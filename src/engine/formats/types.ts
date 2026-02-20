import type { TournamentState, DomainEvent, ID, MatchOutcome, MatchScore, Participant, StageSettings, TournamentStage, Match } from "@/models";

export interface TournamentFormatPlugin {
  name: string;
  generateStage(args: {
    stageId: ID;
    stageName: string;
    participants: Participant[];
    settings: StageSettings;
    rngSeed?: string;
    options?: Record<string, unknown>;
  }): { stage: TournamentStage; matches: Match[] };
  processMatchResult(args: {
    state: TournamentState;
    matchId: ID;
    score: MatchScore;
    outcome: MatchOutcome;
    now: string;
  }): { state: TournamentState; events: DomainEvent[] };
}
