import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveWordEntry } from "./createWordEntry.js";
import { buildDictionary, deduplicateWordEntries } from "./import/buildDictionary.js";
import { parseJmdictEntry } from "./import/jmdict.js";
import { parseJmnedictEntry } from "./import/jmnedict.js";
import { InMemoryDictionaryRepository } from "./repository.js";
import type { DictionaryScope } from "./types.js";
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
});

test("returns all homophones and specialized reading candidates", () => {
  assert.deepEqual(repository.findByReading("はし").map((entry) => entry.surface), ["橋", "箸", "端"]);
  assert.deepEqual(repository.findKanjiCandidatesByReading("こうしょう").map((entry) => entry.surface), ["交渉", "校章", "鉱床"]);
  assert.deepEqual(repository.findKatakanaCandidatesByReading("すーぱー").map((entry) => entry.surface), ["スーパー"]);
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
  assert.deepEqual(generated.metadata, {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    jmdictSource: "JMdict.fixture.xml",
    jmnedictSource: "JMnedict.fixture.xml",
  });
});
