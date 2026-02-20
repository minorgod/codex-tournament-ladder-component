import type { ID, ISODateTime } from "@/models/base";

export type DomainEvent =
  | { type: "MATCH_UPDATED"; matchId: ID; at: ISODateTime }
  | { type: "MATCH_COMPLETED"; matchId: ID; at: ISODateTime }
  | { type: "ADVANCEMENT_APPLIED"; fromMatchId: ID; toMatchId: ID; at: ISODateTime }
  | { type: "STANDINGS_UPDATED"; stageId: ID; at: ISODateTime }
  | { type: "TOURNAMENT_LOCKED"; locked: boolean; at: ISODateTime };
