import type { TournamentState } from "@/models";

export const LATEST_STATE_SCHEMA_VERSION = 1;

export function toJSON(state: TournamentState): string {
  return JSON.stringify(state);
}

export function migrateState(json: string, fromVersion: number, toVersion: number): TournamentState {
  const parsed = JSON.parse(json) as TournamentState;
  if (fromVersion === toVersion) {
    return parsed;
  }

  // Migration scaffold: add versioned transforms here.
  let state = parsed;
  for (let version = fromVersion; version < toVersion; version += 1) {
    if (version === 0) {
      state = {
        ...state,
        stateSchemaVersion: 1,
      };
    }
  }

  return state;
}

export function fromJSON(json: string): TournamentState {
  const parsed = JSON.parse(json) as TournamentState;
  const fromVersion = parsed.stateSchemaVersion ?? 0;
  if (fromVersion === LATEST_STATE_SCHEMA_VERSION) {
    return parsed;
  }
  return migrateState(json, fromVersion, LATEST_STATE_SCHEMA_VERSION);
}
