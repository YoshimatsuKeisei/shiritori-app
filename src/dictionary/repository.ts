import { normalizeReading } from "./japaneseText.js";
import type {
  DictionaryQuery,
  DictionaryRepository,
  DictionaryScope,
  WordEntry,
} from "./types.js";

type Index = Map<string, WordEntry[]>;

function add(index: Index, key: string | number, entry: WordEntry): void {
  const normalizedKey = String(key);
  const bucket = index.get(normalizedKey);
  if (bucket) bucket.push(entry);
  else index.set(normalizedKey, [entry]);
}

function isProverb(entry: WordEntry): boolean {
  return entry.semanticTags.includes("proverb");
}

export function isEntryInScope(entry: WordEntry, scope: DictionaryScope): boolean {
  if (entry.source === "JMdict") return isProverb(entry) ? scope.proverbs : scope.commonNouns;
  if (!scope.properNouns) return false;
  switch (entry.properNounType) {
    case "PERSON": return scope.people;
    case "PLACE": return scope.places;
    case "ORGANIZATION": return scope.organizations;
    case "WORK": return scope.works;
    case "PRODUCT": return scope.products;
    default: return true;
  }
}

export class InMemoryDictionaryRepository implements DictionaryRepository {
  readonly #entries: readonly WordEntry[];
  readonly #reading: Index = new Map();
  readonly #firstChar: Index = new Map();
  readonly #firstTwoChars: Index = new Map();
  readonly #lastChar: Index = new Map();
  readonly #characterCount: Index = new Map();
  readonly #scriptType: Index = new Map();

  constructor(entries: readonly WordEntry[]) {
    this.#entries = [...entries];
    for (const entry of entries) {
      add(this.#reading, entry.normalizedReading, entry);
      add(this.#firstChar, entry.firstChar, entry);
      add(this.#firstTwoChars, entry.firstTwoChars, entry);
      add(this.#lastChar, entry.lastChar, entry);
      add(this.#characterCount, entry.characterCount, entry);
      add(this.#scriptType, entry.scriptType, entry);
    }
  }

  findByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[] {
    return this.searchWords({ reading, ...(scope ? { scope } : {}) });
  }

  findKanjiCandidatesByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[] {
    return this.findByReading(reading, scope).filter((entry) => entry.kanjiChars.length > 0);
  }

  findKatakanaCandidatesByReading(reading: string, scope?: DictionaryScope): readonly WordEntry[] {
    return this.searchWords({ reading, scriptType: "katakana", ...(scope ? { scope } : {}) });
  }

  searchWords(query: DictionaryQuery): readonly WordEntry[] {
    const indexedCandidates: WordEntry[][] = [];
    const normalizedReading = query.reading === undefined ? undefined : normalizeReading(query.reading);
    const normalizedStart = query.startsWith === undefined ? undefined : normalizeReading(query.startsWith);
    const normalizedEnd = query.endsWith === undefined ? undefined : normalizeReading(query.endsWith);

    if (normalizedReading !== undefined) indexedCandidates.push(this.#reading.get(normalizedReading) ?? []);
    if (normalizedStart && Array.from(normalizedStart).length === 1) indexedCandidates.push(this.#firstChar.get(normalizedStart) ?? []);
    if (normalizedStart && Array.from(normalizedStart).length === 2) indexedCandidates.push(this.#firstTwoChars.get(normalizedStart) ?? []);
    if (normalizedEnd && Array.from(normalizedEnd).length === 1) indexedCandidates.push(this.#lastChar.get(normalizedEnd) ?? []);
    if (query.exactLength !== undefined) indexedCandidates.push(this.#characterCount.get(String(query.exactLength)) ?? []);
    if (query.scriptType !== undefined) indexedCandidates.push(this.#scriptType.get(query.scriptType) ?? []);

    const candidates = indexedCandidates.length === 0
      ? this.#entries
      : indexedCandidates.reduce((smallest, current) => current.length < smallest.length ? current : smallest);

    return candidates.filter((entry) =>
      (normalizedReading === undefined || entry.normalizedReading === normalizedReading) &&
      (normalizedStart === undefined || entry.normalizedReading.startsWith(normalizedStart)) &&
      (normalizedEnd === undefined || entry.normalizedReading.endsWith(normalizedEnd)) &&
      (query.exactLength === undefined || entry.characterCount === query.exactLength) &&
      (query.scriptType === undefined || (query.scriptType === "kanji"
        ? entry.kanjiChars.length > 0
        : entry.scriptType === query.scriptType)) &&
      (query.forbiddenCharacters === undefined || !Array.from(entry.normalizedReading).some(
        (character) => query.forbiddenCharacters?.has(character),
      )) &&
      (query.scope === undefined || isEntryInScope(entry, query.scope))
    );
  }

  countWords(query: DictionaryQuery): number {
    return this.searchWords(query).length;
  }
}
