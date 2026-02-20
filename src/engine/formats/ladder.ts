import type {
  DomainEvent,
  LadderRuleSet,
  LadderStage,
  Match,
  Participant,
  TournamentStage,
} from "@/models";
import type { MatchOutcome, MatchScore, TournamentState } from "@/models";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import { sortParticipantsForSeed } from "@/engine/formats/bracketUtils";

function defaultRules(): LadderRuleSet {
  return {
    swapRule: "swap_on_win",
    cooldownHours: 24,
    challengeWindow: { minRank: -5, maxRank: 5 },
    decay: { enabled: false, daysInactiveToStart: 30, pointsPerDay: 1 },
    points: { win: 3, loss: 0, draw: 1, bonusStreak: 0 },
  };
}

function buildLadderStage(args: {
  stageId: string;
  stageName: string;
  participants: Participant[];
  settings: LadderStage["settings"];
  options?: Record<string, unknown>;
}): { stage: TournamentStage; matches: Match[] } {
  const rules = (args.options?.rules as LadderRuleSet | undefined) ?? defaultRules();
  const ordered = sortParticipantsForSeed(args.participants);

  const stage: TournamentStage = {
    id: args.stageId,
    name: args.stageName,
    format: "ladder",
    rules,
    standings: ordered.map((participantId, idx) => ({
      participantId,
      rank: idx + 1,
      points: 0,
      streak: 0,
    })),
    matchIds: [],
    settings: args.settings,
  };

  return {
    stage,
    matches: [],
  };
}

function applyPoints(standing: LadderStage["standings"][number], delta: number): LadderStage["standings"][number] {
  return {
    ...standing,
    points: (standing.points ?? 0) + delta,
  };
}

function applyLadderResult(args: {
  state: TournamentState;
  stage: LadderStage;
  matchId: string;
  score: MatchScore;
  outcome: MatchOutcome;
  now: string;
}): { state: TournamentState; events: DomainEvent[] } {
  const match = args.state.matches.find((m) => m.id === args.matchId);
  if (!match) {
    return { state: args.state, events: [] };
  }

  let nextState: TournamentState = {
    ...args.state,
    matches: args.state.matches.map((m) =>
      m.id === args.matchId
        ? {
            ...m,
            score: args.score,
            outcome: args.outcome,
            status: args.outcome.kind === "no_contest" ? "void" : "completed",
            completedAt: args.now,
          }
        : m,
    ),
  };

  const standings = [...args.stage.standings].map((entry) => ({ ...entry }));
  const byParticipant = new Map(standings.map((entry) => [entry.participantId, entry]));

  if (args.outcome.kind === "winner") {
    const winner = byParticipant.get(args.outcome.winnerId);
    const loser = byParticipant.get(args.outcome.loserId);

    if (winner) {
      winner.streak = (winner.streak ?? 0) + 1;
      winner.lastMatchAt = args.now;
    }
    if (loser) {
      loser.streak = 0;
      loser.lastMatchAt = args.now;
    }

    if (winner && loser) {
      const swapEligible = winner.rank > loser.rank;
      if (swapEligible && (args.stage.rules.swapRule === "swap_on_win" || args.stage.rules.swapRule === "hybrid")) {
        const oldWinnerRank = winner.rank;
        winner.rank = loser.rank;
        loser.rank = oldWinnerRank;
      }

      if (args.stage.rules.swapRule === "points" || args.stage.rules.swapRule === "hybrid") {
        const p = args.stage.rules.points ?? { win: 3, loss: 0, draw: 1, bonusStreak: 0 };
        Object.assign(winner, applyPoints(winner, p.win + ((p.bonusStreak ?? 0) > 0 && (winner.streak ?? 0) >= 3 ? p.bonusStreak ?? 0 : 0)));
        Object.assign(loser, applyPoints(loser, p.loss));
      }
    }
  }

  if (args.outcome.kind === "draw") {
    const [a, b] = match.participants;
    const p = args.stage.rules.points ?? { win: 3, loss: 0, draw: 1, bonusStreak: 0 };
    if (a && byParticipant.has(a)) {
      const entry = byParticipant.get(a)!;
      Object.assign(entry, applyPoints(entry, p.draw ?? 1));
      entry.lastMatchAt = args.now;
      entry.streak = 0;
    }
    if (b && byParticipant.has(b)) {
      const entry = byParticipant.get(b)!;
      Object.assign(entry, applyPoints(entry, p.draw ?? 1));
      entry.lastMatchAt = args.now;
      entry.streak = 0;
    }
  }

  const normalized = [...byParticipant.values()].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) {
      return (b.points ?? 0) - (a.points ?? 0);
    }
    return a.rank - b.rank;
  });
  normalized.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  nextState = {
    ...nextState,
    stages: nextState.stages.map((stage) =>
      stage.id === args.stage.id && stage.format === "ladder"
        ? {
            ...stage,
            standings: normalized,
          }
        : stage,
    ),
  };

  return {
    state: nextState,
    events: [
      { type: "MATCH_UPDATED", matchId: args.matchId, at: args.now },
      { type: "MATCH_COMPLETED", matchId: args.matchId, at: args.now },
      { type: "STANDINGS_UPDATED", stageId: args.stage.id, at: args.now },
    ],
  };
}

export const ladderPlugin: TournamentFormatPlugin = {
  name: "ladder",
  generateStage({ stageId, stageName, participants, settings, options }) {
    return buildLadderStage({
      stageId,
      stageName,
      participants,
      settings,
      options,
    });
  },
  processMatchResult({ state, matchId, score, outcome, now }) {
    const stage = state.stages.find((s) => s.format === "ladder" && s.matchIds.includes(matchId));
    if (!stage || stage.format !== "ladder") {
      return { state, events: [] };
    }

    return applyLadderResult({
      state,
      stage,
      matchId,
      score,
      outcome,
      now,
    });
  },
};
