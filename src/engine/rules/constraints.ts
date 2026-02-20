import type { LadderStage } from "@/models";

export function isLadderChallengeWithinWindow(stage: LadderStage, challengerRank: number, challengedRank: number): boolean {
  const min = stage.rules.challengeWindow?.minRank ?? Number.MIN_SAFE_INTEGER;
  const max = stage.rules.challengeWindow?.maxRank ?? Number.MAX_SAFE_INTEGER;
  const delta = challengedRank - challengerRank;
  return delta >= min && delta <= max;
}

export function isChallengeOnCooldown(stage: LadderStage, lastMatchAt: string | undefined, atISO: string): boolean {
  if (!stage.rules.cooldownHours || !lastMatchAt) {
    return false;
  }
  const last = Date.parse(lastMatchAt);
  const now = Date.parse(atISO);
  return Number.isFinite(last) && Number.isFinite(now) && now - last < stage.rules.cooldownHours * 3600_000;
}
