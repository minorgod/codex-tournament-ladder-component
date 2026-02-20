import type { ID, ISODateTime, Slot } from "@/models/base";
import type { LadderStage } from "@/models/ladder";
import type { Match } from "@/models/match";
import type { Participant } from "@/models/participant";
import type { StageSettings } from "@/models/stage";

export interface AdvancementEdge {
  fromMatchId: ID;
  from: { kind: "winner" | "loser"; slot?: Slot };
  toMatchId: ID;
  toSlot: Slot;
}

export interface Round {
  id: ID;
  name: string;
  order: number;
  matchIds: ID[];
}

export interface BracketStage {
  id: ID;
  name: string;
  format: "single_elimination" | "double_elimination" | "group_to_playoff" | "custom" | "swiss" | "round_robin";
  rounds: Round[];
  matchIds: ID[];
  edges: AdvancementEdge[];
  settings: StageSettings;
}

export type TournamentStage = BracketStage | LadderStage;

export interface AuditEntry {
  id: ID;
  at: ISODateTime;
  actor?: { id?: string; name?: string; role?: string };
  commandType: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface TournamentState {
  id: ID;
  name: string;
  version: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  participants: Participant[];
  stages: TournamentStage[];
  matches: Match[];
  audit: AuditEntry[];
  settings?: Record<string, unknown>;
  rngSeed?: string;
  locked?: boolean;
  stateSchemaVersion: number;
}
