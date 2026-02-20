import type { Actor, ApplyResult, TournamentEngine } from "@/engine/types";
import type { Command, GenerateStagePayload } from "@/engine/commands";
import { mutatingCommands } from "@/engine/commands";
import { selectors } from "@/engine/selectors";
import { fromJSON, LATEST_STATE_SCHEMA_VERSION, toJSON } from "@/engine/serialization";
import { validateState, type ValidationResult } from "@/engine/validation";
import { createBuiltInPlugins, type TournamentFormatPlugin } from "@/engine/formats";
import { makeId } from "@/engine/util";
import { isChallengeOnCooldown, isLadderChallengeWithinWindow } from "@/engine/rules/constraints";
import { seedParticipantsByRating, seedParticipantsManual, seedParticipantsShuffle } from "@/engine/rules/seeding";
import type { BracketStage, DomainEvent, LadderStage, Match, TournamentState } from "@/models";

function buildAuditSummary(command: Command): string {
  switch (command.type) {
    case "INIT_TOURNAMENT":
      return `Initialized tournament '${command.payload.name}'`;
    case "ADD_PARTICIPANTS":
      return `Added ${command.payload.participants.length} participant(s)`;
    case "REMOVE_PARTICIPANT":
      return `Removed participant '${command.payload.participantId}'`;
    case "GENERATE_STAGE":
      return `Generated stage '${command.payload.stageName}' (${command.payload.format})`;
    case "SET_MATCH_STATUS":
      return `Set match '${command.payload.matchId}' to ${command.payload.status}`;
    case "RECORD_MATCH_RESULT":
      return `Recorded result for match '${command.payload.matchId}'`;
    case "UNDO_MATCH_RESULT":
      return `Undid result for match '${command.payload.matchId}'`;
    case "FORCE_ADVANCE":
      return `Force advanced participant '${command.payload.participantId}'`;
    case "LOCK_TOURNAMENT":
      return `${command.payload.locked ? "Locked" : "Unlocked"} tournament`;
    case "REGENERATE_STAGE":
      return `Regenerated stage '${command.payload.stageId}'`;
    case "LADDER_CHALLENGE":
      return `Created challenge '${command.payload.challengerId}' vs '${command.payload.challengedId}'`;
    case "APPLY_DECAY":
      return `Applied decay to stage '${command.payload.stageId}'`;
    case "SEED_PARTICIPANTS":
      return `Applied ${command.payload.method} seeding`;
    default:
      return "Unknown command";
  }
}

function addAudit(state: TournamentState, command: Command, now: string, actor?: Actor): TournamentState {
  return {
    ...state,
    audit: [
      ...state.audit,
      {
        id: makeId("audit", state),
        at: now,
        actor,
        commandType: command.type,
        summary: buildAuditSummary(command),
        payload: command.payload as Record<string, unknown>,
      },
    ],
  };
}

function incrementVersion(state: TournamentState, now: string): TournamentState {
  return {
    ...state,
    version: state.version + 1,
    updatedAt: now,
  };
}

function ensurePending(match: Match): Match {
  if (match.status === "scheduled") {
    return { ...match, status: "pending" };
  }
  return match;
}

function participantIdSet(state: TournamentState): Set<string> {
  return new Set(state.participants.map((p) => p.id));
}

function getStageFromMatch(state: TournamentState, matchId: string): TournamentState["stages"][number] | undefined {
  return state.stages.find((stage) => stage.matchIds.includes(matchId));
}

function getCommandValidationFailure(state: TournamentState, code: string, message: string): ApplyResult {
  const validation: ValidationResult = {
    ok: false,
    issues: [{ level: "error", code, message }],
  };
  return { state, events: [], validation };
}

