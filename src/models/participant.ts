import type { ID } from "@/models/base";

export type ParticipantType = "player" | "team";

export interface Participant {
  id: ID;
  name: string;
  type: ParticipantType;
  seed?: number;
  rating?: number;
  avatarUrl?: string;
  org?: string;
  metadata?: Record<string, unknown>;
}
