// Node-only generation. Do not export this module from the browser barrel.
import { execFile } from "node:child_process";
import { lstat, mkdir, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import type { GeneratedDictionary, WordEntry } from "../types.js";
import { groupEntriesBy, shardFileName } from "./buildBrowserDictionary.js";
import type { BrowserDictionaryManifest, GzipBrowserDictionaryShardInfo } from "./types.js";

const gzipAsync = promisify(gzip);
const execFileAsync = promisify(execFile);
export const GZIP_BROWSER_DICTIONARY_SCHEMA_VERSION = 2;
export const DICTIONARY_GZIP_LEVEL = 6;

async function existingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try { await lstat(current); return current; }
    catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/** Preflight every target before unlinking only recognized generated files (never recursive rm). */
export async function cleanBrowserDictionaryOutput(outputDirectory: string): Promise<void> {
  const output = resolve(outputDirectory);
  const relativeWorkspace = relative(output, process.cwd());
  if (output === parse(output).root || output === resolve(homedir()) || relativeWorkspace === "" || (!relativeWorkspace.startsWith("..") && !parse(relativeWorkspace).root)) {
    throw new Error(`Unsafe dictionary output directory: ${output}`);
  }
  const ancestor = await existingAncestor(output);
  if (relative(await realpath(ancestor), ancestor) !== "") {
    throw new Error(`Dictionary output must not use symbolic links: ${output}`);
  }
  const files: string[] = [];
  if (ancestor === output) {
    if (!(await lstat(output)).isDirectory()) throw new Error("Dictionary output must be a directory.");
    for (const item of await readdir(output, { withFileTypes: true })) {
      const path = join(output, item.name);
      if (item.name === "manifest.json" && item.isFile()) files.push(path);
      else if ((item.name === "by-first" || item.name === "by-last") && item.isDirectory() && !item.isSymbolicLink()) {
        for (const shard of await readdir(path, { withFileTypes: true })) {
          if (!shard.isFile() || !/^u[0-9a-f]+(?:-[0-9a-f]+)*\.json(?:\.gz)?$/.test(shard.name)) {
            throw new Error(`Refusing to clean non-generated dictionary item: ${join(path, shard.name)}`);
          }
          files.push(join(path, shard.name));
        }
      } else throw new Error(`Refusing to clean non-generated dictionary item: ${path}`);
    }
    try {
      const { stdout } = await execFileAsync("git", ["-C", output, "ls-files", "--", "."]);
      if (stdout.trim()) throw new Error(`Refusing to clean Git-tracked dictionary files: ${output}`);
    } catch (error: unknown) {
      // Temporary fixture directories outside a Git worktree are allowed.
      if (!(error instanceof Error) || !error.message.includes("not a git repository")) throw error;
    }
  }
  for (const path of files) await unlink(path);
  await mkdir(join(output, "by-first"), { recursive: true });
  await mkdir(join(output, "by-last"), { recursive: true });
}

async function writeGzipGroups(
  output: string,
  direction: "first" | "last",
  groups: ReadonlyMap<string, readonly WordEntry[]>,
): Promise<Record<string, GzipBrowserDictionaryShardInfo>> {
  const infos: Record<string, GzipBrowserDictionaryShardInfo> = {};
  for (const [character, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b, "ja"))) {
    // Only one shard's JSON and compressed Buffer are live at a time.
    const json = JSON.stringify(entries);
    const compressed = await gzipAsync(json, { level: DICTIONARY_GZIP_LEVEL });
    const path = `by-${direction}/${shardFileName(character)}.gz`;
    await writeFile(join(output, path), compressed);
    infos[character] = { path, entries: entries.length, compression: "gzip", compressedBytes: compressed.byteLength, uncompressedBytes: Buffer.byteLength(json) };
  }
  return infos;
}

export interface GzipBrowserDictionaryManifest extends BrowserDictionaryManifest {
  firstCharShards: Record<string, GzipBrowserDictionaryShardInfo>;
  lastCharShards: Record<string, GzipBrowserDictionaryShardInfo>;
}

