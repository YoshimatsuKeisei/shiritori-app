import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { BrowserDictionaryLoader, BrowserDictionarySession, type DictionaryScope } from "./dictionary/index.js";
import { cancelKanjiSelection, createDebugGame, selectDebugGameView, selectKanjiCandidate, submitAnswer, START_CHARACTERS } from "./game/index.js";
import type { CreateDebugGameOptions, DebugGameDependencies, DebugGameState, RandomSource } from "./game/index.js";
import type { ConstraintOption, MatchFormat } from "./rules/index.js";
import { validateRuleConfiguration } from "./rules/configuration.js";
import { AnswerHistory } from "./ui/components/AnswerHistory.js";
import { DebugRulePanel } from "./ui/components/DebugRulePanel.js";
import { KanjiCandidatePicker } from "./ui/components/KanjiCandidatePicker.js";
import { browserDictionaryRepository } from "./ui/debugDictionary.js";
import { VersusApp } from "./ui/versus/VersusApp.js";
import { CONSTRAINT_OPTION_LABELS, MATCH_FORMAT_LABELS, getConditionCaption, getGameOverMessage, getNavigationText, getRejectReasonMessage } from "./ui/presentation.js";

const dictionaryScope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: true, places: true, organizations: true, works: true, products: true };
const clock = { now: () => Date.now() };
const fixtureMode = new URLSearchParams(window.location.search).get("dictionary") === "fixture";
const productionSession = new BrowserDictionarySession(new BrowserDictionaryLoader("/dictionary"));

function fixedRandomSource(character: string): RandomSource {
  const index = START_CHARACTERS.indexOf(character);
  if (index < 0) throw new Error(`Unsupported start character: ${character}`);
  return { next: () => (index + 0.5) / START_CHARACTERS.length };
}

function fixtureRandomSource(format: MatchFormat, options: readonly ConstraintOption[]): RandomSource {
  const available = options.includes("KANJI_ONLY") ? ["こ"] : options.includes("KATAKANA_ONLY") ? ["す"] : format === "TWO_CHARACTER" ? ["よ"] : format === "GROWING_LENGTH" ? ["り"] : format === "REVERSE" ? ["り"] : format === "FORBIDDEN_CHARACTER" ? ["し"] : ["り", "み"];
  return fixedRandomSource(available[Math.floor(Math.random() * available.length)]!);
}

function gameOptions(format: MatchFormat, option: ConstraintOption | "NONE", randomSource: RandomSource): CreateDebugGameOptions {
  const constraintOptions = format === "GROWING_LENGTH" || option === "NONE" ? [] : [option];
  return { matchFormat: format, constraintOptions, dictionaryScope, randomSource, ...(format === "FORBIDDEN_CHARACTER" ? { forbiddenSlots: [{ group: "B" as const }] } : {}) };
}

function dependencies(): DebugGameDependencies {
  return { repository: fixtureMode ? browserDictionaryRepository : productionSession.loader.repository, clock };
}

