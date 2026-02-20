import type { BracketStage, Match, Participant, TournamentStage } from "@/models";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import { processBracketResult } from "@/engine/formats/shared";
import { sortParticipantsForSeed } from "@/engine/formats/bracketUtils";

interface SwissStat {
  participantId: string;
  wins: number;
  losses: number;
  draws: number;
  opponents: Set<string>;
}

function createSwissStage(args: {
  stageId: string;
  stageName: string;
  participants: Participant[];
  settings: BracketStage["settings"];
  options?: Record<string, unknown>;
}): { stage: TournamentStage; matches: Match[] } {
  const roundsCount =
    args.settings.roundsCount ??
    (typeof args.options?.rounds === "number" ? args.options.rounds : 5);

  const ordered = sortParticipantsForSeed(args.participants);
  const rounds: BracketStage["rounds"] = [];
  const matches: Match[] = [];
  const perRoundMatchCount = Math.ceil(ordered.length / 2);

  for (let roundIndex = 0; roundIndex < roundsCount; roundIndex += 1) {
    const roundId = `${args.stageId}_swiss_round_${roundIndex + 1}`;
    const roundMatchIds: string[] = [];
    for (let i = 0; i < perRoundMatchCount; i += 1) {
      const matchId = `${args.stageId}_swiss_r${roundIndex + 1}_m${i + 1}`;
      roundMatchIds.push(matchId);
      let participants: [string | null, string | null] = [null, null];
      if (roundIndex === 0) {
        const left = ordered[i * 2] ?? null;
        const right = ordered[i * 2 + 1] ?? null;
        participants = [left, right];
      }
      matches.push({
        id: matchId,
        format: "swiss",
        stageId: args.stageId,
        roundId,
        bracketSide: "group",
        orderKey: i,
        participants,
        status: participants[0] || participants[1] ? "pending" : "scheduled",
      });
    }
    rounds.push({
      id: roundId,
      name: `Swiss Round ${roundIndex + 1}`,
      order: roundIndex,
      matchIds: roundMatchIds,
    });
  }

  const stage: TournamentStage = {
    id: args.stageId,
    name: args.stageName,
    format: "swiss",
    rounds,
    matchIds: matches.map((m) => m.id),
    edges: [],
    settings: args.settings,
  };

  return { stage, matches };
}

function computeStats(stateParticipants: Participant[], matches: Match[]): Map<string, SwissStat> {
  const stats = new Map<string, SwissStat>();
  stateParticipants.forEach((participant) => {
    stats.set(participant.id, {
      participantId: participant.id,
      wins: 0,
      losses: 0,
      draws: 0,
      opponents: new Set(),
    });
  });

  for (const match of matches) {
    const [a, b] = match.participants;
    if (a && b) {
      stats.get(a)?.opponents.add(b);
      stats.get(b)?.opponents.add(a);
    }
    if (match.status !== "completed" || !match.outcome) {
      continue;
    }
    if (match.outcome.kind === "winner") {
      const winner = stats.get(match.outcome.winnerId);
      const loser = stats.get(match.outcome.loserId);
      if (winner) {
        winner.wins += 1;
      }
      if (loser) {
        loser.losses += 1;
      }
    } else if (match.outcome.kind === "draw") {
      if (a && stats.has(a)) {
        stats.get(a)!.draws += 1;
      }
      if (b && stats.has(b)) {
        stats.get(b)!.draws += 1;
      }
    }
  }

  return stats;
}

