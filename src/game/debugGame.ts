import { normalizeReading } from "../dictionary/japaneseText.js";
import { resolveWordEntry } from "../dictionary/createWordEntry.js";
import type {
  DictionaryQuery,
  WordEntry,
} from "../dictionary/types.js";
import {
  deriveNextConnection,
  evaluateAnswer,
} from "../rules/evaluate.js";
import { resolveForbiddenCharacters } from "../rules/forbiddenCharacters.js";
import { validateRuleConfiguration } from "../rules/configuration.js";
import type { ConstraintOption, RuleEvaluationResult } from "../rules/types.js";
import type {
  AnswerRecord,
  Clock,
  ConnectionCondition,
  CreateDebugGameOptions,
  CreateDebugGameResult,
  DebugGameDependencies,
  DebugGameState,
  GameActionResult,
  RandomSource,
} from "./types.js";

export const START_CHARACTERS = Array.from(
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわを" +
  "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ",
);

const mathRandomSource: RandomSource = { next: () => Math.random() };

export function chooseStartCharacter(randomSource: RandomSource = mathRandomSource): string {
  const value = randomSource.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("RandomSource.next() must return a finite number in [0, 1). ");
  }
  return START_CHARACTERS[Math.floor(value * START_CHARACTERS.length)]!;
}

function initialConnection(matchFormat: CreateDebugGameOptions["matchFormat"], startChar: string): ConnectionCondition {
  return matchFormat === "REVERSE"
    ? { type: "ENDS_WITH", value: startChar }
    : { type: "STARTS_WITH", value: startChar };
}

function hasOption(state: DebugGameState, option: ConstraintOption): boolean {
  return state.constraintOptions.includes(option);
}

function stableCandidates(entries: readonly WordEntry[]): WordEntry[] {
  return [...entries].sort((left, right) => {
    if (left.normalizedSurface < right.normalizedSurface) return -1;
    if (left.normalizedSurface > right.normalizedSurface) return 1;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });
}

function resolveForState(state: DebugGameState, entry: WordEntry, input: string) {
  return resolveWordEntry(entry, input, hasOption(state, "KANJI_ONLY") ? "kanji" : "normal");
}

function evaluate(state: DebugGameState, entry: WordEntry, input: string, dependencies: DebugGameDependencies): RuleEvaluationResult {
  return evaluateAnswer({
    currentWord: resolveForState(state, entry, input),
    ...(state.previousWord ? { previousWord: state.previousWord } : { initialChar: state.startChar }),
    ...(state.requiredLength === undefined ? {} : { requiredLength: state.requiredLength }),
    usedNormalKeys: state.usedNormalKeys,
    usedKanjiKeys: state.usedKanjiKeys,
    matchFormat: state.matchFormat,
    constraintOptions: state.constraintOptions,
    ...(state.forbiddenCharacters === undefined ? {} : { forbiddenCharacters: state.forbiddenCharacters }),
    ...(dependencies.radicalResolver === undefined ? {} : { radicalResolver: dependencies.radicalResolver }),
  });
}

function queryForCurrentTurn(state: DebugGameState): DictionaryQuery {
  return {
    ...(state.currentConnection.type === "ENDS_WITH"
      ? { endsWith: state.currentConnection.value }
      : { startsWith: state.currentConnection.value }),
    ...(state.requiredLength === undefined ? {} : { exactLength: state.requiredLength }),
    ...(state.forbiddenCharacters === undefined ? {} : { forbiddenCharacters: state.forbiddenCharacters }),
    ...(hasOption(state, "KANJI_ONLY") ? { scriptType: "kanji" as const } : {}),
    ...(hasOption(state, "KATAKANA_ONLY") ? { scriptType: "katakana" as const } : {}),
    scope: state.dictionaryScope,
  };
}

function canProveNoValidWord(state: DebugGameState, dependencies: DebugGameDependencies): boolean {
  if (state.matchFormat === "CATEGORY_MASTER") return false;
  if (hasOption(state, "REQUIRED_LAST_KANJI_RADICAL") && !dependencies.radicalResolver) return false;
  const candidates = dependencies.repository.searchWords(queryForCurrentTurn(state));
  return !candidates.some((entry) => {
    const result = evaluate(state, entry, entry.normalizedReading, dependencies);
    return result.valid || ("eliminationReason" in result && result.eliminationReason === "END_WITH_N");
  });
}

