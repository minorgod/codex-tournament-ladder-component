import type { BracketStage, Match, TournamentStage } from "@/models";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import { nextPowerOfTwo, seedPairs, sortParticipantsForSeed } from "@/engine/formats/bracketUtils";
import { processBracketResult } from "@/engine/formats/shared";

function buildSingleElim(args: {
  stageId: string;
  stageName: string;
  participants: { id: string; seed?: number; rating?: number; name: string }[];
  settings: BracketStage["settings"];
}): { stage: TournamentStage; matches: Match[] } {
  const ordered = sortParticipantsForSeed(args.participants);
  const size = nextPowerOfTwo(ordered.length);
  const filled = [...ordered, ...new Array(size - ordered.length).fill(null)];
  const firstRoundPairs = seedPairs(filled);
  const roundsCount = Math.max(1, Math.log2(size));

  const rounds: BracketStage["rounds"] = [];
  const matches: Match[] = [];
  const edges: BracketStage["edges"] = [];

  for (let roundIndex = 0; roundIndex < roundsCount; roundIndex += 1) {
    const matchCount = size / 2 ** (roundIndex + 1);
    const roundId = `${args.stageId}_round_${roundIndex + 1}`;
    const matchIds: string[] = [];

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const id = `${args.stageId}_r${roundIndex + 1}_m${matchIndex + 1}`;
      matchIds.push(id);
      const participants: [string | null, string | null] =
        roundIndex === 0 ? firstRoundPairs[matchIndex] ?? [null, null] : [null, null];
      matches.push({
        id,
        format: "single_elimination",
        stageId: args.stageId,
        roundId,
        bracketSide: "upper",
        orderKey: matchIndex,
        participants,
        status: "pending",
      });
    }

    rounds.push({
      id: roundId,
      name: `Round ${roundIndex + 1}`,
      order: roundIndex,
      matchIds,
    });
  }

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const current = rounds[roundIndex]!;
    const next = rounds[roundIndex + 1]!;
    current.matchIds.forEach((fromMatchId, idx) => {
      const toMatchId = next.matchIds[Math.floor(idx / 2)]!;
      edges.push({
        fromMatchId,
        from: { kind: "winner" },
        toMatchId,
        toSlot: idx % 2 === 0 ? "A" : "B",
      });
    });
  }

  if (args.settings.thirdPlaceMatch && rounds.length >= 2) {
    const stageFinalRound = rounds[rounds.length - 1]!;
    const semifinalRound = rounds[rounds.length - 2]!;
    const thirdPlaceMatchId = `${args.stageId}_third_place`;
    matches.push({
      id: thirdPlaceMatchId,
      format: "single_elimination",
      stageId: args.stageId,
      roundId: `${args.stageId}_round_third`,
      bracketSide: "upper",
      orderKey: 0,
      participants: [null, null],
      status: "pending",
    });
    rounds.push({
      id: `${args.stageId}_round_third`,
      name: "Third Place",
      order: rounds.length,
      matchIds: [thirdPlaceMatchId],
    });
    semifinalRound.matchIds.forEach((fromMatchId, idx) => {
      edges.push({
        fromMatchId,
        from: { kind: "loser" },
        toMatchId: thirdPlaceMatchId,
        toSlot: idx % 2 === 0 ? "A" : "B",
      });
    });

    // keep final round order stable even with third-place appended
    stageFinalRound.order = rounds.length - 2;
  }

  const stage: TournamentStage = {
    id: args.stageId,
    name: args.stageName,
    format: "single_elimination",
    rounds,
    matchIds: matches.map((m) => m.id),
    edges,
    settings: args.settings,
  };

  return { stage, matches };
}

export const singleEliminationPlugin: TournamentFormatPlugin = {
  name: "single_elimination",
  generateStage({ stageId, stageName, participants, settings }) {
    return buildSingleElim({
      stageId,
      stageName,
      participants,
      settings,
    });
  },
  processMatchResult({ state, matchId, score, outcome, now }) {
    const stage = state.stages.find((s) => s.format !== "ladder" && s.matchIds.includes(matchId));
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
