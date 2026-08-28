import {
  FORBIDDEN_CHARACTER_GROUPS,
} from "../dictionary/forbiddenCharacters.js";
import { normalizeReading } from "../dictionary/japaneseText.js";
import type {
  ForbiddenCharacterResolution,
  ForbiddenConfigurationError,
  ForbiddenSlot,
} from "./types.js";

const GROUP_A_NORMAL_KANA = new Set(Array.from("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわを"));

export function resolveForbiddenCharacters(
  slots: readonly ForbiddenSlot[],
): ForbiddenCharacterResolution {
  const errors: ForbiddenConfigurationError[] = [];
  const identities = slots.map((slot) => slot.group === "A" ? `A:${normalizeReading(slot.char)}` : slot.group);

  if (slots.length > 3) errors.push("TOO_MANY_SLOTS");
  if (new Set(identities).size !== identities.length) errors.push("DUPLICATE_SLOT");

  const groupASlots = slots.filter((slot): slot is Extract<ForbiddenSlot, { group: "A" }> => slot.group === "A");
  if (groupASlots.some((slot) => !GROUP_A_NORMAL_KANA.has(normalizeReading(slot.char)))) {
    errors.push("INVALID_GROUP_A_CHARACTER");
  }

  const namedGroupCount = slots.length - groupASlots.length;
  if (slots.length > 1 && (groupASlots.length === 0 || namedGroupCount > 2)) {
    errors.push("GROUP_COMBINATION_NOT_ALLOWED");
  }

  const characters = new Set<string>();
  for (const slot of slots) {
    if (slot.group === "A") {
      const character = normalizeReading(slot.char);
      if (GROUP_A_NORMAL_KANA.has(character)) characters.add(character);
    } else {
      for (const character of FORBIDDEN_CHARACTER_GROUPS[slot.group]) characters.add(character);
    }
  }
  return { valid: errors.length === 0, characters, errors };
}