function DebugApp() {
  const [format, setFormat] = useState<MatchFormat>("NORMAL");
  const [option, setOption] = useState<ConstraintOption | "NONE">("NONE");
  const [state, setState] = useState<DebugGameState>();
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const restart = useCallback(async (nextFormat = format, nextOption = option) => {
    const normalizedOption = nextFormat === "GROWING_LENGTH" ? "NONE" : nextOption;
    const options = normalizedOption === "NONE" ? [] : [normalizedOption];
    if (!validateRuleConfiguration(nextFormat, options).valid) { setMessage("このルールの組み合わせは使用できません"); return; }
    setLoading(true); setLoadError(false);
    try {
      let randomSource = fixtureRandomSource(nextFormat, options);
      if (!fixtureMode) {
        const manifest = await productionSession.loadManifest();
        const shards = nextFormat === "REVERSE" ? manifest.lastCharShards : manifest.firstCharShards;
        const available = START_CHARACTERS.filter((character) => shards[character]?.entries);
        if (available.length === 0) throw new Error("No start-character shards are available.");
        const startChar = available[Math.floor(Math.random() * available.length)]!;
        await productionSession.ensureCurrentTurn(nextFormat === "REVERSE" ? "ENDS_WITH" : "STARTS_WITH", startChar);
        randomSource = fixedRandomSource(startChar);
      }
      const result = createDebugGame(gameOptions(nextFormat, normalizedOption, randomSource), dependencies());
      if (!result.ok) { setMessage(result.error === "CATEGORY_NOT_IMPLEMENTED" ? "カテゴリマスターは未実装です" : "ゲームを開始できません"); return; }
      setFormat(nextFormat); setOption(normalizedOption); setState(result.state); setInput(""); setMessage(undefined);
    } catch { setLoadError(true); setMessage("辞書の読み込みに失敗しました"); }
    finally { setLoading(false); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [format, option]);

  useEffect(() => { void restart("NORMAL", "NONE"); }, []);
  useEffect(() => { if (state?.status === "WAITING_FOR_INPUT" && !loading) inputRef.current?.focus(); }, [state?.status, state?.turnNumber, loading]);

  const handleResult = useCallback((result: ReturnType<typeof submitAnswer>) => {
    setState(result.state);
    if (result.outcome === "REJECTED") setMessage(getRejectReasonMessage(result.rejectReason, selectDebugGameView(result.state)));
    else if (result.outcome === "INVALID_ACTION") setMessage("現在はその操作を行えません");
    else { setMessage(undefined); if (result.outcome === "ACCEPTED" || result.outcome === "GAME_OVER") setInput(""); }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!state || !input.trim() || loading) return;
    setLoading(true); setLoadError(false);
    try { if (!fixtureMode) await productionSession.ensureAnswerAndNextTurn(state, input); handleResult(submitAnswer(state, input, dependencies())); }
    catch { setLoadError(true); setMessage("辞書の読み込みに失敗しました"); }
    finally { setLoading(false); }
  };

  const chooseKanji = (entryId: string) => { if (state && !loading) handleResult(selectKanjiCandidate(state, entryId, dependencies())); };
  const cancelKanji = useCallback(() => { if (state) { const result = cancelKanjiSelection(state); setState(result.state); setMessage(undefined); } }, [state]);
  const handleFormatChange = (nextFormat: MatchFormat) => { setFormat(nextFormat); if (nextFormat === "GROWING_LENGTH") setOption("NONE"); };
  const view = state ? selectDebugGameView(state) : undefined;

  return <main className="app-shell">
    {state && <aside className="rule-card" aria-label="現在のルール"><p className="eyebrow">MATCH FORMAT</p><strong>{MATCH_FORMAT_LABELS[state.matchFormat]}</strong><div className="rule-divider" /><p className="eyebrow">OPTIONS</p>{state.constraintOptions.length ? state.constraintOptions.map((value) => <span className="option-chip" key={value}>{CONSTRAINT_OPTION_LABELS[value]}</span>) : <span className="muted">なし</span>}</aside>}
    <section className="game-panel"><header className="game-header"><div><span className="status-dot" /> PLAYER 1</div><span className="turn-counter">TURN {String(state?.turnNumber ?? 1).padStart(2, "0")}</span></header><div className="game-content">
      {!state || !view ? <section className="dictionary-status" aria-live="polite"><h1>{loadError ? "辞書の読み込みに失敗しました" : "辞書を読み込み中..."}</h1>{loadError && <button className="primary-button" type="button" onClick={() => void restart()}>再読み込み</button>}</section> : <>
        <div className="navigation"><p className="eyebrow">NEXT WORD</p><h1>{getNavigationText(view)}</h1></div><AnswerHistory history={view.answerHistory} /><div className="connection-zone"><span className="connection-caption">{getConditionCaption(view)}</span><div className="connection-character" aria-label={`現在の接続文字 ${view.connectionValue}`}>{view.connectionValue}</div></div>
        {state.status === "GAME_OVER" ? <section className="game-over" aria-live="assertive"><p>{getGameOverMessage(state.gameOverReason)}</p><h2>GAME OVER</h2><button type="button" className="primary-button" onClick={() => void restart()}>もう一度</button></section> : <form className="answer-form" onSubmit={(event) => void submit(event)}><label htmlFor="answer">あなたの回答</label><div className="input-row"><input ref={inputRef} id="answer" value={input} onChange={(event) => setInput(event.target.value)} placeholder="ひらがなで入力" autoComplete="off" disabled={loading || state.status !== "WAITING_FOR_INPUT"}/><button className="primary-button" type="submit" disabled={loading || state.status !== "WAITING_FOR_INPUT" || !input.trim()}>{loading ? "読込中" : "回答"}</button></div><p className={`feedback ${message ? "is-visible" : ""}`} aria-live="polite">{loading ? "辞書を読み込み中..." : message ?? " "}</p></form>}
      </>}
    </div></section>
    <div className="debug-tools">{fixtureMode && <span className="debug-badge">DEBUG DICTIONARY</span>}<DebugRulePanel format={format} option={option} onFormatChange={handleFormatChange} onOptionChange={setOption} onApply={() => void restart(format, option)} /></div>
    {state?.pendingKanjiSelection && <KanjiCandidatePicker pending={state.pendingKanjiSelection} onSelect={chooseKanji} onCancel={cancelKanji} />}
  </main>;
}

export function App() {
  return new URLSearchParams(window.location.search).get("mode") === "debug" ? <DebugApp /> : <VersusApp />;
}
