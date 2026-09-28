// A controlled WebSocket peer. The production Convex client, auth manager,
// token rotation, request queue, and React provider all run unchanged.
type Version = { querySet: number; identity: number; ts: string };
export type ClientMessage =
  | { type: "Authenticate"; tokenType: "User" | "None"; value?: string; baseVersion: number }
  | { type: "ModifyQuerySet"; newVersion: number }
  | { type: "Mutation"; udfPath: string; args: unknown[]; requestId: number }
  | { type: "Connect" };

export function createAuthServer() {
  const messages: ClientMessage[] = [];
  const sockets: Socket[] = [];
  let confirmAuth = true;
  class Socket {
    onopen: (() => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
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
      if (message.type === "Authenticate") {
        if (!confirmAuth) return;
        this.next.identity = message.baseVersion + 1;
      } else if (message.type === "ModifyQuerySet") {
        this.next.querySet = message.newVersion;
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
    rejectSession() {
      this.onmessage?.({ data: JSON.stringify({
        type: "AuthError", error: "test token expired", baseVersion: this.version.identity - 1, authUpdateAttempted: false,
      }) });
    }
  }
  return {
    // This fixture implements the subset of the browser socket used by Convex.
    WebSocket: Socket as unknown as typeof WebSocket,
    messages,
    sockets,
    setConfirmAuth: (value: boolean) => { confirmAuth = value; },
    latest: () => sockets.at(-1)!,
  };
}

let sequence = 0;
export function tokenFor(subject: string) {
  const now = Math.floor(Date.now() / 1000);
  return `${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ sub: subject, iat: now, exp: now + 60, nonce: sequence++ }))}.test`;
}
