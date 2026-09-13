import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createWordEntry, resolveWordEntry } from "./createWordEntry.js";
import { buildDictionary, calculateDictionaryStatistics, deduplicateWordEntries, wordEntryDeduplicationKey } from "./import/buildDictionary.js";
import { parseJmdictEntry } from "./import/jmdict.js";
import { mapJmnedictNameType, mapJmnedictNameTypes, parseJmnedictEntry } from "./import/jmnedict.js";
import { InMemoryDictionaryRepository } from "./repository.js";
import type { DictionaryScope, ProperNounType } from "./types.js";
import { evaluateAnswer } from "../rules/evaluate.js";

const fixtures = fileURLToPath(new URL("../../test/fixtures/", import.meta.url));
const jmdictPath = `${fixtures}JMdict.fixture.xml`;
const jmnedictPath = `${fixtures}JMnedict.fixture.xml`;

const allScope: DictionaryScope = {
  commonNouns: true,
  proverbs: true,
  properNouns: true,
  people: true,
  places: true,
  organizations: true,
  works: true,
  products: true,
};

const generated = await buildDictionary({
  jmdictPath,
  jmnedictPath,
  generatedAt: "2026-01-01T00:00:00.000Z",
});
const repository = new InMemoryDictionaryRepository(generated.entries);

test("imports JMdict nouns and proverbs but excludes verbs", () => {
  assert.equal(repository.findByReading("りんご").some((entry) => entry.surface === "林檎"), true);
  assert.equal(repository.findByReading("いしのうえにもさんねん").some((entry) => entry.semanticTags.includes("proverb")), true);
  assert.equal(repository.findByReading("たべる").length, 0);
});

test("imports and classifies JMnedict name types", () => {
  assert.equal(repository.findByReading("たなか")[0]?.properNounType, "PERSON");
  assert.equal(repository.findByReading("とうきょう")[0]?.properNounType, "PLACE");
  assert.equal(repository.findByReading("じしょきょうかい")[0]?.properNounType, "ORGANIZATION");
  assert.equal(repository.findByReading("じしょものがたり")[0]?.properNounType, "WORK");
  assert.equal(repository.findByReading("じしょぺん")[0]?.properNounType, "PRODUCT");
  assert.equal(repository.findByReading("じしょのもり")[0]?.properNounType, "OTHER");
  assert.equal(repository.findByReading("えーびーしー").length, 0);
  assert.equal(repository.findByReading("にほんえーびーしー")[0]?.surface, "日本ABC");
  assert.equal(repository.findByReading("ABC123").length, 0);
});

test("maps official JMnedict name types and safely falls back to OTHER", () => {
  for (const tag of ["surname", "given", "fem", "masc", "person", "unclass"]) assert.equal(mapJmnedictNameType([tag]), "PERSON");
  for (const tag of ["place", "station"]) assert.equal(mapJmnedictNameType([tag]), "PLACE");
  for (const tag of ["organization", "company"]) assert.equal(mapJmnedictNameType([tag]), "ORGANIZATION");
  assert.equal(mapJmnedictNameType(["work"]), "WORK");
  assert.equal(mapJmnedictNameType(["product"]), "PRODUCT");
  assert.equal(mapJmnedictNameType(["future-tag"]), "OTHER");
});

test("returns all homophones and specialized reading candidates", () => {
  assert.deepEqual(repository.findByReading("はし").map((entry) => entry.surface), ["橋", "箸", "端"]);
  assert.deepEqual(repository.findKanjiCandidatesByReading("こうしょう").map((entry) => entry.surface), ["交渉", "校章", "鉱床"]);
  assert.deepEqual(repository.findKatakanaCandidatesByReading("すーぱー").map((entry) => entry.surface), ["スーパー"]);
});