function autoAdvanceByes(state: TournamentState, stage: BracketStage, now: string): { state: TournamentState; events: DomainEvent[] } {
  if (!stage.settings.autoAdvanceByes) {
    return { state, events: [] };
  }

  let nextState = state;
  const events: DomainEvent[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const matchId of stage.matchIds) {
      const match = nextState.matches.find((m) => m.id === matchId);
      if (!match || match.status === "completed") {
        continue;
      }
      const [a, b] = match.participants;
      if ((a && !b) || (!a && b)) {
        const winnerId = a ?? b;
        if (!winnerId) {
          continue;
        }
        nextState = {
          ...nextState,
          matches: nextState.matches.map((m) =>
            m.id === match.id
              ? {
                  ...m,
                  status: "completed",
                  score: { mode: "points", a: a ? 1 : 0, b: b ? 1 : 0, notes: "Auto-advance bye" },
                  outcome: { kind: "winner", winnerId, loserId: "BYE" },
                  completedAt: now,
                }
              : m,
          ),
        };

        const outgoing = stage.edges.filter((edge) => edge.fromMatchId === match.id && edge.from.kind === "winner");
        outgoing.forEach((edge) => {
          nextState = {
            ...nextState,
            matches: nextState.matches.map((m) => {
              if (m.id !== edge.toMatchId) {
                return m;
              }
              const participants: [string | null, string | null] = [...m.participants];
              participants[edge.toSlot === "A" ? 0 : 1] = winnerId;
              return {
                ...m,
                participants,
                status: m.status === "scheduled" ? "pending" : m.status,
              };
            }),
          };
          events.push({ type: "ADVANCEMENT_APPLIED", fromMatchId: match.id, toMatchId: edge.toMatchId, at: now });
        });

        events.push({ type: "MATCH_COMPLETED", matchId: match.id, at: now });
        changed = true;
      }
    }
  }

  return { state: nextState, events };
}

function cascadeUndoBracket(state: TournamentState, stage: BracketStage, matchId: string, now: string): { state: TournamentState; events: DomainEvent[] } {
  const matches = new Map(state.matches.map((match) => [match.id, { ...match }]));
  const edgesByFrom = new Map<string, BracketStage["edges"]>();
  stage.edges.forEach((edge) => {
    const list = edgesByFrom.get(edge.fromMatchId) ?? [];
    list.push(edge);
    edgesByFrom.set(edge.fromMatchId, list);
  });

  const touched = new Set<string>();
  const visited = new Set<string>();

  const clearMatch = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const match = matches.get(id);
    if (!match) {
      return;
    }

    const resetMatch: Match = {
      ...match,
      score: undefined,
      outcome: undefined,
      completedAt: undefined,
      status: match.participants.some((p) => p !== null) ? "pending" : "scheduled",
    };
    matches.set(id, resetMatch);
    touched.add(id);

    const outgoing = edgesByFrom.get(id) ?? [];
    outgoing.forEach((edge) => {
      const target = matches.get(edge.toMatchId);
      if (!target) {
        return;
      }
      const participants: [string | null, string | null] = [...target.participants];
      const slotIndex = edge.toSlot === "A" ? 0 : 1;
      if (participants[slotIndex] !== null) {
        participants[slotIndex] = null;
      }
      matches.set(edge.toMatchId, {
        ...target,
        participants,
        score: undefined,
        outcome: undefined,
        completedAt: undefined,
        status: participants.some((p) => p !== null) ? "pending" : "scheduled",
      });
      touched.add(edge.toMatchId);
      clearMatch(edge.toMatchId);
    });
  };

  clearMatch(matchId);

  return {
    state: {
      ...state,
      matches: state.matches.map((match) => matches.get(match.id) ?? match),
    },
    events: [...touched].map((id) => ({ type: "MATCH_UPDATED", matchId: id, at: now })),
  };
}

function findPluginForMatch(state: TournamentState, plugins: Map<string, TournamentFormatPlugin>, matchId: string): TournamentFormatPlugin | undefined {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) {
    return undefined;
  }
  return plugins.get(match.format);
}

function findGenerateParticipants(state: TournamentState, payload: GenerateStagePayload) {
  const ids = payload.participantIds && payload.participantIds.length > 0 ? new Set(payload.participantIds) : null;
  return ids ? state.participants.filter((p) => ids.has(p.id)) : state.participants;
}

export class DeterministicTournamentEngine implements TournamentEngine {
  private readonly plugins = new Map<string, TournamentFormatPlugin>();

  selectors = selectors;

  constructor() {
    createBuiltInPlugins().forEach((plugin) => {
      this.plugins.set(plugin.name, plugin);
    });
  }

