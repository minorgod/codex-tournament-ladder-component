import { useMemo, useState } from "react";

import type { Viewport } from "@/engine";
import { getEngineSelectors } from "@/ui/hooks/useTournamentStore";
import { useBracketKeyboardNavigation } from "@/ui/hooks/useBracketKeyboardNavigation";
import { MatchCard } from "@/ui/MatchCard";
import { ZoomPanSurface } from "@/ui/ZoomPanSurface";
import type { TournamentState } from "@/models";

const selectors = getEngineSelectors();

export function BracketView(props: {
  state: TournamentState;
  stageId: string;
  orientation?: "horizontal" | "vertical";
  statusFilter?: string;
  bracketSideFilter?: string;
  highlightedParticipantId?: string;
  reducedMotion?: boolean;
  onOpenMatch(matchId: string): void;
}) {
  const stage = props.state.stages.find((s) => s.id === props.stageId);
  const orientation = props.orientation ?? "horizontal";

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, width: 1280, height: 680 });
  const [collapsedRoundIds, setCollapsedRoundIds] = useState<Set<string>>(() => new Set());
  const [focusedMatchId, setFocusedMatchId] = useState<string | undefined>(() => stage && stage.format !== "ladder" ? stage.rounds[0]?.matchIds[0] : undefined);

  const keyboardHandler = useBracketKeyboardNavigation({
    state: props.state,
    stageId: props.stageId,
    focusedMatchId,
    onFocus: setFocusedMatchId,
    onOpen: props.onOpenMatch,
  });

  const participantsById = useMemo(() => new Map(props.state.participants.map((p) => [p.id, p])), [props.state.participants]);

  if (!stage || stage.format === "ladder") {
    return <div className="tlc-panel">No bracket stage selected.</div>;
  }

  const allLayouts = selectors.getBracketNodeLayouts(props.state, props.stageId, orientation);
  const matchById = new Map(props.state.matches.map((match) => [match.id, match]));

  const maxX = Math.max(1200, ...allLayouts.map((node) => node.x + node.width + 160));
  const maxY = Math.max(640, ...allLayouts.map((node) => node.y + node.height + 120));

  const highlightPath = new Set(
    props.highlightedParticipantId
      ? selectors.getParticipantPathToFinals(props.state, props.stageId, props.highlightedParticipantId)
      : [],
  );

  const upsetIds = new Set(selectors.getUpsets(props.state, props.stageId).map((match) => match.id));
  const visible = selectors
    .getBracketNodeLayouts(props.state, props.stageId, orientation, viewport)
    .filter((layout) => !collapsedRoundIds.has(stage.rounds[layout.roundIndex]?.id ?? ""))
    .filter((layout) => {
      const match = matchById.get(layout.matchId);
      if (!match) {
        return false;
      }
      if (props.statusFilter && props.statusFilter !== "all" && match.status !== props.statusFilter) {
        return false;
      }
      if (props.bracketSideFilter && props.bracketSideFilter !== "all" && match.bracketSide !== props.bracketSideFilter) {
        return false;
      }
      return true;
    });

  const visibleById = new Map(visible.map((node) => [node.matchId, node]));

  return (
    <div className="tlc-panel">
      <div className="tlc-toolbar">
        {stage.rounds.map((round) => (
          <button
            key={round.id}
            onClick={() => {
              setCollapsedRoundIds((prev) => {
                const next = new Set(prev);
                if (next.has(round.id)) {
                  next.delete(round.id);
                } else {
                  next.add(round.id);
                }
                return next;
              });
            }}
          >
            {collapsedRoundIds.has(round.id) ? `Show ${round.name}` : `Hide ${round.name}`}
          </button>
        ))}
      </div>

      <div tabIndex={0} onKeyDown={keyboardHandler} aria-label="Bracket graph keyboard navigation">
        <ZoomPanSurface
          width={maxX}
          height={maxY}
          reducedMotion={props.reducedMotion}
          onViewportChange={setViewport}
        >
          <svg className="tlc-svg" viewBox={`0 0 ${maxX} ${maxY}`} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
            {stage.edges.map((edge) => {
              const from = visibleById.get(edge.fromMatchId);
              const to = visibleById.get(edge.toMatchId);
              if (!from || !to) {
                return null;
              }
              const x1 = from.x + from.width;
              const y1 = from.y + from.height / 2;
              const x2 = to.x;
              const y2 = to.y + (edge.toSlot === "A" ? to.height * 0.3 : to.height * 0.7);
              return (
                <path
                  key={`${edge.fromMatchId}-${edge.toMatchId}-${edge.toSlot}`}
                  d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
                  stroke="var(--border)"
                  strokeWidth={1.5}
                  fill="none"
                />
              );
            })}
          </svg>

          {visible.map((node) => {
            const match = matchById.get(node.matchId);
            if (!match) {
              return null;
            }
            const isHighlighted = highlightPath.has(match.id) || focusedMatchId === match.id;
            const isLive = match.status === "in_progress";
            return (
              <div
                key={match.id}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
              >
                <MatchCard
                  match={match}
                  participantsById={participantsById}
                  isHighlighted={isHighlighted}
                  isUpset={upsetIds.has(match.id)}
                  isLive={isLive}
                  onClick={(id) => {
                    setFocusedMatchId(id);
                    props.onOpenMatch(id);
                  }}
                />
              </div>
            );
          })}
        </ZoomPanSurface>
      </div>
    </div>
  );
}
