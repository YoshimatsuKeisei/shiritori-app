export type DictionarySource = "JMdict" | "JMnedict";

export type ScriptType = "kanji" | "katakana" | "hiragana" | "mixed";

export type ProperNounType =
  | "PERSON"
  | "PLACE"
  | "ORGANIZATION"
  | "WORK"
  | "PRODUCT"
  | "OTHER";

/** A normalized record stored in the local application dictionary. */
export interface WordEntry {
  id: string;
  source: DictionarySource;
  reading: string;
  normalizedReading: string;
  surface: string;
  normalizedSurface: string;
  partOfSpeech: string[];
  semanticTags: string[];
  properNounType?: ProperNounType;
  scriptType: ScriptType;
  characterCount: number;
  firstChar: string;
  lastChar: string;
  firstTwoChars: string;
  lastTwoChars: string;
  kanjiChars: string[];
  usageKeyNormal: string;
  usageKeyKanji: string;
}

/** A dictionary candidate selected for rule-engine validation. */
export interface ResolvedWord {
  entryId: string;
  input: string;
  reading: string;
  surface: string;
  normalizedReading: string;
  characterCount: number;
  firstChar: string;
  lastChar: string;
  firstTwoChars: string;
  lastTwoChars: string;
  scriptType: WordEntry["scriptType"];
  kanjiChars: string[];
  source: WordEntry["source"];
  usageKey: string;
}

export type RawWordEntry = Pick<WordEntry, "id" | "source" | "reading" | "surface"> &
  Partial<Pick<WordEntry, "partOfSpeech" | "semanticTags" | "properNounType">>;

export type UsageKeyMode = "normal" | "kanji";

export interface DictionaryMetadata {
  schemaVersion: number;
  generatedAt: string;
  jmdictSource?: string;
  jmnedictSource?: string;
}

export interface GeneratedDictionary {
  metadata: DictionaryMetadata;
  entries: WordEntry[];
}

export interface DictionaryScope {
  commonNouns: boolean;
  proverbs: boolean;
  properNouns: boolean;
  people: boolean;
  places: boolean;
  organizations: boolean;
  works: boolean;
  products: boolean;
}

export interface DictionaryQuery {
  reading?: string;
  startsWith?: string;
  endsWith?: string;
  exactLength?: number;
  forbiddenCharacters?: ReadonlySet<string>;
  scriptType?: "kanji" | "katakana";
  scope?: DictionaryScope;
}

export interface DictionaryRepository {
  findByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[];
  findKanjiCandidatesByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[];
  findKatakanaCandidatesByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[];
  searchWords(query: DictionaryQuery): readonly WordEntry[];
  countWords(query: DictionaryQuery): number;
}
