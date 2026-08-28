import { resolveWordEntry } from "../createWordEntry.js";
import { normalizeReading } from "../japaneseText.js";
import type { DebugGameState } from "../../game/types.js";
import { deriveNextConnection } from "../../rules/evaluate.js";
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
    const first = Array.from(reading)[0];
    if (!first) return;
    await this.loader.ensureFirstChar(first);
    const entry = this.loader.repository.findByReading(reading)[0];
    if (!entry) return;
    const connection = deriveNextConnection(state.matchFormat, resolveWordEntry(entry, input));
    if (connection.type === "CATEGORY") return;
    const shardCharacter = Array.from(connection.value)[0];
    if (!shardCharacter) return;
    if (connection.type === "ENDS_WITH") await this.loader.ensureLastChar(shardCharacter);
    else await this.loader.ensureFirstChar(shardCharacter);
  }
}
