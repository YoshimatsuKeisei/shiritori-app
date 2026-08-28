import type { VersusGameState, VersusGameView } from "../../game/index.js";
import { formatAverageCharacters, formatAverageTime, formatRemainingTime, resultLongestDisplay } from "./helpers.js";

interface Props { state: VersusGameState; view: VersusGameView; onRematch: () => void; onSetup: () => void; skipInitiallyAvailable: boolean }
const reasons = { TIMEOUT: "時間切れ", END_WITH_N: "「ん」で終わったため敗北", NO_VALID_WORD: "この条件で回答可能な単語がありません" } as const;

export function VersusResult({ state, view, onRematch, onSetup, skipInitiallyAvailable }: Props) {
  return <section className="versus-result" aria-live="assertive">
    <p className="eyebrow">GAME OVER</p><h1>{view.winner?.name} WIN</h1><p className="result-reason">{state.gameOverReason ? reasons[state.gameOverReason] : "ゲーム終了"}</p>
    <div className="result-grid">{view.playerResults.map((result) => <article key={result.id} className={result.outcome === "WIN" ? "is-winner" : ""}>
      <strong>{result.name} — {result.outcome}</strong><dl>
        <div><dt>有効回答</dt><dd>{result.validAnswerCount}</dd></div><div><dt>平均時間</dt><dd>{formatAverageTime(result.averageAnswerTimeMs)}</dd></div>
        <div><dt>平均文字数</dt><dd>{formatAverageCharacters(result.averageCharacterCount)}</dd></div><div><dt>最長語</dt><dd>{resultLongestDisplay(result, state.answerHistory)}</dd></div>
        <div><dt>残り時間</dt><dd>{formatRemainingTime(result.remainingTimeMs)}</dd></div><div><dt>使用スキップ</dt><dd>{skipInitiallyAvailable ? 1 - result.skipRemaining : 0}</dd></div>
      </dl>
    </article>)}</div>
    <div className="result-actions"><button className="primary-button" onClick={onRematch}>もう一度</button><button className="secondary-button" onClick={onSetup}>設定へ戻る</button></div>
  </section>;
}
