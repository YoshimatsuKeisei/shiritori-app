/** 濁音・撥音。半濁音（ぱぴぷぺぽ）は仕様上含めない。 */
export const FORBIDDEN_GROUP_B = new Set([
  ..."がぎぐげござじずぜぞだぢづでどばびぶべぼ",
  "ゔ",
  "ん",
]);

/** dictionary_spec.md で明示された小書き文字。 */
export const FORBIDDEN_GROUP_C = new Set([
  "ぁ",
  "ぃ",
  "ぅ",
  "ぇ",
  "ぉ",
  "ゃ",
  "ゅ",
  "ょ",
  "っ",
  "ゎ",
]);

/** 長音記号。 */
export const FORBIDDEN_GROUP_D = new Set(["ー"]);

export const FORBIDDEN_CHARACTER_GROUPS = {
  B: FORBIDDEN_GROUP_B,
  C: FORBIDDEN_GROUP_C,
  D: FORBIDDEN_GROUP_D,
} as const;
