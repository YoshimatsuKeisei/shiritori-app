import assert from "node:assert/strict";
import test from "node:test";

import type { DebugGameView } from "../game/types.js";
import {
  CONSTRAINT_OPTION_LABELS,
  MATCH_FORMAT_LABELS,
  getNavigationText,
  getRejectReasonMessage,
} from "./presentation.js";

const view: DebugGameView = {
  matchFormat: "NORMAL",
  constraintOptions: [],
  answerHistory: [],
  connectionValue: "か",
  connectionDirection: "STARTS_WITH",
  connectionCharacterCount: 1,
  turnNumber: 1,
};

test("maps internal rules to user-facing labels", () => {
  assert.equal(MATCH_FORMAT_LABELS.TWO_CHARACTER, "2文字しりとり");
  assert.equal(CONSTRAINT_OPTION_LABELS.KANJI_ONLY, "漢字オンリー");
});

test("builds navigation and rejection messages from structured state", () => {
  assert.equal(getNavigationText(view), "「か」から始まる言葉を入力してください");
  assert.equal(getNavigationText({ ...view, connectionDirection: "ENDS_WITH" }), "「か」で終わる言葉を入力してください");
  assert.equal(getRejectReasonMessage("WORD_NOT_FOUND", view), "辞書にありません");
});
