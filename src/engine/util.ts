import type { Match, Participant, TournamentState } from "@/models";

export function cloneState<T>(state: T): T {
  return structuredClone(state);
}

export function deterministicSortParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) {
      return seedA - seedB;
    }
    if ((b.rating ?? -Infinity) !== (a.rating ?? -Infinity)) {
      return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
    }
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    return a.id.localeCompare(b.id);
  });
}

export function makeId(prefix: string, state: TournamentState): string {
  const serial = state.version + state.matches.length + state.stages.length + state.participants.length + state.audit.length + 1;
  return `${prefix}_${serial}`;
}

export function getMatch(state: TournamentState, matchId: string): Match | undefined {
  return state.matches.find((m) => m.id === matchId);
}

export function updateMatch(state: TournamentState, next: Match): TournamentState {
  const matches = state.matches.map((m) => (m.id === next.id ? next : m));
  return { ...state, matches };
}

export function mulberry32(seed: number): () => number {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function stableShuffled<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
