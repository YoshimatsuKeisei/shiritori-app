import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry, resolveWordEntry } from "../dictionary/index.js";
import {
  deriveNextConnection,
  evaluateAnswer,
  hasRequiredLastKanji,
  normalizeSmallKanaForConnection,
  resolveForbiddenCharacters,
  validateRuleConfiguration,
} from "./index.js";
import type {
  ConstraintOption,
  MatchFormat,
  RuleEvaluationContext,
} from "./index.js";

let wordSequence = 0;
function word(reading: string, surface = reading, mode: "normal" | "kanji" = "normal") {
  const entry = createWordEntry({
    id: `word-${wordSequence++}`,
    source: "JMdict",
    reading,
    surface,
  });
  return resolveWordEntry(entry, reading, mode);
}

function context(
  currentWord: ReturnType<typeof word>,
  matchFormat: MatchFormat = "NORMAL",
  overrides: Partial<RuleEvaluationContext> = {},
): RuleEvaluationContext {
  return {
    currentWord,
    initialChar: currentWord.firstChar,
    usedNormalKeys: new Set(),
    usedKanjiKeys: new Set(),
    matchFormat,
    constraintOptions: [],
    ...overrides,
  };
}

test("validates option limits for every match format", () => {
  const three: ConstraintOption[] = ["KANJI_ONLY", "REQUIRED_LAST_KANJI", "KATAKANA_ONLY"];
  const four: ConstraintOption[] = [...three, "REQUIRED_LAST_KANJI_RADICAL"];
  assert.equal(validateRuleConfiguration("NORMAL", ["KANJI_ONLY", "REQUIRED_LAST_KANJI", "KATAKANA_ONLY"]).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), false);
  assert.equal(validateRuleConfiguration("NORMAL", four).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), true);
  assert.equal(validateRuleConfiguration("TWO_CHARACTER", ["KANJI_ONLY", "REQUIRED_LAST_KANJI"]).valid, true);
  assert.equal(validateRuleConfiguration("TWO_CHARACTER", three).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), true);
  assert.equal(validateRuleConfiguration("REVERSE", three).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), true);
  assert.equal(validateRuleConfiguration("FORBIDDEN_CHARACTER", three).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), true);
  assert.equal(validateRuleConfiguration("CATEGORY_MASTER", three).errors.some((e) => e.code === "TOO_MANY_CONSTRAINT_OPTIONS"), true);
  assert.equal(validateRuleConfiguration("GROWING_LENGTH", []).valid, true);
  assert.equal(validateRuleConfiguration("GROWING_LENGTH", ["KANJI_ONLY"]).valid, false);
});

test("validates option conflicts, dependencies, and duplicates", () => {
  assert.equal(validateRuleConfiguration("NORMAL", ["KANJI_ONLY", "KATAKANA_ONLY"]).valid, false);
  assert.equal(validateRuleConfiguration("NORMAL", ["REQUIRED_LAST_KANJI"]).valid, false);
  assert.equal(validateRuleConfiguration("NORMAL", ["REQUIRED_LAST_KANJI_RADICAL"]).valid, false);
  assert.equal(validateRuleConfiguration("NORMAL", ["KANJI_ONLY", "REQUIRED_LAST_KANJI", "REQUIRED_LAST_KANJI_RADICAL"]).valid, false);
  assert.equal(validateRuleConfiguration("NORMAL", ["KANJI_ONLY", "KANJI_ONLY"]).errors.some((e) => e.code === "DUPLICATE_CONSTRAINT_OPTION"), true);
});

test("evaluates normal and two-character connections", () => {
  assert.deepEqual(evaluateAnswer(context(word("すいか"), "NORMAL", { previousWord: word("りす") })), { valid: true });
  assert.deepEqual(evaluateAnswer(context(word("かいしゃ"), "TWO_CHARACTER", { previousWord: word("ようかい") })), { valid: true });
});

