import type { BrowserDictionaryShardDirection } from "./types.js";

export type DictionaryTimingPhase =
  | "manifest"
  | "shard-fetch"
  | "shard-body-read"
  | "gzip-decode-and-parse"
  | "repository-index"
  | "shard-total";

export interface DictionaryTimingDetails {
  direction?: BrowserDictionaryShardDirection;
  character?: string;
  entries?: number;
  addedEntries?: number;
  duplicateEntries?: number;
  compressedBytes?: number;
  uncompressedBytes?: number;
}

export interface DictionaryTimingEvent extends DictionaryTimingDetails {
  phase: DictionaryTimingPhase;
  durationMs: number;
  status: "success" | "error";
}

export interface DictionaryTimingOptions {
  onTiming?: (event: DictionaryTimingEvent) => void;
  now?: () => number;
}

/** Explicit opt-in only; no window dependency or logging during module import. */
export function dictionaryMetricsOptions(
  search: string,
  log: (event: DictionaryTimingEvent) => void = (event) => console.info("[dictionary]", event),
): DictionaryTimingOptions {
  return new URLSearchParams(search).get("dictionaryMetrics") === "1" ? { onTiming: log } : {};
}
