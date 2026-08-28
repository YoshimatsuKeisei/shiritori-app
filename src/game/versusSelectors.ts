import { getEffectiveRemainingTime } from "./versusGame.js";
import type { Clock } from "./types.js";
import type { VersusGameState, VersusGameView, VersusPlayer, VersusPlayerResult } from "./versusTypes.js";

function resultFor(state: VersusGameState, player: VersusPlayer, clock: Clock): VersusPlayerResult {
  return {
    id: player.id, name: player.name, remainingTimeMs: getEffectiveRemainingTime(state, player.id, clock.now()), validAnswerCount: player.validAnswerCount,
    averageAnswerTimeMs: player.validAnswerCount ? player.totalAnswerTimeMs / player.validAnswerCount : null,
    averageCharacterCount: player.validAnswerCount ? player.totalCharacterCount / player.validAnswerCount : null,
    ...(player.longestWord ? { longestWord: player.longestWord } : {}), skipRemaining: player.skipRemaining,
    ...(player.eliminationReason ? { eliminationReason: player.eliminationReason } : {}),
    outcome: state.winnerPlayerId === player.id ? "WIN" : player.eliminationReason ? "LOSE" : "UNDECIDED",
  };
}

export function selectVersusGameView(state: VersusGameState, clock: Clock): VersusGameView {
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
  const waitingPlayer = state.players.find((player) => player.id !== state.currentPlayerId)!;
  const winner = state.winnerPlayerId ? state.players.find((player) => player.id === state.winnerPlayerId) : undefined;
  return { currentPlayer, waitingPlayer, currentPlayerRemainingTimeMs: getEffectiveRemainingTime(state, currentPlayer.id, clock.now()), waitingPlayerRemainingTimeMs: getEffectiveRemainingTime(state, waitingPlayer.id, clock.now()), ...(winner ? { winner } : {}), playerResults: state.players.map((player) => resultFor(state, player, clock)) as [VersusPlayerResult, VersusPlayerResult], currentConnection: state.currentConnection, ...(state.pendingKanjiSelection ? { pendingKanjiSelection: state.pendingKanjiSelection } : {}) };
}
