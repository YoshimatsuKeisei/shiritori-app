import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry, InMemoryDictionaryRepository } from "../dictionary/index.js";
import type { DictionaryScope } from "../dictionary/index.js";
import {
  START_CHARACTERS,
  cancelKanjiSelection,
  chooseStartCharacter,
  createDebugGame,
  selectDebugGameView,
  selectKanjiCandidate,
  submitAnswer,
} from "./index.js";
import type { Clock, DebugGameDependencies, DebugGameState } from "./index.js";
import type { ConstraintOption, MatchFormat } from "../rules/index.js";

const scope: DictionaryScope = {
  commonNouns: true,
  proverbs: true,
  properNouns: true,
  people: true,
  places: true,
  organizations: true,
  works: true,
  products: true,
};

let entrySequence = 0;
function entry(reading: string, surface = reading) {
  return createWordEntry({ id: `game-${entrySequence++}`, source: "JMdict", reading, surface });
}

function randomFor(character: string) {
  const index = START_CHARACTERS.indexOf(character);
  assert.notEqual(index, -1);
  return { next: () => (index + 0.25) / START_CHARACTERS.length };
}

class FakeClock implements Clock {
  constructor(public value: number) {}
  now(): number { return this.value; }
}

function start(
  entries: ReturnType<typeof entry>[],
  startChar: string,
  matchFormat: MatchFormat = "NORMAL",
  constraintOptions: readonly ConstraintOption[] = [],
  clock = new FakeClock(100),
  forbiddenSlots?: Parameters<typeof createDebugGame>[0]["forbiddenSlots"],
) {
  const dependencies: DebugGameDependencies = {
    repository: new InMemoryDictionaryRepository(entries),
    clock,
  };
  const result = createDebugGame({
    matchFormat,
    constraintOptions,
    dictionaryScope: scope,
    randomSource: randomFor(startChar),
    ...(forbiddenSlots ? { forbiddenSlots } : {}),
  }, dependencies);
  assert.equal(result.ok, true);
  return { state: (result as { ok: true; state: DebugGameState }).state, dependencies, clock };
}

test("chooses only eligible start characters through an injected source", () => {
  assert.equal(chooseStartCharacter(randomFor("ぱ")), "ぱ");
  assert.equal(START_CHARACTERS.includes("ん"), false);
  assert.equal(START_CHARACTERS.includes("ゃ"), false);
  assert.equal(START_CHARACTERS.includes("ー"), false);
});

test("continues a normal single-player chain and records elapsed time", () => {
  const session = start([entry("りす"), entry("すいか"), entry("からす")], "り");
  session.clock.value = 160;
  const first = submitAnswer(session.state, "りす", session.dependencies);
  assert.equal(first.outcome, "ACCEPTED");
  assert.equal(first.state.currentConnection.value, "す");
  assert.equal(first.state.answerHistory[0]?.displayText, "りす");
  assert.equal(first.state.answerHistory[0]?.elapsedMs, 60);

  const second = submitAnswer(first.state, "すいか", session.dependencies);
  assert.equal(second.state.answerHistory.length, 2);
  assert.equal(second.state.currentConnection.value, "か");
  assert.equal(second.state.turnNumber, 3);
});

test("rejects reused and unknown readings without changing state", () => {
  const session = start([entry("りす"), entry("すいか"), entry("からす")], "り");
  const accepted = submitAnswer(session.state, "りす", session.dependencies);
  const before = accepted.state;
  const reused = submitAnswer(before, "りす", session.dependencies);
  assert.deepEqual(reused, { outcome: "REJECTED", state: before, rejectReason: "ALREADY_USED" });
  const unknown = submitAnswer(before, "すなし", session.dependencies);
  assert.deepEqual(unknown, { outcome: "REJECTED", state: before, rejectReason: "WORD_NOT_FOUND" });
});

test("ends with N without committing the answer", () => {
  const session = start([entry("みかん")], "み");
  const result = submitAnswer(session.state, "みかん", session.dependencies);
  assert.equal(result.outcome, "GAME_OVER");
  assert.equal(result.state.gameOverReason, "END_WITH_N");
  assert.equal(result.state.answerHistory.length, 0);
  assert.equal(result.state.previousWord, undefined);
  assert.equal(result.state.usedNormalKeys.size, 0);
});

test("switches two-character connection after the first answer", () => {
  const session = start([entry("ようかい"), entry("かいしゃ")], "よ", "TWO_CHARACTER");
  const first = submitAnswer(session.state, "ようかい", session.dependencies);
  assert.equal(first.state.currentConnection.type, "STARTS_WITH_TWO");
  assert.equal(first.state.currentConnection.value, "かい");
  const second = submitAnswer(first.state, "かいしゃ", session.dependencies);
  assert.equal(second.state.answerHistory.length, 2);
});