function withNoValidWordIfNeeded(state: DebugGameState, dependencies: DebugGameDependencies): DebugGameState {
  return canProveNoValidWord(state, dependencies)
    ? { ...state, status: "GAME_OVER", gameOverReason: "NO_VALID_WORD" }
    : state;
}

export function createDebugGame(
  options: CreateDebugGameOptions,
  dependencies: DebugGameDependencies,
): CreateDebugGameResult {
  const constraintOptions = options.constraintOptions ?? [];
  if (!validateRuleConfiguration(options.matchFormat, constraintOptions).valid) {
    return { ok: false, error: "INVALID_RULE_CONFIGURATION" };
  }
  if (options.matchFormat === "CATEGORY_MASTER") return { ok: false, error: "CATEGORY_NOT_IMPLEMENTED" };
  if (constraintOptions.includes("REQUIRED_LAST_KANJI_RADICAL") && !dependencies.radicalResolver) {
    return { ok: false, error: "RADICAL_RESOLVER_REQUIRED" };
  }

  let forbiddenCharacters: ReadonlySet<string> | undefined;
  if (options.matchFormat === "FORBIDDEN_CHARACTER") {
    const resolution = resolveForbiddenCharacters(options.forbiddenSlots ?? []);
    if (!resolution.valid) return { ok: false, error: "INVALID_FORBIDDEN_CONFIGURATION" };
    forbiddenCharacters = resolution.characters;
  }

  const startChar = chooseStartCharacter(options.randomSource);
  const startedAt = dependencies.clock.now();
  const state: DebugGameState = {
    status: "WAITING_FOR_INPUT",
    matchFormat: options.matchFormat,
    constraintOptions: [...constraintOptions],
    dictionaryScope: { ...options.dictionaryScope },
    startChar,
    currentConnection: initialConnection(options.matchFormat, startChar),
    answerHistory: [],
    usedNormalKeys: new Set(),
    usedKanjiKeys: new Set(),
    ...(options.matchFormat === "GROWING_LENGTH" ? { requiredLength: 2 } : {}),
    ...(forbiddenCharacters === undefined ? {} : { forbiddenCharacters }),
    turnNumber: 1,
    turnStartedAt: startedAt,
  };
  return { ok: true, state: withNoValidWordIfNeeded(state, dependencies) };
}

function rejectOrEliminate(
  state: DebugGameState,
  evaluation: Exclude<RuleEvaluationResult, { valid: true }>,
): GameActionResult {
  if ("rejectReason" in evaluation) {
    if (state.status !== "WAITING_FOR_KANJI_SELECTION") {
      return { outcome: "REJECTED", state, rejectReason: evaluation.rejectReason };
    }
    const { pendingKanjiSelection: _pending, ...stateWithoutPending } = state;
    return {
      outcome: "REJECTED",
      state: { ...stateWithoutPending, status: "WAITING_FOR_INPUT" },
      rejectReason: evaluation.rejectReason,
    };
  }
  const { pendingKanjiSelection: _pending, ...stateWithoutPending } = state;
  const gameOverState: DebugGameState = {
    ...stateWithoutPending,
    status: "GAME_OVER",
    gameOverReason: evaluation.eliminationReason,
  };
  return { outcome: "GAME_OVER", state: gameOverState, eliminationReason: evaluation.eliminationReason };
}

