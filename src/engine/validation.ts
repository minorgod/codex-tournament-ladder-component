import type { BracketStage, ID, LadderStage, Match, TournamentState } from "@/models";

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  entity?: { kind: "match" | "stage" | "participant"; id: ID };
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function duplicateIssues(kind: "match" | "stage" | "participant", ids: string[]): ValidationIssue[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) {
      dup.add(id);
    }
    seen.add(id);
  });
  return [...dup].map((id) => ({
    level: "error",
    code: "DUPLICATE_ID",
    message: `${kind} '${id}' appears more than once`,
    entity: { kind, id },
  }));
}

function validateMatchParticipants(state: TournamentState, match: Match): ValidationIssue[] {
  const participantIds = new Set(state.participants.map((p) => p.id));
  const issues: ValidationIssue[] = [];
  match.participants.forEach((participantId) => {
    if (!participantId || participantId === "BYE") {
      return;
    }
    if (!participantIds.has(participantId)) {
      issues.push({
        level: "error",
        code: "MATCH_PARTICIPANT_MISSING",
        message: `Match participant '${participantId}' does not exist in participants list`,
        entity: { kind: "match", id: match.id },
      });
    }
  });

  if (match.status === "completed" && !match.outcome) {
    issues.push({
      level: "error",
      code: "MATCH_COMPLETED_WITHOUT_OUTCOME",
      message: "Completed match must include an outcome",
      entity: { kind: "match", id: match.id },
    });
  }

  return issues;
}

function validateBracketStage(stage: BracketStage, knownMatchIds: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  stage.matchIds.forEach((matchId) => {
    if (!knownMatchIds.has(matchId)) {
      issues.push({
        level: "error",
        code: "STAGE_MATCH_REFERENCE_MISSING",
        message: `Stage references unknown match '${matchId}'`,
        entity: { kind: "stage", id: stage.id },
      });
    }
  });

  stage.edges.forEach((edge) => {
    if (!knownMatchIds.has(edge.fromMatchId) || !knownMatchIds.has(edge.toMatchId)) {
      issues.push({
        level: "error",
        code: "EDGE_MATCH_REFERENCE_MISSING",
        message: `Edge references unknown match (${edge.fromMatchId} -> ${edge.toMatchId})`,
        entity: { kind: "stage", id: stage.id },
      });
    }
  });

  const roundMatchIds = new Set(stage.rounds.flatMap((round) => round.matchIds));
  stage.matchIds.forEach((id) => {
    if (!roundMatchIds.has(id)) {
      issues.push({
        level: "warning",
        code: "STAGE_MATCH_NOT_IN_ROUND",
        message: `Match '${id}' is not listed in any stage round`,
        entity: { kind: "stage", id: stage.id },
      });
    }
  });

  return issues;
}

function validateLadderStage(stage: LadderStage, participantIds: Set<string>, knownMatchIds: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenStanding = new Set<string>();

  for (const entry of stage.standings) {
    if (!participantIds.has(entry.participantId)) {
      issues.push({
        level: "error",
        code: "LADDER_PARTICIPANT_MISSING",
        message: `Ladder standing references unknown participant '${entry.participantId}'`,
        entity: { kind: "stage", id: stage.id },
      });
    }
    if (seenStanding.has(entry.participantId)) {
      issues.push({
        level: "error",
        code: "LADDER_DUPLICATE_STANDING",
        message: `Participant '${entry.participantId}' appears more than once in standings`,
        entity: { kind: "stage", id: stage.id },
      });
    }
    seenStanding.add(entry.participantId);
  }

  stage.matchIds.forEach((matchId) => {
    if (!knownMatchIds.has(matchId)) {
      issues.push({
        level: "error",
        code: "LADDER_MATCH_REFERENCE_MISSING",
        message: `Ladder stage references unknown match '${matchId}'`,
        entity: { kind: "stage", id: stage.id },
      });
    }
  });

  return issues;
}

export function validateState(state: TournamentState, pluginNames: Set<string>): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...duplicateIssues("participant", state.participants.map((p) => p.id)));
  issues.push(...duplicateIssues("match", state.matches.map((m) => m.id)));
  issues.push(...duplicateIssues("stage", state.stages.map((s) => s.id)));

  const participantIds = new Set(state.participants.map((p) => p.id));
  const knownMatchIds = new Set(state.matches.map((m) => m.id));

  state.matches.forEach((match) => {
    issues.push(...validateMatchParticipants(state, match));

    if (!pluginNames.has(match.format)) {
      issues.push({
        level: "error",
        code: "UNKNOWN_MATCH_FORMAT",
        message: `Match '${match.id}' uses unregistered format '${match.format}'`,
        entity: { kind: "match", id: match.id },
      });
    }
  });

  state.stages.forEach((stage) => {
    if (!pluginNames.has(stage.format)) {
      issues.push({
        level: "error",
        code: "UNKNOWN_STAGE_FORMAT",
        message: `Stage '${stage.id}' uses unregistered format '${stage.format}'`,
        entity: { kind: "stage", id: stage.id },
      });
    }

    if (stage.format === "ladder") {
      issues.push(...validateLadderStage(stage, participantIds, knownMatchIds));
    } else {
      issues.push(...validateBracketStage(stage, knownMatchIds));
    }
  });

  return {
    ok: !issues.some((issue) => issue.level === "error"),
    issues,
  };
}
