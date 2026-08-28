import {
  classifyScriptType,
  extractKanji,
  getCharacterEdges,
  normalizeReading,
  normalizeShiritoriText,
} from "./japaneseText.js";
import type { RawWordEntry, ResolvedWord, UsageKeyMode, WordEntry } from "./types.js";

export function createWordEntry(raw: RawWordEntry): WordEntry {
  const normalizedReading = normalizeReading(raw.reading);
  const normalizedSurface = normalizeShiritoriText(raw.surface);

  if (!normalizedReading) {
    throw new Error("WordEntry reading must contain at least one Japanese character.");
  }
  if (!normalizedSurface) {
    throw new Error("WordEntry surface must contain at least one Japanese character.");
  }

  const edges = getCharacterEdges(normalizedReading);

  return {
    id: raw.id,
    source: raw.source,
    reading: raw.reading,
    normalizedReading,
    surface: raw.surface,
    normalizedSurface,
    partOfSpeech: [...(raw.partOfSpeech ?? [])],
    semanticTags: [...(raw.semanticTags ?? [])],
    ...(raw.properNounType === undefined ? {} : { properNounType: raw.properNounType }),
    scriptType: classifyScriptType(normalizedSurface),
    characterCount: Array.from(normalizedReading).length,
    ...edges,
    kanjiChars: extractKanji(normalizedSurface),
    usageKeyNormal: normalizedReading,
    usageKeyKanji: normalizedSurface,
  };
}

export function resolveWordEntry(
  entry: WordEntry,
  input: string,
  usageKeyMode: UsageKeyMode = "normal",
): ResolvedWord {
  return {
    entryId: entry.id,
    input,
    reading: entry.reading,
    surface: entry.surface,
    normalizedReading: entry.normalizedReading,
    characterCount: entry.characterCount,
    firstChar: entry.firstChar,
    lastChar: entry.lastChar,
    firstTwoChars: entry.firstTwoChars,
    lastTwoChars: entry.lastTwoChars,
    scriptType: entry.scriptType,
    kanjiChars: [...entry.kanjiChars],
    source: entry.source,
    usageKey: usageKeyMode === "kanji" ? entry.usageKeyKanji : entry.usageKeyNormal,
  };
}
