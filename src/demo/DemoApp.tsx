import { useEffect, useMemo, useState } from "react";

import { AdminPanel } from "@/admin/AdminPanel";
import type { Command } from "@/engine";
import { BracketView } from "@/ui/BracketView";
import { LadderView } from "@/ui/LadderView";
import { ModalMatchDetails } from "@/ui/ModalMatchDetails";
import { SidebarPanels } from "@/ui/SidebarPanels";
import { ThemeProvider, useTheme } from "@/ui/ThemeProvider";
import { useTournamentStore } from "@/ui/hooks/useTournamentStore";
import { createDemoTournamentState } from "@/demo/fixtures";
import { MockAdapter } from "@/realtime";

function DemoShell() {
  const store = useTournamentStore();
  const { mode, toggleMode } = useTheme();
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");

  useEffect(() => {
    if (store.tournament.participants.length === 0) {
      store.initialize(createDemoTournamentState());
    }

    const adapter = new MockAdapter();
    store.connectAdapter(adapter);
    return () => store.disconnectAdapter();
  }, []);

  const activeStageId =
    store.filters.stageId !== "all"
      ? store.filters.stageId
      : store.tournament.stages[0]?.id;

  const activeStage = store.tournament.stages.find((stage) => stage.id === activeStageId);

  const participantsById = useMemo(
    () => new Map(store.tournament.participants.map((participant) => [participant.id, participant])),
    [store.tournament.participants],
  );

  const selectedMatch = store.selectedMatchId
    ? store.tournament.matches.find((match) => match.id === store.selectedMatchId)
    : undefined;

  const run = (command: Command) => {
    store.applyCommand(command, new Date().toISOString(), { id: "demo-admin", name: "Demo Admin", role: "admin" });
  };

  return (
    <div className={`tlc-shell ${store.reducedMotion ? "tlc-reduce-motion" : ""}`}>
      <SidebarPanels
        state={store.tournament}
        query={store.query}
        filters={store.filters}
        onQueryChange={store.setQuery}
        onFilterChange={store.setFilters}
        onHighlightParticipant={store.highlightParticipant}
      />

      <div className="tlc-panel">
        <div className="tlc-toolbar">
          <button onClick={toggleMode}>Theme: {mode}</button>
          <button onClick={() => setOrientation((o) => (o === "horizontal" ? "vertical" : "horizontal"))}>
            Orientation: {orientation}
          </button>
          <button onClick={() => store.setReducedMotion(!store.reducedMotion)}>
            Reduced Motion: {store.reducedMotion ? "On" : "Off"}
          </button>
          <button
            onClick={() => {
              const out = store.exportJSON();
              navigator.clipboard.writeText(out).catch(() => undefined);
            }}
          >
            Copy JSON
          </button>
          <button
            onClick={() => {
              const json = window.prompt("Paste tournament JSON");
              if (json) {
                store.importJSON(json);
              }
            }}
          >
            Import JSON
          </button>
        </div>

        {activeStage?.format === "ladder" && activeStageId ? (
          <LadderView
            state={store.tournament}
            stageId={activeStageId}
            statusFilter={store.filters.status}
            onOpenMatch={(matchId) => store.selectMatch(matchId)}
          />
        ) : activeStageId ? (
          <BracketView
            state={store.tournament}
            stageId={activeStageId}
            orientation={orientation}
            statusFilter={store.filters.status}
            bracketSideFilter={store.filters.bracketSide}
            highlightedParticipantId={store.highlightedParticipantId}
            reducedMotion={store.reducedMotion}
            onOpenMatch={(matchId) => store.selectMatch(matchId)}
          />
        ) : (
          <div className="tlc-panel">No stage selected.</div>
        )}

        {store.validationIssues.length > 0 ? (
          <div className="tlc-grid" style={{ marginTop: 12 }}>
            {store.validationIssues.map((issue) => (
              <div key={issue} className="tlc-badge">
                {issue}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <AdminPanel state={store.tournament} onCommand={run} />

      <ModalMatchDetails
        match={selectedMatch}
        participantsById={participantsById}
        canEdit
        onClose={() => store.selectMatch(undefined)}
        onRecord={(matchId, score, outcome) =>
          run({ type: "RECORD_MATCH_RESULT", payload: { matchId, score, outcome } })
        }
      />
    </div>
  );
}

export function DemoApp() {
  return (
    <ThemeProvider>
      <DemoShell />
    </ThemeProvider>
  );
}
