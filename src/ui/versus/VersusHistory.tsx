import { useEffect, useRef } from "react";
import type { VersusAnswerRecord } from "../../game/versusTypes.js";

export function VersusHistory({ history }: { history: readonly VersusAnswerRecord[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [history.length]);
  return <div className="history versus-history" aria-label="回答履歴">{history.length === 0 && <p className="history-empty">最初の言葉を入力してください</p>}{history.map((record) => <div className="history-word" key={`${record.turnNumber}-${record.playerId}`}><span className="history-turn">{record.playerId === "player-1" ? "P1" : "P2"}</span><span>{record.displayText}</span></div>)}<div ref={end} /></div>;
}
