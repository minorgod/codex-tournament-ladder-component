import { useMemo } from "react";

import type { TournamentState } from "@/models";

export function SidebarPanels(props: {
  state: TournamentState;
  query: string;
  filters: {
    status: string;
    bracketSide: string;
    stageId: string;
  };
  onQueryChange(query: string): void;
  onFilterChange(next: Partial<{ status: string; bracketSide: string; stageId: string }>): void;
  onHighlightParticipant(participantId?: string): void;
}) {
  const matchesByParticipant = useMemo(() => {
    const map = new Map<string, number>();
    props.state.matches.forEach((match) => {
      match.participants.forEach((id) => {
        if (!id || id === "BYE") {
          return;
        }
        map.set(id, (map.get(id) ?? 0) + 1);
      });
    });
    return map;
  }, [props.state.matches]);

  const suggestions = useMemo(() => {
    const q = props.query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return props.state.participants
      .filter((participant) => participant.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [props.query, props.state.participants]);

  return (
    <div className="tlc-panel">
      <h3 style={{ marginTop: 0 }}>Controls</h3>

      <div className="tlc-grid">
        <label>
          Search participants
          <input
            type="text"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Type a player/team"
          />
        </label>

        {suggestions.length > 0 ? (
          <div className="tlc-grid">
            {suggestions.map((participant) => (
              <button key={participant.id} onClick={() => props.onHighlightParticipant(participant.id)}>
                {participant.name} <span className="tlc-muted">({matchesByParticipant.get(participant.id) ?? 0} matches)</span>
              </button>
            ))}
          </div>
        ) : null}

        <label>
          Stage
          <select value={props.filters.stageId} onChange={(event) => props.onFilterChange({ stageId: event.target.value })}>
            <option value="all">All stages</option>
            {props.state.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select value={props.filters.status} onChange={(event) => props.onFilterChange({ status: event.target.value })}>
            {[
              "all",
              "scheduled",
              "pending",
              "in_progress",
              "completed",
              "forfeit",
              "disqualified",
              "void",
            ].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          Bracket side
          <select value={props.filters.bracketSide} onChange={(event) => props.onFilterChange({ bracketSide: event.target.value })}>
            {["all", "upper", "lower", "grand", "group", "ladder"].map((side) => (
              <option key={side} value={side}>
                {side}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
