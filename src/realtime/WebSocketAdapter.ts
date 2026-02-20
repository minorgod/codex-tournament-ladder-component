import type { DomainEvent } from "@/models";
import type { RealtimeAdapter } from "@/realtime/RealtimeAdapter";

export class WebSocketAdapter implements RealtimeAdapter {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<(ev: DomainEvent) => void>();

  constructor(private readonly url: string) {}

  connect(): void {
    if (typeof WebSocket === "undefined") {
      return;
    }
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as DomainEvent;
        this.listeners.forEach((listener) => listener(parsed));
      } catch {
        // Intentionally ignore malformed frames; callers should validate before applying.
      }
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  onEvent(cb: (ev: DomainEvent) => void): void {
    this.listeners.add(cb);
  }

  broadcast(ev: DomainEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(ev));
  }
}
