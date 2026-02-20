import { useMemo, useState } from "react";

import type { Command } from "@/engine";
import type { TournamentState } from "@/models";
import { sortAudit, summarizeAudit } from "@/admin/audit";

export function AdminPanel(props: {
  state: TournamentState;
  onCommand(command: Command): void;
}) {
  const [undoMatchId, setUndoMatchId] = useState("");
  const [forceFrom, setForceFrom] = useState("");
  const [forceTo, setForceTo] = useState("");
  const [forceParticipantId, setForceParticipantId] = useState("");
  const [forceSlot, setForceSlot] = useState<"A" | "B">("A");
  const [regenStageId, setRegenStageId] = useState("");
  const [preserveResults, setPreserveResults] = useState(false);

  const [challengerId, setChallengerId] = useState("");
  const [challengedId, setChallengedId] = useState("");
  const [decayStageId, setDecayStageId] = useState("");

  const sortedAudit = useMemo(() => sortAudit(props.state.audit), [props.state.audit]);

  return (
    <div className="tlc-panel">
      <h3 style={{ marginTop: 0 }}>Admin</h3>

      <div className="tlc-grid">
        <button onClick={() => props.onCommand({ type: "LOCK_TOURNAMENT", payload: { locked: !props.state.locked } })}>
          {props.state.locked ? "Unlock Tournament" : "Lock Tournament"}
        </button>

        <div className="tlc-grid two">
          <input value={undoMatchId} onChange={(event) => setUndoMatchId(event.target.value)} placeholder="Match ID for undo" />
          <button
            onClick={() => {
              if (!undoMatchId.trim()) {
                return;
              }
              props.onCommand({ type: "UNDO_MATCH_RESULT", payload: { matchId: undoMatchId.trim(), reason: "Admin undo" } });
            }}
          >
            Undo Result
          </button>
        </div>

        <div className="tlc-grid two">
          <input value={forceFrom} onChange={(event) => setForceFrom(event.target.value)} placeholder="From match ID" />
          <input value={forceTo} onChange={(event) => setForceTo(event.target.value)} placeholder="To match ID" />
          <input
            value={forceParticipantId}
            onChange={(event) => setForceParticipantId(event.target.value)}
            placeholder="Participant ID"
          />
          <select value={forceSlot} onChange={(event) => setForceSlot(event.target.value as "A" | "B")}>
            <option value="A">Slot A</option>
            <option value="B">Slot B</option>
          </select>
          <button
            onClick={() => {
              if (!forceFrom || !forceTo || !forceParticipantId) {
                return;
              }
              props.onCommand({
                type: "FORCE_ADVANCE",
                payload: {
                  fromMatchId: forceFrom,
                  toMatchId: forceTo,
                  participantId: forceParticipantId,
                  toSlot: forceSlot,
                  reason: "Admin override",
                },
              });
            }}
          >
            Force Advance
          </button>
        </div>

        <div className="tlc-grid two">
          <select value={regenStageId} onChange={(event) => setRegenStageId(event.target.value)}>
            <option value="">Select stage</option>
            {props.state.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <label>
            <input type="checkbox" checked={preserveResults} onChange={(event) => setPreserveResults(event.target.checked)} />
            Preserve results
          </label>
          <button
            onClick={() => {
              if (!regenStageId) {
                return;
              }
              props.onCommand({
                type: "REGENERATE_STAGE",
                payload: { stageId: regenStageId, preserveResults },
              });
            }}
          >
            Regenerate Stage
          </button>
        </div>

        <h4 style={{ marginBottom: 0 }}>Ladder Actions</h4>
        <div className="tlc-grid two">
          <input value={challengerId} onChange={(event) => setChallengerId(event.target.value)} placeholder="Challenger ID" />
          <input value={challengedId} onChange={(event) => setChallengedId(event.target.value)} placeholder="Challenged ID" />
          <button
            onClick={() => {
              if (!challengerId || !challengedId) {
                return;
              }
              props.onCommand({
                type: "LADDER_CHALLENGE",
                payload: { challengerId, challengedId },
              });
            }}
          >
            Create Challenge
          </button>
        </div>

        <div className="tlc-grid two">
          <select value={decayStageId} onChange={(event) => setDecayStageId(event.target.value)}>
            <option value="">Decay stage</option>
            {props.state.stages
              .filter((stage) => stage.format === "ladder")
              .map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => {
              if (!decayStageId) {
                return;
              }
              props.onCommand({
                type: "APPLY_DECAY",
                payload: {
                  stageId: decayStageId,
                  at: new Date().toISOString(),
                },
              });
            }}
          >
            Apply Decay
          </button>
        </div>
      </div>

      <h4>Audit Trail</h4>
      <div className="tlc-grid">
        {sortedAudit.length === 0 ? <span className="tlc-muted">No audit entries.</span> : null}
        {sortedAudit.slice(-30).reverse().map((entry) => (
          <div key={entry.id} className="tlc-badge" style={{ justifyContent: "space-between" }}>
            {summarizeAudit(entry)}
          </div>
        ))}
      </div>
    </div>
  );
}
