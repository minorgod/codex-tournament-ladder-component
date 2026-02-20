import { useCallback } from "react";

import { getEngineSelectors } from "@/ui/hooks/useTournamentStore";
import type { TournamentState } from "@/models";

const selectors = getEngineSelectors();

export function useBracketKeyboardNavigation(args: {
  state: TournamentState;
  stageId: string;
  focusedMatchId?: string;
  onFocus(matchId: string): void;
  onOpen(matchId: string): void;
}) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!args.focusedMatchId) {
        return;
      }

      if (event.key === "Enter") {
        args.onOpen(args.focusedMatchId);
        return;
      }

      const direction =
        event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowDown"
                ? "down"
                : undefined;

      if (!direction) {
        return;
      }
      event.preventDefault();

      const next = selectors.getAdjacentMatchId(args.state, args.stageId, args.focusedMatchId, direction);
      if (next) {
        args.onFocus(next);
      }
    },
    [args],
  );
}
