import { useMemo } from "react";

import type { Match, Participant, TournamentState } from "@/models";

export function LadderView(props: {
  state: TournamentState;
  stageId: string;
  statusFilter?: string;
  onOpenMatch(matchId: string): void;
}) {
  const stage = props.state.stages.find((s) => s.id === props.stageId && s.format === "ladder");
  const participantsById = useMemo(() => new Map(props.state.participants.map((p) => [p.id, p])), [props.state.participants]);

  if (!stage || stage.format !== "ladder") {
    return <div className="tlc-panel">No ladder stage selected.</div>;
  }

  const matches = props.state.matches
    .filter((m) => stage.matchIds.includes(m.id))
    .filter((match) => (props.statusFilter && props.statusFilter !== "all" ? match.status === props.statusFilter : true));

  const pointsMax = Math.max(1, ...stage.standings.map((entry) => entry.points ?? 0));

  const resolveName = (id: string) => participantsById.get(id)?.name ?? id;

  return (
    <div className="tlc-panel">
      <h3 style={{ marginTop: 0 }}>{stage.name}</h3>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th align="left">Rank</th>
            <th align="left">Participant</th>
            <th align="right">Points</th>
            <th align="right">Streak</th>
            <th align="left">Momentum</th>
          </tr>
        </thead>
        <tbody>
          {[...stage.standings]
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => (
              <tr key={entry.participantId}>
                <td>{entry.rank}</td>
                <td>{resolveName(entry.participantId)}</td>
                <td align="right">{entry.points ?? 0}</td>
                <td align="right">{entry.streak ?? 0}</td>
                <td>
                  <div
                    style={{
                      height: 8,
                      width: `${Math.max(8, ((entry.points ?? 0) / pointsMax) * 100)}%`,
                      background: "var(--accent)",
                      borderRadius: 999,
                    }}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <h4>Challenge Matches</h4>
      <div className="tlc-grid">
        {matches.length === 0 ? <span className="tlc-muted">No ladder matches yet.</span> : null}
        {matches.map((match) => {
          const [a, b] = match.participants;
          return (
            <button key={match.id} onClick={() => props.onOpenMatch(match.id)}>
              {(a ? resolveName(a) : "TBD")} vs {(b ? resolveName(b) : "TBD")} • {match.status}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ladderMatchLabel(match: Match, participantsById: Map<string, Participant>): string {
  const [a, b] = match.participants;
  return `${a ? participantsById.get(a)?.name ?? a : "TBD"} vs ${b ? participantsById.get(b)?.name ?? b : "TBD"}`;
}
