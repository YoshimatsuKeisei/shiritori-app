import type { ConstraintOption, MatchFormat } from "../../rules/types.js";
import type { VersusGameState, VersusPlayerResult } from "../../game/versusTypes.js";

export interface VersusSetupValues {
  matchFormat: MatchFormat;
  constraintOptions: readonly ConstraintOption[];
  timeChoice: number | "CUSTOM";
  customMinutes: number;
  skipEnabled: boolean;
}

export function resolveInitialTimeMs(values: Pick<VersusSetupValues, "timeChoice" | "customMinutes">): number {
  const minutes = values.timeChoice === "CUSTOM" ? Math.min(60, Math.max(1, Math.trunc(values.customMinutes))) : values.timeChoice;
  return minutes * 60_000;
}

export function formatRemainingTime(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatAverageTime(milliseconds: number | null): string {
  return milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(2)}秒`;
}

export function formatAverageCharacters(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}文字`;
}

export function isSkipDisabled(state: VersusGameState, loading: boolean): boolean {
  const current = state.players.find((player) => player.id === state.currentPlayerId)!;
  return loading || state.status !== "WAITING_FOR_INPUT" || state.matchFormat === "GROWING_LENGTH" || current.skipRemaining <= 0;
}

export function resultLongestDisplay(result: VersusPlayerResult, history: VersusGameState["answerHistory"]): string {
  if (!result.longestWord) return "—";
  return history.find((record) => record.playerId === result.id && record.word.entryId === result.longestWord?.entryId)?.displayText ?? result.longestWord.surface;
}
