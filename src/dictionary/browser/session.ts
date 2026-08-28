import { normalizeReading } from "../japaneseText.js";
import type { DebugGameState } from "../../game/types.js";
import type { BrowserDictionaryManifest } from "./types.js";
import { BrowserDictionaryLoader } from "./loader.js";

export class BrowserDictionarySession {
  constructor(readonly loader: BrowserDictionaryLoader) {}

  loadManifest(): Promise<BrowserDictionaryManifest> {
    return this.loader.loadManifest();
  }

  async ensureCurrentTurn(direction: "STARTS_WITH" | "ENDS_WITH", value: string): Promise<void> {
    const character = Array.from(value)[0] ?? "";
    if (direction === "ENDS_WITH") await this.loader.ensureLastChar(character);
    else await this.loader.ensureFirstChar(character);
  }

  async ensureAnswerAndNextTurn(state: Pick<DebugGameState, "matchFormat">, input: string): Promise<void> {
    const reading = normalizeReading(input);
    const characters = Array.from(reading);
    const first = characters[0];
    const last = characters.at(-1);
    if (!first || !last) return;
    await this.loader.ensureFirstChar(first);
    if (state.matchFormat === "REVERSE") await this.loader.ensureLastChar(first);
    else await this.loader.ensureFirstChar(last);
  }
}
