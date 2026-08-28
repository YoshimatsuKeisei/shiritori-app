import { createWordEntry } from "../dictionary/createWordEntry.js";
import { InMemoryDictionaryRepository } from "../dictionary/repository.js";

const words: ReadonlyArray<readonly [string, string?]> = [
  ["りす"], ["すいか", "西瓜"], ["からす", "烏"], ["すずめ", "雀"], ["めだか", "目高"],
  ["みかん", "蜜柑"], ["ようかい", "妖怪"], ["かいしゃ", "会社"], ["しゃかい", "社会"],
  ["りんご", "林檎"], ["かもしか", "羚羊"], ["かたつむり", "蝸牛"],
  ["きゅうり", "胡瓜"], ["たぬき", "狸"], ["かるた"], ["しか", "鹿"], ["しんぶん", "新聞"],
  ["こうしょう", "交渉"], ["こうしょう", "校章"], ["こうしょう", "鉱床"], ["うみ", "海"],
  ["すーぱー", "スーパー"],
];

export const browserFixtureEntries = words.map(([reading, surface], index) => createWordEntry({
  id: `browser-fixture-${index + 1}`,
  source: "JMdict",
  reading,
  surface: surface ?? reading,
  partOfSpeech: ["n"],
}));

export const browserDictionaryRepository = new InMemoryDictionaryRepository(browserFixtureEntries);