function acceptEntry(
  state: DebugGameState,
  entry: WordEntry,
  input: string,
  dependencies: DebugGameDependencies,
): GameActionResult {
  const word = resolveForState(state, entry, input);
  const evaluation = evaluate(state, entry, input, dependencies);
  if (!evaluation.valid) return rejectOrEliminate(state, evaluation);

  const acceptedAt = dependencies.clock.now();
  const record: AnswerRecord = {
    turnNumber: state.turnNumber,
    word,
    displayText: hasOption(state, "KANJI_ONLY") || hasOption(state, "KATAKANA_ONLY")
      ? word.surface
      : word.normalizedReading,
    submittedReading: normalizeReading(input),
    startedAt: state.turnStartedAt,
    acceptedAt,
    elapsedMs: Math.max(0, acceptedAt - state.turnStartedAt),
  };
  const usedNormalKeys = new Set(state.usedNormalKeys);
  const usedKanjiKeys = new Set(state.usedKanjiKeys);
  if (hasOption(state, "KANJI_ONLY")) usedKanjiKeys.add(word.usageKey);
  else usedNormalKeys.add(word.usageKey);
  const connection = deriveNextConnection(state.matchFormat, word);
  if (connection.type === "CATEGORY") {
    return { outcome: "REJECTED", state, rejectReason: "CATEGORY_NOT_IMPLEMENTED" };
  }

  const { pendingKanjiSelection: _pending, ...stateWithoutPending } = state;
  const nextState: DebugGameState = {
    ...stateWithoutPending,
    status: "WAITING_FOR_INPUT",
    previousWord: word,
    currentConnection: connection,
    answerHistory: [...state.answerHistory, record],
    usedNormalKeys,
    usedKanjiKeys,
    ...(state.matchFormat === "GROWING_LENGTH" ? { requiredLength: (state.requiredLength ?? 2) + 1 } : {}),
    turnNumber: state.turnNumber + 1,
    turnStartedAt: acceptedAt,
  };
  const checkedState = withNoValidWordIfNeeded(nextState, dependencies);
  return checkedState.status === "GAME_OVER"
    ? { outcome: "GAME_OVER", state: checkedState, eliminationReason: "NO_VALID_WORD" }
    : { outcome: "ACCEPTED", state: checkedState, record };
}

export function submitAnswer(
  state: DebugGameState,
  input: string,
  dependencies: DebugGameDependencies,
): GameActionResult {
  if (state.status !== "WAITING_FOR_INPUT") {
    return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_INPUT" };
  }
  const normalizedInput = normalizeReading(input);
  const allCandidates = dependencies.repository.findByReading(normalizedInput, state.dictionaryScope);
  if (allCandidates.length === 0) return { outcome: "REJECTED", state, rejectReason: "WORD_NOT_FOUND" };

  if (hasOption(state, "KANJI_ONLY")) {
    const candidates = stableCandidates(dependencies.repository.findKanjiCandidatesByReading(normalizedInput, state.dictionaryScope));
    if (candidates.length === 0) return { outcome: "REJECTED", state, rejectReason: "KANJI_REQUIRED" };
    return {
      outcome: "WAITING_FOR_KANJI_SELECTION",
      state: {
        ...state,
        status: "WAITING_FOR_KANJI_SELECTION",
        pendingKanjiSelection: { input, normalizedInput, candidates },
      },
    };
  }

  const candidates = hasOption(state, "KATAKANA_ONLY")
    ? stableCandidates(dependencies.repository.findKatakanaCandidatesByReading(normalizedInput, state.dictionaryScope))
    : stableCandidates(allCandidates);
  if (candidates.length === 0) {
    return { outcome: "REJECTED", state, rejectReason: "KATAKANA_REQUIRED" };
  }
  return acceptEntry(state, candidates[0]!, input, dependencies);
}

export function selectKanjiCandidate(
  state: DebugGameState,
  entryId: string,
  dependencies: DebugGameDependencies,
): GameActionResult {
  if (state.status !== "WAITING_FOR_KANJI_SELECTION" || !state.pendingKanjiSelection) {
    return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_KANJI_SELECTION" };
  }
  const entry = state.pendingKanjiSelection.candidates.find((candidate) => candidate.id === entryId);
  if (!entry) return { outcome: "INVALID_ACTION", state, error: "KANJI_CANDIDATE_NOT_FOUND" };
  return acceptEntry(state, entry, state.pendingKanjiSelection.input, dependencies);
}

export function cancelKanjiSelection(state: DebugGameState): GameActionResult {
  if (state.status !== "WAITING_FOR_KANJI_SELECTION" || !state.pendingKanjiSelection) {
    return { outcome: "INVALID_ACTION", state, error: "NOT_WAITING_FOR_KANJI_SELECTION" };
  }
  const { pendingKanjiSelection: _pending, ...stateWithoutPending } = state;
  return {
    outcome: "KANJI_SELECTION_CANCELLED",
    state: { ...stateWithoutPending, status: "WAITING_FOR_INPUT" },
  };
}
