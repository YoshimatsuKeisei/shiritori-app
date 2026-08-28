import assert from "node:assert/strict";
import test from "node:test";

import { createWordEntry, InMemoryDictionaryRepository, type DictionaryScope } from "../dictionary/index.js";
import type { ConstraintOption, MatchFormat } from "../rules/index.js";
import { START_CHARACTERS, cancelVersusKanjiSelection, checkVersusTimeout, createVersusGame, getEffectiveRemainingTime, pauseForDictionaryLoad, resumeAfterDictionaryLoad, selectVersusGameView, selectVersusKanjiCandidate, skipVersusTurn, submitVersusAnswer } from "./index.js";
import type { Clock, VersusGameDependencies, VersusGameState } from "./index.js";

const scope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: true, places: true, organizations: true, works: true, products: true };
let sequence = 0;
const entry = (reading: string, surface = reading) => createWordEntry({ id: `versus-${sequence++}`, source: "JMdict", reading, surface });
class FakeClock implements Clock { constructor(public value = 0) {} now() { return this.value; } }

function random(player: 1 | 2, character: string) {
  const index = START_CHARACTERS.indexOf(character);
  const values = [player === 1 ? 0.25 : 0.75, (index + 0.25) / START_CHARACTERS.length];
  return { next: () => values.shift()! };
}

function start(words: ReturnType<typeof entry>[], startChar = "り", player: 1 | 2 = 1, format: MatchFormat = "NORMAL", options: readonly ConstraintOption[] = [], skipEnabled = true) {
  const clock = new FakeClock();
  const dependencies: VersusGameDependencies = { repository: new InMemoryDictionaryRepository(words), clock };
  const result = createVersusGame({ matchFormat: format, constraintOptions: options, dictionaryScope: scope, initialTimeMs: 10_000, skipEnabled, randomSource: random(player, startChar), ...(format === "FORBIDDEN_CHARACTER" ? { forbiddenSlots: [{ group: "B" as const }] } : {}) }, dependencies);
  assert.equal(result.ok, true);
  return { state: (result as { ok: true; state: VersusGameState }).state, dependencies, clock };
}

const chain = () => [entry("りす"), entry("すいか"), entry("からす"), entry("すずめ"), entry("めだか"), entry("かるた"), entry("たぬき")];

test("selects either player as the seeded first player", () => {
  assert.equal(start(chain(), "り", 1).state.currentPlayerId, "player-1");
  assert.equal(start(chain(), "り", 2).state.currentPlayerId, "player-2");
});

test("accepted answers switch turns while rejected answers do not", () => {
  const game = start(chain());
  const rejected = submitVersusAnswer(game.state, "すいか", game.dependencies);
  assert.equal(rejected.outcome, "REJECTED"); assert.equal(rejected.state.currentPlayerId, "player-1");
  const accepted = submitVersusAnswer(rejected.state, "りす", game.dependencies);
  assert.equal(accepted.outcome, "ACCEPTED"); assert.equal(accepted.state.currentPlayerId, "player-2");
});

test("only the active player's effective clock decreases", () => {
  const game = start(chain()); game.clock.value = 1_250;
  assert.equal(getEffectiveRemainingTime(game.state, "player-1", game.clock.now()), 8_750);
  assert.equal(getEffectiveRemainingTime(game.state, "player-2", game.clock.now()), 10_000);
});

test("turn change checkpoints one clock and starts the other", () => {
  const game = start(chain()); game.clock.value = 1_000;
  const result = submitVersusAnswer(game.state, "りす", game.dependencies);
  assert.equal(result.state.players[0].remainingTimeMs, 9_000);
  game.clock.value = 1_600;
  assert.equal(getEffectiveRemainingTime(result.state, "player-2", game.clock.now()), 9_400);
  assert.equal(getEffectiveRemainingTime(result.state, "player-1", game.clock.now()), 9_000);
});

test("dictionary pause excludes loading time but keeps prior thinking time", () => {
  const game = start(chain()); game.clock.value = 100;
  const paused = pauseForDictionaryLoad(game.state, game.dependencies); assert.equal(paused.outcome, "PAUSED_FOR_DICTIONARY");
  game.clock.value = 5_100;
  assert.equal(getEffectiveRemainingTime(paused.state, "player-1", game.clock.now()), 9_900);
  const resumed = resumeAfterDictionaryLoad(paused.state, game.dependencies); assert.equal(resumed.outcome, "RESUMED_AFTER_DICTIONARY");
  game.clock.value = 5_200;
  const accepted = submitVersusAnswer(resumed.state, "りす", game.dependencies);
  assert.equal(accepted.outcome === "ACCEPTED" && accepted.record.elapsedMs, 200);
  assert.equal(accepted.state.players[0].remainingTimeMs, 9_800);
});

test("rejections keep the original turn clock running", () => {
  const game = start(chain()); game.clock.value = 400;
  const rejected = submitVersusAnswer(game.state, "なし", game.dependencies);
  game.clock.value = 900;
  assert.equal(getEffectiveRemainingTime(rejected.state, "player-1", game.clock.now()), 9_100);
  assert.equal(rejected.state.turnStartedAt, 0);
});

