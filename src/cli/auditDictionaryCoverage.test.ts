import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry } from "../dictionary/createWordEntry.js";
import { auditDictionaryCoverage, formatCoverageAudit, formatCoverageCandidate, parseAuditArguments } from "./auditDictionaryCoverage.js";

const entries = [
  createWordEntry({ id: "common", source: "JMdict", reading: "かいしゃ", surface: "会社", partOfSpeech: ["n"] }),
  createWordEntry({ id: "place", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PLACE", semanticTags: ["place"] }),
];

test("audits found and missing readings in one dictionary pass", () => {
  const results = auditDictionaryCoverage(entries, ["トウキョウ", "おおさか"]);
  assert.equal(results[0]?.matches[0]?.surface, "東京");
  assert.equal(results[1]?.matches.length, 0);
  assert.match(formatCoverageAudit(results), /Found: 1\nNot found: 1/);
  assert.match(formatCoverageAudit(results), /NOT FOUND/);
});

test("formats every source field needed for coverage diagnosis", () => {
  const output = formatCoverageCandidate(entries[1]!);
  assert.match(output, /\[JMnedict\]\[PLACE\]/);
  assert.match(output, /reading: とうきょう/);
  assert.match(output, /surface: 東京/);
  assert.match(output, /properNounType: PLACE/);
  assert.match(output, /partOfSpeech: -/);
  assert.match(output, /semanticTags: place/);
});

test("accepts repeated readings and an optional dictionary path", () => {
  const parsed = parseAuditArguments(["--dictionary", "tmp/dictionary.json", "--reading", "とうきょう", "--reading", "やまだ"]);
  assert.deepEqual(parsed.readings, ["とうきょう", "やまだ"]);
  assert.match(parsed.dictionaryPath, /tmp[\\/]dictionary\.json$/);
  assert.throws(() => parseAuditArguments([]), /At least one --reading/);
});
