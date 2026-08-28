import assert from "node:assert/strict";
import test from "node:test";

import {
  FORBIDDEN_GROUP_B,
  FORBIDDEN_GROUP_C,
  FORBIDDEN_GROUP_D,
  classifyScriptType,
  countShiritoriCharacters,
  createWordEntry,
  extractKanji,
  getCharacterEdges,
  isKatakanaWord,
  katakanaToHiragana,
  normalizeReading,
  normalizeShiritoriText,
  resolveWordEntry,
} from "./index.js";

test("converts katakana while preserving long marks and small kana", () => {
  assert.equal(katakanaToHiragana("スーパー"), "すーぱー");
  assert.equal(katakanaToHiragana("コンピューター"), "こんぴゅーたー");
});

test("normalizes punctuation but preserves meaningful shiritori characters", () => {
  assert.equal(normalizeReading("　スーパー ・、。！？『』 "), "すーぱー");
  assert.equal(normalizeReading("きゃ・っーゔ"), "きゃっーゔ");
  assert.equal(normalizeShiritoriText("東京・タワー。"), "東京タワー");
});

test("counts normalized code points rather than morae", () => {
  assert.equal(countShiritoriCharacters("きゃ"), 2);
  assert.equal(countShiritoriCharacters("きゃく"), 3);
  assert.equal(countShiritoriCharacters("がっこう"), 4);
  assert.equal(countShiritoriCharacters("すーぱー"), 4);
  assert.equal(countShiritoriCharacters("スーパー"), 4);
});

test("gets one- and two-character edges", () => {
  assert.deepEqual(getCharacterEdges("すーぱー"), {
    firstChar: "す",
    lastChar: "ー",
    firstTwoChars: "すー",
    lastTwoChars: "ぱー",
  });
  assert.equal(getCharacterEdges("きゃく").firstTwoChars, "きゃ");
});

test("classifies dictionary surfaces and extracts kanji", () => {
  assert.equal(isKatakanaWord("スーパー"), true);
  assert.equal(isKatakanaWord("すーぱー"), false);
  assert.equal(classifyScriptType("東京"), "kanji");
  assert.equal(classifyScriptType("スーパー"), "katakana");
  assert.equal(classifyScriptType("すーぱー"), "hiragana");
  assert.equal(classifyScriptType("東京タワー"), "mixed");
  assert.deepEqual(extractKanji("東京タワー"), ["東", "京"]);
});

test("defines forbidden groups exactly as specified", () => {
  assert.equal(FORBIDDEN_GROUP_B.has("が"), true);
  assert.equal(FORBIDDEN_GROUP_B.has("ゔ"), true);
  assert.equal(FORBIDDEN_GROUP_B.has("ん"), true);
  assert.equal(FORBIDDEN_GROUP_B.has("ぱ"), false);
  assert.deepEqual([...FORBIDDEN_GROUP_C], [..."ぁぃぅぇぉゃゅょっゎ"]);
  assert.deepEqual([...FORBIDDEN_GROUP_D], ["ー"]);
});

test("creates reusable word records and mode-specific usage keys", () => {
  const entry = createWordEntry({
    id: "jmdict-1",
    source: "JMdict",
    reading: "スーパー",
    surface: "スーパー",
    partOfSpeech: ["noun"],
  });

  assert.equal(entry.normalizedReading, "すーぱー");
  assert.equal(entry.characterCount, 4);
  assert.equal(entry.lastTwoChars, "ぱー");
  assert.equal(entry.scriptType, "katakana");
  assert.equal(entry.usageKeyNormal, "すーぱー");
  assert.equal(entry.usageKeyKanji, "スーパー");
  assert.equal(resolveWordEntry(entry, "すーぱー").usageKey, "すーぱー");
});

test("distinguishes kanji surfaces while sharing the normal reading key", () => {
  const surfaces = ["橋", "箸", "端"];
  const entries = surfaces.map((surface, index) => createWordEntry({
    id: String(index),
    source: "JMdict",
    reading: "はし",
    surface,
  }));

  assert.equal(new Set(entries.map((entry) => entry.usageKeyNormal)).size, 1);
  assert.equal(new Set(entries.map((entry) => entry.usageKeyKanji)).size, 3);
});
