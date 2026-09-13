import type { ProperNounType, WordEntry } from "./types.js";

/** Supports old JSON; an empty category array also falls back to the legacy field. */
export function getProperNounTypes(
  entry: Pick<WordEntry, "properNounType" | "properNounTypes">,
): readonly ProperNounType[] {
  return entry.properNounTypes?.length
    ? entry.properNounTypes
    : [entry.properNounType ?? "OTHER"];
}
