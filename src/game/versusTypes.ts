import type { DictionaryScope, ResolvedWord } from "../dictionary/types.js";
import type { ConstraintOption, EliminationReason, ForbiddenSlot, MatchFormat, RejectReason } from "../rules/types.js";
import type { Clock, ConnectionCondition, DebugGameDependencies, DebugGameState, PendingKanjiSelection, RandomSource } from "./types.js";

export type VersusGameStatus = "READY" | "WAITING_FOR_DICTIONARY" | "WAITING_FOR_INPUT" | "WAITING_FOR_KANJI_SELECTION" | "GAME_OVER";

export interface VersusPlayer {
  id: string;
  name: string;
  remainingTimeMs: number;
  isActive: boolean;
  skipRemaining: number;
  validAnswerCount: number;
  totalAnswerTimeMs: number;
  totalCharacterCount: number;
  longestWord?: ResolvedWord;
  eliminationReason?: EliminationReason;
}

export interface VersusAnswerRecord {
  turnNumber: number;
  playerId: string;
  word: ResolvedWord;
  displayText: string;
  submittedReading: string;
  startedAt: number;
  acceptedAt: number;
  elapsedMs: number;
}

export interface VersusGameState extends Omit<DebugGameState, "status" | "answerHistory"> {
  status: VersusGameStatus;
  players: [VersusPlayer, VersusPlayer];
  currentPlayerId: string;
  answerHistory: readonly VersusAnswerRecord[];
  winnerPlayerId?: string;
  statusBeforeDictionaryLoad?: "WAITING_FOR_INPUT" | "WAITING_FOR_KANJI_SELECTION";
  currentTurnElapsedMs: number;
}

export interface CreateVersusGameOptions {
  matchFormat: MatchFormat;
  constraintOptions?: readonly ConstraintOption[];
  dictionaryScope: DictionaryScope;
  forbiddenSlots?: readonly ForbiddenSlot[];
  initialTimeMs: number;
  skipEnabled?: boolean;
  playerNames?: readonly [string, string];
  randomSource?: RandomSource;
}

export interface VersusGameDependencies extends Omit<DebugGameDependencies, "clock"> { clock: Clock }

export type VersusSetupError = "INVALID_TIME" | "INVALID_RULE_CONFIGURATION" | "INVALID_FORBIDDEN_CONFIGURATION" | "CATEGORY_NOT_IMPLEMENTED" | "RADICAL_RESOLVER_REQUIRED";
export type CreateVersusGameResult = { ok: true; state: VersusGameState } | { ok: false; error: VersusSetupError };

export type VersusActionResult =
  | { outcome: "ACCEPTED"; state: VersusGameState; record: VersusAnswerRecord }
  | { outcome: "REJECTED"; state: VersusGameState; rejectReason: RejectReason }
  | { outcome: "WAITING_FOR_KANJI_SELECTION"; state: VersusGameState }
  | { outcome: "KANJI_SELECTION_CANCELLED"; state: VersusGameState }
  | { outcome: "SKIPPED"; state: VersusGameState }
  | { outcome: "PAUSED_FOR_DICTIONARY"; state: VersusGameState }
  | { outcome: "RESUMED_AFTER_DICTIONARY"; state: VersusGameState }
  | { outcome: "GAME_OVER"; state: VersusGameState; eliminationReason: EliminationReason }
  | { outcome: "INVALID_ACTION"; state: VersusGameState; error: "NOT_WAITING_FOR_INPUT" | "NOT_WAITING_FOR_KANJI_SELECTION" | "KANJI_CANDIDATE_NOT_FOUND" | "NOT_WAITING_FOR_DICTIONARY" | "SKIP_UNAVAILABLE" };

export interface VersusPlayerResult {
  id: string;
  name: string;
  remainingTimeMs: number;
  validAnswerCount: number;
  averageAnswerTimeMs: number | null;
  averageCharacterCount: number | null;
  longestWord?: ResolvedWord;
  skipRemaining: number;
  eliminationReason?: EliminationReason;
  outcome: "WIN" | "LOSE" | "UNDECIDED";
}

export interface VersusGameView {
  currentPlayer: VersusPlayer;
  waitingPlayer: VersusPlayer;
  currentPlayerRemainingTimeMs: number;
  waitingPlayerRemainingTimeMs: number;
  winner?: VersusPlayer;
  playerResults: readonly [VersusPlayerResult, VersusPlayerResult];
  currentConnection: ConnectionCondition;
  pendingKanjiSelection?: PendingKanjiSelection;
}
