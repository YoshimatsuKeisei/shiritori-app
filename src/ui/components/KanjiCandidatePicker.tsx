import { useEffect, useMemo, useState } from "react";

import type { PendingKanjiSelection } from "../../game/types.js";

interface KanjiCandidatePickerProps {
  pending: PendingKanjiSelection;
  onSelect: (entryId: string) => void;
  onCancel: () => void;
}

export function KanjiCandidatePicker({ pending, onSelect, onCancel }: KanjiCandidatePickerProps) {
  const [query, setQuery] = useState("");
  const candidates = useMemo(
    () => pending.candidates.filter((candidate) => candidate.surface.includes(query.trim())),
    [pending.candidates, query],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onCancel();
    }}>
      <section className="candidate-sheet" role="dialog" aria-modal="true" aria-labelledby="candidate-title">
        <div className="sheet-handle" />
        <header className="candidate-header">
          <div>
            <p className="eyebrow">KANJI SELECTION</p>
            <h2 id="candidate-title">「{pending.normalizedInput}」の漢字を選択</h2>
          </div>
          <button type="button" className="text-button" onClick={onCancel}>キャンセル</button>
        </header>
        <input
          autoFocus
          className="candidate-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="候補を検索"
          aria-label="漢字候補を検索"
        />
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <button
              type="button"
              className="candidate-item"
              key={candidate.id}
              onClick={() => onSelect(candidate.id)}
            >
              <span>{candidate.surface}</span>
              <small>{candidate.normalizedReading}</small>
            </button>
          ))}
          {candidates.length === 0 && <p className="candidate-empty">一致する候補がありません</p>}
        </div>
      </section>
    </div>
  );
}
