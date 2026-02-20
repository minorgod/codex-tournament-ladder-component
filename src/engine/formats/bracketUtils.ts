import type { DomainEvent, BracketStage, Match, MatchOutcome, MatchScore, TournamentState } from "@/models";

export function applyResultBase(
  state: TournamentState,
  matchId: string,
  score: MatchScore,
  outcome: MatchOutcome,
  now: string,
): TournamentState {
  return {
    ...state,
    matches: state.matches.map((match) => {
      if (match.id !== matchId) {
        return match;
      }
      return {
        ...match,
        score,
        outcome,
        status: outcome.kind === "no_contest" ? "void" : "completed",
        completedAt: now,
      };
    }),
  };
}

function resolveFromOutcome(outcome: MatchOutcome, side: "winner" | "loser"): string | null {
  if (outcome.kind !== "winner") {
    return null;
  }
  return side === "winner" ? outcome.winnerId : outcome.loserId;
}

export function propagateByEdges(args: {
  state: TournamentState;
  stage: BracketStage;
  fromMatchId: string;
  outcome: MatchOutcome;
  now: string;
}): { state: TournamentState; events: DomainEvent[] } {
  const { stage, fromMatchId, outcome, now } = args;
  const outgoing = stage.edges.filter((edge) => edge.fromMatchId === fromMatchId);
  if (outgoing.length === 0) {
    return { state: args.state, events: [] };
  }

  const events: DomainEvent[] = [];
  let nextState = args.state;

  for (const edge of outgoing) {
    const participantId = resolveFromOutcome(outcome, edge.from.kind);
    nextState = {
      ...nextState,
      matches: nextState.matches.map((match) => {
        if (match.id !== edge.toMatchId) {
          return match;
        }
        const participants: [string | null, string | null] = [...match.participants];
        participants[edge.toSlot === "A" ? 0 : 1] = participantId;

        // Auto-advance deterministic byes if enabled and exactly one participant exists.
        if (
          stage.settings.autoAdvanceByes &&
          participants.filter((x) => x !== null).length === 1 &&
          match.status !== "completed"
        ) {
          const winnerId = participants[0] ?? participants[1];
          if (winnerId) {
            const loserId = participants[0] && participants[1] ? participants[1] : "BYE";
            return {
              ...match,
              participants,
              status: "completed",
              outcome: { kind: "winner", winnerId, loserId },
              completedAt: now,
            };
          }
        }

        return {
          ...match,
          participants,
          status: match.status === "scheduled" ? "pending" : match.status,
        };
      }),
    };

    events.push({ type: "ADVANCEMENT_APPLIED", fromMatchId, toMatchId: edge.toMatchId, at: now });
  }

  return { state: nextState, events };
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < Math.max(1, n)) {
    p *= 2;
  }
  return p;
}

export function sortParticipantsForSeed(participants: { id: string; seed?: number; rating?: number; name: string }[]): string[] {
  return [...participants]
    .sort((a, b) => {
      const sa = a.seed ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seed ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) {
        return sa - sb;
      }
      if ((b.rating ?? -Infinity) !== (a.rating ?? -Infinity)) {
        return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
      }
      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }
      return a.id.localeCompare(b.id);
    })
    .map((p) => p.id);
}

export function seedPairs(ids: (string | null)[]): [string | null, string | null][] {
  const out: [string | null, string | null][] = [];
  let left = 0;
  let right = ids.length - 1;
  while (left < right) {
    out.push([ids[left] ?? null, ids[right] ?? null]);
    left += 1;
    right -= 1;
  }
  return out;
}

export function bracketMatchLabel(roundIndex: number, matchIndex: number): string {
  return `r${roundIndex + 1}m${matchIndex + 1}`;
}

export function findMatch(state: TournamentState, matchId: string): Match | undefined {
  return state.matches.find((m) => m.id === matchId);
}
