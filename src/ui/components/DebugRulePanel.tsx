import type { ConstraintOption, MatchFormat } from "../../rules/types.js";
import { validateRuleConfiguration } from "../../rules/configuration.js";
import { CONSTRAINT_OPTION_LABELS, MATCH_FORMAT_LABELS } from "../presentation.js";

interface DebugRulePanelProps {
  format: MatchFormat;
  option: ConstraintOption | "NONE";
  onFormatChange: (format: MatchFormat) => void;
  onOptionChange: (option: ConstraintOption | "NONE") => void;
  onApply: () => void;
}

const formats: MatchFormat[] = [
  "NORMAL", "TWO_CHARACTER", "GROWING_LENGTH", "CATEGORY_MASTER", "REVERSE", "FORBIDDEN_CHARACTER",
];

export function DebugRulePanel({ format, option, onFormatChange, onOptionChange, onApply }: DebugRulePanelProps) {
  const selectedOptions = option === "NONE" ? [] : [option];
  const valid = validateRuleConfiguration(format, selectedOptions).valid && format !== "CATEGORY_MASTER";

  return (
    <details className="debug-panel">
      <summary>DEBUG SETTINGS</summary>
      <label>
        試合形式
        <select value={format} onChange={(event) => onFormatChange(event.target.value as MatchFormat)}>
          {formats.map((value) => (
            <option key={value} value={value} disabled={value === "CATEGORY_MASTER"}>
              {MATCH_FORMAT_LABELS[value]}{value === "CATEGORY_MASTER" ? "（未実装）" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        オプション
        <select
          value={format === "GROWING_LENGTH" ? "NONE" : option}
          disabled={format === "GROWING_LENGTH"}
          onChange={(event) => onOptionChange(event.target.value as ConstraintOption | "NONE")}
        >
          <option value="NONE">なし</option>
          <option value="KANJI_ONLY">{CONSTRAINT_OPTION_LABELS.KANJI_ONLY}</option>
          <option value="KATAKANA_ONLY">{CONSTRAINT_OPTION_LABELS.KATAKANA_ONLY}</option>
        </select>
      </label>
      <p className="debug-note">
        禁止文字しりとりはGroup B（濁音・ん）固定。部首オプションは未実装です。
      </p>
      <button type="button" className="secondary-button" disabled={!valid} onClick={onApply}>この設定で再開</button>
    </details>
  );
}
