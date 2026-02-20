import type { ID, ISODateTime } from "@/models/base";

export type MatchStatus =
  | "scheduled"
  | "pending"
  | "in_progress"
  | "completed"
  | "forfeit"
  | "disqualified"
  | "void";

export type MatchOutcome =
  | { kind: "winner"; winnerId: ID; loserId: ID }
  | { kind: "draw" }
  | { kind: "no_contest" };

export interface SetScore {
  a: number;
  b: number;
  label?: string;
}

export interface MatchScore {
  mode: "points" | "sets" | "aggregate";
  a?: number;
  b?: number;
  sets?: SetScore[];
  notes?: string;
}

export interface Match {
  id: ID;
  format: string;
  stageId: ID;
  roundId?: ID;
  bracketSide?: "upper" | "lower" | "grand" | "group" | "ladder";
  orderKey?: number;
  participants: [ID | null, ID | null];
  score?: MatchScore;
  outcome?: MatchOutcome;
  status: MatchStatus;
  scheduledAt?: ISODateTime;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  sources?: {
    vodUrl?: string;
    replayUrl?: string;
    streamUrl?: string;
  };
  officiating?: {
    referee?: string;
    verifiedBy?: string;
    verifiedAt?: ISODateTime;
  };
  metadata?: Record<string, unknown>;
}
