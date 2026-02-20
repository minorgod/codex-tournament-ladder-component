import { create } from "zustand";

import { createTournamentEngine, type Actor, type Command } from "@/engine";
import type { DomainEvent, TournamentState } from "@/models";
import type { RealtimeAdapter } from "@/realtime";

interface UIFilters {
  status: "all" | "scheduled" | "pending" | "in_progress" | "completed" | "forfeit" | "disqualified" | "void";
  bracketSide: "all" | "upper" | "lower" | "grand" | "group" | "ladder";
  stageId: string | "all";
}

interface TournamentStoreState {
  tournament: TournamentState;
  selectedMatchId?: string;
  highlightedParticipantId?: string;
  query: string;
  filters: UIFilters;
  lastEvents: DomainEvent[];
  validationIssues: string[];
  reducedMotion: boolean;
  adapter?: RealtimeAdapter;

  initialize(state: TournamentState): void;
  applyCommand(command: Command, now?: string, actor?: Actor): void;
  selectMatch(matchId?: string): void;
  setQuery(query: string): void;
  highlightParticipant(participantId?: string): void;
  setFilters(next: Partial<UIFilters>): void;
  setReducedMotion(enabled: boolean): void;
  connectAdapter(adapter: RealtimeAdapter): void;
  disconnectAdapter(): void;
  exportJSON(): string;
  importJSON(json: string): void;
}

const engine = createTournamentEngine();

const nowISO = () => new Date().toISOString();

function createFallbackState(): TournamentState {
  return engine.createEmpty(nowISO(), "tournament", "Tournament");
}

export const useTournamentStore = create<TournamentStoreState>((set, get) => ({
  tournament: createFallbackState(),
  selectedMatchId: undefined,
  highlightedParticipantId: undefined,
  query: "",
  filters: {
    status: "all",
    bracketSide: "all",
    stageId: "all",
  },
  lastEvents: [],
  validationIssues: [],
  reducedMotion: false,
  adapter: undefined,

  initialize(state) {
    set({ tournament: state, validationIssues: [] });
  },

  applyCommand(command, now = nowISO(), actor) {
    const current = get().tournament;
    const result = engine.applyCommand(current, command, now, actor);

    get().adapter?.broadcast(
      result.events[result.events.length - 1] ?? {
        type: "MATCH_UPDATED",
        at: now,
        matchId: "heartbeat",
      },
    );

    set({
      tournament: result.state,
      lastEvents: result.events,
      validationIssues: result.validation.issues.map((issue) => `${issue.code}: ${issue.message}`),
    });
  },

  selectMatch(matchId) {
    set({ selectedMatchId: matchId });
  },

  setQuery(query) {
    set({ query });
  },

  highlightParticipant(participantId) {
    set({ highlightedParticipantId: participantId });
  },

  setFilters(next) {
    set((state) => ({ filters: { ...state.filters, ...next } }));
  },

  setReducedMotion(enabled) {
    set({ reducedMotion: enabled });
  },

  connectAdapter(adapter) {
    adapter.onEvent((event) => {
      set((state) => ({
        lastEvents: [...state.lastEvents, event].slice(-50),
      }));
    });
    adapter.connect();
    set({ adapter });
  },

  disconnectAdapter() {
    get().adapter?.disconnect();
    set({ adapter: undefined });
  },

  exportJSON() {
    return engine.toJSON(get().tournament);
  },

  importJSON(json) {
    const state = engine.fromJSON(json);
    set({ tournament: state, validationIssues: [] });
  },
}));

export function getEngineSelectors() {
  return engine.selectors;
}
