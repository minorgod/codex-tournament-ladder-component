import type { DomainEvent } from "@/models";
import type { RealtimeAdapter } from "@/realtime/RealtimeAdapter";

export class MockAdapter implements RealtimeAdapter {
  private connected = false;
  private readonly listeners = new Set<(ev: DomainEvent) => void>();
  private queue: DomainEvent[] = [];

  connect(): void {
    this.connected = true;
    this.flush();
  }

  disconnect(): void {
    this.connected = false;
  }

  onEvent(cb: (ev: DomainEvent) => void): void {
    this.listeners.add(cb);
  }

  broadcast(ev: DomainEvent): void {
    this.queue.push(ev);
    this.flush();
  }

  replay(events: DomainEvent[]): void {
    this.queue.push(...events);
    this.flush();
  }

  private flush(): void {
    if (!this.connected || this.queue.length === 0) {
      return;
    }

    const pending = [...this.queue];
    this.queue = [];
    pending.forEach((event) => {
      this.listeners.forEach((listener) => listener(event));
    });
  }
}
