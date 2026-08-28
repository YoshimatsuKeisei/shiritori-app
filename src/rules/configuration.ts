import type {
  ConstraintOption,
  MatchFormat,
  RuleConfigurationError,
  RuleConfigurationValidation,
} from "./types.js";

export const MAX_CONSTRAINT_OPTIONS: Readonly<Record<MatchFormat, number>> = {
  NORMAL: 3,
  TWO_CHARACTER: 2,
  GROWING_LENGTH: 0,
  CATEGORY_MASTER: 2,
  REVERSE: 2,
  FORBIDDEN_CHARACTER: 2,
};

export function validateRuleConfiguration(
  matchFormat: MatchFormat,
  constraintOptions: readonly ConstraintOption[],
): RuleConfigurationValidation {
  const errors: RuleConfigurationError[] = [];
  const options = new Set<ConstraintOption>();

  for (const option of constraintOptions) {
    if (options.has(option)) {
      errors.push({ code: "DUPLICATE_CONSTRAINT_OPTION", option });
    }
    options.add(option);
  }

  if (constraintOptions.length > MAX_CONSTRAINT_OPTIONS[matchFormat]) {
    errors.push({ code: "TOO_MANY_CONSTRAINT_OPTIONS" });
  }
  if (options.has("KANJI_ONLY") && options.has("KATAKANA_ONLY")) {
    errors.push({ code: "SCRIPT_OPTIONS_CONFLICT" });
  }
  for (const option of ["REQUIRED_LAST_KANJI", "REQUIRED_LAST_KANJI_RADICAL"] as const) {
    if (options.has(option) && !options.has("KANJI_ONLY")) {
      errors.push({ code: "KANJI_ONLY_REQUIRED", option });
    }
  }
  if (options.has("REQUIRED_LAST_KANJI") && options.has("REQUIRED_LAST_KANJI_RADICAL")) {
    errors.push({ code: "LAST_KANJI_OPTIONS_CONFLICT" });
  }

  return { valid: errors.length === 0, errors };
}
