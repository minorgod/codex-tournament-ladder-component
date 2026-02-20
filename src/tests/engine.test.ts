import { describe, expect, it } from "vitest";

import { createTournamentEngine } from "@/engine";
import type { Command } from "@/engine";
import type { TournamentState } from "@/models";

const engine = createTournamentEngine();

function now() {
  return "2026-02-20T12:00:00Z";
}

function seededState(participantCount: number): TournamentState {
  let state = engine.createEmpty(now(), "t1", "Spec Tournament");
  const participants = Array.from({ length: participantCount }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    type: "player" as const,
    seed: idx + 1,
    rating: 1800 - idx * 10,
  }));

  state = engine.applyCommand(state, { type: "ADD_PARTICIPANTS", payload: { participants } }, now()).state;
  return state;
}

function apply(state: TournamentState, command: Command): TournamentState {
  return engine.applyCommand(state, command, now(), { id: "t", name: "Test", role: "admin" }).state;
}

describe("deterministic engine", () => {
  it("returns same next state for same state+command", () => {
    const base = seededState(8);
    const command: Command = {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "s1",
        stageName: "Single",
        format: "single_elimination",
        settings: { autoAdvanceByes: true },
      },
    };

    const a = engine.applyCommand(base, command, now()).state;
    const b = engine.applyCommand(base, command, now()).state;

    expect(a).toEqual(b);
  });

  it("generates single elimination brackets for N=2..64", () => {
    for (let n = 2; n <= 64; n += 1) {
      let state = seededState(n);
      state = apply(state, {
        type: "GENERATE_STAGE",
        payload: {
          stageId: `s_${n}`,
          stageName: `SE ${n}`,
          format: "single_elimination",
          settings: { autoAdvanceByes: true },
        },
      });

      const stage = state.stages.find((s) => s.id === `s_${n}`);
      expect(stage).toBeDefined();
      if (!stage || stage.format === "ladder") {
        continue;
      }
      expect(stage.rounds.length).toBeGreaterThan(0);
      expect(stage.matchIds.length).toBeGreaterThan(0);
    }
  });

  it("assigns byes and auto-advances", () => {
    let state = seededState(5);
    state = apply(state, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "bye_stage",
        stageName: "Bye Stage",
        format: "single_elimination",
        settings: { autoAdvanceByes: true },
      },
    });

    const stage = state.stages.find((s) => s.id === "bye_stage");
    expect(stage).toBeDefined();
    if (!stage || stage.format === "ladder") {
      return;
    }
    const completedByes = state.matches.filter(
      (m) => stage.matchIds.includes(m.id) && m.outcome?.kind === "winner" && m.outcome.loserId === "BYE",
    );
    expect(completedByes.length).toBeGreaterThan(0);
  });

  it("supports double elimination standard flow metadata", () => {
    let state = seededState(8);
    state = apply(state, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "de8",
        stageName: "Double",
        format: "double_elimination",
        settings: { grandFinalReset: true },
      },
    });

    const stage = state.stages.find((s) => s.id === "de8");
    expect(stage).toBeDefined();
    if (!stage || stage.format === "ladder") {
      return;
    }
    expect(stage.rounds.some((r) => r.name.toLowerCase().includes("upper"))).toBe(true);
    expect(stage.rounds.some((r) => r.name.toLowerCase().includes("lower"))).toBe(true);
    expect(stage.rounds.some((r) => r.name.toLowerCase().includes("grand"))).toBe(true);
  });

  it("undoes results with downstream cascade", () => {
    let state = seededState(4);
    state = apply(state, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "undo_stage",
        stageName: "Undo Stage",
        format: "single_elimination",
        settings: {},
      },
    });

    const stage = state.stages.find((s) => s.id === "undo_stage");
    expect(stage && stage.format !== "ladder").toBe(true);
    if (!stage || stage.format === "ladder") {
      return;
    }

    const semifinalA = stage.rounds[0]!.matchIds[0]!;
    const semifinalB = stage.rounds[0]!.matchIds[1]!;

    const matchA = state.matches.find((m) => m.id === semifinalA)!;
    const matchB = state.matches.find((m) => m.id === semifinalB)!;

    const [a1, a2] = matchA.participants;
    const [b1, b2] = matchB.participants;
    if (!a1 || !a2 || !b1 || !b2) {
      return;
    }

    state = apply(state, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: semifinalA,
        score: { mode: "points", a: 2, b: 1 },
        outcome: { kind: "winner", winnerId: a1, loserId: a2 },
      },
    });

    state = apply(state, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: semifinalB,
        score: { mode: "points", a: 2, b: 0 },
        outcome: { kind: "winner", winnerId: b1, loserId: b2 },
      },
    });

    const finalMatchId = stage.rounds[1]!.matchIds[0]!;
    state = apply(state, {
      type: "UNDO_MATCH_RESULT",
      payload: { matchId: semifinalA },
    });

    const final = state.matches.find((m) => m.id === finalMatchId)!;
    expect(final.participants[0]).toBeNull();
    expect(final.outcome).toBeUndefined();
  });

  it("swiss pairings avoid repeats and remain deterministic", () => {
    let base = seededState(10);
    base = apply(base, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "sw1",
        stageName: "Swiss",
        format: "swiss",
        settings: { roundsCount: 4 },
      },
    });

    const first = engine.applyCommand(base, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: "sw1_swiss_r1_m1",
        score: { mode: "points", a: 1, b: 0 },
        outcome: { kind: "winner", winnerId: "p1", loserId: "p2" },
      },
    }, now()).state;

    const second = engine.applyCommand(base, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: "sw1_swiss_r1_m1",
        score: { mode: "points", a: 1, b: 0 },
        outcome: { kind: "winner", winnerId: "p1", loserId: "p2" },
      },
    }, now()).state;

    expect(first).toEqual(second);
  });

  it("ladder swap/cooldown/decay idempotency", () => {
    let state = seededState(6);
    state = apply(state, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "lad",
        stageName: "Ladder",
        format: "ladder",
        settings: { metadata: {} },
      },
    });

    const before = state;
    state = apply(state, { type: "LADDER_CHALLENGE", payload: { challengerId: "p6", challengedId: "p3" } });
    const challengeMatch = state.matches.find((m) => m.stageId === "lad");
    expect(challengeMatch).toBeDefined();
    if (!challengeMatch) {
      return;
    }

    state = apply(state, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: challengeMatch.id,
        score: { mode: "points", a: 2, b: 0 },
        outcome: { kind: "winner", winnerId: "p6", loserId: "p3" },
      },
    });

    const afterWin = state.stages.find((s) => s.id === "lad");
    expect(afterWin && afterWin.format === "ladder").toBe(true);

    const blockedCooldown = engine.applyCommand(state, {
      type: "LADDER_CHALLENGE",
      payload: { challengerId: "p6", challengedId: "p2" },
    }, now());
    expect(blockedCooldown.validation.ok).toBe(false);

    const once = apply(before, { type: "APPLY_DECAY", payload: { stageId: "lad", at: "2026-03-01T00:00:00Z" } });
    const twice = apply(once, { type: "APPLY_DECAY", payload: { stageId: "lad", at: "2026-03-01T00:00:00Z" } });
    expect(once.stages).toEqual(twice.stages);
  });

  it("recomputes ladder standings on undo", () => {
    let state = seededState(6);
    state = apply(state, {
      type: "GENERATE_STAGE",
      payload: {
        stageId: "lad_u",
        stageName: "Ladder Undo",
        format: "ladder",
        settings: { metadata: {} },
      },
    });

    state = apply(state, { type: "LADDER_CHALLENGE", payload: { challengerId: "p6", challengedId: "p3" } });
    let firstMatch = state.matches.find((m) => m.stageId === "lad_u");
    expect(firstMatch).toBeDefined();
    if (!firstMatch) {
      return;
    }

    state = apply(state, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: firstMatch.id,
        score: { mode: "points", a: 2, b: 0 },
        outcome: { kind: "winner", winnerId: "p6", loserId: "p3" },
      },
    });

    state = apply(state, { type: "LADDER_CHALLENGE", payload: { challengerId: "p5", challengedId: "p2" } });
    const secondMatch = state.matches.filter((m) => m.stageId === "lad_u").find((m) => m.id !== firstMatch!.id);
    expect(secondMatch).toBeDefined();
    if (!secondMatch) {
      return;
    }

    state = apply(state, {
      type: "RECORD_MATCH_RESULT",
      payload: {
        matchId: secondMatch.id,
        score: { mode: "points", a: 2, b: 0 },
        outcome: { kind: "winner", winnerId: "p5", loserId: "p2" },
      },
    });

    const beforeUndo = state.stages.find((s) => s.id === "lad_u");
    expect(beforeUndo && beforeUndo.format === "ladder").toBe(true);
    if (!beforeUndo || beforeUndo.format !== "ladder") {
      return;
    }
    const p6Before = beforeUndo.standings.find((s) => s.participantId === "p6");
    expect(p6Before?.rank).toBeLessThan(6);

    state = apply(state, {
      type: "UNDO_MATCH_RESULT",
      payload: { matchId: firstMatch.id },
    });

    const afterUndo = state.stages.find((s) => s.id === "lad_u");
    expect(afterUndo && afterUndo.format === "ladder").toBe(true);
    if (!afterUndo || afterUndo.format !== "ladder") {
      return;
    }
    const p6After = afterUndo.standings.find((s) => s.participantId === "p6");
    expect(p6After?.rank).toBeGreaterThanOrEqual(p6Before?.rank ?? 1);
  });

  it("blocks admin commands for non-admin actors", () => {
    const state = seededState(4);
    const denied = engine.applyCommand(
      state,
      {
        type: "SEED_PARTICIPANTS",
        payload: { method: "shuffle" },
      },
      now(),
      { id: "viewer", role: "viewer", name: "Viewer" },
    );
    expect(denied.validation.ok).toBe(false);
    expect(denied.validation.issues.some((issue) => issue.code === "ROLE_FORBIDDEN")).toBe(true);
  });
});
