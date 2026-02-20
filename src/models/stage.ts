export interface StageSettings {
  bestOf?: number;
  allowDraws?: boolean;
  reseedAfterRound?: boolean;
  autoAdvanceByes?: boolean;
  grandFinalReset?: boolean;
  thirdPlaceMatch?: boolean;
  roundsCount?: number;
  doubleRoundRobin?: boolean;
  tiebreakers?: string[];
  metadata?: Record<string, unknown>;
}
