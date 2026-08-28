import type { DebugGameState, DebugGameView } from "./types.js";

export function selectDebugGameView(state: DebugGameState): DebugGameView {
  return {
    matchFormat: state.matchFormat,
    constraintOptions: state.constraintOptions,
    answerHistory: state.answerHistory,
    ...(state.answerHistory.at(-1) ? { latestAnswer: state.answerHistory.at(-1)! } : {}),
    connectionValue: state.currentConnection.value,
    connectionDirection: state.currentConnection.type === "ENDS_WITH" ? "ENDS_WITH" : "STARTS_WITH",
    connectionCharacterCount: state.currentConnection.type === "STARTS_WITH_TWO" ? 2 : 1,
    ...(state.requiredLength === undefined ? {} : { requiredLength: state.requiredLength }),
    ...(state.forbiddenCharacters === undefined ? {} : { forbiddenCharacters: state.forbiddenCharacters }),
    ...(state.pendingKanjiSelection === undefined ? {} : { pendingKanjiSelection: state.pendingKanjiSelection }),
    ...(state.gameOverReason === undefined ? {} : { gameOverReason: state.gameOverReason }),
    turnNumber: state.turnNumber,
  };
}
