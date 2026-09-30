// A fake Canvas for submission tests and the submission preview. It speaks
// the submission endpoints wiscourse uses, keeps each assignment's attempts,
// logs every request, and refuses any host but its own two, so nothing here
// can reach a real Canvas.

export const MOCK_INSTANCE = "canvas.mock.invalid";
export const MOCK_UPLOAD_HOST = "upload.mock.invalid";

export type Operation = "check" | "slot" | "upload" | "confirm" | "post";

export type Fault =
  | "ok" // a normal reply, to aim a later fault at a later request
  | "rateLimit" // 403 "Rate Limit Exceeded"; nothing happens
  | "serverError" // 503; nothing happens
  | "networkError" // the request never reaches Canvas
  | "reject" // 400 with a Canvas error message
  | "unauthenticated" // 401: the token is dead
  | "timeout" // no work and no reply: the caller's timeout fires
  | "acceptThenTimeout" // Canvas does the work, the reply is lost
  | "acceptThenStall"; // Canvas does the work and the action dies waiting (see `releaseStalls`)

export interface MockSubmission {
  attempt: number;
  submission_type: string;
  submitted_at: string;
  body: string | null;
  url: string | null;
  attachments: Array<{ id: number; display_name: string }>;
}

export interface LoggedRequest {
  at: number;
  method: string;
  host: string;
  path: string;
  operation: Operation | "other";
  authorized: boolean;
  status: number | "no reply" | "network error";
  fault?: Fault;
}

interface Upload {
  name: string;
  size: number;
  contentType: string;
  fileId?: number;
}

