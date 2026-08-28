import { createWordEntry } from "../createWordEntry.js";
import { normalizeShiritoriText } from "../japaneseText.js";
import type { WordEntry } from "../types.js";
import {
  extractBlocks,
  extractEntityCode,
  extractTagValues,
} from "./xmlEntries.js";

const NOUN_POS = new Set([
  "n",
  "n-adv",
  "n-pr",
  "n-pref",
  "n-suf",
  "n-t",
  "num",
  "pn",
]);

interface ReadingRecord {
  reading: string;
  restrictions: Set<string>;
  noKanji: boolean;
}

interface SenseRecord {
  partOfSpeech: string[];
  proverb: boolean;
  surfaceRestrictions: Set<string>;
  readingRestrictions: Set<string>;
}

export function parseJmdictEntry(xml: string): WordEntry[] {
  const sequence = extractTagValues(xml, "ent_seq")[0];
  if (!sequence) return [];

  const surfaces = extractBlocks(xml, "k_ele").flatMap((block) =>
    extractTagValues(block, "keb"),
  );

  const readings: ReadingRecord[] = extractBlocks(xml, "r_ele").flatMap(
    (block) => {
      const reading = extractTagValues(block, "reb")[0];

      return reading
        ? [
            {
              reading,
              restrictions: new Set(extractTagValues(block, "re_restr")),
              noKanji: block.includes("<re_nokanji"),
            },
          ]
        : [];
    },
  );

  let inheritedPartOfSpeech: string[] = [];

  const senses: SenseRecord[] = extractBlocks(xml, "sense").map((block) => {
    const declaredPartOfSpeech = extractTagValues(block, "pos").map(
      extractEntityCode,
    );

    if (declaredPartOfSpeech.length > 0) {
      inheritedPartOfSpeech = declaredPartOfSpeech;
    }

    return {
      partOfSpeech: [...inheritedPartOfSpeech],
      proverb: extractTagValues(block, "misc")
        .map(extractEntityCode)
        .includes("proverb"),
      surfaceRestrictions: new Set(extractTagValues(block, "stagk")),
      readingRestrictions: new Set(extractTagValues(block, "stagr")),
    };
  });

  const entries: WordEntry[] = [];

  for (const [readingIndex, record] of readings.entries()) {
    const applicableSurfaces =
      surfaces.length === 0 || record.noKanji
        ? [record.reading]
        : surfaces.filter(
            (surface) =>
              record.restrictions.size === 0 ||
              record.restrictions.has(surface),
          );

    for (const [surfaceIndex, surface] of applicableSurfaces.entries()) {
      const applicableSenses = senses.filter(
        (sense) =>
          (sense.surfaceRestrictions.size === 0 ||
            sense.surfaceRestrictions.has(surface)) &&
          (sense.readingRestrictions.size === 0 ||
            sense.readingRestrictions.has(record.reading)) &&
          (sense.proverb ||
            sense.partOfSpeech.some((tag) => NOUN_POS.has(tag))),
      );

      if (applicableSenses.length === 0) {
        continue;
      }

      /*
       * JMdictには、読みは日本語でも表記が英字・数字などだけの
       * エントリが含まれる場合がある。
       *
       * しりとり用WordEntryは日本語文字を含むsurfaceを前提としているため、
       * createWordEntry()へ渡す前に対象外の表記だけを除外する。
       *
       * createWordEntry()側のvalidationは緩和しない。
       */
      if (!normalizeShiritoriText(surface)) {
        continue;
      }

      const partOfSpeech = [
        ...new Set(applicableSenses.flatMap((sense) => sense.partOfSpeech)),
      ];

      const proverb = applicableSenses.some((sense) => sense.proverb);

      entries.push(
        createWordEntry({
          id: `JMdict:${sequence}:${readingIndex}:${surfaceIndex}`,
          source: "JMdict",
          reading: record.reading,
          surface,
          partOfSpeech,
          semanticTags: proverb ? ["proverb"] : [],
        }),
      );
    }
  }

  return entries;
}
