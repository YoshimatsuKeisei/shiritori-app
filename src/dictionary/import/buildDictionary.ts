import { basename } from "node:path";

import type { GeneratedDictionary, WordEntry } from "../types.js";
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
    const jmdictEntries = await importFile(
      options.jmdictPath,
      parseJmdictEntry,
    );

    appendEntries(entries, jmdictEntries);
  }

  if (options.jmnedictPath) {
    const jmnedictEntries = await importFile(
      options.jmnedictPath,
      parseJmnedictEntry,
    );

    appendEntries(entries, jmnedictEntries);
  }

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
    },

    entries: deduplicateWordEntries(entries),
  };
}