export function browserDictionaryCompressionStatistics(manifest: GzipBrowserDictionaryManifest, manifestBytes: number) {
  const describe = (direction: "first" | "last", shards: Record<string, GzipBrowserDictionaryShardInfo>) =>
    Object.entries(shards).map(([character, info]) => ({ direction, character, ...info }));
  const first = describe("first", manifest.firstCharShards);
  const last = describe("last", manifest.lastCharShards);
  type Shard = typeof first[number];
  const sum = (shards: Shard[], key: "compressedBytes" | "uncompressedBytes") => shards.reduce((total, info) => total + info[key], 0);
  const largest = (shards: Shard[], key: "compressedBytes" | "uncompressedBytes") =>
    shards.reduce<Shard | null>((result, info) => !result || info[key] > result[key] ? info : result, null);
  const firstCompressedBytes = sum(first, "compressedBytes");
  const firstUncompressedBytes = sum(first, "uncompressedBytes");
  const lastCompressedBytes = sum(last, "compressedBytes");
  const lastUncompressedBytes = sum(last, "uncompressedBytes");
  const compressed = firstCompressedBytes + lastCompressedBytes;
  const uncompressed = firstUncompressedBytes + lastUncompressedBytes;
  const shardCount = first.length + last.length;
  // Totals include the unchanged manifest on both sides; averages cover shards only.
  const totalCompressedBytes = compressed + manifestBytes;
  const totalUncompressedBytes = uncompressed + manifestBytes;
  const compressionRatio = totalUncompressedBytes === 0 ? 0 : totalCompressedBytes / totalUncompressedBytes;
  return {
    totalEntries: manifest.totalEntries, totalFiles: shardCount + 1,
    firstShards: first.length, lastShards: last.length, manifestBytes,
    totalCompressedBytes, totalUncompressedBytes, compressionRatio,
    spaceSavedPercentage: totalUncompressedBytes === 0 ? 0 : (1 - compressionRatio) * 100,
    firstCompressedBytes, firstUncompressedBytes, lastCompressedBytes, lastUncompressedBytes,
    averageCompressedShardBytes: shardCount ? Math.round(compressed / shardCount) : 0,
    averageUncompressedShardBytes: shardCount ? Math.round(uncompressed / shardCount) : 0,
    largestCompressedFirstShard: largest(first, "compressedBytes"),
    largestCompressedLastShard: largest(last, "compressedBytes"),
    largestUncompressedFirstShard: largest(first, "uncompressedBytes"),
    largestUncompressedLastShard: largest(last, "uncompressedBytes"),
  };
}

export async function buildGzipBrowserDictionary(
  dictionary: GeneratedDictionary,
  outputDirectory: string,
  sourceDictionary: string,
  generatedAt = new Date().toISOString(),
) {
  if (!Array.isArray(dictionary.entries)) throw new Error("Invalid generated dictionary.");
  const output = resolve(outputDirectory);
  await cleanBrowserDictionaryOutput(output);
  const firstCharShards = await writeGzipGroups(output, "first", groupEntriesBy(dictionary.entries, (entry) => entry.firstChar));
  const lastCharShards = await writeGzipGroups(output, "last", groupEntriesBy(dictionary.entries, (entry) => entry.lastChar));
  const manifest: GzipBrowserDictionaryManifest = {
    schemaVersion: GZIP_BROWSER_DICTIONARY_SCHEMA_VERSION, generatedAt, sourceDictionary,
    sourceMetadata: dictionary.metadata, totalEntries: dictionary.entries.length,
    firstCharShards, lastCharShards,
  };
  const json = JSON.stringify(manifest, null, 2);
  await writeFile(join(output, "manifest.json"), json);
  return { manifest, statistics: browserDictionaryCompressionStatistics(manifest, Buffer.byteLength(json)) };
}
