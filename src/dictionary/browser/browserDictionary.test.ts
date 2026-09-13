import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry } from "../createWordEntry.js";
import type { DictionaryScope, GeneratedDictionary, WordEntry } from "../types.js";
import { createBrowserDictionaryManifest, groupEntriesBy } from "./buildBrowserDictionary.js";
import { BrowserDictionaryLoader, type DictionaryFetch } from "./loader.js";
import { BrowserDictionarySession } from "./session.js";

const entries: WordEntry[] = [
  ["みらい", "未来"], ["するめ", "鯣"], ["りす", "栗鼠"], ["すいか", "西瓜"],
  ["こうしょう", "交渉"], ["こうしょう", "校章"], ["すーぱー", "スーパー"],
  ["ようかい", "妖怪"], ["かいしゃ", "会社"], ["ぱんだ", "パンダ"],
  ["やさい", "野菜"],
].map(([reading, surface], index) => createWordEntry({ id: `test-${index}`, source: "JMdict", reading: reading!, surface: surface!, partOfSpeech: ["n"] }));

const dictionary: GeneratedDictionary = {
  metadata: { schemaVersion: 1, generatedAt: "2026-01-01T00:00:00.000Z", jmdictSource: "JMdict_e.gz" },
  entries,
};
const first = groupEntriesBy(entries, (entry) => entry.firstChar);
const last = groupEntriesBy(entries, (entry) => entry.lastChar);
const manifest = createBrowserDictionaryManifest(dictionary, first, last, "dictionary.json", "2026-01-02T00:00:00.000Z");

function loaderFixture() {
  const calls = new Map<string, number>();
  const assets = new Map<string, unknown>([["/dictionary/manifest.json", manifest]]);
  for (const [character, group] of first) assets.set(`/dictionary/${manifest.firstCharShards[character]!.path}`, group);
  for (const [character, group] of last) assets.set(`/dictionary/${manifest.lastCharShards[character]!.path}`, group);
  const fetcher: DictionaryFetch = async (input) => {
    calls.set(input, (calls.get(input) ?? 0) + 1);
    return { ok: assets.has(input), json: async () => assets.get(input) };
  };
  return { loader: new BrowserDictionaryLoader("/dictionary", fetcher), calls };
}

test("browser manifest preserves source metadata and total entry count", () => {
  assert.equal(manifest.totalEntries, entries.length);
  assert.equal(manifest.sourceMetadata.jmdictSource, "JMdict_e.gz");
  assert.equal(manifest.firstCharShards["み"]?.entries, 1);
});

