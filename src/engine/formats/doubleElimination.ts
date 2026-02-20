import type { BracketStage, Match, TournamentStage } from "@/models";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import { nextPowerOfTwo, seedPairs, sortParticipantsForSeed } from "@/engine/formats/bracketUtils";
import { processBracketResult } from "@/engine/formats/shared";

interface DoubleElimMeta {
  upperFinalMatchId?: string;
  lowerFinalMatchId?: string;
  grandFinalMatchId?: string;
  grandFinalResetMatchId?: string;
}

function createDoubleElimination(args: {
  stageId: string;
  stageName: string;
  participants: { id: string; seed?: number; rating?: number; name: string }[];
  settings: BracketStage["settings"];
}): { stage: TournamentStage; matches: Match[] } {
  const ordered = sortParticipantsForSeed(args.participants);
  const size = nextPowerOfTwo(ordered.length);
  const roundsCount = Math.max(1, Math.log2(size));
  const padded = [...ordered, ...new Array(size - ordered.length).fill(null)];
  const firstRoundPairs = seedPairs(padded);

  const matches: Match[] = [];
  const rounds: BracketStage["rounds"] = [];
  const edges: BracketStage["edges"] = [];

  const upperRoundIds: string[][] = [];

  for (let r = 0; r < roundsCount; r += 1) {
    const count = size / 2 ** (r + 1);
    const roundId = `${args.stageId}_upper_round_${r + 1}`;
    const matchIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `${args.stageId}_u_r${r + 1}_m${i + 1}`;
      matchIds.push(id);
      matches.push({
        id,
        format: "double_elimination",
        stageId: args.stageId,
        roundId,
        bracketSide: "upper",
        orderKey: i,
        participants: r === 0 ? firstRoundPairs[i] ?? [null, null] : [null, null],
        status: "pending",
      });
    }
    rounds.push({ id: roundId, name: `Upper Round ${r + 1}`, order: rounds.length, matchIds });
    upperRoundIds.push(matchIds);
  }

  for (let r = 0; r < upperRoundIds.length - 1; r += 1) {
    upperRoundIds[r]!.forEach((fromMatchId, idx) => {
      const toMatchId = upperRoundIds[r + 1]![Math.floor(idx / 2)]!;
      edges.push({
        fromMatchId,
        from: { kind: "winner" },
        toMatchId,
        toSlot: idx % 2 === 0 ? "A" : "B",
      });
    });
  }

  const lowerRoundsCount = roundsCount > 1 ? (roundsCount - 1) * 2 : 0;
  const lowerRoundIds: string[][] = [];

  for (let lr = 0; lr < lowerRoundsCount; lr += 1) {
    const count = 2 ** Math.floor((lowerRoundsCount - lr - 1) / 2);
    const roundId = `${args.stageId}_lower_round_${lr + 1}`;
    const matchIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `${args.stageId}_l_r${lr + 1}_m${i + 1}`;
      matchIds.push(id);
      matches.push({
        id,
        format: "double_elimination",
        stageId: args.stageId,
        roundId,
        bracketSide: "lower",
        orderKey: i,
        participants: [null, null],
        status: "pending",
      });
    }
    rounds.push({ id: roundId, name: `Lower Round ${lr + 1}`, order: rounds.length, matchIds });
    lowerRoundIds.push(matchIds);
  }

  for (let lr = 0; lr < lowerRoundIds.length - 1; lr += 1) {
    const curr = lowerRoundIds[lr]!;
    const next = lowerRoundIds[lr + 1]!;
    if (lr % 2 === 0) {
      curr.forEach((fromMatchId, idx) => {
        edges.push({
          fromMatchId,
          from: { kind: "winner" },
          toMatchId: next[idx]!,
          toSlot: "A",
        });
      });
    } else {
      curr.forEach((fromMatchId, idx) => {
        edges.push({
          fromMatchId,
          from: { kind: "winner" },
          toMatchId: next[Math.floor(idx / 2)]!,
          toSlot: idx % 2 === 0 ? "A" : "B",
        });
      });
    }
  }

  if (lowerRoundIds.length > 0) {
    upperRoundIds[0]!.forEach((fromMatchId, idx) => {
      edges.push({
        fromMatchId,
        from: { kind: "loser" },
        toMatchId: lowerRoundIds[0]![Math.floor(idx / 2)]!,
        toSlot: idx % 2 === 0 ? "A" : "B",
      });
    });

    for (let upperRound = 2; upperRound <= roundsCount; upperRound += 1) {
      const targetLower = upperRound * 2 - 4;
      if (targetLower >= lowerRoundIds.length) {
        break;
      }
      upperRoundIds[upperRound - 1]!.forEach((fromMatchId, idx) => {
        edges.push({
          fromMatchId,
          from: { kind: "loser" },
          toMatchId: lowerRoundIds[targetLower]![idx]!,
          toSlot: "B",
        });
      });
    }
  }

  const meta: DoubleElimMeta = {
    upperFinalMatchId: upperRoundIds[upperRoundIds.length - 1]?.[0],
    lowerFinalMatchId: lowerRoundIds[lowerRoundIds.length - 1]?.[0],
  };

  if (roundsCount > 1) {
    const grandRoundId = `${args.stageId}_grand_round`;
    const grandFinalId = `${args.stageId}_grand_final`;
    matches.push({
      id: grandFinalId,
      format: "double_elimination",
      stageId: args.stageId,
      roundId: grandRoundId,
      bracketSide: "grand",
      orderKey: 0,
      participants: [null, null],
      status: "pending",
    });
    rounds.push({ id: grandRoundId, name: "Grand Final", order: rounds.length, matchIds: [grandFinalId] });

    edges.push({
      fromMatchId: meta.upperFinalMatchId!,
      from: { kind: "winner" },
      toMatchId: grandFinalId,
      toSlot: "A",
    });

    if (meta.lowerFinalMatchId) {
      edges.push({
        fromMatchId: meta.lowerFinalMatchId,
        from: { kind: "winner" },
        toMatchId: grandFinalId,
        toSlot: "B",
      });
    }

    meta.grandFinalMatchId = grandFinalId;

    if (args.settings.grandFinalReset) {
      const resetRoundId = `${args.stageId}_grand_reset_round`;
      const resetId = `${args.stageId}_grand_final_reset`;
      matches.push({
        id: resetId,
        format: "double_elimination",
        stageId: args.stageId,
        roundId: resetRoundId,
        bracketSide: "grand",
        orderKey: 0,
        participants: [null, null],
        status: "scheduled",
      });
      rounds.push({ id: resetRoundId, name: "Grand Final Reset", order: rounds.length, matchIds: [resetId] });
      meta.grandFinalResetMatchId = resetId;
    }
  }

  const stage: TournamentStage = {
    id: args.stageId,
    name: args.stageName,
    format: "double_elimination",
    rounds,
    matchIds: matches.map((m) => m.id),
    edges,
    settings: {
      ...args.settings,
      metadata: {
        ...(args.settings.metadata ?? {}),
        doubleElimination: meta,
      },
    },
  };

  return { stage, matches };
}

