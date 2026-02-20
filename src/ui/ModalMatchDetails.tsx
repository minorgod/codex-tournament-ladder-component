import { useState } from "react";

import type { Match, MatchOutcome, MatchScore, Participant } from "@/models";

function resolveName(participantsById: Map<string, Participant>, participantId: string | null): string {
  if (!participantId) {
    return "TBD";
  }
  if (participantId === "BYE") {
    return "BYE";
  }
  return participantsById.get(participantId)?.name ?? participantId;
}

export function ModalMatchDetails(props: {
  match?: Match;
  participantsById: Map<string, Participant>;
  canEdit?: boolean;
  onClose(): void;
  onRecord(matchId: string, score: MatchScore, outcome: MatchOutcome): void;
}) {
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");

  if (!props.match) {
    return null;
  }

  const [a, b] = props.match.participants;
  const aName = resolveName(props.participantsById, a);
  const bName = resolveName(props.participantsById, b);

  return (
    <div className="tlc-modal-backdrop" role="presentation" onClick={props.onClose}>
      <div className="tlc-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="tlc-row">
          <h3 style={{ margin: 0 }}>{aName} vs {bName}</h3>
          <button onClick={props.onClose}>Close</button>
        </div>

        <p className="tlc-muted">Status: {props.match.status}</p>

        <div className="tlc-grid two">
          <label>
            {aName} score
            <input value={scoreA} onChange={(event) => setScoreA(event.target.value)} type="number" min={0} />
          </label>
          <label>
            {bName} score
            <input value={scoreB} onChange={(event) => setScoreB(event.target.value)} type="number" min={0} />
          </label>
        </div>

        {props.canEdit ? (
          <div className="tlc-toolbar" style={{ marginTop: 12 }}>
            <button
              onClick={() => {
                const aNum = Number(scoreA);
                const bNum = Number(scoreB);
                const winner = aNum >= bNum ? a : b;
                const loser = aNum >= bNum ? b : a;
                if (!winner || !loser) {
                  return;
                }
                props.onRecord(
                  props.match!.id,
                  { mode: "points", a: aNum, b: bNum },
                  { kind: "winner", winnerId: winner, loserId: loser },
                );
              }}
            >
              Save Result
            </button>
            <button
              onClick={() => {
                props.onRecord(props.match!.id, { mode: "points", a: Number(scoreA), b: Number(scoreB) }, { kind: "draw" });
              }}
            >
              Mark Draw
            </button>
            <button
              onClick={() => {
                props.onRecord(props.match!.id, { mode: "points", notes: "No contest" }, { kind: "no_contest" });
              }}
            >
              No Contest
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