export function createMockCanvas(options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const attempts = new Map<number, MockSubmission[]>();
  const files = new Map<number, { id: number; display_name: string; size: number }>();
  const uploads = new Map<number, Upload>();
  const faults: Array<{ operation: Operation; fault: Fault }> = [];
  const log: LoggedRequest[] = [];
  let nextId = 9000;
  let delayMs = 0;
  let uploadReply: "redirect" | "created" = "redirect";
  let stalls: Array<() => void> = [];

  function submissionJson(assignmentId: number) {
    const history = attempts.get(assignmentId) ?? [];
    const latest = history.at(-1);
    const base = { id: assignmentId * 10, assignment_id: assignmentId, score: null, grade: null, posted_at: null, late: false, missing: false };
    if (latest === undefined) {
      return { ...base, attempt: null, workflow_state: "unsubmitted", submitted_at: null, submission_type: null, body: null, url: null, attachments: [], submission_history: [] };
    }
    const versions = history.map((s) => ({ ...base, ...s, workflow_state: "submitted" }));
    return { ...versions.at(-1)!, submission_history: versions };
  }

  function record(assignmentId: number, submission: Omit<MockSubmission, "attempt" | "submitted_at">) {
    const history = attempts.get(assignmentId) ?? [];
    history.push({ ...submission, attempt: history.length + 1, submitted_at: new Date(now()).toISOString() });
    attempts.set(assignmentId, history);
  }

  function takeFault(operation: Operation): Fault | undefined {
    const index = faults.findIndex((f) => f.operation === operation);
    return index < 0 ? undefined : faults.splice(index, 1)[0].fault;
  }

  function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
  }

  function abortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  async function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (url.host !== MOCK_INSTANCE && url.host !== MOCK_UPLOAD_HOST) {
      throw new Error(`Mock Canvas refused a request to ${url.host}; only ${MOCK_INSTANCE} is allowed.`);
    }
    const route = matchRoute(method, url);
    const entry: LoggedRequest = {
      at: now(), method, host: url.host, path: url.pathname, operation: route?.operation ?? "other",
      authorized: headers.has("Authorization"), status: 404,
    };
    log.push(entry);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (route === undefined) return json({ errors: [{ message: "Not found" }] }, 404);

    const fault = takeFault(route.operation);
    entry.fault = fault;
    const reply = (response: Response) => {
      entry.status = response.status;
      return response;
    };
    switch (fault) {
      case "rateLimit":
        return reply(new Response("403 Forbidden (Rate Limit Exceeded)", { status: 403 }));
      case "serverError":
        return reply(json({ errors: [{ message: "Service unavailable" }] }, 503));
      case "reject":
        return reply(json({ errors: [{ message: "This assignment does not accept submissions right now." }] }, 400));
      case "unauthenticated":
        return reply(json({ status: "unauthenticated", errors: [{ message: "Invalid access token." }] }, 401, { "WWW-Authenticate": "Bearer" }));
      case "networkError":
        entry.status = "network error";
        throw new TypeError("fetch failed");
      case "timeout":
        entry.status = "no reply";
        throw abortError();
      case "acceptThenTimeout":
        await route.handle(init);
        entry.status = "no reply";
        throw abortError();
      case "acceptThenStall":
        await route.handle(init);
        entry.status = "no reply";
        await new Promise<void>((resolve) => stalls.push(resolve));
        throw new TypeError("connection reset");
      default:
        return reply(await route.handle(init));
    }
  }

  function matchRoute(method: string, url: URL): { operation: Operation; handle: (init: RequestInit) => Promise<Response> } | undefined {
    if (url.host === MOCK_UPLOAD_HOST) {
      const id = Number(url.pathname.match(/^\/upload\/(\d+)$/)?.[1]);
      if (method !== "POST" || !uploads.has(id)) return undefined;
      return {
        operation: "upload",
        handle: async (init) => {
          const form = init.body as FormData;
          const file = form.get("file");
          if (!(file instanceof Blob) || form.get("token") !== `grant-${id}`) return json({ message: "bad upload" }, 400);
          const upload = uploads.get(id)!;
          const fileId = ++nextId;
          upload.fileId = fileId;
          files.set(fileId, { id: fileId, display_name: upload.name, size: file.size });
          const location = `https://${MOCK_INSTANCE}/api/v1/files/${fileId}/create_success?uuid=${id}`;
          return uploadReply === "redirect"
            ? new Response(null, { status: 302, headers: { Location: location } })
            : json({ id: fileId, display_name: upload.name }, 201, { Location: location });
        },
      };
    }
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const confirm = path.match(/^\/files\/(\d+)\/create_success$/);
    if (confirm && method === "GET") {
      return { operation: "confirm", handle: async () => json(files.get(Number(confirm[1])) ?? {}, files.has(Number(confirm[1])) ? 200 : 404) };
    }
    const match = path.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/submissions(\/self(\/files)?)?$/);
    if (!match) return undefined;
    const assignmentId = Number(match[2]);
    if (method === "GET" && match[3] === "/self") {
      return { operation: "check", handle: async () => json(submissionJson(assignmentId)) };
    }
    if (method === "POST" && match[4] !== undefined) {
      return {
        operation: "slot",
        handle: async (init) => {
          const form = new URLSearchParams(init.body as URLSearchParams);
          const id = ++nextId;
          uploads.set(id, { name: form.get("name") ?? "file", size: Number(form.get("size")), contentType: form.get("content_type") ?? "" });
          return json({ upload_url: `https://${MOCK_UPLOAD_HOST}/upload/${id}`, upload_params: { token: `grant-${id}`, filename: form.get("name") }, file_param: "file" });
        },
      };
    }
    if (method === "POST" && match[3] === undefined) {
      return {
        operation: "post",
        handle: async (init) => {
          const form = new URLSearchParams(init.body as URLSearchParams);
          const type = form.get("submission[submission_type]") ?? "";
          const fileIds = form.getAll("submission[file_ids][]").map(Number);
          if (type === "online_upload" && (fileIds.length === 0 || fileIds.some((id) => !files.has(id)))) {
            return json({ errors: [{ message: "Unknown file" }] }, 400);
          }
          record(assignmentId, {
            submission_type: type,
            body: form.get("submission[body]"),
            url: form.get("submission[url]"),
            attachments: fileIds.map((id) => ({ id, display_name: files.get(id)!.display_name })),
          });
          const { submission_history: _history, ...latest } = submissionJson(assignmentId);
          void _history;
          return json(latest, 201);
        },
      };
    }
    return undefined;
  }

  return {
    fetch,
    log,
    /** The attempts Canvas holds for an assignment: the ground truth for duplicates. */
    attempts: (assignmentId: number) => attempts.get(assignmentId) ?? [],
    seed: (assignmentId: number, submission: Omit<MockSubmission, "attempt" | "submitted_at">) => record(assignmentId, submission),
    fail: (operation: Operation, fault: Fault, times = 1) => {
      for (let i = 0; i < times; i++) faults.push({ operation, fault });
    },
    pendingFaults: () => faults.map((f) => `${f.operation}:${f.fault}`),
    clearFaults: () => void faults.splice(0),
    setDelay: (ms: number) => void (delayMs = ms),
    /** Ends stalled requests, as a dead action's sockets would close. */
    releaseStalls: () => {
      for (const release of stalls) release();
      stalls = [];
    },
    setUploadReply: (mode: "redirect" | "created") => void (uploadReply = mode),
    reset: () => {
      attempts.clear();
      files.clear();
      uploads.clear();
      faults.splice(0);
      log.splice(0);
      delayMs = 0;
      stalls = []; // left hanging: their actions belong to a discarded backend
    },
  };
}

export type MockCanvas = ReturnType<typeof createMockCanvas>;
