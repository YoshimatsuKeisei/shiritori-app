import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
  createBrowserDictionaryManifest,
  groupEntriesBy,
} from "../dictionary/browser/buildBrowserDictionary.js";
import type { GeneratedDictionary, WordEntry } from "../dictionary/types.js";

interface Arguments { inputPath: string; outputDirectory: string }

function parseArguments(values: readonly string[]): Arguments {
  let inputPath = "data/generated/dictionary.json";
  let outputDirectory = "public/dictionary";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if ((value === "--input" || value === "--out") && !next) throw new Error(`${value} requires a path.`);
    if (value === "--input") { inputPath = next!; index += 1; }
    else if (value === "--out") { outputDirectory = next!; index += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return { inputPath, outputDirectory };
}

async function writeGroups(output: string, groups: ReadonlyMap<string, readonly WordEntry[]>, infos: Record<string, { path: string }>): Promise<void> {
  for (const [character, entries] of groups) {
    const target = resolve(output, infos[character]!.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(entries));
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const input = resolve(options.inputPath);
  const output = resolve(options.outputDirectory);
  const dictionary = JSON.parse(await readFile(input, "utf8")) as GeneratedDictionary;
  if (!Array.isArray(dictionary.entries)) throw new Error("Invalid generated dictionary.");
  const first = groupEntriesBy(dictionary.entries, (entry) => entry.firstChar);
  const last = groupEntriesBy(dictionary.entries, (entry) => entry.lastChar);
  const manifest = createBrowserDictionaryManifest(dictionary, first, last, basename(input));
  await mkdir(output, { recursive: true });
  await writeGroups(output, first, manifest.firstCharShards);
  await writeGroups(output, last, manifest.lastCharShards);
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  const firstBytes = Object.values(manifest.firstCharShards).reduce((sum, shard) => sum + shard.bytes, 0);
  const lastBytes = Object.values(manifest.lastCharShards).reduce((sum, shard) => sum + shard.bytes, 0);
  const all = [...Object.entries(manifest.firstCharShards).map(([character, shard]) => ({ direction: "first", character, ...shard })), ...Object.entries(manifest.lastCharShards).map(([character, shard]) => ({ direction: "last", character, ...shard }))];
  const largest = all.sort((left, right) => right.bytes - left.bytes)[0];
  console.log(JSON.stringify({ totalEntries: manifest.totalEntries, firstShards: first.size, lastShards: last.size, firstBytes, lastBytes, totalBytes: firstBytes + lastBytes, averageBytes: Math.round((firstBytes + lastBytes) / all.length), largest }, null, 2));
}

await main();