test("increments growing length only after accepted answers", () => {
  const session = start([entry("りす"), entry("すいか"), entry("すずめばち"), entry("かもしか"), entry("かたつむり")], "り", "GROWING_LENGTH");
  const first = submitAnswer(session.state, "りす", session.dependencies);
  assert.equal(first.state.requiredLength, 3);
  const rejected = submitAnswer(first.state, "すずめばち", session.dependencies);
  assert.equal(rejected.outcome, "REJECTED");
  assert.equal(rejected.state.requiredLength, 3);
  assert.equal(rejected.state.turnNumber, 2);
  const second = submitAnswer(rejected.state, "すいか", session.dependencies);
  assert.equal(second.state.requiredLength, 4);
});

test("derives reverse end conditions", () => {
  const session = start([entry("きゅうり"), entry("たぬき")], "り", "REVERSE");
  const first = submitAnswer(session.state, "きゅうり", session.dependencies);
  assert.deepEqual(first.state.currentConnection, { type: "ENDS_WITH", value: "き" });
  assert.equal(selectDebugGameView(first.state).connectionDirection, "ENDS_WITH");
});

test("keeps forbidden answers out of history", () => {
  const session = start([entry("しんぶん"), entry("しか")], "し", "FORBIDDEN_CHARACTER", [], new FakeClock(0), [{ group: "B" }]);
  const result = submitAnswer(session.state, "しんぶん", session.dependencies);
  assert.equal(result.outcome, "REJECTED");
  assert.equal(result.outcome === "REJECTED" && result.rejectReason, "FORBIDDEN_CHARACTER");
  assert.equal(result.state.answerHistory.length, 0);
});

test("waits for kanji selection, validates it, and supports cancellation", () => {
  const session = start([
    entry("こうしょう", "交渉"), entry("こうしょう", "校章"), entry("うみ", "海"),
  ], "こ", "NORMAL", ["KANJI_ONLY"]);
  const pending = submitAnswer(session.state, "こうしょう", session.dependencies);
  assert.equal(pending.outcome, "WAITING_FOR_KANJI_SELECTION");
  assert.equal(pending.state.pendingKanjiSelection?.candidates.length, 2);

  const cancelled = cancelKanjiSelection(pending.state);
  assert.equal(cancelled.state.status, "WAITING_FOR_INPUT");
  assert.equal(cancelled.state.turnNumber, 1);
  assert.equal(cancelled.state.answerHistory.length, 0);

  const pendingAgain = submitAnswer(cancelled.state, "こうしょう", session.dependencies);
  const selectedId = pendingAgain.state.pendingKanjiSelection?.candidates.find((candidate) => candidate.surface === "交渉")?.id;
  assert.ok(selectedId);
  const selected = selectKanjiCandidate(pendingAgain.state, selectedId, session.dependencies);
  assert.equal(selected.state.answerHistory[0]?.displayText, "交渉");
  assert.equal(selected.state.usedKanjiKeys.has("交渉"), true);
});

test("deterministically confirms katakana and displays its surface", () => {
  const session = start([entry("すーぱー", "スーパー")], "す", "NORMAL", ["KATAKANA_ONLY"]);
  const result = submitAnswer(session.state, "すーぱー", session.dependencies);
  assert.equal(result.state.answerHistory[0]?.displayText, "スーパー");
  assert.equal(result.state.usedNormalKeys.has("すーぱー"), true);
});

test("continues from a trailing small kana without a false NO_VALID_WORD", () => {
  const session = start([entry("かいしゃ", "会社"), entry("やさい", "野菜"), entry("いか", "烏賊")], "か");
  const first = submitAnswer(session.state, "かいしゃ", session.dependencies);
  assert.equal(first.outcome, "ACCEPTED");
  assert.deepEqual(first.state.currentConnection, { type: "STARTS_WITH", value: "や" });
  assert.notEqual(first.state.gameOverReason, "NO_VALID_WORD");
  assert.equal(submitAnswer(first.state, "やさい", session.dependencies).outcome, "ACCEPTED");
});

test("reports strict zero-candidate turns but rejects unsupported setup", () => {
  const emptySession = start([entry("りす")], "ぬ");
  assert.equal(emptySession.state.status, "GAME_OVER");
  assert.equal(emptySession.state.gameOverReason, "NO_VALID_WORD");

  const dependencies: DebugGameDependencies = {
    repository: new InMemoryDictionaryRepository([entry("りす")]),
    clock: new FakeClock(0),
  };
  assert.deepEqual(createDebugGame({ matchFormat: "CATEGORY_MASTER", dictionaryScope: scope }, dependencies), {
    ok: false,
    error: "CATEGORY_NOT_IMPLEMENTED",
  });
  assert.deepEqual(createDebugGame({
    matchFormat: "NORMAL",
    constraintOptions: ["KANJI_ONLY", "REQUIRED_LAST_KANJI_RADICAL"],
    dictionaryScope: scope,
  }, dependencies), { ok: false, error: "RADICAL_RESOLVER_REQUIRED" });
});
