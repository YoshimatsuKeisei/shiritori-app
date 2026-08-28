import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { BrowserDictionaryLoader, BrowserDictionarySession, getConfiguredBrowserDictionaryBaseUrl, type DictionaryScope } from "../../dictionary/index.js";
import { START_CHARACTERS, cancelVersusKanjiSelection, checkVersusTimeout, createVersusGame, pauseForDictionaryLoad, resumeAfterDictionaryLoad, selectVersusGameView, selectVersusKanjiCandidate, skipVersusTurn, submitVersusAnswer } from "../../game/index.js";
import type { DebugGameView, RandomSource, VersusActionResult, VersusGameDependencies, VersusGameState } from "../../game/index.js";
import type { ConstraintOption, MatchFormat, RejectReason } from "../../rules/index.js";
import { KanjiCandidatePicker } from "../components/KanjiCandidatePicker.js";
import { browserDictionaryRepository } from "../debugDictionary.js";
import { getRejectReasonMessage } from "../presentation.js";
import { VersusPlayScreen } from "./VersusPlayScreen.js";
import { VersusSetup } from "./VersusSetup.js";
import { resolveInitialTimeMs, shouldRunVersusTicker, type VersusSetupValues } from "./helpers.js";

const scope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: true, places: true, organizations: true, works: true, products: true };
const clock = { now: () => Date.now() };
const fixtureMode = new URLSearchParams(window.location.search).get("dictionary") === "fixture";
const session = new BrowserDictionarySession(new BrowserDictionaryLoader(getConfiguredBrowserDictionaryBaseUrl()));
const defaults: VersusSetupValues = { matchFormat: "NORMAL", constraintOptions: [], timeChoice: 5, customMinutes: 5, skipEnabled: true };

function randomFor(playerValue: number, character: string): RandomSource {
  const index = START_CHARACTERS.indexOf(character);
  const values = [playerValue, (index + 0.5) / START_CHARACTERS.length];
  return { next: () => values.shift()! };
}
function fixtureStart(format: MatchFormat, options: readonly ConstraintOption[]): string {
  return options.includes("KANJI_ONLY") ? "こ" : options.includes("KATAKANA_ONLY") ? "す" : format === "TWO_CHARACTER" ? "よ" : format === "GROWING_LENGTH" ? "り" : format === "REVERSE" ? "り" : format === "FORBIDDEN_CHARACTER" ? "し" : "り";
}
function dependencies(): VersusGameDependencies { return { repository: fixtureMode ? browserDictionaryRepository : session.loader.repository, clock }; }
function presentationView(state: VersusGameState): DebugGameView {
  return { matchFormat: state.matchFormat, constraintOptions: state.constraintOptions, answerHistory: state.answerHistory.map(({ playerId: _id, ...record }) => record), connectionValue: state.currentConnection.value, connectionDirection: state.currentConnection.type === "ENDS_WITH" ? "ENDS_WITH" : "STARTS_WITH", connectionCharacterCount: state.currentConnection.type === "STARTS_WITH_TWO" ? 2 : 1, ...(state.requiredLength === undefined ? {} : { requiredLength: state.requiredLength }), ...(state.forbiddenCharacters ? { forbiddenCharacters: state.forbiddenCharacters } : {}), turnNumber: state.turnNumber };
}
function rejectionMessage(reason: RejectReason, state: VersusGameState) { return getRejectReasonMessage(reason, presentationView(state)); }

