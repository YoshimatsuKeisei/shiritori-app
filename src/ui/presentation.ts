import type { DebugGameView } from "../game/types.js";
import type { ConstraintOption, EliminationReason, MatchFormat, RejectReason } from "../rules/types.js";

export const MATCH_FORMAT_LABELS: Readonly<Record<MatchFormat, string>> = {
  NORMAL: "通常しりとり",
  TWO_CHARACTER: "2文字しりとり",
  GROWING_LENGTH: "1文字ずつ増えるしりとり",
  CATEGORY_MASTER: "カテゴリマスター",
  REVERSE: "リバースしりとり",
  FORBIDDEN_CHARACTER: "禁止文字しりとり",
};

export const CONSTRAINT_OPTION_LABELS: Readonly<Record<ConstraintOption, string>> = {
  KANJI_ONLY: "漢字オンリー",
  KATAKANA_ONLY: "カタカナオンリー",
  REQUIRED_LAST_KANJI: "最後の漢字を使用",
  REQUIRED_LAST_KANJI_RADICAL: "最後の漢字の部首を使用",
};

export function getNavigationText(view: DebugGameView): string {
  const direction = view.connectionDirection === "ENDS_WITH" ? "で終わる" : "から始まる";
  return `「${view.connectionValue}」${direction}言葉を入力してください`;
}

export function getRejectReasonMessage(reason: RejectReason, view: DebugGameView): string {
  switch (reason) {
    case "WORD_NOT_FOUND": return "辞書にありません";
    case "ALREADY_USED": return "既に使用されています";
    case "CONNECTION_MISMATCH":
    case "INVALID_INITIAL_CONDITION": return getNavigationText(view);
    case "LENGTH_MISMATCH": return `${view.requiredLength ?? "指定された"}文字で回答してください`;
    case "FORBIDDEN_CHARACTER": return "禁止文字を含んでいます";
    case "KANJI_REQUIRED": return "漢字表記が見つかりません";
    case "KATAKANA_REQUIRED": return "カタカナ表記が見つかりません";
    case "REQUIRED_KANJI_MISSING": return "前の言葉の最後の漢字が含まれていません";
    case "RADICAL_MISMATCH": return "指定された部首条件を満たしていません";
    case "CATEGORY_NOT_IMPLEMENTED": return "カテゴリマスターは未実装です";
    case "INVALID_RULE_CONFIGURATION": return "ルール設定が正しくありません";
  }
}

export function getGameOverMessage(reason: EliminationReason | undefined): string {
  if (reason === "END_WITH_N") return "「ん」で終わりました";
  if (reason === "NO_VALID_WORD") return "条件を満たす言葉がありません";
  if (reason === "TIMEOUT") return "時間切れです";
  return "ゲームを終了しました";
}

export function getConditionCaption(view: DebugGameView): string {
  if (view.requiredLength !== undefined) return `${view.requiredLength}文字で回答`;
  if (view.matchFormat === "FORBIDDEN_CHARACTER" && view.forbiddenCharacters?.size) {
    const values = [...view.forbiddenCharacters];
    const preview = values.length > 5 ? `${values.slice(0, 5).join("・")}…` : values.join("・");
    return `「${preview}」禁止`;
  }
  if (view.connectionDirection === "ENDS_WITH") return "この文字で終わる";
  if (view.connectionCharacterCount === 2) return "この2文字から始める";
  return "この文字から始める";
}
