import type { ConstraintOption, MatchFormat } from "../../rules/types.js";
import { validateRuleConfiguration } from "../../rules/configuration.js";
import { CONSTRAINT_OPTION_LABELS, MATCH_FORMAT_LABELS } from "../presentation.js";
import type { VersusSetupValues } from "./helpers.js";

interface Props { values: VersusSetupValues; onChange: (values: VersusSetupValues) => void; onStart: () => void; loading: boolean; error?: string }
const formats: MatchFormat[] = ["NORMAL", "TWO_CHARACTER", "GROWING_LENGTH", "REVERSE", "FORBIDDEN_CHARACTER"];
const options: ConstraintOption[] = ["KANJI_ONLY", "KATAKANA_ONLY", "REQUIRED_LAST_KANJI", "REQUIRED_LAST_KANJI_RADICAL"];

export function VersusSetup({ values, onChange, onStart, loading, error }: Props) {
  const validation = validateRuleConfiguration(values.matchFormat, values.constraintOptions);
  const updateFormat = (matchFormat: MatchFormat) => onChange({ ...values, matchFormat, constraintOptions: matchFormat === "GROWING_LENGTH" ? [] : values.constraintOptions, skipEnabled: matchFormat === "GROWING_LENGTH" ? false : values.skipEnabled });
  const toggle = (option: ConstraintOption) => onChange({ ...values, constraintOptions: values.constraintOptions.includes(option) ? values.constraintOptions.filter((value) => value !== option) : [...values.constraintOptions, option] });
  return <section className="setup-panel" aria-labelledby="setup-title">
    <p className="eyebrow">1 VS 1</p><h1 id="setup-title">対戦設定</h1>
    <label>試合形式<select value={values.matchFormat} onChange={(event) => updateFormat(event.target.value as MatchFormat)}>{formats.map((format) => <option value={format} key={format}>{MATCH_FORMAT_LABELS[format]}</option>)}</select></label>
    <fieldset><legend>制約オプション</legend>{options.map((option) => <label className="check-row" key={option}><input type="checkbox" checked={values.constraintOptions.includes(option)} disabled={values.matchFormat === "GROWING_LENGTH" || option === "REQUIRED_LAST_KANJI_RADICAL"} onChange={() => toggle(option)} />{CONSTRAINT_OPTION_LABELS[option]}{option === "REQUIRED_LAST_KANJI_RADICAL" ? "（部首DB未実装）" : ""}</label>)}</fieldset>
    <label>持ち時間<select value={values.timeChoice} onChange={(event) => onChange({ ...values, timeChoice: event.target.value === "CUSTOM" ? "CUSTOM" : Number(event.target.value) })}>{Array.from({ length: 10 }, (_, index) => index + 1).map((minutes) => <option key={minutes} value={minutes}>{minutes}分</option>)}<option value="CUSTOM">カスタム</option></select></label>
    {values.timeChoice === "CUSTOM" && <label>カスタム（1〜60分）<input type="number" min="1" max="60" value={values.customMinutes} onChange={(event) => onChange({ ...values, customMinutes: Number(event.target.value) })} /></label>}
    <label className="check-row"><input type="checkbox" checked={values.skipEnabled && values.matchFormat !== "GROWING_LENGTH"} disabled={values.matchFormat === "GROWING_LENGTH"} onChange={(event) => onChange({ ...values, skipEnabled: event.target.checked })} />1ゲーム1回スキップ</label>
    {values.matchFormat === "GROWING_LENGTH" && <p className="setup-note">文字数増加ではスキップを使用できません。</p>}
    {values.matchFormat === "FORBIDDEN_CHARACTER" && <p className="setup-note">禁止文字はGroup B（濁音・ん）です。</p>}
    {!validation.valid && <p className="setup-error">制約オプションの組み合わせが正しくありません。</p>}
    {error && <p className="setup-error" role="alert">{error}</p>}
    <button className="primary-button setup-start" type="button" disabled={loading || !validation.valid} onClick={onStart}>{loading ? "辞書を読み込み中..." : "START"}</button>
  </section>;
}
