import type { ID, ISODateTime } from "@/models/base";
import type { StageSettings } from "@/models/stage";

export interface LadderRuleSet {
  challengeWindow?: { minRank?: number; maxRank?: number };
  cooldownHours?: number;
  decay?: { enabled: boolean; daysInactiveToStart?: number; pointsPerDay?: number };
  swapRule: "swap_on_win" | "points" | "hybrid";
  points?: {
    win: number;
    loss: number;
    draw?: number;
    bonusStreak?: number;
  };
}

export interface LadderStandingEntry {
  participantId: ID;
  rank: number;
  points?: number;
  streak?: number;
  lastMatchAt?: ISODateTime;
}

export interface LadderStage {
  id: ID;
  name: string;
  format: "ladder";
  rules: LadderRuleSet;
  standings: LadderStandingEntry[];
  matchIds: ID[];
  settings: StageSettings;
}