test("keeps JMnedict source and proper noun type in browser shards", () => {
  const properNoun = createWordEntry({ id: "name-1", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PLACE", semanticTags: ["place"] });
  const groups = groupEntriesBy([...entries, properNoun], (entry) => entry.firstChar);
  const shardEntry = groups.get("と")?.find((entry) => entry.id === "name-1");
  assert.equal(shardEntry?.source, "JMnedict");
  assert.equal(shardEntry?.properNounType, "PLACE");
});

test("loads serialized multi-category shards and applies ANY-category scope on either index", async () => {
  const entry = createWordEntry({ id: "multi-shard", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PERSON", properNounTypes: ["PERSON", "PLACE"], semanticTags: ["place", "surname"] });
  const combined: GeneratedDictionary = { ...dictionary, entries: [...entries, entry] };
  const firstGroups = groupEntriesBy(combined.entries, (word) => word.firstChar);
  const lastGroups = groupEntriesBy(combined.entries, (word) => word.lastChar);
  const combinedManifest = createBrowserDictionaryManifest(combined, firstGroups, lastGroups, "fixture.json");
  const assets = new Map<string, string>([["/dictionary/manifest.json", JSON.stringify(combinedManifest)]]);
  for (const [character, group] of firstGroups) assets.set(`/dictionary/${combinedManifest.firstCharShards[character]!.path}`, JSON.stringify(group));
  for (const [character, group] of lastGroups) assets.set(`/dictionary/${combinedManifest.lastCharShards[character]!.path}`, JSON.stringify(group));
  const fetcher: DictionaryFetch = async (url) => ({ ok: assets.has(url), json: async (): Promise<unknown> => JSON.parse(assets.get(url)!) });
  const scope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: false, places: true, organizations: false, works: false, products: false };
  for (const direction of ["first", "last"] as const) {
    const loader = new BrowserDictionaryLoader("/dictionary", fetcher);
    if (direction === "first") await loader.ensureFirstChar("と");
    else await loader.ensureLastChar("う");
    const loaded = loader.repository.findByReading("とうきょう", scope);
    assert.deepEqual(loaded[0]?.properNounTypes, ["PERSON", "PLACE"]);
    assert.equal(loaded[0]?.source, "JMnedict");
    assert.equal(loader.repository.findByReading("とうきょう", { ...scope, people: true, places: false }).length, 1);
    assert.equal(loader.repository.findByReading("とうきょう", { ...scope, places: false }).length, 0);
    assert.equal(loader.repository.findByReading("とうきょう", { ...scope, properNouns: false }).length, 0);
  }
});

test("loads みらい from the み first-character shard", async () => {
  const { loader } = loaderFixture(); await loader.ensureFirstChar("み");
  assert.equal(loader.repository.findByReading("みらい")[0]?.surface, "未来");
});

test("loads するめ from the す first-character shard", async () => {
  const { loader } = loaderFixture(); await loader.ensureFirstChar("す");
  assert.equal(loader.repository.findByReading("するめ")[0]?.surface, "鯣");
});

test("filters two-character conditions inside a first-character shard", async () => {
  const { loader } = loaderFixture(); await loader.ensureFirstChar("す");
  assert.deepEqual(loader.repository.searchWords({ startsWith: "すい" }).map((entry) => entry.surface), ["西瓜"]);
});

test("loads reverse candidates from a last-character shard", async () => {
  const { loader } = loaderFixture(); await loader.ensureLastChar("す");
  assert.equal(loader.repository.searchWords({ endsWith: "す" })[0]?.surface, "栗鼠");
});

test("caches a shard promise and does not fetch or parse twice", async () => {
  const { loader, calls } = loaderFixture();
  await Promise.all([loader.ensureFirstChar("す"), loader.ensureFirstChar("す")]);
  assert.equal(calls.get(`/dictionary/${manifest.firstCharShards["す"]!.path}`), 1);
});

test("distinguishes an unloaded shard from a loaded empty shard", async () => {
  const { loader } = loaderFixture();
  assert.equal(loader.getShardState("first", "ぬ"), "UNLOADED");
  await loader.ensureFirstChar("ぬ");
  assert.equal(loader.getShardState("first", "ぬ"), "LOADED");
  assert.equal(loader.repository.searchWords({ startsWith: "ぬ" }).length, 0);
});

test("returns multiple kanji surfaces with the same reading", async () => {
  const { loader } = loaderFixture(); await loader.ensureFirstChar("こ");
  assert.deepEqual(loader.repository.findKanjiCandidatesByReading("こうしょう").map((entry) => entry.surface), ["交渉", "校章"]);
});

test("returns a katakana surface from a production-format shard", async () => {
  const { loader } = loaderFixture(); await loader.ensureFirstChar("す");
  assert.equal(loader.repository.findKatakanaCandidatesByReading("すーぱー")[0]?.surface, "スーパー");
});

test("preloads the first shard of a two-character next connection", async () => {
  const { loader } = loaderFixture();
  await new BrowserDictionarySession(loader).ensureAnswerAndNextTurn({ matchFormat: "TWO_CHARACTER" }, "ようかい");
  assert.equal(loader.getShardState("first", "か"), "LOADED");
  assert.equal(loader.getShardState("first", "い"), "UNLOADED");
});

test("preloads the kana before a trailing long mark for normal play", async () => {
  const { loader } = loaderFixture();
  await new BrowserDictionarySession(loader).ensureAnswerAndNextTurn({ matchFormat: "NORMAL" }, "すーぱー");
  assert.equal(loader.getShardState("first", "ぱ"), "LOADED");
  assert.equal(loader.getShardState("first", "ー"), "UNLOADED");
});

test("retries manifest fetch after a rejected request", async () => {
  let attempts = 0;
  const fetcher: DictionaryFetch = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, json: async () => undefined };
    return { ok: true, json: async () => manifest };
  };
  const loader = new BrowserDictionaryLoader("/dictionary", fetcher);
  await assert.rejects(loader.loadManifest());
  assert.equal((await loader.loadManifest()).totalEntries, entries.length);
  assert.equal(attempts, 2);
});

test("preloads regular や rather than small ゃ after かいしゃ", async () => {
  const { loader } = loaderFixture();
  await new BrowserDictionarySession(loader).ensureAnswerAndNextTurn({ matchFormat: "NORMAL" }, "かいしゃ");
  assert.equal(loader.getShardState("first", "や"), "LOADED");
  assert.equal(loader.getShardState("first", "ゃ"), "UNLOADED");
});

test("joins external base URLs without double slashes", async () => {
  for (const base of ["https://example.test/shiritori-dictionary-v1", "https://example.test/shiritori-dictionary-v1/"]) {
    const calls: string[] = [];
    const fetcher: DictionaryFetch = async (input) => {
      calls.push(input);
      if (input.endsWith("manifest.json")) return { ok: true, json: async () => manifest };
      return { ok: true, json: async () => first.get("み") };
    };
    const loader = new BrowserDictionaryLoader(base, fetcher);
    await loader.ensureFirstChar("み");
    assert.equal(calls[0], "https://example.test/shiritori-dictionary-v1/manifest.json");
    assert.equal(calls[1], `https://example.test/shiritori-dictionary-v1/${manifest.firstCharShards["み"]!.path}`);
  }
});
