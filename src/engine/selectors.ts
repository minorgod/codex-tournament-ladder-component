import type { BracketStage, Match, Participant, TournamentState } from "@/models";

export interface BracketNodeLayout {
  matchId: string;
  roundIndex: number;
  orderIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getBracketStage(state: TournamentState, stageId: string): BracketStage | undefined {
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage || stage.format === "ladder") {
    return undefined;
  }
  return stage;
}

function getMatchesMap(state: TournamentState): Map<string, Match> {
  return new Map(state.matches.map((m) => [m.id, m]));
}

export interface EngineSelectors {
  getStageById(state: TournamentState, stageId: string): TournamentState["stages"][number] | undefined;
  getMatchesForStage(state: TournamentState, stageId: string): Match[];
  getRoundMatches(state: TournamentState, stageId: string, roundId: string): Match[];
  getParticipantPathToFinals(state: TournamentState, stageId: string, participantId: string): string[];
  getUpsets(state: TournamentState, stageId: string): Match[];
  getLadderStandings(state: TournamentState, stageId: string): { participant: Participant | undefined; rank: number; points?: number; streak?: number }[];
  searchParticipants(state: TournamentState, query: string): Participant[];
  getAdjacentMatchId(
    state: TournamentState,
    stageId: string,
    matchId: string,
    direction: "left" | "right" | "up" | "down",
  ): string | undefined;
  getBracketNodeLayouts(
    state: TournamentState,
    stageId: string,
    orientation: "horizontal" | "vertical",
    viewport?: Viewport,
  ): BracketNodeLayout[];
}

function intersects(a: Viewport, b: Viewport): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

export const selectors: EngineSelectors = {
  getStageById(state, stageId) {
    return state.stages.find((stage) => stage.id === stageId);
  },

  getMatchesForStage(state, stageId) {
    const stage = state.stages.find((s) => s.id === stageId);
    if (!stage) {
      return [];
    }
    const map = getMatchesMap(state);
    return stage.matchIds.map((id) => map.get(id)).filter(Boolean) as Match[];
  },

  getRoundMatches(state, stageId, roundId) {
    const stage = getBracketStage(state, stageId);
    if (!stage) {
      return [];
    }
    const round = stage.rounds.find((r) => r.id === roundId);
    if (!round) {
      return [];
    }
    const map = getMatchesMap(state);
    return round.matchIds.map((id) => map.get(id)).filter(Boolean) as Match[];
  },

  getParticipantPathToFinals(state, stageId, participantId) {
    const stage = getBracketStage(state, stageId);
    if (!stage) {
      return [];
    }

    const matchesById = getMatchesMap(state);
    const path = new Set<string>();
    const queue = state.matches
      .filter((m) => stage.matchIds.includes(m.id) && m.participants.includes(participantId))
      .map((m) => m.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (path.has(current)) {
        continue;
      }
      path.add(current);
      const outgoing = stage.edges.filter((edge) => edge.fromMatchId === current);
      outgoing.forEach((edge) => {
        const nextMatch = matchesById.get(edge.toMatchId);
        if (!nextMatch) {
          return;
        }
        if (nextMatch.participants.includes(participantId) || nextMatch.participants.includes(null)) {
          queue.push(nextMatch.id);
        }
      });
    }

    return [...path];
  },

  getUpsets(state, stageId) {
    const stage = state.stages.find((s) => s.id === stageId);
    if (!stage) {
      return [];
    }
    const participantsById = new Map(state.participants.map((p) => [p.id, p]));
    return state.matches.filter((match) => {
      if (!stage.matchIds.includes(match.id) || match.outcome?.kind !== "winner") {
        return false;
      }
      const winnerSeed = participantsById.get(match.outcome.winnerId)?.seed;
      const loserSeed = participantsById.get(match.outcome.loserId)?.seed;
      if (!winnerSeed || !loserSeed) {
        return false;
      }
      return winnerSeed > loserSeed;
    });
  },

  getLadderStandings(state, stageId) {
    const stage = state.stages.find((s) => s.id === stageId);
    if (!stage || stage.format !== "ladder") {
      return [];
    }
    const participantsById = new Map(state.participants.map((p) => [p.id, p]));
    return [...stage.standings]
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => ({
        participant: participantsById.get(entry.participantId),
        rank: entry.rank,
        points: entry.points,
        streak: entry.streak,
      }));
  },

  searchParticipants(state, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return state.participants.filter((p) => p.name.toLowerCase().includes(normalized));
  },

  getAdjacentMatchId(state, stageId, matchId, direction) {
    const stage = getBracketStage(state, stageId);
    if (!stage) {
      return undefined;
    }

    const roundIndex = stage.rounds.findIndex((round) => round.matchIds.includes(matchId));
    if (roundIndex < 0) {
      return undefined;
    }
    const round = stage.rounds[roundIndex]!;
    const indexInRound = round.matchIds.indexOf(matchId);

    if (direction === "up") {
      return round.matchIds[Math.max(0, indexInRound - 1)];
    }
    if (direction === "down") {
      return round.matchIds[Math.min(round.matchIds.length - 1, indexInRound + 1)];
    }
    if (direction === "left") {
      const prevRound = stage.rounds[roundIndex - 1];
      if (!prevRound) {
        return undefined;
      }
      return prevRound.matchIds[Math.min(prevRound.matchIds.length - 1, indexInRound * 2)];
    }

    const nextRound = stage.rounds[roundIndex + 1];
    if (!nextRound) {
      return undefined;
    }
    return nextRound.matchIds[Math.floor(indexInRound / 2)];
  },

  getBracketNodeLayouts(state, stageId, orientation, viewport) {
    const stage = getBracketStage(state, stageId);
    if (!stage) {
      return [];
    }

    const cardWidth = 200;
    const cardHeight = 90;
    const xGap = 80;
    const yGap = 30;

    const layouts: BracketNodeLayout[] = [];
    stage.rounds.forEach((round, roundIndex) => {
      round.matchIds.forEach((matchId, orderIndex) => {
        const horizontalX = roundIndex * (cardWidth + xGap);
        const horizontalY = orderIndex * (cardHeight + yGap) * 2 ** roundIndex;

        const node: BracketNodeLayout = {
          matchId,
          roundIndex,
          orderIndex,
          x: orientation === "horizontal" ? horizontalX : horizontalY,
          y: orientation === "horizontal" ? horizontalY : horizontalX,
          width: cardWidth,
          height: cardHeight,
        };

        layouts.push(node);
      });
    });

    if (!viewport) {
      return layouts;
    }

    return layouts.filter((node) =>
      intersects(viewport, { x: node.x, y: node.y, width: node.width, height: node.height }),
    );
  },
};
