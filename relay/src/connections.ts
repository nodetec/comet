export type RelaySocketData = {
  connId: string;
  challenge: string;
};

export type RelaySocket = Bun.ServerWebSocket<RelaySocketData>;

export type ConnectionState = {
  id: string;
  challenge: string;
  authedPubkeys: Set<string>;
  ws: RelaySocket;
};

export class ConnectionManager {
  private connections = new Map<string, ConnectionState>();

  add(id: string, challenge: string, ws: RelaySocket): void {
    this.connections.set(id, { id, challenge, authedPubkeys: new Set(), ws });
  }

  get(id: string): ConnectionState | undefined {
    return this.connections.get(id);
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  closeAll(code?: number, reason?: string): void {
    for (const [id, conn] of this.connections) {
      try {
        conn.ws.close(code, reason);
      } catch {
        conn.ws.terminate();
      }
      this.connections.delete(id);
    }
  }

  send(id: string, msg: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.ws.send(msg);
    }
  }

  sendJSON(id: string, msg: unknown): void {
    this.send(id, JSON.stringify(msg));
  }

  getChallenge(id: string): string {
    return this.connections.get(id)?.challenge ?? "";
  }

  getAuthedPubkeys(id: string): Set<string> {
    return this.connections.get(id)?.authedPubkeys ?? new Set();
  }

  addAuthedPubkey(id: string, pubkey: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.authedPubkeys.add(pubkey);
    }
  }

  /** Iterate all connections. */
  entries(): IterableIterator<[string, ConnectionState]> {
    return this.connections.entries();
  }

  get size(): number {
    return this.connections.size;
  }
}
