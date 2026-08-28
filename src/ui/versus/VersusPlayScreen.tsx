import type { FormEvent, RefObject } from "react";
import type { VersusGameState, VersusGameView } from "../../game/index.js";
import { PlayerTimerPanel } from "./PlayerTimerPanel.js";
import { VersusHistory } from "./VersusHistory.js";
import { VersusResult } from "./VersusResult.js";
import { isSkipDisabled } from "./helpers.js";

interface Props {
  state: VersusGameState; view: VersusGameView; input: string; message?: string; loading: boolean; fixtureMode: boolean;
  inputRef: RefObject<HTMLInputElement | null>; skipInitiallyAvailable: boolean;
  onInput: (value: string) => void; onSubmit: (event: FormEvent) => void; onSkip: () => void; onRetry: () => void; onRematch: () => void; onSetup: () => void;
}
function conditionCaption(state: VersusGameState): string {
  if (state.requiredLength !== undefined) return `${state.requiredLength}文字で回答`;
  if (state.matchFormat === "FORBIDDEN_CHARACTER" && state.forbiddenCharacters?.size) return `${[...state.forbiddenCharacters].map((value) => `「${value}」`).join("")}禁止`;
  if (state.currentConnection.type === "ENDS_WITH") return "この文字で終わる";
  if (state.currentConnection.type === "STARTS_WITH_TWO") return "この2文字から始める";
  return "この文字から始める";
}
function navigation(state: VersusGameState): string { return `「${state.currentConnection.value}」${state.currentConnection.type === "ENDS_WITH" ? "で終わる" : "から始まる"}言葉`; }

export function VersusPlayScreen(props: Props) {
  const { state, view } = props;
  return <section className="game-panel versus-panel">
    <header className="versus-header"><PlayerTimerPanel player={state.players[0]} remainingTimeMs={view.playerResults[0].remainingTimeMs} /><PlayerTimerPanel player={state.players[1]} remainingTimeMs={view.playerResults[1].remainingTimeMs} /></header>
    <div className="game-content">
      {state.status === "GAME_OVER" ? <VersusResult state={state} view={view} onRematch={props.onRematch} onSetup={props.onSetup} skipInitiallyAvailable={props.skipInitiallyAvailable} /> : <>
        <div className="navigation"><p className="eyebrow">{view.currentPlayer.name} TURN</p><h1>{navigation(state)}</h1></div><VersusHistory history={state.answerHistory} />
        <div className="connection-zone"><span className="connection-caption">{conditionCaption(state)}</span><div className="connection-character">{state.currentConnection.value}</div></div>
        <form className="answer-form" onSubmit={props.onSubmit}><label htmlFor="versus-answer">{view.currentPlayer.name} の回答</label><div className="input-row"><input ref={props.inputRef} id="versus-answer" value={props.input} onChange={(event) => props.onInput(event.target.value)} placeholder="ひらがなで入力" autoComplete="off" disabled={props.loading || state.status !== "WAITING_FOR_INPUT"}/><button className="primary-button" type="submit" disabled={props.loading || state.status !== "WAITING_FOR_INPUT" || !props.input.trim()}>{props.loading ? "読込中" : "回答"}</button></div><p className={`feedback ${props.message ? "is-visible" : ""}`} aria-live="polite">{state.status === "WAITING_FOR_DICTIONARY" ? "辞書を読み込み中..." : props.message ?? " "}</p></form>
        <div className="skip-row"><button type="button" className="secondary-button" disabled={isSkipDisabled(state, props.loading)} onClick={props.onSkip}>SKIP　残り{view.currentPlayer.skipRemaining}回</button>{state.matchFormat === "GROWING_LENGTH" && <small>文字数増加では使用不可</small>}</div>
        {props.message === "辞書の読み込みに失敗しました" && <button type="button" className="text-button load-retry" onClick={props.onRetry}>辞書を再読み込み</button>}
      </>}
    </div>{props.fixtureMode && <span className="versus-debug-badge">DEBUG DICTIONARY</span>}
  </section>;
}
