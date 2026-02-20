import type { Command } from "@/engine/commands";
import type { EngineSelectors } from "@/engine/selectors";
import type { TournamentFormatPlugin } from "@/engine/formats/types";
import type { DomainEvent, ID, ISODateTime, TournamentState } from "@/models";
import type { ValidationResult } from "@/engine/validation";

export interface Actor {
  id?: string;
  name?: string;
  role?: "viewer" | "staff" | "admin";
}

export interface ApplyResult {
  state: TournamentState;
  events: DomainEvent[];
  validation: ValidationResult;
}

export interface TournamentEngine {
  createEmpty(now: ISODateTime, id: ID, name: string): TournamentState;
  applyCommand(state: TournamentState, command: Command, now: ISODateTime, actor?: Actor): ApplyResult;
  selectors: EngineSelectors;
  validate(state: TournamentState): ValidationResult;
  toJSON(state: TournamentState): string;
  fromJSON(json: string): TournamentState;
  registerPlugin(plugin: TournamentFormatPlugin): void;
}