test("returns JMdict and JMnedict records sharing one reading without merging sources", () => {
  const mixed = new InMemoryDictionaryRepository([
    ...parseJmdictEntry("<entry><ent_seq>20</ent_seq><k_ele><keb>東京</keb></k_ele><r_ele><reb>とうきょう</reb></r_ele><sense><pos>&n-pr;</pos></sense></entry>"),
    ...parseJmnedictEntry("<entry><ent_seq>21</ent_seq><k_ele><keb>東京</keb></k_ele><r_ele><reb>とうきょう</reb></r_ele><trans><name_type>&place;</name_type></trans></entry>"),
  ]);
  assert.deepEqual(mixed.findByReading("とうきょう").map((entry) => entry.source), ["JMdict", "JMnedict"]);
  assert.deepEqual(mixed.findByReading("とうきょう", { ...allScope, properNouns: false }).map((entry) => entry.source), ["JMdict"]);
});

test("searches indexed connection, length, and script conditions", () => {
  assert.equal(repository.searchWords({ startsWith: "り" }).some((entry) => entry.normalizedReading === "りんご"), true);
  assert.equal(repository.searchWords({ startsWith: "こう" }).length, 3);
  assert.equal(repository.searchWords({ endsWith: "か" }).some((entry) => entry.normalizedReading === "すいか"), true);
  assert.equal(repository.searchWords({ exactLength: 3 }).some((entry) => entry.normalizedReading === "りんご"), true);
  assert.equal(repository.searchWords({ scriptType: "kanji" }).every((entry) => entry.kanjiChars.length > 0), true);
});

test("filters forbidden characters and dictionary scopes", () => {
  assert.equal(repository.searchWords({ forbiddenCharacters: new Set(["ん"]) }).some((entry) => entry.normalizedReading === "りんご"), false);
  const commonOnly = { ...allScope, properNouns: false };
  assert.equal(repository.findByReading("とうきょう", commonOnly).length, 0);
  const placesOnly = { ...allScope, people: false, organizations: false, works: false, products: false };
  assert.equal(repository.findByReading("とうきょう", placesOnly).length, 1);
  assert.equal(repository.findByReading("たなか", placesOnly).length, 0);
});

test("applies every proper-noun scope switch including OTHER", () => {
  const cases = [["たなか", "people"], ["とうきょう", "places"], ["じしょきょうかい", "organizations"], ["じしょものがたり", "works"], ["じしょぺん", "products"]] as const;
  for (const [reading, key] of cases) {
    assert.equal(repository.findByReading(reading, { ...allScope, [key]: false }).length, 0);
    assert.equal(repository.findByReading(reading, allScope).length, 1);
  }
  assert.equal(repository.findByReading("じしょのもり", allScope).length, 1);
  assert.equal(repository.findByReading("じしょのもり", { ...allScope, properNouns: false }).length, 0);
  assert.equal(repository.searchWords({ scope: { ...allScope, properNouns: false } }).some((entry) => entry.source === "JMnedict"), false);
});

test("counts matching words without exposing storage details", () => {
  assert.equal(repository.countWords({ reading: "はし" }), 3);
  assert.equal(repository.countWords({ startsWith: "こう", exactLength: 5 }), 3);
});

test("deduplicates exact records without merging homophones", () => {
  const duplicates = parseJmdictEntry("<entry><ent_seq>1</ent_seq><k_ele><keb>橋</keb></k_ele><k_ele><keb>橋</keb></k_ele><r_ele><reb>はし</reb></r_ele><sense><pos>&n;</pos></sense></entry>");
  assert.equal(duplicates.length, 2);
  assert.equal(deduplicateWordEntries(duplicates).length, 1);
  assert.equal(repository.findByReading("はし").length, 3);
});

