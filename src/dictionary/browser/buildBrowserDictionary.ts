import type { GeneratedDictionary, WordEntry } from "../types.js";
import type { BrowserDictionaryManifest, BrowserDictionaryShardInfo } from "./types.js";

export const BROWSER_DICTIONARY_SCHEMA_VERSION = 1;

export function shardFileName(character: string): string {
  const codePoints = Array.from(character, (value) => value.codePointAt(0)!.toString(16).padStart(4, "0"));
  return `u${codePoints.join("-")}.json`;
}

export function groupEntriesBy(
  entries: readonly WordEntry[],
  selectKey: (entry: WordEntry) => string,
): Map<string, WordEntry[]> {
  const groups = new Map<string, WordEntry[]>();
  for (const entry of entries) {
    const key = selectKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

export function createShardInfo(
  direction: "first" | "last",
  character: string,
  entries: readonly WordEntry[],
): BrowserDictionaryShardInfo {
  return {
    path: `by-${direction}/${shardFileName(character)}`,
    entries: entries.length,
    bytes: Buffer.byteLength(JSON.stringify(entries)),
  };
}

export function createBrowserDictionaryManifest(
  dictionary: GeneratedDictionary,
  firstGroups: ReadonlyMap<string, readonly WordEntry[]>,
  lastGroups: ReadonlyMap<string, readonly WordEntry[]>,
  sourceDictionary: string,
  generatedAt = new Date().toISOString(),
): BrowserDictionaryManifest {
  const describe = (direction: "first" | "last", groups: ReadonlyMap<string, readonly WordEntry[]>) =>
    Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "ja"))
      .map(([character, entries]) => [character, createShardInfo(direction, character, entries)]));
  return {
    schemaVersion: BROWSER_DICTIONARY_SCHEMA_VERSION,
    generatedAt,
    sourceDictionary,
    sourceMetadata: dictionary.metadata,
    totalEntries: dictionary.entries.length,
    firstCharShards: describe("first", firstGroups),
    lastCharShards: describe("last", lastGroups),
  };
}
