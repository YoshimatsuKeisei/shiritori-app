import type { DictionaryMetadata, WordEntry } from "../types.js";

export interface BrowserDictionaryShardInfo {
  path: string;
  entries: number;
  bytes: number;
}

export interface BrowserDictionaryManifest {
  schemaVersion: number;
  generatedAt: string;
  sourceDictionary: string;
  sourceMetadata: DictionaryMetadata;
  totalEntries: number;
  firstCharShards: Record<string, BrowserDictionaryShardInfo>;
  lastCharShards: Record<string, BrowserDictionaryShardInfo>;
}

export type BrowserDictionaryShard = WordEntry[];
export type BrowserDictionaryShardDirection = "first" | "last";

export type ShardLoadState = "UNLOADED" | "LOADING" | "LOADED";
