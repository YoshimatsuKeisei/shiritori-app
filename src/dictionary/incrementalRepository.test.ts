import assert from "node:assert/strict";
import test from "node:test";
import { createWordEntry } from "./createWordEntry.js";
import { InMemoryDictionaryRepository } from "./repository.js";
import type { DictionaryQuery, DictionaryScope, WordEntry } from "./types.js";

const common = createWordEntry({ id: "common", source: "JMdict", reading: "はし", surface: "橋" });
const name = createWordEntry({ id: "name", source: "JMnedict", reading: "はし", surface: "波志", properNounTypes: ["PERSON", "PLACE"] });
const katakana = createWordEntry({ id: "katakana", source: "JMdict", reading: "スーパー", surface: "スーパー" });
const other = createWordEntry({ id: "other", source: "JMnedict", reading: "りす", surface: "理須", properNounType: "OTHER" });
const scope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: true, places: true, organizations: true, works: true, products: true };

test("addEntries retains constructor entries and makes new readings and counts available", () => {
  const repository = new InMemoryDictionaryRepository([common]);
  assert.equal(repository.size, 1);
  assert.deepEqual(repository.findByReading("スーパー"), []);
  assert.deepEqual(repository.addEntries([katakana]), { added: 1, skippedDuplicates: 0 });
  assert.equal(repository.size, 2);
  assert.deepEqual(repository.findByReading("はし"), [common]);
  assert.deepEqual(repository.findByReading("すーぱー"), [katakana]);
  assert.equal(repository.countWords({}), 2);
  assert.deepEqual(repository.addEntries([]), { added: 0, skippedDuplicates: 0 });
});

test("duplicate IDs within and across batches do not duplicate any index", () => {
  const repository = new InMemoryDictionaryRepository([common, common]);
  assert.deepEqual(repository.addEntries([common, name, name]), { added: 1, skippedDuplicates: 2 });
  assert.equal(repository.size, 2);
  const queries: DictionaryQuery[] = [
    {}, { reading: "はし" }, { startsWith: "は" }, { startsWith: "はし" },
    { endsWith: "し" }, { exactLength: 2 }, { scriptType: "kanji" },
  ];
  for (const query of queries) {
    assert.deepEqual(repository.searchWords(query), [common, name]);
    assert.equal(repository.countWords(query), 2);
  }
});

test("incremental queries match one-shot construction including candidate order", () => {
  const entries = [common, name, katakana, other];
  const expected = new InMemoryDictionaryRepository(entries);
  const repository = new InMemoryDictionaryRepository([]);
  repository.addEntries([common, name]);
  repository.addEntries([name, katakana, other, common]);
  const queries: DictionaryQuery[] = [
    {}, { reading: "ハシ" }, { startsWith: "す" }, { startsWith: "すー" },
    { startsWith: "すーぱ" }, { endsWith: "ー" }, { endsWith: "ぱー" },
    { exactLength: 4 }, { scriptType: "katakana" }, { scriptType: "kanji" },
    { forbiddenCharacters: new Set(["ー"]) }, { scope: { ...scope, properNouns: false } },
    { startsWith: "は", endsWith: "し", exactLength: 2, scriptType: "kanji", scope },
    { reading: "missing" },
  ];
  for (const query of queries) {
    assert.deepEqual(repository.searchWords(query), expected.searchWords(query));
    assert.equal(repository.countWords(query), expected.countWords(query));
  }
  for (const reading of ["はし", "スーパー", "りす", "missing"]) {
    assert.deepEqual(repository.findByReading(reading), expected.findByReading(reading));
    assert.deepEqual(repository.findKanjiCandidatesByReading(reading), expected.findKanjiCandidatesByReading(reading));
    assert.deepEqual(repository.findKatakanaCandidatesByReading(reading), expected.findKatakanaCandidatesByReading(reading));
  }
});

test("mixed sources and multi-category scope still use any enabled category after addition", () => {
  const repository = new InMemoryDictionaryRepository([common]);
  repository.addEntries([name, other]);
  assert.deepEqual(repository.findByReading("はし", { ...scope, people: false, places: true }), [common, name]);
  assert.deepEqual(repository.findByReading("はし", { ...scope, people: false, places: false }), [common]);
  assert.deepEqual(repository.findByReading("はし", { ...scope, properNouns: false }), [common]);
  assert.deepEqual(repository.findByReading("はし", { ...scope, commonNouns: false }), [name]);
  assert.deepEqual(repository.findByReading("りす", { ...scope, people: false, places: false }), [other]);
  assert.deepEqual(repository.findByReading("りす", { ...scope, properNouns: false }), []);
});

test("first-seen ID and load order win without cloning or sorting entries", () => {
  const repository = new InMemoryDictionaryRepository([name]);
  repository.addEntries([common]);
  repository.addEntries([{ ...name, surface: "変更されない" }]);
  const result = repository.findByReading("はし");
  assert.deepEqual(result, [name, common]);
  assert.equal(result[0], name);
  assert.equal(result[1], common);
});

test("invalid batches leave entries and every index unchanged and can be retried", () => {
  const repository = new InMemoryDictionaryRepository([common]);
  const invalid = { ...katakana, normalizedReading: null } as unknown as WordEntry;
  assert.throws(() => repository.addEntries([name, invalid]), /Invalid dictionary entry/);
  assert.equal(repository.size, 1);
  assert.deepEqual(repository.searchWords({}), [common]);
  assert.deepEqual(repository.findByReading("はし"), [common]);
  assert.equal(repository.countWords({ startsWith: "は", endsWith: "し", exactLength: 2 }), 1);
  assert.deepEqual(repository.addEntries([common, name, katakana]), { added: 2, skippedDuplicates: 1 });
  assert.deepEqual(repository.findByReading("はし"), [common, name]);
});

test("adding a shard never reads or reindexes previously stored entries", () => {
  const existing = { ...common };
  const repository = new InMemoryDictionaryRepository([existing]);
  Object.defineProperty(existing, "normalizedReading", { get() { throw new Error("Old entry was reindexed"); } });
  assert.deepEqual(repository.addEntries([name, katakana]), { added: 2, skippedDuplicates: 0 });
  assert.equal(repository.size, 3);
});
