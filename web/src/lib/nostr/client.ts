type EventCallback = (subId: string, event: NostrEvent) => void;
type EoseCallback = (subId: string) => void;
type AuthCallback = () => void;
type CloseCallback = () => void;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  "#p"?: string[];
  "#c"?: string[];
  "#d"?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedEvent): Promise<NostrEvent>;
      nip44: {
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
        encrypt(pubkey: string, plaintext: string): Promise<string>;
      };
    };
  }
}

interface PendingFetch {
  events: NostrEvent[];
  resolve: (events: NostrEvent[]) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private pendingOk = new Map<
    string,
    { resolve: (ok: boolean) => void; reject: (err: Error) => void }
  >();
  private pendingFetches = new Map<string, PendingFetch>();
  private closed = false;

  onEvent: EventCallback = () => {};
  onEose: EoseCallback = () => {};
  onAuth: AuthCallback = () => {};
  onClose: CloseCallback = () => {};

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.closed = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      let msg: unknown;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg.length < 2) return;
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.onClose();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [, { reject }] of this.pendingOk) {
      reject(new Error("disconnected"));
    }
    this.pendingOk.clear();
    for (const [, { resolve, timeout }] of this.pendingFetches) {
      clearTimeout(timeout);
      resolve([]);
    }
    this.pendingFetches.clear();
  }

  subscribe(subId: string, filters: NostrFilter[]): void {
    this.send(JSON.stringify(["REQ", subId, ...filters]));
  }

  closeSubscription(subId: string): void {
    this.send(JSON.stringify(["CLOSE", subId]));
  }

  async publish(event: NostrEvent): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.pendingOk.set(event.id, { resolve, reject });
      this.send(JSON.stringify(["EVENT", event]));
      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingOk.has(event.id)) {
          this.pendingOk.delete(event.id);
          reject(new Error("publish timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Fetch events matching filters. Resolves with all events received
   * before EOSE or the timeout (whichever comes first).
   */
  fetch(filters: NostrFilter[], timeoutMs = 15000): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const subId = `f:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`;
      const timeout = setTimeout(() => {
        const pending = this.pendingFetches.get(subId);
        if (pending) {
          this.pendingFetches.delete(subId);
          this.closeSubscription(subId);
          resolve(pending.events);
        }
      }, timeoutMs);
      this.pendingFetches.set(subId, { events: [], resolve, timeout });
      this.subscribe(subId, filters);
    });
  }

  private send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private handleMessage(msg: unknown[]): void {
    const type = msg[0] as string;

    switch (type) {
      case "AUTH": {
        const challenge = msg[1] as string;
        void this.handleAuthChallenge(challenge);
        break;
      }
      case "EVENT": {
        const subId = msg[1] as string;
        const event = msg[2] as NostrEvent;
        const fetchPending = this.pendingFetches.get(subId);
        if (fetchPending) {
          fetchPending.events.push(event);
        } else {
          this.onEvent(subId, event);
        }
        break;
      }
      case "EOSE": {
        const subId = msg[1] as string;
        const fetchPending = this.pendingFetches.get(subId);
        if (fetchPending) {
          clearTimeout(fetchPending.timeout);
          this.pendingFetches.delete(subId);
          this.closeSubscription(subId);
          fetchPending.resolve(fetchPending.events);
        } else {
          this.onEose(subId);
        }
        break;
      }
      case "OK": {
        const eventId = msg[1] as string;
        const success = msg[2] as boolean;
        const pending = this.pendingOk.get(eventId);
        if (pending) {
          this.pendingOk.delete(eventId);
          pending.resolve(success);
        }
        break;
      }
      case "NOTICE": {
        console.warn("[relay notice]", msg[1]);
        break;
      }
      case "CLOSED": {
        const subId = msg[1] as string;
        const fetchPending = this.pendingFetches.get(subId);
        if (fetchPending) {
          clearTimeout(fetchPending.timeout);
          this.pendingFetches.delete(subId);
          fetchPending.resolve(fetchPending.events);
        } else {
          console.warn("[relay closed sub]", subId, msg[2]);
        }
        break;
      }
    }
  }

  private async handleAuthChallenge(challenge: string): Promise<void> {
    if (!window.nostr) {
      console.error("NIP-07 extension not available for AUTH");
      return;
    }

    try {
      const authEvent: UnsignedEvent = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["relay", this.url],
          ["challenge", challenge],
        ],
        content: "",
      };

      const signed = await window.nostr.signEvent(authEvent);
      this.send(JSON.stringify(["AUTH", signed]));

      // Wait for OK response for this auth event
      const ok = await new Promise<boolean>((resolve, reject) => {
        this.pendingOk.set(signed.id, { resolve, reject });
        setTimeout(() => {
          if (this.pendingOk.has(signed.id)) {
            this.pendingOk.delete(signed.id);
            reject(new Error("AUTH timeout"));
          }
        }, 10000);
      });

      if (ok) {
        this.onAuth();
      }
    } catch (err) {
      console.error("AUTH failed:", err);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }
}
