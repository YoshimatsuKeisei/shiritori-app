import { InMemoryDictionaryRepository } from "../repository.js";
import type { WordEntry } from "../types.js";
import type {
  BrowserDictionaryManifest,
  BrowserDictionaryShard,
  BrowserDictionaryShardDirection,
  ShardLoadState,
} from "./types.js";

export type DictionaryFetch = (input: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export class BrowserDictionaryLoader {
  readonly #baseUrl: string;
  readonly #fetch: DictionaryFetch;
  readonly #cache = new Map<string, Promise<readonly WordEntry[]>>();
  readonly #loaded = new Set<string>();
  readonly #entries = new Map<string, WordEntry>();
  #manifestPromise: Promise<BrowserDictionaryManifest> | undefined;
  #repository = new InMemoryDictionaryRepository([]);

  constructor(baseUrl = "/dictionary", fetcher: DictionaryFetch = (input) => fetch(input)) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = fetcher;
  }

  async loadManifest(): Promise<BrowserDictionaryManifest> {
    if (this.#manifestPromise) return this.#manifestPromise;
    const promise = this.#fetchJson(`${this.#baseUrl}/manifest.json`).then((value) => {
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
    const entries = info ? await this.#fetchJson(`${this.#baseUrl}/${info.path}`) : [];
    if (!Array.isArray(entries)) throw new Error(`Invalid ${direction}-character dictionary shard.`);
    for (const entry of entries as BrowserDictionaryShard) this.#entries.set(entry.id, entry);
    this.#repository = new InMemoryDictionaryRepository([...this.#entries.values()]);
    return entries as BrowserDictionaryShard;
  }

  async #fetchJson(url: string): Promise<unknown> {
    const response = await this.#fetch(url);
    if (!response.ok) throw new Error(`Dictionary request failed: ${url}`);
    return response.json();
  }
}
