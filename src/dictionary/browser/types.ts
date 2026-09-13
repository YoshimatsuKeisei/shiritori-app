import type { DictionaryMetadata, WordEntry } from "../types.js";

export interface LegacyBrowserDictionaryShardInfo {
  path: string;
  entries: number;
  bytes: number;
  compression?: undefined;
}

export interface GzipBrowserDictionaryShardInfo {
  path: string;
  entries: number;
  compression: "gzip";
  compressedBytes: number;
  uncompressedBytes: number;
}

export type BrowserDictionaryShardInfo = LegacyBrowserDictionaryShardInfo | GzipBrowserDictionaryShardInfo;

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
