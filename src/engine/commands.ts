import type {
  ID,
  ISODateTime,
  MatchOutcome,
  MatchScore,
  MatchStatus,
  Participant,
  Slot,
  StageSettings,
  TournamentStage,
} from "@/models";

export interface InitTournamentPayload {
  id: ID;
  name: string;
  rngSeed?: string;
  settings?: Record<string, unknown>;
}

export interface GenerateStagePayload {
  stageId: ID;
  stageName: string;
  format: "single_elimination" | "double_elimination" | "swiss" | "round_robin" | "ladder" | "group_to_playoff" | "custom";
  participantIds?: ID[];
  settings: StageSettings;
  options?: Record<string, unknown>;
}

export type Command =
  | { type: "INIT_TOURNAMENT"; payload: InitTournamentPayload }
  | { type: "ADD_PARTICIPANTS"; payload: { participants: Participant[] } }
  | { type: "REMOVE_PARTICIPANT"; payload: { participantId: ID } }
  | { type: "SEED_PARTICIPANTS"; payload: { method: "manual" | "rating" | "shuffle"; seedMap?: Record<ID, number> } }
  | { type: "GENERATE_STAGE"; payload: GenerateStagePayload }
  | { type: "SET_MATCH_STATUS"; payload: { matchId: ID; status: MatchStatus } }
  | { type: "RECORD_MATCH_RESULT"; payload: { matchId: ID; score: MatchScore; outcome: MatchOutcome } }
  | { type: "UNDO_MATCH_RESULT"; payload: { matchId: ID; reason?: string } }
  | { type: "FORCE_ADVANCE"; payload: { fromMatchId: ID; participantId: ID; toMatchId: ID; toSlot: Slot; reason?: string } }
  | { type: "LOCK_TOURNAMENT"; payload: { locked: boolean } }
  | { type: "REGENERATE_STAGE"; payload: { stageId: ID; preserveResults?: boolean } }
  | { type: "LADDER_CHALLENGE"; payload: { challengerId: ID; challengedId: ID; scheduledAt?: ISODateTime } }
  | { type: "APPLY_DECAY"; payload: { stageId: ID; at: ISODateTime } };

export const mutatingCommands: ReadonlySet<Command["type"]> = new Set([
  "INIT_TOURNAMENT",
  "ADD_PARTICIPANTS",
  "REMOVE_PARTICIPANT",
  "SEED_PARTICIPANTS",
  "GENERATE_STAGE",
  "SET_MATCH_STATUS",
  "RECORD_MATCH_RESULT",
  "UNDO_MATCH_RESULT",
  "FORCE_ADVANCE",
  "LOCK_TOURNAMENT",
  "REGENERATE_STAGE",
  "LADDER_CHALLENGE",
  "APPLY_DECAY",
]);

export function isBracketFormat(format: TournamentStage["format"]): boolean {
  return format !== "ladder";
}
