import { cancelKanjiSelection as cancelDebugKanji, createDebugGame, selectKanjiCandidate as selectDebugKanji, submitAnswer as submitDebugAnswer } from "./debugGame.js";
import type { DebugGameState, GameActionResult, RandomSource } from "./types.js";
import type { CreateVersusGameOptions, CreateVersusGameResult, VersusActionResult, VersusAnswerRecord, VersusGameDependencies, VersusGameState, VersusPlayer } from "./versusTypes.js";

const mathRandomSource: RandomSource = { next: () => Math.random() };
const timedStatuses = new Set(["WAITING_FOR_INPUT", "WAITING_FOR_KANJI_SELECTION"]);

function updatePlayer(state: VersusGameState, id: string, update: (player: VersusPlayer) => VersusPlayer): [VersusPlayer, VersusPlayer] {
  return state.players.map((player) => player.id === id ? update(player) : player) as [VersusPlayer, VersusPlayer];
}

function otherPlayer(state: VersusGameState, id = state.currentPlayerId): VersusPlayer {
  return state.players.find((player) => player.id !== id)!;
}

function debugState(state: VersusGameState): DebugGameState {
  return {
    status: state.status === "WAITING_FOR_KANJI_SELECTION" ? "WAITING_FOR_KANJI_SELECTION" : state.status === "GAME_OVER" ? "GAME_OVER" : "WAITING_FOR_INPUT",
    matchFormat: state.matchFormat, constraintOptions: state.constraintOptions, dictionaryScope: state.dictionaryScope,
    startChar: state.startChar, currentConnection: state.currentConnection,
    ...(state.previousWord ? { previousWord: state.previousWord } : {}),
    answerHistory: state.answerHistory.map(({ playerId: _playerId, ...record }) => record),
    usedNormalKeys: state.usedNormalKeys, usedKanjiKeys: state.usedKanjiKeys,
    ...(state.requiredLength === undefined ? {} : { requiredLength: state.requiredLength }),
    ...(state.forbiddenCharacters === undefined ? {} : { forbiddenCharacters: state.forbiddenCharacters }),
    ...(state.pendingKanjiSelection === undefined ? {} : { pendingKanjiSelection: state.pendingKanjiSelection }),
    ...(state.gameOverReason === undefined ? {} : { gameOverReason: state.gameOverReason }),
    turnNumber: state.turnNumber, turnStartedAt: state.turnStartedAt,
  };
}

function mergeCore(state: VersusGameState, core: DebugGameState): VersusGameState {
  return {
    ...state, status: core.status, matchFormat: core.matchFormat, constraintOptions: core.constraintOptions,
    dictionaryScope: core.dictionaryScope, startChar: core.startChar, currentConnection: core.currentConnection,
    ...(core.previousWord ? { previousWord: core.previousWord } : {}),
    usedNormalKeys: core.usedNormalKeys, usedKanjiKeys: core.usedKanjiKeys,
    ...(core.requiredLength === undefined ? {} : { requiredLength: core.requiredLength }),
    ...(core.forbiddenCharacters === undefined ? {} : { forbiddenCharacters: core.forbiddenCharacters }),
    ...(core.pendingKanjiSelection === undefined ? {} : { pendingKanjiSelection: core.pendingKanjiSelection }),
    ...(core.gameOverReason === undefined ? {} : { gameOverReason: core.gameOverReason }),
    turnNumber: core.turnNumber, turnStartedAt: core.turnStartedAt,
  };
}

export function getEffectiveRemainingTime(state: VersusGameState, playerId: string, now: number): number {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  const running = playerId === state.currentPlayerId && timedStatuses.has(state.status);
  return Math.max(0, player.remainingTimeMs - (running ? Math.max(0, now - state.turnStartedAt) : 0));
}

function checkpoint(state: VersusGameState, now: number): VersusGameState {
  if (!timedStatuses.has(state.status)) return state;
  const elapsed = Math.max(0, now - state.turnStartedAt);
  return { ...state, players: updatePlayer(state, state.currentPlayerId, (player) => ({ ...player, remainingTimeMs: Math.max(0, player.remainingTimeMs - elapsed) })), currentTurnElapsedMs: state.currentTurnElapsedMs + elapsed, turnStartedAt: now };
}

function eliminate(state: VersusGameState, reason: "END_WITH_N" | "TIMEOUT" | "NO_VALID_WORD"): VersusGameState {
  const winner = otherPlayer(state);
  return { ...state, status: "GAME_OVER", players: updatePlayer(state, state.currentPlayerId, (player) => ({ ...player, isActive: false, eliminationReason: reason })), winnerPlayerId: winner.id, gameOverReason: reason };
}