function pairSwissRound(args: {
  participants: Participant[];
  stageMatches: Match[];
}): [string | null, string | null][] {
  const stats = computeStats(args.participants, args.stageMatches);
  const winsById = new Map<string, number>();
  stats.forEach((value, id) => {
    winsById.set(id, value.wins);
  });

  const ordered = [...stats.values()].sort((a, b) => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    if (a.draws !== b.draws) {
      return b.draws - a.draws;
    }

    const buchholzA = [...a.opponents].reduce((sum, opp) => sum + (winsById.get(opp) ?? 0), 0);
    const buchholzB = [...b.opponents].reduce((sum, opp) => sum + (winsById.get(opp) ?? 0), 0);
    if (buchholzA !== buchholzB) {
      return buchholzB - buchholzA;
    }

    const pa = args.participants.find((p) => p.id === a.participantId);
    const pb = args.participants.find((p) => p.id === b.participantId);
    const seedA = pa?.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = pb?.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) {
      return seedA - seedB;
    }
    return a.participantId.localeCompare(b.participantId);
  });

  const unpaired = ordered.map((row) => row.participantId);
  const pairs: [string | null, string | null][] = [];

  if (unpaired.length % 2 === 1) {
    const bye = unpaired.pop()!;
    pairs.push([bye, null]);
  }

  while (unpaired.length > 0) {
    const a = unpaired.shift()!;
    const aStats = stats.get(a)!;
    let chosenIdx = -1;

    for (let idx = 0; idx < unpaired.length; idx += 1) {
      const candidate = unpaired[idx]!;
      if (!aStats.opponents.has(candidate)) {
        chosenIdx = idx;
        break;
      }
    }

    if (chosenIdx < 0) {
      chosenIdx = 0;
    }

    const [b] = unpaired.splice(chosenIdx, 1);
    pairs.push([a, b ?? null]);
  }

  return pairs;
}

export const swissPlugin: TournamentFormatPlugin = {
  name: "swiss",
  generateStage({ stageId, stageName, participants, settings, options }) {
    return createSwissStage({
      stageId,
      stageName,
      participants,
      settings,
      options,
    });
  },
  processMatchResult({ state, matchId, score, outcome, now }) {
    const stage = state.stages.find((s) => s.format === "swiss" && s.matchIds.includes(matchId));
    if (!stage || stage.format === "ladder") {
      return { state, events: [] };
    }

    const base = processBracketResult({
      state,
      stage,
      matchId,
      score,
      outcome,
      now,
      includeCompletionEvent: true,
    });

    const match = base.state.matches.find((m) => m.id === matchId);
    if (!match?.roundId) {
      return base;
    }

    const roundIndex = stage.rounds.findIndex((r) => r.id === match.roundId);
    if (roundIndex < 0 || roundIndex >= stage.rounds.length - 1) {
      return base;
    }

    const currentRound = stage.rounds[roundIndex]!;
    const roundMatches = base.state.matches.filter((m) => currentRound.matchIds.includes(m.id));
    if (!roundMatches.every((m) => m.status === "completed" || m.status === "void")) {
      return base;
    }

    const nextRound = stage.rounds[roundIndex + 1]!;
    const nextMatches = base.state.matches.filter((m) => nextRound.matchIds.includes(m.id));
    if (!nextMatches.every((m) => m.participants[0] === null && m.participants[1] === null)) {
      return base;
    }

    const participantPool = state.participants.filter((p) =>
      base.state.matches.some((m) => m.stageId === stage.id && m.participants.includes(p.id)),
    );
    const stageMatches = base.state.matches.filter((m) => m.stageId === stage.id);
    const pairings = pairSwissRound({ participants: participantPool, stageMatches });

    let nextState = base.state;
    const events = [...base.events];

    nextMatches.forEach((existing, idx) => {
      const pairing = pairings[idx] ?? [null, null];
      const [a, b] = pairing;
      const autoCompleted = a && !b;
      nextState = {
        ...nextState,
        matches: nextState.matches.map((m) => {
          if (m.id !== existing.id) {
            return m;
          }
          if (autoCompleted) {
            return {
              ...m,
              participants: [a, b],
              status: "completed",
              score: { mode: "points", a: 1, b: 0, notes: "Swiss bye" },
              outcome: { kind: "winner", winnerId: a, loserId: "BYE" },
              completedAt: now,
            };
          }
          return {
            ...m,
            participants: [a, b],
            status: a || b ? "pending" : "scheduled",
          };
        }),
      };
      events.push({ type: "MATCH_UPDATED", matchId: existing.id, at: now });
    });

    return {
      state: nextState,
      events,
    };
  },
};