test("evaluates growing-length exact character counts", () => {
  for (const [reading, valid] of [["すいかき", true], ["すいか", false], ["すいかきく", false]] as const) {
    const result = evaluateAnswer(context(word(reading), "GROWING_LENGTH", {
      initialChar: "す",
      requiredLength: 4,
    }));
    assert.equal(result.valid, valid);
    if (!valid) assert.equal("rejectReason" in result && result.rejectReason, "LENGTH_MISMATCH");
  }
});

test("evaluates reverse connections", () => {
  assert.deepEqual(evaluateAnswer(context(word("たぬき"), "REVERSE", { previousWord: word("きゅうり") })), { valid: true });
});

test("resolves forbidden slots and rejects occurrences including internal ん", () => {
  const resolution = resolveForbiddenCharacters([{ group: "B" }]);
  assert.equal(resolution.valid, true);
  const result = evaluateAnswer(context(word("しんぶん"), "FORBIDDEN_CHARACTER", {
    initialChar: "し",
    forbiddenCharacters: resolution.characters,
  }));
  assert.deepEqual(result, { valid: false, rejectReason: "FORBIDDEN_CHARACTER" });
  assert.equal(resolveForbiddenCharacters([{ group: "B" }, { group: "C" }]).valid, false);
  assert.equal(resolveForbiddenCharacters([{ group: "A", char: "東" }]).valid, false);
  assert.equal(resolveForbiddenCharacters([{ group: "A", char: "あ" }]).valid, true);
});

test("uses reading keys normally and surface keys for kanji-only", () => {
  const bridge = word("はし", "橋");
  assert.deepEqual(evaluateAnswer(context(bridge, "NORMAL", { usedNormalKeys: new Set(["はし"]), initialChar: "は" })), {
    valid: false,
    rejectReason: "ALREADY_USED",
  });

  const chopsticks = word("はし", "箸", "kanji");
  assert.deepEqual(evaluateAnswer(context(chopsticks, "NORMAL", {
    constraintOptions: ["KANJI_ONLY"],
    usedKanjiKeys: new Set(["橋"]),
    initialChar: "は",
  })), { valid: true });
});

test("evaluates kanji-only and katakana-only from dictionary surfaces", () => {
  assert.deepEqual(evaluateAnswer(context(word("たべもの", "食べ物", "kanji"), "NORMAL", {
    constraintOptions: ["KANJI_ONLY"], initialChar: "た",
  })), { valid: true });
  assert.deepEqual(evaluateAnswer(context(word("すーぱー", "スーパー"), "NORMAL", {
    constraintOptions: ["KATAKANA_ONLY"], initialChar: "す",
  })), { valid: true });
});

test("evaluates required last kanji and injected radical resolver", () => {
  const previousWord = word("おんがく", "音楽", "kanji");
  assert.equal(hasRequiredLastKanji(previousWord, word("がくえん", "楽園", "kanji")), true);

  const currentWord = word("くらく", "苦楽", "kanji");
  assert.deepEqual(evaluateAnswer(context(currentWord, "NORMAL", {
    previousWord,
    constraintOptions: ["KANJI_ONLY", "REQUIRED_LAST_KANJI"],
  })), { valid: true });

  const radicalResult = evaluateAnswer(context(word("くらく", "苦楽", "kanji"), "NORMAL", {
    previousWord,
    constraintOptions: ["KANJI_ONLY", "REQUIRED_LAST_KANJI_RADICAL"],
    radicalResolver: { getRadicalId: (kanji) => kanji === "楽" ? "wood" : undefined },
  }));
  assert.deepEqual(radicalResult, { valid: true });
});

test("does not require a previous kanji or radical on the first turn", () => {
  const first = word("おんがく", "音楽", "kanji");
  assert.deepEqual(evaluateAnswer(context(first, "NORMAL", {
    initialChar: "お",
    constraintOptions: ["KANJI_ONLY", "REQUIRED_LAST_KANJI"],
  })), { valid: true });
  assert.deepEqual(evaluateAnswer(context(first, "NORMAL", {
    initialChar: "お",
    constraintOptions: ["KANJI_ONLY", "REQUIRED_LAST_KANJI_RADICAL"],
    radicalResolver: { getRadicalId: () => "wood" },
  })), { valid: true });
});

