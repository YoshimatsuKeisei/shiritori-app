import { createWordEntry } from "../createWordEntry.js";
import type { ProperNounType, WordEntry } from "../types.js";
import { extractBlocks, extractEntityCode, extractTagValues } from "./xmlEntries.js";

const PERSON_TYPES = new Set(["surname", "given", "fem", "masc", "person", "unclass"]);
const PLACE_TYPES = new Set(["place", "station"]);

export function mapJmnedictNameType(tags: readonly string[]): ProperNounType {
  if (tags.some((tag) => PERSON_TYPES.has(tag))) return "PERSON";
  if (tags.some((tag) => PLACE_TYPES.has(tag))) return "PLACE";
  if (tags.includes("organization") || tags.includes("company")) return "ORGANIZATION";
  if (tags.includes("work")) return "WORK";
  if (tags.includes("product")) return "PRODUCT";
  return "OTHER";
}

export function parseJmnedictEntry(xml: string): WordEntry[] {
  const sequence = extractTagValues(xml, "ent_seq")[0];
  if (!sequence) return [];
  const surfaces = extractBlocks(xml, "k_ele").flatMap((block) => extractTagValues(block, "keb"));
  const nameTypes = extractTagValues(xml, "name_type").map(extractEntityCode);
  const properNounType = mapJmnedictNameType(nameTypes);
  const entries: WordEntry[] = [];

  for (const [readingIndex, block] of extractBlocks(xml, "r_ele").entries()) {
    const reading = extractTagValues(block, "reb")[0];
    if (!reading) continue;
    const restrictions = new Set(extractTagValues(block, "re_restr"));
    const applicableSurfaces = surfaces.length === 0
      ? [reading]
      : surfaces.filter((surface) => restrictions.size === 0 || restrictions.has(surface));
    for (const [surfaceIndex, surface] of applicableSurfaces.entries()) {
      entries.push(createWordEntry({
        id: `JMnedict:${sequence}:${readingIndex}:${surfaceIndex}`,
        source: "JMnedict",
        reading,
        surface,
        partOfSpeech: [],
        semanticTags: nameTypes,
        properNounType,
      }));
    }
  }
  return entries;
}
