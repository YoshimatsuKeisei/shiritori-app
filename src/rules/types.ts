import type { ResolvedWord } from "../dictionary/types.js";

export type MatchFormat =
  | "NORMAL"
  | "TWO_CHARACTER"
  | "GROWING_LENGTH"
  | "CATEGORY_MASTER"
  | "REVERSE"
  | "FORBIDDEN_CHARACTER";

export type ConstraintOption =
  | "KANJI_ONLY"
  | "KATAKANA_ONLY"
  | "REQUIRED_LAST_KANJI"
  | "REQUIRED_LAST_KANJI_RADICAL";

export type RuleConfigurationErrorCode =
  | "TOO_MANY_CONSTRAINT_OPTIONS"
  | "DUPLICATE_CONSTRAINT_OPTION"
  | "SCRIPT_OPTIONS_CONFLICT"
  | "KANJI_ONLY_REQUIRED"
  | "LAST_KANJI_OPTIONS_CONFLICT";

export interface RuleConfigurationError {
  code: RuleConfigurationErrorCode;
  option?: ConstraintOption;
}

export interface RuleConfigurationValidation {
  valid: boolean;
  errors: RuleConfigurationError[];
}

export type RejectReason =
  | "WORD_NOT_FOUND"
  | "ALREADY_USED"
  | "CONNECTION_MISMATCH"
  | "LENGTH_MISMATCH"
  | "FORBIDDEN_CHARACTER"
  | "KANJI_REQUIRED"
  | "KATAKANA_REQUIRED"
  | "REQUIRED_KANJI_MISSING"
  | "RADICAL_MISMATCH"
  | "INVALID_INITIAL_CONDITION"
  | "INVALID_RULE_CONFIGURATION"
  | "CATEGORY_NOT_IMPLEMENTED";

export type EliminationReason = "END_WITH_N" | "TIMEOUT" | "NO_VALID_WORD";

export interface RadicalResolver {
  getRadicalId(kanji: string): string | undefined;
}

export interface RuleEvaluationContext {
  currentWord: ResolvedWord;
  previousWord?: ResolvedWord;
  initialChar?: string;
  requiredLength?: number;
  usedNormalKeys: ReadonlySet<string>;
  usedKanjiKeys: ReadonlySet<string>;
  matchFormat: MatchFormat;
  constraintOptions: readonly ConstraintOption[];
  forbiddenCharacters?: ReadonlySet<string>;
  radicalResolver?: RadicalResolver;
}

export type RuleEvaluationResult =
  | { valid: true }
  | { valid: false; rejectReason: RejectReason }
  | { valid: false; eliminationReason: EliminationReason };

export type ForbiddenSlot =
  | { group: "A"; char: string }
  | { group: "B" | "C" | "D" };

export type ForbiddenConfigurationError =
  | "TOO_MANY_SLOTS"
  | "DUPLICATE_SLOT"
  | "INVALID_GROUP_A_CHARACTER"
  | "GROUP_COMBINATION_NOT_ALLOWED";

export interface ForbiddenCharacterResolution {
  valid: boolean;
  characters: ReadonlySet<string>;
  errors: ForbiddenConfigurationError[];
}

export type NextConnection =
  | { type: "STARTS_WITH"; value: string }
  | { type: "STARTS_WITH_TWO"; value: string }
  | { type: "ENDS_WITH"; value: string }
  | { type: "CATEGORY" };
