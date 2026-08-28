import type { ScriptType } from "./types.js";

const KATAKANA_CHARACTER = /\p{Script=Katakana}/u;
const HIRAGANA_CHARACTER = /\p{Script=Hiragana}/u;
const KANJI_CHARACTER = /\p{Script=Han}/u;
const ALLOWED_SHIRITORI_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u;

/** Converts full-width katakana code points to hiragana without altering ー or small kana. */
export function katakanaToHiragana(value: string): string {
  return Array.from(value.normalize("NFC"), (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      return String.fromCodePoint(codePoint - 0x60);
    }
    return character;
  }).join("");
}

/** Removes whitespace, punctuation and decoration while preserving Japanese letters and ー. */
export function normalizeShiritoriText(value: string): string {
  const normalized = value.normalize("NFKC");
  return Array.from(normalized)
    .filter((character) => ALLOWED_SHIRITORI_CHARACTER.test(character))
    .join("")
    .normalize("NFC");
}

/** Normalizes a reading to the hiragana representation used by every rule check. */
export function normalizeReading(value: string): string {
  return katakanaToHiragana(normalizeShiritoriText(value));
}

/** Counts Unicode code points after reading normalization (not morae or UTF-16 units). */
export function countShiritoriCharacters(value: string): number {
  return Array.from(normalizeReading(value)).length;
}

export interface CharacterEdges {
  firstChar: string;
  lastChar: string;
  firstTwoChars: string;
  lastTwoChars: string;
}

export function getCharacterEdges(normalizedReading: string): CharacterEdges {
  const characters = Array.from(normalizedReading);
  return {
    firstChar: characters.at(0) ?? "",
    lastChar: characters.at(-1) ?? "",
    firstTwoChars: characters.slice(0, 2).join(""),
    lastTwoChars: characters.slice(-2).join(""),
  };
}

export function hasKanji(value: string): boolean {
  return Array.from(value).some((character) => KANJI_CHARACTER.test(character));
}

export function extractKanji(value: string): string[] {
  return Array.from(value.normalize("NFC")).filter((character) => KANJI_CHARACTER.test(character));
}

export function isKatakanaWord(value: string): boolean {
  const characters = Array.from(normalizeShiritoriText(value));
  return characters.length > 0 && characters.some((character) => KATAKANA_CHARACTER.test(character)) &&
    characters.every((character) => KATAKANA_CHARACTER.test(character) || character === "ー");
}

export function isHiraganaWord(value: string): boolean {
  const characters = Array.from(normalizeShiritoriText(value));
  return characters.length > 0 && characters.some((character) => HIRAGANA_CHARACTER.test(character)) &&
    characters.every((character) => HIRAGANA_CHARACTER.test(character) || character === "ー");
}

export function classifyScriptType(value: string): ScriptType {
  const normalized = normalizeShiritoriText(value);
  const characters = Array.from(normalized);

  if (characters.length > 0 && characters.every((character) => KANJI_CHARACTER.test(character))) {
    return "kanji";
  }
  if (isKatakanaWord(normalized)) {
    return "katakana";
  }
  if (isHiraganaWord(normalized)) {
    return "hiragana";
  }
  return "mixed";
}