export function VersusApp() {
  const [setup, setSetup] = useState<VersusSetupValues>(defaults);
  const [screen, setScreen] = useState<"SETUP" | "PLAY">("SETUP");
  const [game, setGame] = useState<VersusGameState>();
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<string>();
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const applyResult = useCallback((result: VersusActionResult) => {
    setGame(result.state);
    if (result.outcome === "REJECTED") setMessage(rejectionMessage(result.rejectReason, result.state));
    else if (result.outcome === "INVALID_ACTION") setMessage("現在はその操作を行えません");
    else { setMessage(undefined); if (["ACCEPTED", "GAME_OVER", "SKIPPED"].includes(result.outcome)) setInput(""); }
  }, []);

  const startGame = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true); setMessage(undefined);
    try {
      let startChar = fixtureStart(setup.matchFormat, setup.constraintOptions);
      if (!fixtureMode) {
        const manifest = await session.loadManifest();
        const shards = setup.matchFormat === "REVERSE" ? manifest.lastCharShards : manifest.firstCharShards;
        const available = START_CHARACTERS.filter((character) => shards[character]?.entries);
        startChar = available[Math.floor(Math.random() * available.length)]!;
        await session.ensureCurrentTurn(setup.matchFormat === "REVERSE" ? "ENDS_WITH" : "STARTS_WITH", startChar);
      }
      const result = createVersusGame({ matchFormat: setup.matchFormat, constraintOptions: setup.constraintOptions, dictionaryScope: scope, initialTimeMs: resolveInitialTimeMs(setup), skipEnabled: setup.skipEnabled, randomSource: randomFor(Math.random(), startChar), ...(setup.matchFormat === "FORBIDDEN_CHARACTER" ? { forbiddenSlots: [{ group: "B" as const }] } : {}) }, dependencies());
      if (!result.ok) throw new Error(result.error);
      setGame(result.state); setScreen("PLAY"); setInput(""); setPendingSubmission(undefined);
    } catch { setMessage("辞書の読み込みに失敗しました"); }
    finally { busyRef.current = false; setLoading(false); }
  }, [setup]);

  const finishPausedSubmission = useCallback(async (paused: VersusGameState, answer: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true); setPendingSubmission(answer);
    try {
      await session.ensureAnswerAndNextTurn(paused, answer);
      const resumed = resumeAfterDictionaryLoad(paused, dependencies());
      if (resumed.outcome !== "RESUMED_AFTER_DICTIONARY") { applyResult(resumed); return; }
      applyResult(submitVersusAnswer(resumed.state, answer, dependencies()));
      setPendingSubmission(undefined);
    } catch { setGame(paused); setMessage("辞書の読み込みに失敗しました"); }
    finally { busyRef.current = false; setLoading(false); }
  }, [applyResult]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!game || !input.trim() || loading || busyRef.current || game.status !== "WAITING_FOR_INPUT") return;
    if (fixtureMode) { applyResult(submitVersusAnswer(game, input, dependencies())); return; }
    const paused = pauseForDictionaryLoad(game, dependencies());
    if (paused.outcome !== "PAUSED_FOR_DICTIONARY") { applyResult(paused); return; }
    setGame(paused.state);
    await finishPausedSubmission(paused.state, input);
  };

  useEffect(() => {
    if (!shouldRunVersusTicker(game)) return;
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
      setGame((current) => {
        if (!current) return current;
        const timeout = checkVersusTimeout(current, dependencies());
        return timeout?.state ?? current;
      });
    }, 200);
    return () => window.clearInterval(interval);
  }, [Boolean(game), game?.status]);
  useEffect(() => { if (game?.status === "WAITING_FOR_INPUT" && !loading) inputRef.current?.focus(); }, [game?.currentPlayerId, game?.status, loading]);

  if (screen === "SETUP" || !game) return <main className="app-shell"><VersusSetup values={setup} onChange={setSetup} onStart={() => void startGame()} loading={loading} {...(message ? { error: message } : {})} />{fixtureMode && <span className="setup-debug-badge">DEBUG DICTIONARY</span>}</main>;
  const view = selectVersusGameView(game, clock);
  return <main className="app-shell">
    <VersusPlayScreen state={game} view={view} input={input} {...(message ? { message } : {})} loading={loading} fixtureMode={fixtureMode} inputRef={inputRef} skipInitiallyAvailable={setup.skipEnabled && setup.matchFormat !== "GROWING_LENGTH"} onInput={setInput} onSubmit={(event) => void submit(event)} onSkip={() => applyResult(skipVersusTurn(game, dependencies()))} onRetry={() => pendingSubmission && void finishPausedSubmission(game, pendingSubmission)} onRematch={() => void startGame()} onSetup={() => { setScreen("SETUP"); setGame(undefined); setMessage(undefined); }} />
    {game.pendingKanjiSelection && game.status !== "GAME_OVER" && <KanjiCandidatePicker pending={game.pendingKanjiSelection} onSelect={(id) => applyResult(selectVersusKanjiCandidate(game, id, dependencies()))} onCancel={() => applyResult(cancelVersusKanjiSelection(game))} />}
  </main>;
}