  registerPlugin(plugin: TournamentFormatPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  createEmpty(now: string, id: string, name: string): TournamentState {
    return {
      id,
      name,
      version: 0,
      createdAt: now,
      updatedAt: now,
      participants: [],
      stages: [],
      matches: [],
      audit: [],
      stateSchemaVersion: LATEST_STATE_SCHEMA_VERSION,
      locked: false,
    };
  }

  validate(state: TournamentState): ValidationResult {
    return validateState(state, new Set(this.plugins.keys()));
  }

  toJSON(state: TournamentState): string {
    return toJSON(state);
  }

  fromJSON(json: string): TournamentState {
    return fromJSON(json);
  }

  applyCommand(state: TournamentState, command: Command, now: string, actor?: Actor): ApplyResult {
    if (state.locked && command.type !== "LOCK_TOURNAMENT" && actor?.role !== "admin") {
      return getCommandValidationFailure(state, "TOURNAMENT_LOCKED", "Tournament is locked for non-admin mutations.");
    }

    let nextState = state;
    let events: DomainEvent[] = [];

    switch (command.type) {
      case "INIT_TOURNAMENT": {
        nextState = this.createEmpty(now, command.payload.id, command.payload.name);
        nextState.rngSeed = command.payload.rngSeed;
        nextState.settings = command.payload.settings;
        break;
      }

      case "ADD_PARTICIPANTS": {
        const existing = participantIdSet(nextState);
        const incoming = command.payload.participants.filter((p) => !existing.has(p.id));
        nextState = {
          ...nextState,
          participants: [...nextState.participants, ...incoming],
        };
        break;
      }

      case "REMOVE_PARTICIPANT": {
        const removeId = command.payload.participantId;
        nextState = {
          ...nextState,
          participants: nextState.participants.filter((p) => p.id !== removeId),
          matches: nextState.matches.map((match) => ({
            ...match,
            participants: [
              match.participants[0] === removeId ? null : match.participants[0],
              match.participants[1] === removeId ? null : match.participants[1],
            ],
          })),
          stages: nextState.stages.map((stage) => {
            if (stage.format !== "ladder") {
              return stage;
            }
            return {
              ...stage,
              standings: stage.standings.filter((entry) => entry.participantId !== removeId),
            };
          }),
        };
        break;
      }

      case "SEED_PARTICIPANTS": {
        if (command.payload.method === "manual") {
          nextState = {
            ...nextState,
            participants: seedParticipantsManual(nextState.participants, command.payload.seedMap ?? {}),
          };
        } else if (command.payload.method === "rating") {
          nextState = {
            ...nextState,
            participants: seedParticipantsByRating(nextState.participants),
          };
        } else {
          nextState = {
            ...nextState,
            participants: seedParticipantsShuffle(nextState.participants, nextState.rngSeed ?? nextState.id),
          };
        }
        break;
      }

      case "GENERATE_STAGE": {
        const plugin = this.plugins.get(command.payload.format);
        if (!plugin) {
          return getCommandValidationFailure(state, "UNKNOWN_STAGE_FORMAT", `Unknown stage format '${command.payload.format}'.`);
        }

        const participants = findGenerateParticipants(nextState, command.payload);
        const generated = plugin.generateStage({
          stageId: command.payload.stageId,
          stageName: command.payload.stageName,
          participants,
          settings: command.payload.settings,
          rngSeed: nextState.rngSeed,
          options: command.payload.options,
        });

        const existingStage = nextState.stages.find((stage) => stage.id === command.payload.stageId);
        const removedMatchIds = new Set(existingStage?.matchIds ?? []);

        nextState = {
          ...nextState,
          stages: [...nextState.stages.filter((s) => s.id !== command.payload.stageId), generated.stage],
          matches: [...nextState.matches.filter((m) => !removedMatchIds.has(m.id)), ...generated.matches.map(ensurePending)],
        };

        if (generated.stage.format !== "ladder") {
          const auto = autoAdvanceByes(nextState, generated.stage, now);
          nextState = auto.state;
          events = [...events, ...auto.events];
        }

        break;
      }

      case "SET_MATCH_STATUS": {
        if (!nextState.matches.some((match) => match.id === command.payload.matchId)) {
          return getCommandValidationFailure(state, "MATCH_NOT_FOUND", `Match '${command.payload.matchId}' not found.`);
        }
        nextState = {
          ...nextState,
          matches: nextState.matches.map((match) =>
            match.id === command.payload.matchId ? { ...match, status: command.payload.status } : match,
          ),
        };
        events.push({ type: "MATCH_UPDATED", matchId: command.payload.matchId, at: now });
        break;
      }

      case "RECORD_MATCH_RESULT": {
        const plugin = findPluginForMatch(nextState, this.plugins, command.payload.matchId);
        if (!plugin) {
          return getCommandValidationFailure(state, "MATCH_FORMAT_UNAVAILABLE", `No plugin for match '${command.payload.matchId}'.`);
        }

        const result = plugin.processMatchResult({
          state: nextState,
          matchId: command.payload.matchId,
          score: command.payload.score,
          outcome: command.payload.outcome,
          now,
        });

        nextState = result.state;
        events = [...events, ...result.events];
        break;
      }

      case "UNDO_MATCH_RESULT": {
        const stage = getStageFromMatch(nextState, command.payload.matchId);
        if (!stage) {
          return getCommandValidationFailure(state, "MATCH_STAGE_NOT_FOUND", `Match '${command.payload.matchId}' is not in a stage.`);
        }

        if (stage.format === "ladder") {
          nextState = {
            ...nextState,
            matches: nextState.matches.map((match) =>
              match.id === command.payload.matchId
                ? {
                    ...match,
                    score: undefined,
                    outcome: undefined,
                    completedAt: undefined,
                    status: "pending",
                  }
                : match,
            ),
          };
          events.push({ type: "MATCH_UPDATED", matchId: command.payload.matchId, at: now });
        } else {
          const undone = cascadeUndoBracket(nextState, stage, command.payload.matchId, now);
          nextState = undone.state;
          events = [...events, ...undone.events];
        }
        break;
      }

      case "FORCE_ADVANCE": {
        const toSlotIndex = command.payload.toSlot === "A" ? 0 : 1;
        nextState = {
          ...nextState,
          matches: nextState.matches.map((match) =>
            match.id === command.payload.toMatchId
              ? {
                  ...match,
                  participants:
                    toSlotIndex === 0
                      ? [command.payload.participantId, match.participants[1]]
                      : [match.participants[0], command.payload.participantId],
                  status: "pending",
                }
              : match,
          ),
        };
        events.push({ type: "ADVANCEMENT_APPLIED", fromMatchId: command.payload.fromMatchId, toMatchId: command.payload.toMatchId, at: now });
        break;
      }

      case "LOCK_TOURNAMENT": {
        nextState = {
          ...nextState,
          locked: command.payload.locked,
        };
        events.push({ type: "TOURNAMENT_LOCKED", locked: command.payload.locked, at: now });
        break;
      }

      case "REGENERATE_STAGE": {
        const existing = nextState.stages.find((stage) => stage.id === command.payload.stageId);
        if (!existing) {
          return getCommandValidationFailure(state, "STAGE_NOT_FOUND", `Stage '${command.payload.stageId}' not found.`);
        }
        const plugin = this.plugins.get(existing.format);
        if (!plugin) {
          return getCommandValidationFailure(state, "UNKNOWN_STAGE_FORMAT", `Unknown stage format '${existing.format}'.`);
        }

        const participantIds = new Set(
          nextState.matches
            .filter((match) => existing.matchIds.includes(match.id))
            .flatMap((match) => match.participants)
            .filter((id): id is string => Boolean(id && id !== "BYE")),
        );
        const participants = nextState.participants.filter((p) => participantIds.has(p.id));

        const generated = plugin.generateStage({
          stageId: existing.id,
          stageName: existing.name,
          participants,
          settings: existing.settings,
          rngSeed: nextState.rngSeed,
          options: existing.settings.metadata,
        });

        if (command.payload.preserveResults) {
          const oldMap = new Map(
            nextState.matches
              .filter((match) => existing.matchIds.includes(match.id))
              .map((match) => [`${match.roundId ?? "none"}:${match.orderKey ?? -1}`, match] as const),
          );
          generated.matches = generated.matches.map((match) => {
            const old = oldMap.get(`${match.roundId ?? "none"}:${match.orderKey ?? -1}`);
            if (!old || old.status !== "completed") {
              return match;
            }
            return {
              ...match,
              score: old.score,
              outcome: old.outcome,
              status: old.status,
              completedAt: old.completedAt,
            };
          });
        }

        const oldIds = new Set(existing.matchIds);
        nextState = {
          ...nextState,
          stages: nextState.stages.map((stage) => (stage.id === existing.id ? generated.stage : stage)),
          matches: [...nextState.matches.filter((m) => !oldIds.has(m.id)), ...generated.matches],
        };

        if (generated.stage.format !== "ladder") {
          const auto = autoAdvanceByes(nextState, generated.stage, now);
          nextState = auto.state;
          events = [...events, ...auto.events];
        }

        break;
      }

      case "LADDER_CHALLENGE": {
        const ladderStage = nextState.stages.find((stage) => stage.format === "ladder") as LadderStage | undefined;
        if (!ladderStage) {
          return getCommandValidationFailure(state, "LADDER_STAGE_NOT_FOUND", "No ladder stage available for challenge command.");
        }

        const challenger = ladderStage.standings.find((entry) => entry.participantId === command.payload.challengerId);
        const challenged = ladderStage.standings.find((entry) => entry.participantId === command.payload.challengedId);
        if (!challenger || !challenged) {
          return getCommandValidationFailure(state, "LADDER_PARTICIPANT_NOT_FOUND", "Challenge participants must exist in ladder standings.");
        }

        if (!isLadderChallengeWithinWindow(ladderStage, challenger.rank, challenged.rank)) {
          return getCommandValidationFailure(state, "LADDER_CHALLENGE_WINDOW", "Challenge violates ladder challenge window rules.");
        }

        if (isChallengeOnCooldown(ladderStage, challenger.lastMatchAt, now)) {
          return getCommandValidationFailure(state, "LADDER_COOLDOWN", "Challenger is still on cooldown.");
        }

        const challengeMatchId = makeId("ladder_match", nextState);
        const challengeMatch: Match = {
          id: challengeMatchId,
          format: "ladder",
          stageId: ladderStage.id,
          bracketSide: "ladder",
          participants: [command.payload.challengerId, command.payload.challengedId],
          status: command.payload.scheduledAt ? "scheduled" : "pending",
          scheduledAt: command.payload.scheduledAt,
        };

        nextState = {
          ...nextState,
          matches: [...nextState.matches, challengeMatch],
          stages: nextState.stages.map((stage) =>
            stage.id === ladderStage.id && stage.format === "ladder"
              ? {
                  ...stage,
                  matchIds: [...stage.matchIds, challengeMatchId],
                }
              : stage,
          ),
        };

        events.push({ type: "MATCH_UPDATED", matchId: challengeMatchId, at: now });
        break;
      }

      case "APPLY_DECAY": {
        const stage = nextState.stages.find((s) => s.id === command.payload.stageId);
        if (!stage || stage.format !== "ladder") {
          return getCommandValidationFailure(state, "LADDER_STAGE_NOT_FOUND", `Ladder stage '${command.payload.stageId}' not found.`);
        }

        const lastApplied = stage.settings.metadata?.lastDecayAt;
        if (typeof lastApplied === "string" && lastApplied === command.payload.at) {
          break;
        }

        if (!stage.rules.decay?.enabled) {
          break;
        }

        const decayConfig = stage.rules.decay;
        const thresholdDays = decayConfig.daysInactiveToStart ?? 30;
        const pointsPerDay = decayConfig.pointsPerDay ?? 1;
        const atMs = Date.parse(command.payload.at);

        const standings = stage.standings.map((entry) => {
          const lastMs = entry.lastMatchAt ? Date.parse(entry.lastMatchAt) : Number.NaN;
          if (!Number.isFinite(lastMs)) {
            return entry;
          }
          const inactiveDays = (atMs - lastMs) / 86_400_000;
          if (inactiveDays <= thresholdDays) {
            return entry;
          }
          const decayedDays = Math.floor(inactiveDays - thresholdDays);
          const points = Math.max(0, (entry.points ?? 0) - decayedDays * pointsPerDay);
          return { ...entry, points };
        });

        const sorted = [...standings].sort((a, b) => {
          if ((b.points ?? 0) !== (a.points ?? 0)) {
            return (b.points ?? 0) - (a.points ?? 0);
          }
          return a.rank - b.rank;
        });
        sorted.forEach((entry, idx) => {
          entry.rank = idx + 1;
        });

        nextState = {
          ...nextState,
          stages: nextState.stages.map((s) =>
            s.id === stage.id && s.format === "ladder"
              ? {
                  ...s,
                  standings: sorted,
                  settings: {
                    ...s.settings,
                    metadata: {
                      ...(s.settings.metadata ?? {}),
                      lastDecayAt: command.payload.at,
                    },
                  },
                }
              : s,
          ),
        };

        events.push({ type: "STANDINGS_UPDATED", stageId: stage.id, at: now });
        break;
      }
    }

    if (mutatingCommands.has(command.type)) {
      nextState = incrementVersion(nextState, now);
      nextState = addAudit(nextState, command, now, actor);
    }

    const validation = this.validate(nextState);

    return {
      state: nextState,
      events,
      validation,
    };
  }
}

export function createTournamentEngine(): TournamentEngine {
  return new DeterministicTournamentEngine();
}