export const doubleEliminationPlugin: TournamentFormatPlugin = {
  name: "double_elimination",
  generateStage({ stageId, stageName, participants, settings }) {
    return createDoubleElimination({ stageId, stageName, participants, settings });
  },
  processMatchResult({ state, matchId, score, outcome, now }) {
    const stage = state.stages.find((s) => s.format === "double_elimination" && s.matchIds.includes(matchId));
    if (!stage || stage.format === "ladder") {
      return { state, events: [] };
    }

    const base = processBracketResult({ state, stage, matchId, score, outcome, now });

    const meta = (stage.settings.metadata?.doubleElimination ?? {}) as DoubleElimMeta;
    if (!meta.grandFinalResetMatchId || matchId !== meta.grandFinalMatchId) {
      return base;
    }

    const grandFinal = base.state.matches.find((m) => m.id === matchId);
    if (!grandFinal || outcome.kind !== "winner") {
      return base;
    }

    const resetId = meta.grandFinalResetMatchId;
    const upperChampion = grandFinal.participants[0];
    const lowerChampion = grandFinal.participants[1];
    if (!upperChampion || !lowerChampion) {
      return base;
    }

    const lowerWon = outcome.winnerId === lowerChampion;
    const finalists: [string, string] = [upperChampion, lowerChampion];
    const nextState = {
      ...base.state,
      matches: base.state.matches.map((m): Match => {
        if (m.id !== resetId) {
          return m;
        }
        if (lowerWon) {
          return {
            ...m,
            participants: finalists,
            status: "pending",
          };
        }
        return {
          ...m,
          participants: finalists,
          status: "void",
          outcome: { kind: "winner", winnerId: upperChampion, loserId: lowerChampion },
          completedAt: now,
        };
      }),
    };

    return {
      state: nextState,
      events: [
        ...base.events,
        { type: "MATCH_UPDATED", matchId: resetId, at: now },
      ],
    };
  },
};
