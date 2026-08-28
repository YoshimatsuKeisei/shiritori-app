import { readFile } from "node:fs/promises";

import { InMemoryDictionaryRepository } from "./repository.js";
import type { GeneratedDictionary } from "./types.js";

export async function loadGeneratedDictionary(path: string): Promise<GeneratedDictionary> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("metadata" in parsed) || !("entries" in parsed) || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid generated dictionary JSON.");
  }
  return parsed as GeneratedDictionary;
}

export async function loadDictionaryRepository(path: string): Promise<InMemoryDictionaryRepository> {
  const dictionary = await loadGeneratedDictionary(path);
  return new InMemoryDictionaryRepository(dictionary.entries);
}
