import type { DomainEvent } from "@/models";

export interface RealtimeAdapter {
  connect(): void;
  disconnect(): void;
  onEvent(cb: (ev: DomainEvent) => void): void;
  broadcast(ev: DomainEvent): void;
}