test("kanji selection and cancellation keep the same running clock", () => {
  const game = start([entry("こうしょう", "交渉"), entry("こうしょう", "校章"), entry("うみ", "海")], "こ", 1, "NORMAL", ["KANJI_ONLY"]);
  game.clock.value = 200;
  const pending = submitVersusAnswer(game.state, "こうしょう", game.dependencies);
  assert.equal(pending.outcome, "WAITING_FOR_KANJI_SELECTION");
  game.clock.value = 700;
  const cancelled = cancelVersusKanjiSelection(pending.state); assert.equal(cancelled.state.turnStartedAt, 0);
  const pendingAgain = submitVersusAnswer(cancelled.state, "こうしょう", game.dependencies);
  game.clock.value = 1_000;
  const id = pendingAgain.state.pendingKanjiSelection!.candidates[0]!.id;
  const selected = selectVersusKanjiCandidate(pendingAgain.state, id, game.dependencies);
  assert.equal(selected.outcome === "ACCEPTED" && selected.record.elapsedMs, 1_000);
});

test("timeout wins over a simultaneous valid submission", () => {
  const game = start(chain()); game.clock.value = 10_000;
  const timeout = submitVersusAnswer(game.state, "りす", game.dependencies);
  assert.equal(timeout.outcome, "GAME_OVER"); assert.equal(timeout.state.gameOverReason, "TIMEOUT");
  assert.equal(timeout.state.winnerPlayerId, "player-2"); assert.equal(timeout.state.answerHistory.length, 0);
  assert.equal(checkVersusTimeout(timeout.state, game.dependencies), undefined);
});

test("END_WITH_N eliminates the current player without committing the word", () => {
  const game = start([entry("みかん")], "み");
  const result = submitVersusAnswer(game.state, "みかん", game.dependencies);
  assert.equal(result.outcome, "GAME_OVER"); assert.equal(result.state.gameOverReason, "END_WITH_N");
  assert.equal(result.state.winnerPlayerId, "player-2"); assert.equal(result.state.answerHistory.length, 0);
  assert.equal(result.state.usedNormalKeys.size, 0);
});

test("strict initial zero candidates gives the starting player NO_VALID_WORD", () => {
  const game = start([entry("りす")], "ぬ");
  assert.equal(game.state.gameOverReason, "NO_VALID_WORD"); assert.equal(game.state.winnerPlayerId, "player-2");
});

test("skip consumes time and one charge, preserves conditions, then switches", () => {
  const game = start(chain()); game.clock.value = 500;
  const before = game.state.currentConnection;
  const result = skipVersusTurn(game.state, game.dependencies);
  assert.equal(result.outcome, "SKIPPED"); assert.deepEqual(result.state.currentConnection, before);
  assert.equal(result.state.currentPlayerId, "player-2"); assert.equal(result.state.players[0].skipRemaining, 0);
  assert.equal(result.state.players[0].remainingTimeMs, 9_500); assert.equal(result.state.answerHistory.length, 0);
});

test("a second skip is rejected and growing length never grants skip", () => {
  const game = start(chain());
  const first = skipVersusTurn(game.state, game.dependencies);
  const second = skipVersusTurn(first.state, game.dependencies);
  const third = skipVersusTurn(second.state, game.dependencies);
  assert.equal(third.outcome, "INVALID_ACTION"); assert.equal(third.outcome === "INVALID_ACTION" && third.error, "SKIP_UNAVAILABLE");
  assert.equal(start([entry("りす"), entry("すいか")], "り", 1, "GROWING_LENGTH").state.players[0].skipRemaining, 0);
});

test("statistics track averages and the longest valid word", () => {
  const game = start(chain()); game.clock.value = 1_000;
  const one = submitVersusAnswer(game.state, "りす", game.dependencies);
  game.clock.value = 3_000; const two = submitVersusAnswer(one.state, "すいか", game.dependencies);
  game.clock.value = 6_000; const three = submitVersusAnswer(two.state, "からす", game.dependencies);
  const view = selectVersusGameView(three.state, game.clock);
  const p1 = view.playerResults[0];
  assert.equal(p1.validAnswerCount, 2); assert.equal(p1.averageAnswerTimeMs, 2_000);
  assert.equal(p1.averageCharacterCount, 2.5); assert.equal(p1.longestWord?.normalizedReading, "からす");
});

test("used words are shared by both players", () => {
  const game = start(chain());
  const one = submitVersusAnswer(game.state, "りす", game.dependencies);
  const two = submitVersusAnswer(one.state, "すいか", game.dependencies);
  const three = submitVersusAnswer(two.state, "からす", game.dependencies);
  const reused = submitVersusAnswer(three.state, "すいか", game.dependencies);
  assert.equal(reused.outcome, "REJECTED"); assert.equal(reused.outcome === "REJECTED" && reused.rejectReason, "ALREADY_USED");
  assert.equal(reused.state.currentPlayerId, "player-2");
});

test("versus delegates two-character, growing, reverse, and forbidden rules to the core", () => {
  const two = start([entry("ようかい"), entry("かいしゃ")], "よ", 1, "TWO_CHARACTER");
  assert.equal(submitVersusAnswer(two.state, "ようかい", two.dependencies).outcome, "ACCEPTED");
  const growing = start([entry("りす"), entry("すいか")], "り", 1, "GROWING_LENGTH");
  assert.equal(submitVersusAnswer(growing.state, "りす", growing.dependencies).outcome, "ACCEPTED");
  const reverse = start([entry("きゅうり"), entry("たぬき")], "り", 1, "REVERSE");
  assert.equal(submitVersusAnswer(reverse.state, "きゅうり", reverse.dependencies).outcome, "ACCEPTED");
  const forbidden = start([entry("しんぶん"), entry("しか")], "し", 1, "FORBIDDEN_CHARACTER");
  const rejected = submitVersusAnswer(forbidden.state, "しんぶん", forbidden.dependencies);
  assert.equal(rejected.outcome === "REJECTED" && rejected.rejectReason, "FORBIDDEN_CHARACTER");
});
