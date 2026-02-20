import type { BracketStage, DomainEvent, MatchOutcome, MatchScore, TournamentState } from "@/models";
import { applyResultBase, propagateByEdges } from "@/engine/formats/bracketUtils";

export function processBracketResult(args: {
  state: TournamentState;
  stage: BracketStage;
  matchId: string;
  score: MatchScore;
  outcome: MatchOutcome;
  now: string;
  includeCompletionEvent?: boolean;
}): { state: TournamentState; events: DomainEvent[] } {
  const { state, stage, matchId, score, outcome, now, includeCompletionEvent = true } = args;
  const withResult = applyResultBase(state, matchId, score, outcome, now);
  const advanced = propagateByEdges({
    state: withResult,
    stage,
    fromMatchId: matchId,
    outcome,
    now,
  });

  const events: DomainEvent[] = [{ type: "MATCH_UPDATED", matchId, at: now }, ...advanced.events];
  if (includeCompletionEvent) {
    events.push({ type: "MATCH_COMPLETED", matchId, at: now });
  }

  return { state: advanced.state, events };
}
