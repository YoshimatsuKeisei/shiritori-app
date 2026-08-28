import type {
  DictionaryScope,
  ResolvedWord,
  WordEntry,
} from "../dictionary/types.js";
import type {
  ConstraintOption,
  EliminationReason,
  ForbiddenSlot,
  MatchFormat,
  NextConnection,
  RadicalResolver,
  RejectReason,
} from "../rules/types.js";

export type GameStatus =
  | "READY"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_KANJI_SELECTION"
  | "GAME_OVER";

export type ConnectionCondition = Exclude<NextConnection, { type: "CATEGORY" }>;

export interface AnswerRecord {
  turnNumber: number;
  word: ResolvedWord;
  displayText: string;
  submittedReading: string;
  startedAt: number;
  acceptedAt: number;
  elapsedMs: number;
}

export interface PendingKanjiSelection {
  input: string;
  normalizedInput: string;
  candidates: readonly WordEntry[];
}

export interface DebugGameState {
  status: GameStatus;
  matchFormat: MatchFormat;
  constraintOptions: readonly ConstraintOption[];
  dictionaryScope: DictionaryScope;
  startChar: string;
  currentConnection: ConnectionCondition;
  previousWord?: ResolvedWord;
  answerHistory: readonly AnswerRecord[];
  usedNormalKeys: ReadonlySet<string>;
  usedKanjiKeys: ReadonlySet<string>;
  requiredLength?: number;
  forbiddenCharacters?: ReadonlySet<string>;
  pendingKanjiSelection?: PendingKanjiSelection;
  gameOverReason?: EliminationReason;
  turnNumber: number;
  turnStartedAt: number;
}

export interface RandomSource { next(): number }
export interface Clock { now(): number }

export interface DebugGameDependencies {
  repository: import("../dictionary/types.js").DictionaryRepository;
  clock: Clock;
  radicalResolver?: RadicalResolver;
}

export interface CreateDebugGameOptions {
  matchFormat: MatchFormat;
  constraintOptions?: readonly ConstraintOption[];
  dictionaryScope: DictionaryScope;
  forbiddenSlots?: readonly ForbiddenSlot[];
  randomSource?: RandomSource;
}

export type GameSetupError =
  | "INVALID_RULE_CONFIGURATION"
  | "INVALID_FORBIDDEN_CONFIGURATION"
  | "CATEGORY_NOT_IMPLEMENTED"
  | "RADICAL_RESOLVER_REQUIRED";

export type CreateDebugGameResult =
  | { ok: true; state: DebugGameState }
  | { ok: false; error: GameSetupError };

export type GameActionError =
  | "NOT_WAITING_FOR_INPUT"
  | "NOT_WAITING_FOR_KANJI_SELECTION"
  | "KANJI_CANDIDATE_NOT_FOUND";

export type GameActionResult =
  | { outcome: "ACCEPTED"; state: DebugGameState; record: AnswerRecord }
  | { outcome: "REJECTED"; state: DebugGameState; rejectReason: RejectReason }
  | { outcome: "WAITING_FOR_KANJI_SELECTION"; state: DebugGameState }
  | { outcome: "KANJI_SELECTION_CANCELLED"; state: DebugGameState }
  | { outcome: "GAME_OVER"; state: DebugGameState; eliminationReason: EliminationReason }
  | { outcome: "INVALID_ACTION"; state: DebugGameState; error: GameActionError };

export interface DebugGameView {
  matchFormat: MatchFormat;
  constraintOptions: readonly ConstraintOption[];
  answerHistory: readonly AnswerRecord[];
  latestAnswer?: AnswerRecord;
  connectionValue: string;
  connectionDirection: "STARTS_WITH" | "ENDS_WITH";
  connectionCharacterCount: 1 | 2;
  requiredLength?: number;
  forbiddenCharacters?: ReadonlySet<string>;
  pendingKanjiSelection?: PendingKanjiSelection;
  gameOverReason?: EliminationReason;
  turnNumber: number;
}
