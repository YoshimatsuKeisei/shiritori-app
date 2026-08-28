import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeReading } from "../dictionary/japaneseText.js";
import type { GeneratedDictionary, WordEntry } from "../dictionary/types.js";

export interface CoverageAuditResult {
  reading: string;
  normalizedReading: string;
  matches: readonly WordEntry[];
}

interface Arguments {
  dictionaryPath: string;
  readings: string[];
}

export function auditDictionaryCoverage(
  entries: readonly WordEntry[],
  readings: readonly string[],
): CoverageAuditResult[] {
  const index = new Map<string, WordEntry[]>();
  for (const entry of entries) {
    const bucket = index.get(entry.normalizedReading);
    if (bucket) bucket.push(entry);
    else index.set(entry.normalizedReading, [entry]);
  }
  return readings.map((reading) => {
    const normalizedReading = normalizeReading(reading);
    return { reading, normalizedReading, matches: index.get(normalizedReading) ?? [] };
  });
}

export function formatCoverageCandidate(entry: WordEntry): string {
  return [
    `  [${entry.source}][${entry.properNounType ?? "COMMON"}]`,
    `  reading: ${entry.reading}`,
    `  surface: ${entry.surface}`,
    `  properNounType: ${entry.properNounType ?? "-"}`,
    `  partOfSpeech: ${entry.partOfSpeech.join(", ") || "-"}`,
    `  semanticTags: ${entry.semanticTags.join(", ") || "-"}`,
  ].join("\n");
}

export function formatCoverageAudit(results: readonly CoverageAuditResult[]): string {
  const sections = results.map((result) => {
    const heading = `${result.reading}\n  normalized reading: ${result.normalizedReading || "-"}`;
    if (result.matches.length === 0) return `${heading}\n  NOT FOUND`;
    return `${heading}\n  matches: ${result.matches.length}\n\n${result.matches.map(formatCoverageCandidate).join("\n\n")}`;
  });
  const found = results.filter((result) => result.matches.length > 0).length;
  return `${sections.join("\n\n")}\n\nFound: ${found}\nNot found: ${results.length - found}\n`;
}

export function parseAuditArguments(values: readonly string[]): Arguments {
  let dictionaryPath = "data/generated/dictionary.json";
  const readings: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if ((value === "--reading" || value === "--dictionary") && !next) {
      throw new Error(`${value} requires a value.`);
    }
    if (value === "--reading") { readings.push(next!); index += 1; }
    else if (value === "--dictionary") { dictionaryPath = next!; index += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (readings.length === 0) throw new Error("At least one --reading is required.");
  return { dictionaryPath: resolve(dictionaryPath), readings };
}

async function main(): Promise<void> {
  const options = parseAuditArguments(process.argv.slice(2));
  const dictionary = JSON.parse(await readFile(options.dictionaryPath, "utf8")) as GeneratedDictionary;
  if (!Array.isArray(dictionary.entries)) throw new Error("Invalid generated dictionary.");
  const results = auditDictionaryCoverage(dictionary.entries, options.readings);
  process.stdout.write(formatCoverageAudit(results));
  if (results.some((result) => result.matches.length === 0)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
