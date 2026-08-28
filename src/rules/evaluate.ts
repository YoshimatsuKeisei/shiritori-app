import { validateRuleConfiguration } from "./configuration.js";
import type { ResolvedWord } from "../dictionary/types.js";
import type {
  ConstraintOption,
  MatchFormat,
  NextConnection,
  RadicalResolver,
  RejectReason,
  RuleEvaluationContext,
  RuleEvaluationResult,
} from "./types.js";

function rejected(rejectReason: RejectReason): RuleEvaluationResult {
  return { valid: false, rejectReason };
}

function connectionRejectReason(context: RuleEvaluationContext): RejectReason | undefined {
  const { currentWord, previousWord, initialChar, matchFormat } = context;
  if (!previousWord) {
    if (!initialChar) return "INVALID_INITIAL_CONDITION";
    const matches = matchFormat === "REVERSE"
      ? currentWord.lastChar === initialChar
      : currentWord.firstChar === initialChar;
    return matches ? undefined : "INVALID_INITIAL_CONDITION";
  }

  const matches = matchFormat === "TWO_CHARACTER"
    ? previousWord.lastTwoChars === currentWord.firstTwoChars
    : matchFormat === "REVERSE"
      ? previousWord.firstChar === currentWord.lastChar
      : getSingleCharacterConnection(previousWord) === currentWord.firstChar;
  return matches ? undefined : "CONNECTION_MISMATCH";
}

function hasOption(options: readonly ConstraintOption[], option: ConstraintOption): boolean {
  return options.includes(option);
}

function radicalMatches(
  previousWord: ResolvedWord,
  currentWord: ResolvedWord,
  resolver: RadicalResolver | undefined,
): boolean {
  const previousKanji = previousWord.kanjiChars.at(-1);
  if (!previousKanji || !resolver) return false;
  const requiredRadical = resolver.getRadicalId(previousKanji);
  return requiredRadical !== undefined && currentWord.kanjiChars.some(
    (kanji) => resolver.getRadicalId(kanji) === requiredRadical,
  );
}

export function hasRequiredLastKanji(previousWord: ResolvedWord, currentWord: ResolvedWord): boolean {
  const requiredKanji = previousWord.kanjiChars.at(-1);
  return requiredKanji !== undefined && currentWord.kanjiChars.includes(requiredKanji);
}

/** Returns the connection kana for one-character formats without changing character counts. */
export function getSingleCharacterConnection(word: ResolvedWord): string {
  if (word.lastChar !== "ー") return word.lastChar;
  const characters = Array.from(word.normalizedReading);
  return characters.at(-2) ?? word.lastChar;
}

export function evaluateAnswer(context: RuleEvaluationContext): RuleEvaluationResult {
  const configuration = validateRuleConfiguration(context.matchFormat, context.constraintOptions);
  if (!configuration.valid) return rejected("INVALID_RULE_CONFIGURATION");
  if (context.matchFormat === "CATEGORY_MASTER") return rejected("CATEGORY_NOT_IMPLEMENTED");

  const kanjiOnly = hasOption(context.constraintOptions, "KANJI_ONLY");
  if (kanjiOnly && context.currentWord.kanjiChars.length === 0) return rejected("KANJI_REQUIRED");
  if (hasOption(context.constraintOptions, "KATAKANA_ONLY") && context.currentWord.scriptType !== "katakana") {
    return rejected("KATAKANA_REQUIRED");
  }

  const usedKeys = kanjiOnly ? context.usedKanjiKeys : context.usedNormalKeys;
  if (usedKeys.has(context.currentWord.usageKey)) return rejected("ALREADY_USED");

  const connectionError = connectionRejectReason(context);
  if (connectionError) return rejected(connectionError);

  if (context.matchFormat === "GROWING_LENGTH") {
    if (context.requiredLength === undefined || context.currentWord.characterCount !== context.requiredLength) {
      return rejected("LENGTH_MISMATCH");
    }
  }

  if (context.matchFormat === "FORBIDDEN_CHARACTER") {
    const forbidden = context.forbiddenCharacters ?? new Set<string>();
    if (Array.from(context.currentWord.normalizedReading).some((character) => forbidden.has(character))) {
      return rejected("FORBIDDEN_CHARACTER");
    }
  }

  if (context.previousWord && hasOption(context.constraintOptions, "REQUIRED_LAST_KANJI")) {
    if (!hasRequiredLastKanji(context.previousWord, context.currentWord)) {
      return rejected("REQUIRED_KANJI_MISSING");
    }
  }
  if (context.previousWord && hasOption(context.constraintOptions, "REQUIRED_LAST_KANJI_RADICAL")) {
    if (!radicalMatches(context.previousWord, context.currentWord, context.radicalResolver)) {
      return rejected("RADICAL_MISMATCH");
    }
  }

  if (context.currentWord.lastChar === "ん") return { valid: false, eliminationReason: "END_WITH_N" };
  return { valid: true };
}

export function deriveNextConnection(matchFormat: MatchFormat, acceptedWord: ResolvedWord): NextConnection {
  if (matchFormat === "TWO_CHARACTER") {
    return { type: "STARTS_WITH_TWO", value: acceptedWord.lastTwoChars };
  }
  if (matchFormat === "REVERSE") {
    return { type: "ENDS_WITH", value: acceptedWord.firstChar };
  }
  if (matchFormat === "CATEGORY_MASTER") return { type: "CATEGORY" };
  return { type: "STARTS_WITH", value: getSingleCharacterConnection(acceptedWord) };
}
