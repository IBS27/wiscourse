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

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`https://${this.options.instance}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, String(item));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
      },
    });

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
    if (
      response.status === 429 ||
      (response.status === 403 && body.includes("Rate Limit Exceeded"))
    ) {
      throw new CanvasRateLimitError(response.status);
    }
    throw new CanvasApiError(
      `Canvas API ${response.status} for ${new URL(url).pathname}: ${body.slice(0, 200)}`,
      response.status,
    );
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
