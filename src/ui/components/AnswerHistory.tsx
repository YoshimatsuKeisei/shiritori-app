import { useEffect, useRef } from "react";

import type { AnswerRecord } from "../../game/types.js";

interface AnswerHistoryProps { history: readonly AnswerRecord[] }

export function AnswerHistory({ history }: AnswerHistoryProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [history.length]);

  return (
    <section className="history" aria-label="解答履歴" aria-live="polite">
      {history.length === 0 && <p className="history-empty">まだ回答はありません</p>}
      {history.map((record) => (
        <div className="history-word" key={`${record.turnNumber}-${record.word.entryId}`}>
          <span className="history-turn">{String(record.turnNumber).padStart(2, "0")}</span>
          <span>{record.displayText}</span>
        </div>
      ))}
      <div ref={endRef} />
    </section>
  );
}
