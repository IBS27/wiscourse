// HTTP client for the Canvas REST API.
//
// Design constraints (verified against Canvas source, Aug 2026):
// - The rate limit is a leaky bucket per access token where the binding
//   constraint is CONCURRENCY (~12 in-flight requests max), not request
//   frequency. This client is strictly sequential, which keeps one user's
//   sync far below the limit.
// - Throttling can surface as 403 (body "Rate Limit Exceeded") or 429
//   depending on instance config. Both must map to CanvasRateLimitError,
//   and a genuine permission 403 must NOT.
// - Pagination Link headers are opaque bookmarks; always follow rel="next",
//   never construct page URLs.
// - X-Rate-Limit-Remaining is live telemetry; we surface it via callback
//   so the sync layer can persist it and back off adaptively.

export class CanvasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Response body, for callers that show Canvas's own error text. */
    public readonly body?: string,
  ) {
    super(message);
    this.name = "CanvasApiError";
  }
}

export class CanvasAuthError extends CanvasApiError {
  constructor(message = "Canvas rejected the access token") {
    super(message, 401);
    this.name = "CanvasAuthError";
  }
}

export class CanvasRateLimitError extends CanvasApiError {
  constructor(status: number) {
    super("Canvas rate limit exceeded", status);
    this.name = "CanvasRateLimitError";
  }
}

/**
 * Run a course-scoped request, treating 401/403/404 as "this course has no
 * such content" (the instructor hid the tab or the feature is off) and
 * returning `fallback`. Throttling and a dead token are never swallowed.
 */
export async function tolerateDisabledTab<T>(
  fetch: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (error instanceof CanvasRateLimitError) throw error;
    if (error instanceof CanvasAuthError) throw error;
    if (
      error instanceof CanvasApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      return fallback;
    }
    throw error;
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | Array<string | number>
>;

/** Step 1 of a Canvas file upload: where to send the bytes. */
export interface CanvasUploadSlot {
  upload_url: string;
  upload_params: Record<string, string | number>;
  file_param?: string;
}

export interface CanvasClientOptions {
  instance: string; // e.g. "canvas.wisc.edu"
  accessToken: string;
  onRateLimitRemaining?: (remaining: number) => void;
}

const MAX_PAGES = 50; // safety backstop; 50 pages * 100 items is beyond any real course load

export class CanvasClient {
  constructor(private readonly options: CanvasClientOptions) {}

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const response = await this.request(this.buildUrl(path, params));
    return (await response.json()) as T;
  }

  /** GET all pages by following Link rel="next". Sequential by design. */
  async getPaginated<T>(path: string, params?: QueryParams): Promise<T[]> {
    const results: T[] = [];
    let url: string | undefined = this.buildUrl(path, {
      ...params,
      per_page: 100,
    });
    for (let page = 0; url !== undefined && page < MAX_PAGES; page++) {
      const response = await this.request(url);
      results.push(...((await response.json()) as T[]));
      url = parseNextLink(response.headers.get("Link"));
    }
    if (url !== undefined) throw new Error("Canvas pagination exceeded its safety limit; refusing a partial snapshot");
    return results;
  }

  /** Form-encoded POST. Writes are never retried here; callers decide. */
  async post<T>(path: string, params: QueryParams, options: { timeoutMs?: number } = {}): Promise<T> {
    const body = new URLSearchParams();
    appendParams(body, params);
    const response = await this.request(this.buildUrl(path), { method: "POST", body }, options.timeoutMs);
    return (await response.json()) as T;
  }

  /**
   * Steps 2 and 3 of a Canvas file upload: send the bytes to the upload URL
   * from step 1, then confirm with Canvas. The upload URL carries its own
   * grant and may be another host, so it never gets the access token.
   */
  async uploadFile<T extends { id: number }>(slot: CanvasUploadSlot, file: Blob, name: string, timeoutMs: number): Promise<T> {
    if (new URL(slot.upload_url).protocol !== "https:") {
      throw new CanvasApiError("Canvas returned an upload URL that is not HTTPS", 0);
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(slot.upload_params)) form.append(key, String(value));
    form.append(slot.file_param ?? "file", file, name); // Canvas requires the file last.
    const response = await withTimeout(timeoutMs, (signal) =>
      fetch(slot.upload_url, { method: "POST", body: form, redirect: "manual", signal }),
    );
    if (response.status >= 300 && response.status < 400) {
      return await this.confirmUpload<T>(response.headers.get("Location"));
    }
    const body = await response.text();
    // The upload host throttles like Canvas does. Anything else, including a
    // 401 for the upload grant, is about this upload, never the Canvas token.
    if (isThrottled(response.status, body)) throw new CanvasRateLimitError(response.status);
    if (!response.ok) {
      throw new CanvasApiError(`Canvas file upload ${response.status}: ${body.slice(0, 200)}`, response.status, body);
    }
    const parsed = parseJson(body);
    if (typeof parsed?.id === "number") return parsed as T;
    return await this.confirmUpload<T>(response.headers.get("Location") ?? (typeof parsed?.location === "string" ? parsed.location : null));
  }

  private async confirmUpload<T>(location: string | null): Promise<T> {
    if (location === null) throw new CanvasApiError("Canvas did not confirm the file upload", 0);
    const url = new URL(location, `https://${this.options.instance}`);
    // The token only ever goes to the Canvas host.
    if (url.protocol !== "https:" || url.host !== this.options.instance) {
      throw new CanvasApiError(`Canvas confirmed the upload on an unexpected host: ${url.host}`, 0);
    }
    const response = await this.request(url.toString());
    return (await response.json()) as T;
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`https://${this.options.instance}/api/v1${path}`);
    if (params) appendParams(url.searchParams, params);
    return url.toString();
  }

  private async request(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
    const headers = { Authorization: `Bearer ${this.options.accessToken}` };
    const response = timeoutMs === undefined
      ? await fetch(url, { ...init, headers })
      : await withTimeout(timeoutMs, (signal) => fetch(url, { ...init, headers, signal }));

    const remaining = response.headers.get("X-Rate-Limit-Remaining");
    if (remaining !== null && this.options.onRateLimitRemaining) {
      const parsed = Number.parseFloat(remaining);
      if (!Number.isNaN(parsed)) this.options.onRateLimitRemaining(parsed);
    }

    if (response.ok) return response;

    const body = await response.text();
    // Canvas uses 401 for two different things: a bad/expired token
    // (body status "unauthenticated", plus a WWW-Authenticate header) and
    // a per-resource permission denial such as a course tab the instructor
    // disabled (body status "unauthorized"). Only the former means the
    // credential is dead.
    if (
      response.status === 401 &&
      (body.includes('"unauthenticated"') ||
        response.headers.has("WWW-Authenticate"))
    ) {
      throw new CanvasAuthError();
    }
    if (isThrottled(response.status, body)) {
      throw new CanvasRateLimitError(response.status);
    }
    throw new CanvasApiError(
      `Canvas API ${response.status} for ${new URL(url).pathname}: ${body.slice(0, 200)}`,
      response.status,
      body,
    );
  }
}

/** Canvas throttling: 429, or a 403 whose body says "Rate Limit Exceeded". */
function isThrottled(status: number, body: string): boolean {
  return status === 429 || (status === 403 && body.includes("Rate Limit Exceeded"));
}

function appendParams(target: URLSearchParams, params: QueryParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) target.append(key, String(item));
    } else {
      target.set(key, String(value));
    }
  }
}

async function withTimeout(ms: number, run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function parseNextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return undefined;
}
