import { basename } from "node:path";
import { access } from "node:fs/promises";

import type { DictionaryStatistics, GeneratedDictionary, ProperNounType, WordEntry } from "../types.js";
import { parseJmdictEntry } from "./jmdict.js";
import { parseJmnedictEntry } from "./jmnedict.js";
import { openDictionaryXml, streamXmlEntries } from "./xmlEntries.js";

export const DICTIONARY_SCHEMA_VERSION = 1;

export function wordEntryDeduplicationKey(entry: WordEntry): string {
  return [
    entry.source,
    entry.normalizedReading,
    entry.normalizedSurface,
    entry.properNounType ?? "",
    [...entry.partOfSpeech].sort().join(","),
    [...entry.semanticTags].sort().join(","),
  ].join("\u0000");
}

export function deduplicateWordEntries(
  entries: readonly WordEntry[],
): WordEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = wordEntryDeduplicationKey(entry);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function calculateDictionaryStatistics(entries: readonly WordEntry[]): DictionaryStatistics {
  const properNounCounts: Record<ProperNounType, number> = {
    PERSON: 0, PLACE: 0, ORGANIZATION: 0, WORK: 0, PRODUCT: 0, OTHER: 0,
  };
  let jmdict = 0;
  let jmnedict = 0;
  let commonNouns = 0;
  let proverbs = 0;
  for (const entry of entries) {
    if (entry.source === "JMdict") {
      jmdict += 1;
      if (entry.semanticTags.includes("proverb")) proverbs += 1;
      else commonNouns += 1;
    } else {
      jmnedict += 1;
      properNounCounts[entry.properNounType ?? "OTHER"] += 1;
    }
  }
  return {
    totalEntries: entries.length,
    bySource: { JMdict: jmdict, JMnedict: jmnedict },
    jmdict: { commonNouns, proverbs },
    jmnedict: properNounCounts,
  };
}

async function importFile(
  path: string,
  parser: (xml: string) => WordEntry[],
): Promise<WordEntry[]> {
  const entries: WordEntry[] = [];

  for await (const xml of streamXmlEntries(openDictionaryXml(path))) {
    const parsedEntries = parser(xml);

    for (const entry of parsedEntries) {
      entries.push(entry);
    }
  }

  return entries;
}

function appendEntries(
  target: WordEntry[],
  source: readonly WordEntry[],
): void {
  for (const entry of source) {
    target.push(entry);
  }
}

export interface BuildDictionaryOptions {
  jmdictPath?: string;
  jmnedictPath?: string;
  generatedAt?: string;
}

export async function buildDictionary(
  options: BuildDictionaryOptions,
): Promise<GeneratedDictionary> {
  if (!options.jmdictPath && !options.jmnedictPath) {
    throw new Error("At least one dictionary input is required.");
  }

  const entries: WordEntry[] = [];

  if (options.jmdictPath) {
    await access(options.jmdictPath).catch(() => { throw new Error(`JMdict input file not found: ${options.jmdictPath}`); });
    const jmdictEntries = await importFile(
      options.jmdictPath,
      parseJmdictEntry,
    );

    appendEntries(entries, jmdictEntries);
  }

  if (options.jmnedictPath) {
    await access(options.jmnedictPath).catch(() => { throw new Error(`JMnedict input file not found: ${options.jmnedictPath}`); });
    const jmnedictEntries = await importFile(
      options.jmnedictPath,
      parseJmnedictEntry,
    );

    appendEntries(entries, jmnedictEntries);
  }

  const deduplicatedEntries = deduplicateWordEntries(entries);
  return {
    metadata: {
      schemaVersion: DICTIONARY_SCHEMA_VERSION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      ...(options.jmdictPath
        ? { jmdictSource: basename(options.jmdictPath) }
        : {}),
      ...(options.jmnedictPath
        ? { jmnedictSource: basename(options.jmnedictPath) }
        : {}),
      statistics: calculateDictionaryStatistics(deduplicatedEntries),
    },
    entries: deduplicatedEntries,
  };
}
