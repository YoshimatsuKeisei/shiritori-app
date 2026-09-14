import { InMemoryDictionaryRepository } from "../repository.js";
import type { WordEntry } from "../types.js";
import { decodeGzipDictionary, type GzipDictionaryDecoder } from "./decompress.js";
import type { DictionaryTimingDetails, DictionaryTimingEvent, DictionaryTimingOptions, DictionaryTimingPhase } from "./timing.js";
import type {
  BrowserDictionaryManifest,
  BrowserDictionaryShard,
  BrowserDictionaryShardDirection,
  ShardLoadState,
} from "./types.js";

export interface DictionaryResponse {
  ok: boolean;
  json(): Promise<unknown>;
  /** Optional only for backwards-compatible JSON-only fetch mocks. */
  arrayBuffer?(): Promise<ArrayBuffer>;
}
export type DictionaryFetch = (input: string) => Promise<DictionaryResponse>;

export class BrowserDictionaryLoader {
  readonly #baseUrl: string;
  readonly #fetch: DictionaryFetch;
  readonly #decodeGzip: GzipDictionaryDecoder;
  readonly #cache = new Map<string, Promise<readonly WordEntry[]>>();
  readonly #loaded = new Set<string>();
  readonly #onTiming: DictionaryTimingOptions["onTiming"];
  readonly #now: () => number;
  #manifestPromise: Promise<BrowserDictionaryManifest> | undefined;
  readonly #repository = new InMemoryDictionaryRepository([]);

  constructor(baseUrl = "/dictionary", fetcher: DictionaryFetch = (input) => fetch(input), decodeGzip: GzipDictionaryDecoder = decodeGzipDictionary, timing: DictionaryTimingOptions = {}) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = fetcher;
    this.#decodeGzip = decodeGzip;
    this.#onTiming = timing.onTiming;
    this.#now = timing.now ?? (() => globalThis.performance?.now() ?? Date.now());
  }

  async loadManifest(): Promise<BrowserDictionaryManifest> {
    if (this.#manifestPromise) return this.#manifestPromise;
    const promise = this.#time("manifest", {}, async () => {
      const value = await this.#fetchJson(`${this.#baseUrl}/manifest.json`);
      if (!value || typeof value !== "object" || !("totalEntries" in value) || !("firstCharShards" in value) || !("lastCharShards" in value)) {
        throw new Error("Invalid browser dictionary manifest.");
      }
      return value as BrowserDictionaryManifest;
    });
    this.#manifestPromise = promise;
    try {
      return await promise;
    } catch (error: unknown) {
      if (this.#manifestPromise === promise) this.#manifestPromise = undefined;
      throw error;
    }
  }

  get repository(): InMemoryDictionaryRepository {
    return this.#repository;
  }

  getShardState(direction: BrowserDictionaryShardDirection, character: string): ShardLoadState {
    const key = `${direction}:${character}`;
    return this.#loaded.has(key) ? "LOADED" : this.#cache.has(key) ? "LOADING" : "UNLOADED";
  }

  async ensureFirstChar(character: string): Promise<readonly WordEntry[]> {
    return this.#ensureShard("first", character);
  }

  async ensureLastChar(character: string): Promise<readonly WordEntry[]> {
    return this.#ensureShard("last", character);
  }

  async #ensureShard(direction: BrowserDictionaryShardDirection, character: string): Promise<readonly WordEntry[]> {
    const key = `${direction}:${character}`;
    const existing = this.#cache.get(key);
    if (existing) return existing;
    const promise = this.#loadShard(direction, character).then((entries) => {
      this.#loaded.add(key);
      return entries;
    }).catch((error: unknown) => { this.#cache.delete(key); throw error; });
    this.#cache.set(key, promise);
    return promise;
  }

  async #loadShard(direction: BrowserDictionaryShardDirection, character: string): Promise<readonly WordEntry[]> {
    const manifest = await this.loadManifest();
    const info = direction === "first" ? manifest.firstCharShards[character] : manifest.lastCharShards[character];
    const details: DictionaryTimingDetails = {
      direction, character, entries: info?.entries ?? 0,
      ...(info?.compression === "gzip" ? { compressedBytes: info.compressedBytes, uncompressedBytes: info.uncompressedBytes }
        : info ? { uncompressedBytes: info.bytes } : {}),
    };
    // Total starts after the manifest is available; cache hits do not enter this method.
    return this.#time("shard-total", details, async () => {
      let entries: unknown = [];
      if (info) {
        const url = `${this.#baseUrl}/${info.path}`;
        if (info.compression === "gzip") {
          const response = await this.#time("shard-fetch", details, () => this.#fetchResponse(url));
          if (!response.arrayBuffer) throw new Error("Dictionary binary response is unavailable.");
          let bytes: ArrayBuffer;
          try { bytes = await this.#time("shard-body-read", details, () => response.arrayBuffer!()); }
          catch (cause: unknown) { throw new Error(`Dictionary HTTP body read failure: ${url}`, { cause }); }
          entries = await this.#time("gzip-decode-and-parse", details, () => this.#decodeGzip(bytes));
        } else if (info.compression === undefined) {
          const response = await this.#time("shard-fetch", details, () => this.#fetchResponse(url));
          try { entries = await this.#time("shard-body-read", details, () => response.json()); }
          catch (cause: unknown) { throw new Error(`Dictionary JSON parse failure: ${url}`, { cause }); }
        } else {
          throw new Error("Unsupported dictionary shard compression.");
        }
      }
      if (!Array.isArray(entries)) throw new Error(`Invalid ${direction}-character dictionary shard.`);
      details.entries = entries.length;
      const indexStart = this.#startTiming();
      let status: DictionaryTimingEvent["status"] = "error";
      try {
        const result = this.#repository.addEntries(entries as BrowserDictionaryShard);
        details.addedEntries = result.added;
        details.duplicateEntries = result.skippedDuplicates;
        status = "success";
      } finally {
        this.#emitTiming("repository-index", indexStart, details, status);
      }
      return entries as BrowserDictionaryShard;
    });
  }

  #startTiming(): number | undefined {
    return this.#onTiming ? this.#now() : undefined;
  }

  #emitTiming(phase: DictionaryTimingPhase, started: number | undefined, details: DictionaryTimingDetails, status: DictionaryTimingEvent["status"]): void {
    if (started === undefined || !this.#onTiming) return;
    const event: DictionaryTimingEvent = { ...details, phase, durationMs: Math.max(0, this.#now() - started), status };
    try { this.#onTiming(event); } catch { /* Observability must not fail a dictionary load. */ }
  }

  async #time<T>(phase: DictionaryTimingPhase, details: DictionaryTimingDetails, operation: () => Promise<T>): Promise<T> {
    if (!this.#onTiming) return operation();
    const started = this.#startTiming();
    let status: DictionaryTimingEvent["status"] = "error";
    try {
      const result = await operation();
      status = "success";
      return result;
    } finally {
      this.#emitTiming(phase, started, details, status);
    }
  }

  async #fetchJson(url: string): Promise<unknown> {
    const response = await this.#fetchResponse(url);
    try { return await response.json(); }
    catch (cause: unknown) { throw new Error(`Dictionary JSON parse failure: ${url}`, { cause }); }
  }

  async #fetchResponse(url: string): Promise<DictionaryResponse> {
    try {
      const response = await this.#fetch(url);
      if (!response.ok) throw new Error("Unsuccessful HTTP status.");
      return response;
    } catch (cause: unknown) {
      throw new Error(`Dictionary HTTP fetch failure: ${url}`, { cause });
    }
  }
}