export function checkVersusTimeout(state: VersusGameState, dependencies: VersusGameDependencies): VersusActionResult | undefined {
  if (!timedStatuses.has(state.status)) return undefined;
  if (getEffectiveRemainingTime(state, state.currentPlayerId, dependencies.clock.now()) > 0) return undefined;
  return { outcome: "GAME_OVER", state: eliminate(checkpoint(state, dependencies.clock.now()), "TIMEOUT"), eliminationReason: "TIMEOUT" };
}

export function createVersusGame(options: CreateVersusGameOptions, dependencies: VersusGameDependencies): CreateVersusGameResult {
  if (!Number.isInteger(options.initialTimeMs) || options.initialTimeMs <= 0) return { ok: false, error: "INVALID_TIME" };
  const random = options.randomSource ?? mathRandomSource;
  const firstPlayerIndex = random.next() < 0.5 ? 0 : 1;
  const coreResult = createDebugGame({ matchFormat: options.matchFormat, ...(options.constraintOptions ? { constraintOptions: options.constraintOptions } : {}), dictionaryScope: options.dictionaryScope, ...(options.forbiddenSlots ? { forbiddenSlots: options.forbiddenSlots } : {}), randomSource: random }, dependencies);
  if (!coreResult.ok) return coreResult;
  const names = options.playerNames ?? ["PLAYER 1", "PLAYER 2"];
  const skips = options.skipEnabled && options.matchFormat !== "GROWING_LENGTH" ? 1 : 0;
  const players: [VersusPlayer, VersusPlayer] = [0, 1].map((index) => ({ id: `player-${index + 1}`, name: names[index]!, remainingTimeMs: options.initialTimeMs, isActive: index === firstPlayerIndex, skipRemaining: skips, validAnswerCount: 0, totalAnswerTimeMs: 0, totalCharacterCount: 0 })) as [VersusPlayer, VersusPlayer];
  let state: VersusGameState = { ...coreResult.state, status: coreResult.state.status, players, currentPlayerId: players[firstPlayerIndex]!.id, answerHistory: [], currentTurnElapsedMs: 0 };
  if (coreResult.state.status === "GAME_OVER" && coreResult.state.gameOverReason === "NO_VALID_WORD") state = eliminate(state, "NO_VALID_WORD");
  return { ok: true, state };
}

function addAcceptedRecord(state: VersusGameState, result: GameActionResult, now: number): { state: VersusGameState; record?: VersusAnswerRecord } {
  const debugRecord = result.state.answerHistory.at(-1);
  if (!debugRecord || debugRecord.turnNumber !== state.turnNumber) return { state: mergeCore(state, result.state) };
  const elapsedMs = state.currentTurnElapsedMs + Math.max(0, now - state.turnStartedAt);
  const record: VersusAnswerRecord = { ...debugRecord, playerId: state.currentPlayerId, elapsedMs };
  const players = updatePlayer(state, state.currentPlayerId, (player) => ({ ...player, isActive: false, remainingTimeMs: Math.max(0, player.remainingTimeMs - Math.max(0, now - state.turnStartedAt)), validAnswerCount: player.validAnswerCount + 1, totalAnswerTimeMs: player.totalAnswerTimeMs + elapsedMs, totalCharacterCount: player.totalCharacterCount + record.word.characterCount, ...(!player.longestWord || record.word.characterCount > player.longestWord.characterCount ? { longestWord: record.word } : {}) }));
  const next = otherPlayer(state);
  const activated = players.map((player) => ({ ...player, isActive: player.id === next.id })) as [VersusPlayer, VersusPlayer];
  return { state: { ...mergeCore(state, result.state), players: activated, currentPlayerId: next.id, answerHistory: [...state.answerHistory, record], currentTurnElapsedMs: 0, turnStartedAt: now }, record };
}