test("returns END_WITH_N only after ordinary rules pass", () => {
  assert.deepEqual(evaluateAnswer(context(word("みかん"), "NORMAL", { initialChar: "み" })), {
    valid: false,
    eliminationReason: "END_WITH_N",
  });
  assert.deepEqual(evaluateAnswer(context(word("みかん"), "FORBIDDEN_CHARACTER", {
    initialChar: "み",
    forbiddenCharacters: new Set(["ん"]),
  })), { valid: false, rejectReason: "FORBIDDEN_CHARACTER" });
});

test("derives next connections without mutating game state", () => {
  const accepted = word("すーぱー");
  assert.deepEqual(deriveNextConnection("NORMAL", accepted), { type: "STARTS_WITH", value: "ぱ" });
  assert.deepEqual(deriveNextConnection("TWO_CHARACTER", accepted), { type: "STARTS_WITH_TWO", value: "ぱー" });
  assert.deepEqual(deriveNextConnection("REVERSE", accepted), { type: "ENDS_WITH", value: "す" });
});

test("uses the kana before a long mark in normal single-character formats", () => {
  assert.deepEqual(deriveNextConnection("NORMAL", word("こんぴゅーたー")), { type: "STARTS_WITH", value: "た" });
  assert.deepEqual(deriveNextConnection("GROWING_LENGTH", word("すーぱー")), { type: "STARTS_WITH", value: "ぱ" });
  assert.deepEqual(deriveNextConnection("FORBIDDEN_CHARACTER", word("すーぱー")), { type: "STARTS_WITH", value: "ぱ" });
  assert.deepEqual(evaluateAnswer(context(word("ぱんだ"), "NORMAL", { previousWord: word("すーぱー") })), { valid: true });
});

test("keeps a long mark in two-character connections and reverse unchanged", () => {
  assert.deepEqual(deriveNextConnection("TWO_CHARACTER", word("すーぱー")), { type: "STARTS_WITH_TWO", value: "ぱー" });
  assert.deepEqual(deriveNextConnection("REVERSE", word("すーぱー")), { type: "ENDS_WITH", value: "す" });
});

test("safely falls back when a reading consists only of a long mark", () => {
  assert.deepEqual(deriveNextConnection("NORMAL", word("ー")), { type: "STARTS_WITH", value: "ー" });
});

test("normalizes small hiragana only for single-character connections", () => {
  const mappings = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゎ": "わ" } as const;
  for (const [small, regular] of Object.entries(mappings)) assert.equal(normalizeSmallKanaForConnection(small), regular);
  assert.equal(normalizeSmallKanaForConnection("ぷ"), "ぷ");
});

test("uses regular-sized kana after words ending in small kana", () => {
  assert.deepEqual(deriveNextConnection("NORMAL", word("かいしゃ")), { type: "STARTS_WITH", value: "や" });
  assert.deepEqual(deriveNextConnection("NORMAL", word("かんじゃ")), { type: "STARTS_WITH", value: "や" });
  assert.deepEqual(deriveNextConnection("GROWING_LENGTH", word("かいしゃ")), { type: "STARTS_WITH", value: "や" });
  assert.deepEqual(deriveNextConnection("FORBIDDEN_CHARACTER", word("かいしゃ")), { type: "STARTS_WITH", value: "や" });
  assert.deepEqual(evaluateAnswer(context(word("やさい"), "NORMAL", { previousWord: word("かいしゃ") })), { valid: true });
});

test("keeps small kana in two-character connections and leaves reverse unchanged", () => {
  assert.deepEqual(deriveNextConnection("TWO_CHARACTER", word("かいしゃ")), { type: "STARTS_WITH_TWO", value: "しゃ" });
  assert.deepEqual(deriveNextConnection("REVERSE", word("かいしゃ")), { type: "ENDS_WITH", value: "か" });
});

test("handles isolated and long-marked small kana defensively", () => {
  assert.deepEqual(deriveNextConnection("NORMAL", word("ゃ")), { type: "STARTS_WITH", value: "や" });
  assert.deepEqual(deriveNextConnection("NORMAL", word("ゃー")), { type: "STARTS_WITH", value: "や" });
});
