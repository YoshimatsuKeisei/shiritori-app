import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry } from "../createWordEntry.js";
import type { GeneratedDictionary, WordEntry } from "../types.js";
import { createBrowserDictionaryManifest, groupEntriesBy } from "./buildBrowserDictionary.js";
import { BrowserDictionaryLoader, type DictionaryFetch } from "./loader.js";

const entries: WordEntry[] = [
  ["みらい", "未来"], ["するめ", "鯣"], ["りす", "栗鼠"], ["すいか", "西瓜"],
  ["こうしょう", "交渉"], ["こうしょう", "校章"], ["すーぱー", "スーパー"],
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
