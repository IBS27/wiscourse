// A controlled WebSocket peer. The production Convex client, auth manager,
// token rotation, request queue, and React provider all run unchanged.
type Version = { querySet: number; identity: number; ts: string };
export type ClientMessage =
  | { type: "Authenticate"; tokenType: "User" | "None"; value?: string; baseVersion: number }
  | { type: "ModifyQuerySet"; newVersion: number; modifications: { type: "Add" | "Remove" }[] }
  | { type: "Mutation"; udfPath: string; args: unknown[]; requestId: number }
  | { type: "Connect" };

export function createAuthServer() {
  const messages: ClientMessage[] = [];
  const sockets: Socket[] = [];
  // The identity each mutation arrived under; null is anonymous.
  const mutationOwners: (string | null)[] = [];
  let confirmAuth = true;
  class Socket {
    onopen: (() => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    /** This socket's frames, in order, for per-connection auth checks. */
    sent: ClientMessage[] = [];
    private subject: string | null = null;
    private authBase = 0;
    private version: Version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    private next = { ...this.version };
    private scheduled = false;
    constructor() {
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(raw: string) {
      const message = JSON.parse(raw) as ClientMessage;
      messages.push(message);
      this.sent.push(message);
      if (message.type === "Authenticate") {
        this.subject = message.tokenType === "User" && message.value ? subjectOf(message.value) : null;
        this.authBase = message.baseVersion;
        if (!confirmAuth) return;
        this.next.identity = message.baseVersion + 1;
      } else if (message.type === "ModifyQuerySet") {
        this.next.querySet = message.newVersion;
      } else if (message.type === "Mutation") {
        mutationOwners.push(this.subject);
        // Like convex/lib/auth.ts: an anonymous write fails for good.
        if (this.subject === null) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
          type: "MutationResponse", requestId: message.requestId, success: false, result: "Not signed in", logLines: [],
        }) }));
        return;
      } else return;
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          if (this.closed) return;
          this.onmessage?.({ data: JSON.stringify({
            type: "Transition", startVersion: this.version, endVersion: this.next, modifications: [],
          }) });
          this.version = { ...this.next };
        });
      }
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      queueMicrotask(() => this.onclose?.({ code: 1000, reason: "test connection closed" }));
    }
    /** `attempted`: the server is refusing the token just sent, not one that has since expired. */
    rejectSession(attempted = false) {
      this.onmessage?.({ data: JSON.stringify({
        type: "AuthError", error: "test token expired", authUpdateAttempted: attempted,
        baseVersion: attempted ? this.authBase : this.version.identity - 1,
      }) });
    }
  }
  return {
    // This fixture implements the subset of the browser socket used by Convex.
    WebSocket: Socket as unknown as typeof WebSocket,
    messages,
    mutationOwners,
    sockets,
    setConfirmAuth: (value: boolean) => { confirmAuth = value; },
    latest: () => sockets.at(-1)!,
  };
}

/**
 * Queries and writes sent for no one: on a connection the owner had not
 * authenticated on, or after its auth was cleared there.
 */
export function anonymousFrames(sockets: { sent: ClientMessage[] }[]): ClientMessage[] {
  return sockets.flatMap((socket) => {
    let owned = false;
    return socket.sent.filter((message) => {
      if (message.type === "Authenticate") owned = message.tokenType === "User";
      if (message.type === "Mutation") return !owned;
      return message.type === "ModifyQuerySet" && !owned && message.modifications.some(change => change.type === "Add");
    });
  });
}

export function subjectOf(token: string): string {
  return (JSON.parse(atob(token.split(".")[1])) as { sub: string }).sub;
}

let sequence = 0;
export function tokenFor(subject: string) {
  const now = Math.floor(Date.now() / 1000);
  return `${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ sub: subject, iat: now, exp: now + 60, nonce: sequence++ }))}.test`;
}
