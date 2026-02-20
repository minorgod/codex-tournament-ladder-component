import type { BracketStage, Match, TournamentStage } from "@/models";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import { processBracketResult } from "@/engine/formats/shared";
import { sortParticipantsForSeed } from "@/engine/formats/bracketUtils";

function circlePairings(ids: (string | null)[]): [string | null, string | null][][] {
  const participants = [...ids];
  const rounds: [string | null, string | null][][] = [];

  for (let round = 0; round < participants.length - 1; round += 1) {
    const matches: [string | null, string | null][] = [];
    for (let i = 0; i < participants.length / 2; i += 1) {
      const a = participants[i] ?? null;
      const b = participants[participants.length - 1 - i] ?? null;
      matches.push([a, b]);
    }
    rounds.push(matches);

    const fixed = participants[0];
    const rotated = participants.slice(1);
    const moved = rotated.pop();
    participants.splice(0, participants.length, fixed ?? null, moved ?? null, ...rotated);
  }

  return rounds;
}

function generateRoundRobin(args: {
  stageId: string;
  stageName: string;
  participants: { id: string; seed?: number; rating?: number; name: string }[];
  settings: BracketStage["settings"];
}): { stage: TournamentStage; matches: Match[] } {
  const ordered = sortParticipantsForSeed(args.participants);
  const pool: (string | null)[] = [...ordered];
  if (pool.length % 2 === 1) {
    pool.push(null);
  }

  const baseRounds = circlePairings(pool);
  const roundsWithLegs = args.settings.doubleRoundRobin
    ? [...baseRounds, ...baseRounds.map((round) => round.map(([a, b]) => [b, a] as [string | null, string | null]))]
    : baseRounds;

  const rounds: BracketStage["rounds"] = [];
  const matches: Match[] = [];

  roundsWithLegs.forEach((roundMatches, roundIndex) => {
    const roundId = `${args.stageId}_rr_round_${roundIndex + 1}`;
    const matchIds: string[] = [];

    roundMatches.forEach((pairing, idx) => {
      const matchId = `${args.stageId}_rr_r${roundIndex + 1}_m${idx + 1}`;
      matchIds.push(matchId);
      const [a, b] = pairing;
      const isBye = Boolean((a && !b) || (!a && b));
      const winner = a ?? b;
      matches.push({
        id: matchId,
        format: "round_robin",
        stageId: args.stageId,
        roundId,
        bracketSide: "group",
        orderKey: idx,
        participants: [a, b],
        status: isBye && args.settings.autoAdvanceByes ? "completed" : "pending",
        score: isBye && args.settings.autoAdvanceByes ? { mode: "points", a: a ? 1 : 0, b: b ? 1 : 0, notes: "Round-robin bye" } : undefined,
        outcome:
          isBye && args.settings.autoAdvanceByes && winner
            ? { kind: "winner", winnerId: winner, loserId: "BYE" }
            : undefined,
      });
    });

    rounds.push({
      id: roundId,
      name: `Round Robin ${roundIndex + 1}`,
      order: roundIndex,
      matchIds,
    });
  });

  const stage: TournamentStage = {
    id: args.stageId,
    name: args.stageName,
    format: "round_robin",
    rounds,
    matchIds: matches.map((m) => m.id),
    edges: [],
    settings: args.settings,
  };

  return { stage, matches };
}

export const roundRobinPlugin: TournamentFormatPlugin = {
  name: "round_robin",
  generateStage({ stageId, stageName, participants, settings }) {
    return generateRoundRobin({
      stageId,
      stageName,
      participants,
      settings,
    });
  },
  processMatchResult({ state, matchId, score, outcome, now }) {
    const stage = state.stages.find((s) => s.format === "round_robin" && s.matchIds.includes(matchId));
    if (!stage || stage.format === "ladder") {
      return { state, events: [] };
    }

    return processBracketResult({
      state,
      stage,
      matchId,
      score,
      outcome,
      now,
    });
  },
};