function handleCoreResult(state: VersusGameState, result: GameActionResult, now: number): VersusActionResult {
  if (result.outcome === "REJECTED") return { outcome: "REJECTED", state: mergeCore(state, result.state), rejectReason: result.rejectReason };
  if (result.outcome === "INVALID_ACTION") return { outcome: "INVALID_ACTION", state, error: result.error };
  if (result.outcome === "WAITING_FOR_KANJI_SELECTION") return { outcome: "WAITING_FOR_KANJI_SELECTION", state: mergeCore(state, result.state) };
  if (result.outcome === "KANJI_SELECTION_CANCELLED") return { outcome: "KANJI_SELECTION_CANCELLED", state: mergeCore(state, result.state) };
  if (result.outcome === "GAME_OVER" && result.eliminationReason === "END_WITH_N") return { outcome: "GAME_OVER", state: eliminate(checkpoint(state, now), "END_WITH_N"), eliminationReason: "END_WITH_N" };
  const accepted = addAcceptedRecord(state, result, now);
  if (result.outcome === "GAME_OVER" && result.eliminationReason === "NO_VALID_WORD") {
    const loserId = accepted.state.currentPlayerId;
    const winnerId = state.currentPlayerId;
    const gameOver = { ...accepted.state, status: "GAME_OVER" as const, players: updatePlayer(accepted.state, loserId, (player) => ({ ...player, isActive: false, eliminationReason: "NO_VALID_WORD" })), winnerPlayerId: winnerId, gameOverReason: "NO_VALID_WORD" as const };
    return { outcome: "GAME_OVER", state: gameOver, eliminationReason: "NO_VALID_WORD" };
  }
  return { outcome: "ACCEPTED", state: accepted.state, record: accepted.record! };
}

export function submitVersusAnswer(state: VersusGameState, input: string, dependencies: VersusGameDependencies): VersusActionResult {
  const timeout = checkVersusTimeout(state, dependencies); if (timeout) return timeout;
  if (state.status !== "WAITING_FOR_INPUT") return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_INPUT" };
  const now = dependencies.clock.now();
  return handleCoreResult(state, submitDebugAnswer(debugState(state), input, dependencies), now);
}

export function selectVersusKanjiCandidate(state: VersusGameState, entryId: string, dependencies: VersusGameDependencies): VersusActionResult {
  const timeout = checkVersusTimeout(state, dependencies); if (timeout) return timeout;
  if (state.status !== "WAITING_FOR_KANJI_SELECTION") return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_KANJI_SELECTION" };
  const now = dependencies.clock.now();
  return handleCoreResult(state, selectDebugKanji(debugState(state), entryId, dependencies), now);
}

export function cancelVersusKanjiSelection(state: VersusGameState): VersusActionResult {
  if (state.status !== "WAITING_FOR_KANJI_SELECTION") return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_KANJI_SELECTION" };
  return handleCoreResult(state, cancelDebugKanji(debugState(state)), state.turnStartedAt);
}

export function pauseForDictionaryLoad(state: VersusGameState, dependencies: VersusGameDependencies): VersusActionResult {
  const timeout = checkVersusTimeout(state, dependencies); if (timeout) return timeout;
  if (!timedStatuses.has(state.status)) return { outcome: "INVALID_ACTION", state, error: state.status === "WAITING_FOR_KANJI_SELECTION" ? "NOT_WAITING_FOR_INPUT" : "NOT_WAITING_FOR_KANJI_SELECTION" };
  const paused = checkpoint(state, dependencies.clock.now());
  return { outcome: "PAUSED_FOR_DICTIONARY", state: { ...paused, statusBeforeDictionaryLoad: state.status as "WAITING_FOR_INPUT" | "WAITING_FOR_KANJI_SELECTION", status: "WAITING_FOR_DICTIONARY" } };
}

export function resumeAfterDictionaryLoad(state: VersusGameState, dependencies: VersusGameDependencies): VersusActionResult {
  if (state.status !== "WAITING_FOR_DICTIONARY" || !state.statusBeforeDictionaryLoad) return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_DICTIONARY" };
  const { statusBeforeDictionaryLoad, ...rest } = state;
  return { outcome: "RESUMED_AFTER_DICTIONARY", state: { ...rest, status: statusBeforeDictionaryLoad, turnStartedAt: dependencies.clock.now() } };
}

export function skipVersusTurn(state: VersusGameState, dependencies: VersusGameDependencies): VersusActionResult {
  const timeout = checkVersusTimeout(state, dependencies); if (timeout) return timeout;
  if (state.status !== "WAITING_FOR_INPUT") return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_INPUT" };
  const current = state.players.find((player) => player.id === state.currentPlayerId)!;
  if (state.matchFormat === "GROWING_LENGTH" || current.skipRemaining <= 0) return { outcome: "INVALID_ACTION", state, error: "SKIP_UNAVAILABLE" };
  const now = dependencies.clock.now();
  const saved = checkpoint(state, now);
  const next = otherPlayer(saved);
  const players = saved.players.map((player) => player.id === current.id ? { ...player, isActive: false, skipRemaining: player.skipRemaining - 1 } : { ...player, isActive: true }) as [VersusPlayer, VersusPlayer];
  return { outcome: "SKIPPED", state: { ...saved, players, currentPlayerId: next.id, turnNumber: state.turnNumber + 1, turnStartedAt: now, currentTurnElapsedMs: 0 } };
}
