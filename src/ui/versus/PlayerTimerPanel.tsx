import type { VersusPlayer } from "../../game/versusTypes.js";
import { formatRemainingTime } from "./helpers.js";

interface Props { player: VersusPlayer; remainingTimeMs: number }
export function PlayerTimerPanel({ player, remainingTimeMs }: Props) {
  return <section className={`player-timer ${player.isActive ? "is-active" : ""} ${remainingTimeMs <= 10_000 ? "is-urgent" : ""}`} aria-label={`${player.name} 残り時間`}>
    <div className="player-name">{player.name}</div><div className="player-turn">{player.isActive ? "● TURN" : "WAIT"}</div>
    <time>{formatRemainingTime(remainingTimeMs)}</time><small>SKIP {player.skipRemaining}</small>
  </section>;
}
