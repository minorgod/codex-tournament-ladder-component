import { doubleEliminationPlugin } from "@/engine/formats/doubleElimination";
import { ladderPlugin } from "@/engine/formats/ladder";
import { roundRobinPlugin } from "@/engine/formats/roundRobin";
import { singleEliminationPlugin } from "@/engine/formats/singleElimination";
import { swissPlugin } from "@/engine/formats/swiss";
import type { TournamentFormatPlugin } from "@/engine/formats/types";

export function createBuiltInPlugins(): TournamentFormatPlugin[] {
  return [singleEliminationPlugin, doubleEliminationPlugin, swissPlugin, roundRobinPlugin, ladderPlugin];
}

export * from "@/engine/formats/types";
