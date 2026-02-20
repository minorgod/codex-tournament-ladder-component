import type { Participant } from "@/models";
import { stableShuffled } from "@/engine/util";

export function seedParticipantsManual(participants: Participant[], seedMap: Record<string, number>): Participant[] {
  return participants.map((participant) => ({
    ...participant,
    seed: seedMap[participant.id] ?? participant.seed,
  }));
}

export function seedParticipantsByRating(participants: Participant[]): Participant[] {
  const sorted = [...participants].sort((a, b) => {
    if ((b.rating ?? -Infinity) !== (a.rating ?? -Infinity)) {
      return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
    }
    return a.id.localeCompare(b.id);
  });

  return sorted.map((participant, idx) => ({
    ...participant,
    seed: idx + 1,
  }));
}

export function seedParticipantsShuffle(participants: Participant[], seed = "default-seed"): Participant[] {
  const shuffled = stableShuffled(participants, seed);
  return shuffled.map((participant, idx) => ({
    ...participant,
    seed: idx + 1,
  }));
}