test("parsers handle individual official XML entry shapes", () => {
  assert.equal(parseJmdictEntry("<entry><ent_seq>1</ent_seq><r_ele><reb>ねこ</reb></r_ele><sense><pos>&n;</pos></sense></entry>")[0]?.surface, "ねこ");
  assert.equal(parseJmdictEntry("<entry><ent_seq>3</ent_seq><k_ele><keb>生</keb></k_ele><r_ele><reb>なま</reb><re_nokanji/></r_ele><sense><pos>&n;</pos></sense></entry>")[0]?.surface, "なま");
  assert.equal(parseJmdictEntry("<entry><ent_seq>4</ent_seq><k_ele><keb>名詞</keb></k_ele><k_ele><keb>動詞</keb></k_ele><r_ele><reb>ことば</reb></r_ele><sense><stagk>名詞</stagk><pos>&n;</pos></sense><sense><stagk>動詞</stagk><pos>&v1;</pos></sense></entry>").some((entry) => entry.surface === "動詞"), false);
  assert.equal(parseJmnedictEntry("<entry><ent_seq>2</ent_seq><k_ele><keb>大阪</keb></k_ele><r_ele><reb>おおさか</reb></r_ele><trans><name_type>&place;</name_type></trans></entry>")[0]?.properNounType, "PLACE");
});

test("connects dictionary search through ResolvedWord to the rule engine", () => {
  const previous = resolveWordEntry(repository.findByReading("りす")[0]!, "りす");
  const current = resolveWordEntry(repository.findByReading("すいか")[0]!, "すいか");
  assert.deepEqual(evaluateAnswer({
    currentWord: current,
    previousWord: previous,
    usedNormalKeys: new Set(),
    usedKanjiKeys: new Set(),
    matchFormat: "NORMAL",
    constraintOptions: [],
  }), { valid: true });

  const orange = resolveWordEntry(repository.findByReading("みかん")[0]!, "みかん");
  assert.deepEqual(evaluateAnswer({
    currentWord: orange,
    initialChar: "み",
    usedNormalKeys: new Set(),
    usedKanjiKeys: new Set(),
    matchFormat: "NORMAL",
    constraintOptions: [],
  }), { valid: false, eliminationReason: "END_WITH_N" });
});

test("stores deterministic source metadata", () => {
  assert.equal(generated.metadata.jmdictSource, "JMdict.fixture.xml");
  assert.equal(generated.metadata.jmnedictSource, "JMnedict.fixture.xml");
  assert.equal(generated.metadata.statistics?.totalEntries, generated.entries.length);
  assert.equal((generated.metadata.statistics?.bySource.JMdict ?? 0) > 0, true);
  assert.equal(generated.metadata.statistics?.bySource.JMnedict, 10);
  assert.deepEqual(generated.metadata.statistics?.jmnedict, { PERSON: 3, PLACE: 3, ORGANIZATION: 2, WORK: 1, PRODUCT: 1, OTHER: 1 });
});

test("maps all name tags to distinct categories in fixed order", () => {
  const cases: [readonly string[], ProperNounType[]][] = [
    ...["surname", "given", "fem", "masc", "person", "unclass"].map((tag): [string[], ProperNounType[]] => [[tag], ["PERSON"]]),
    [["place"], ["PLACE"]], [["station"], ["PLACE"]],
    [["organization"], ["ORGANIZATION"]], [["company"], ["ORGANIZATION"]],
    [["work"], ["WORK"]], [["product"], ["PRODUCT"]],
    [["unknown"], ["OTHER"]], [[], ["OTHER"]],
    [["place", "surname"], ["PERSON", "PLACE"]],
    [["surname", "given", "person"], ["PERSON"]],
    [["place", "unknown"], ["PLACE"]],
    [["product", "work", "company", "place", "surname"], ["PERSON", "PLACE", "ORGANIZATION", "WORK", "PRODUCT"]],
  ];
  for (const [tags, expected] of cases) {
    assert.deepEqual(mapJmnedictNameTypes(tags), expected);
    assert.deepEqual(mapJmnedictNameTypes([...tags].reverse()), expected);
    assert.equal(mapJmnedictNameType(tags), expected[0]);
  }
});

