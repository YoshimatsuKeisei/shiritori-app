import assert from "node:assert/strict";
import test from "node:test";

import type { VersusGameState, VersusPlayer } from "../../game/index.js";
import { formatAverageCharacters, formatAverageTime, formatRemainingTime, isSkipDisabled, resolveInitialTimeMs, shouldRunVersusTicker } from "./helpers.js";

test("formats selector milliseconds as ceiling MM:SS without negatives", () => {
  assert.equal(formatRemainingTime(300_000), "05:00");
  assert.equal(formatRemainingTime(276_001), "04:37");
  assert.equal(formatRemainingTime(1), "00:01");
  assert.equal(formatRemainingTime(-100), "00:00");
});

test("resolves preset and bounded custom minute settings", () => {
  assert.equal(resolveInitialTimeMs({ timeChoice: 5, customMinutes: 1 }), 300_000);
  assert.equal(resolveInitialTimeMs({ timeChoice: "CUSTOM", customMinutes: 12 }), 720_000);
  assert.equal(resolveInitialTimeMs({ timeChoice: "CUSTOM", customMinutes: 0 }), 60_000);
  assert.equal(resolveInitialTimeMs({ timeChoice: "CUSTOM", customMinutes: 100 }), 3_600_000);
});

test("formats result averages for people and zero-answer placeholders", () => {
  assert.equal(formatAverageTime(2_425), "2.42秒");
  assert.equal(formatAverageTime(null), "—");
  assert.equal(formatAverageCharacters(4.25), "4.3文字");
  assert.equal(formatAverageCharacters(null), "—");
});

function player(id: string, active: boolean, skipRemaining: number): VersusPlayer {
  return { id, name: id, remainingTimeMs: 60_000, isActive: active, skipRemaining, validAnswerCount: 0, totalAnswerTimeMs: 0, totalCharacterCount: 0 };
}
function skipState(format: VersusGameState["matchFormat"], skipRemaining: number): VersusGameState {
  return { status: "WAITING_FOR_INPUT", players: [player("p1", true, skipRemaining), player("p2", false, 1)], currentPlayerId: "p1", matchFormat: format, constraintOptions: [], dictionaryScope: { commonNouns: true, proverbs: true, properNouns: false, people: false, places: false, organizations: false, works: false, products: false }, startChar: "り", currentConnection: { type: "STARTS_WITH", value: "り" }, answerHistory: [], usedNormalKeys: new Set(), usedKanjiKeys: new Set(), turnNumber: 1, turnStartedAt: 0, currentTurnElapsedMs: 0 };
}

test("enables skip only for an input-waiting player with a remaining charge", () => {
  assert.equal(isSkipDisabled(skipState("NORMAL", 1), false), false);
  assert.equal(isSkipDisabled(skipState("NORMAL", 0), false), true);
  assert.equal(isSkipDisabled(skipState("NORMAL", 1), true), true);
});

test("always disables skip for growing length", () => {
  assert.equal(isSkipDisabled(skipState("GROWING_LENGTH", 1), false), true);
});

test("starts the ticker for the first live game and stops only at game over", () => {
  assert.equal(shouldRunVersusTicker(undefined), false);
  assert.equal(shouldRunVersusTicker({ status: "WAITING_FOR_INPUT" }), true);
  assert.equal(shouldRunVersusTicker({ status: "WAITING_FOR_KANJI_SELECTION" }), true);
  assert.equal(shouldRunVersusTicker({ status: "WAITING_FOR_DICTIONARY" }), true);
  assert.equal(shouldRunVersusTicker({ status: "GAME_OVER" }), false);
});
