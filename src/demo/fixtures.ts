import { createTournamentEngine, type Command } from "@/engine";
import type { TournamentState } from "@/models";

const engine = createTournamentEngine();

function apply(state: TournamentState, command: Command): TournamentState {
  return engine.applyCommand(state, command, new Date().toISOString(), { id: "demo", name: "Demo Seed", role: "admin" }).state;
}

export function createDemoTournamentState(): TournamentState {
  let state = engine.createEmpty(new Date().toISOString(), "demo_tournament", "Summer Split");

  state = apply(state, {
    type: "ADD_PARTICIPANTS",
    payload: {
      participants: [
        { id: "p1", name: "Iron Owls", type: "team", seed: 1, rating: 1680 },
        { id: "p2", name: "Violet Sharks", type: "team", seed: 2, rating: 1640 },
        { id: "p3", name: "Crimson Vale", type: "team", seed: 3, rating: 1610 },
        { id: "p4", name: "Blue Tides", type: "team", seed: 4, rating: 1605 },
        { id: "p5", name: "Silver Grove", type: "team", seed: 5, rating: 1570 },
        { id: "p6", name: "Golden Frame", type: "team", seed: 6, rating: 1560 },
        { id: "p7", name: "Polar Drakes", type: "team", seed: 7, rating: 1540 },
        { id: "p8", name: "Neon Orbit", type: "team", seed: 8, rating: 1525 },
      ],
    },
  });

  state = apply(state, {
    type: "GENERATE_STAGE",
    payload: {
      stageId: "playoffs",
      stageName: "Playoffs",
      format: "double_elimination",
      settings: {
        autoAdvanceByes: true,
        grandFinalReset: true,
      },
    },
  });

  state = apply(state, {
    type: "GENERATE_STAGE",
    payload: {
      stageId: "season_ladder",
      stageName: "Season Ladder",
      format: "ladder",
      settings: {
        metadata: {
          season: "S1",
        },
      },
      options: {
        rules: {
          swapRule: "hybrid",
          cooldownHours: 12,
          challengeWindow: { minRank: -4, maxRank: 3 },
          decay: { enabled: true, daysInactiveToStart: 10, pointsPerDay: 2 },
          points: { win: 3, loss: 1, draw: 1, bonusStreak: 1 },
        },
      },
    },
  });

  return state;
}