test("imports multiple trans name types without losing tags or changing usage keys", () => {
  const entry = repository.findByReading("きょうと")[0]!;
  assert.deepEqual(entry.properNounTypes, ["PERSON", "PLACE"]);
  assert.equal(entry.properNounType, "PERSON");
  assert.deepEqual(entry.semanticTags, ["place", "surname"]);
  assert.equal(entry.source, "JMnedict");
  assert.equal(resolveWordEntry(entry, "きょうと").usageKey, "きょうと");
  assert.equal(resolveWordEntry(entry, "きょうと", "kanji").usageKey, "京都");
  assert.equal(repository.findByReading("りす")[0]?.properNounTypes, undefined);
  const categories: ProperNounType[] = ["PERSON", "PLACE"];
  const copy = createWordEntry({ id: "copy", source: "JMnedict", reading: "きょうと", surface: "京都", properNounTypes: categories });
  categories.pop();
  assert.deepEqual(copy.properNounTypes, ["PERSON", "PLACE"]);
});

test("includes a multi-category entry when ANY category is enabled", () => {
  for (const [people, places, count] of [[true, false, 1], [false, true, 1], [false, false, 0]] as const) {
    assert.equal(repository.findByReading("きょうと", { ...allScope, people, places }).length, count);
    assert.equal(repository.findByReading("きょうと", { ...allScope, people, places, properNouns: false }).length, 0);
  }
});

test("supports legacy JSON and lets explicit categories override the legacy primary", () => {
  const legacy = createWordEntry({ id: "legacy", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PLACE" });
  const oldRepository = new InMemoryDictionaryRepository([legacy]);
  assert.equal(oldRepository.findByReading("とうきょう", { ...allScope, people: false }).length, 1);
  assert.equal(oldRepository.findByReading("とうきょう", { ...allScope, places: false }).length, 0);
  const explicitRepository = new InMemoryDictionaryRepository([{ ...legacy, properNounTypes: ["PERSON"] }]);
  assert.equal(explicitRepository.findByReading("とうきょう", { ...allScope, people: false }).length, 0);
  const emptyRepository = new InMemoryDictionaryRepository([{ ...legacy, properNounTypes: [] }]);
  assert.equal(emptyRepository.findByReading("とうきょう", { ...allScope, places: false }).length, 0);
  assert.deepEqual(repository.findByReading("じしょのもり")[0]?.properNounTypes, ["OTHER"]);
});

test("deduplicates category sets independently of their order without merging different sets", () => {
  const entry = repository.findByReading("きょうと")[0]!;
  const reordered = { ...entry, properNounTypes: ["PLACE", "PERSON", "PLACE"] as ProperNounType[] };
  assert.equal(wordEntryDeduplicationKey(entry), wordEntryDeduplicationKey(reordered));
  assert.equal(deduplicateWordEntries([entry, reordered]).length, 1);
  assert.notEqual(wordEntryDeduplicationKey(entry), wordEntryDeduplicationKey({ ...entry, properNounTypes: ["PERSON"] }));
  assert.deepEqual(reordered.properNounTypes, ["PLACE", "PERSON", "PLACE"]);
});

test("counts category memberships once per category and preserves unique entry totals", () => {
  const entry = repository.findByReading("きょうと")[0]!;
  const legacy = createWordEntry({ id: "legacy-stat", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PLACE" });
  const statistics = calculateDictionaryStatistics([{ ...entry, properNounTypes: ["PLACE", "PERSON", "PLACE"] }, legacy]);
  assert.equal(statistics.totalEntries, 2);
  assert.equal(statistics.bySource.JMnedict, 2);
  assert.equal(statistics.jmnedict.PERSON, 1);
  assert.equal(statistics.jmnedict.PLACE, 2);
  assert.equal(Object.values(statistics.jmnedict).reduce((sum, count) => sum + count, 0), 3);
});
