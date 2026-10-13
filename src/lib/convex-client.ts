import { ConvexReactClient } from "convex/react";
import { flushSync } from "react-dom";

/**
 * Sockets for one client that can be told not to connect. The SDK replays
 * every subscribed query and queued write on each new connection, whether or
 * not it still holds auth, and an anonymous write fails for good. While held,
 * a new socket stays connecting, so nothing is sent; on release the newest
 * one connects. The SDK's messages are never read or reordered.
 */
function createSocketGate(realSocket: () => typeof WebSocket) {
  let held = false;
  let disposed = false;
  let newest: GatedSocket | null = null;
  const adopt = (socket: GatedSocket) => {
    // The SDK has given up on any socket it replaces; one still waiting never connects.
    newest?.abandon();
    newest = socket;
    if (!held) socket.connect();
  };

  // The part of WebSocket the SDK uses.
  class GatedSocket {
    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    private ws: WebSocket | null = null;
    private ended = false;
    private readonly url: string;
    constructor(url: string) {
      this.url = url;
      adopt(this);
    }
    connect() {
      if (this.ws || this.ended || disposed) return;
      const ws = new (realSocket())(this.url);
      this.ws = ws;
      ws.onopen = (event) => this.onopen?.(event);
      ws.onmessage = (event) => this.onmessage?.(event);
      ws.onerror = (event) => this.onerror?.(event);
      ws.onclose = (event) => {
        this.ended = true;
        this.onclose?.(event);
      };
    }
    send(data: string) {
      this.ws?.send(data);
    }
    close() {
      if (this.ws) this.ws.close();
      else this.abandon();
    }
    /** Ends a socket that never connected, the way a failed connection ends. */
    abandon() {
      if (this.ws || this.ended) return;
      this.ended = true;
      queueMicrotask(() => this.onclose?.(new CloseEvent("close", { code: 1000 })));
    }
    /** Closes an open connection, so that what follows waits for the next one. */
    drop() {
      this.ws?.close();
    }
  }

  return {
    Socket: GatedSocket as unknown as typeof WebSocket,
    held: () => held,
    hold({ drop }: { drop: boolean }) {
      held = true;
      if (drop) newest?.drop();
    },
    release() {
      held = false;
      newest?.connect();
    },
    dispose() {
      disposed = true;
      newest?.abandon();
    },
  };
}

/**
 * A client that, once it has been authenticated, never opens a connection
 * without its owner's token.
 *
 * When the SDK gives up on a client's auth it clears it, and its next
 * connection replays every subscribed query and queued write without it.
 * Reporting the loss inside flushSync unmounts the app, and with it those
 * queries, before the SDK goes on, instead of a render later. The queued
 * writes cannot be withdrawn, so the connection is dropped and the next one
 * held until a token is stored again. The same hold covers auth that is being
 * replaced or was cleared for a restart: the SDK's own pause does not outlive
 * a reconnect.
 */
export class OwnerConvexClient extends ConvexReactClient {
  private readonly gate: ReturnType<typeof createSocketGate>;
  private disposed = false;
  // Whether the SDK holds a token it can use, and its newest token request:
  // it keeps a token only from that one.
  private authenticated = false;
  private requests = 0;
  // Whether the SDK's stored token was cleared after it had been authenticated.
  private cleared = false;

  constructor(...[address, options]: ConstructorParameters<typeof ConvexReactClient>) {
    const gate = createSocketGate(() => options?.webSocketConstructor ?? WebSocket);
    super(address, { ...options, webSocketConstructor: gate.Socket });
    this.gate = gate;
  }

  override setAuth(...[fetchToken, onChange, onRefreshChange]: Parameters<ConvexReactClient["setAuth"]>) {
    // Until the new token is stored the SDK treats the old one as unusable,
    // and can clear it without a word.
    this.withdraw();
    // The SDK may have stopped the connection to refresh the old auth, and
    // restarts it only when it refreshes a token, never for a first one. So
    // auth that was cleared starts again from a refresh: no first token.
    let refresh = this.cleared;
    super.setAuth(async (args) => {
      const skip = refresh && !args.forceRefreshToken;
      refresh = false;
      if (skip) return null;
      const request = ++this.requests;
      const token = await fetchToken(args);
      if (token && request === this.requests) {
        this.authenticated = true;
        this.cleared = false;
        // The SDK stores the token a few steps after this resolves, or refuses
        // it and reports the loss. Release once it has done either.
        setTimeout(() => this.releaseIfAuthenticated(), 0);
      }
      return token;
    }, (authenticated) => {
      if (authenticated) return onChange?.(true);
      this.authenticated = false;
      this.cleared = true;
      this.gate.hold({ drop: true });
      flushSync(() => onChange?.(false));
    }, onRefreshChange);
  }

  override clearAuth() {
    super.clearAuth();
    if (this.authenticated) this.cleared = true;
    this.withdraw();
  }

  override close() {
    this.disposed = true;
    // The SDK waits for a connecting socket to end; one held back never would.
    const closed = super.close();
    this.gate.dispose();
    return closed;
  }

  /**
   * The token the SDK holds is no longer one it will use. The auth that
   * follows pauses this connection, so only a new one needs holding. A client
   * that never had auth has nothing queued to protect.
   */
  private withdraw() {
    if (this.authenticated) this.gate.hold({ drop: false });
    this.authenticated = false;
  }

  private releaseIfAuthenticated() {
    if (!this.disposed && this.authenticated && this.gate.held()) this.gate.release();
  }
}
