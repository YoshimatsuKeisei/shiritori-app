import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecompressionStream as NodeDecompressionStream } from "node:stream/web";
import test from "node:test";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";

import { createWordEntry } from "../createWordEntry.js";
import type { DictionaryScope, GeneratedDictionary } from "../types.js";
import { decodeGzipDictionary } from "./decompress.js";
import { BrowserDictionaryLoader, type DictionaryFetch } from "./loader.js";
import { browserDictionaryCompressionStatistics, buildGzipBrowserDictionary, cleanBrowserDictionaryOutput, type GzipBrowserDictionaryManifest } from "./nodeBuildBrowserDictionary.js";

const dictionary: GeneratedDictionary = {
  metadata: { schemaVersion: 1, generatedAt: "2026-01-01", jmdictSource: "fixture.xml", jmnedictSource: "names.xml" },
  entries: [
    createWordEntry({ id: "common", source: "JMdict", reading: "スーパー", surface: "スーパー", partOfSpeech: ["n"] }),
    createWordEntry({ id: "small", source: "JMdict", reading: "きゃく", surface: "客", partOfSpeech: ["n"] }),
    createWordEntry({ id: "name", source: "JMnedict", reading: "とうきょう", surface: "東京", properNounType: "PERSON", properNounTypes: ["PERSON", "PLACE"], semanticTags: ["place", "surname"] }),
  ],
};
const scope: DictionaryScope = { commonNouns: true, proverbs: true, properNouns: true, people: false, places: true, organizations: false, works: false, products: false };
const arrayBuffer = (buffer: Uint8Array): ArrayBuffer => Uint8Array.from(buffer).buffer;
// Explicit Node Web Streams implementation, not an assumption about test globals.
// Node and lib.dom describe the same Web API with incompatible stream overloads.
const decode = (bytes: ArrayBuffer) => decodeGzipDictionary(bytes, NodeDecompressionStream as unknown as typeof DecompressionStream);

async function tempDirectory(t: test.TestContext) {
  const path = await mkdtemp(join(tmpdir(), "shiritori-gzip-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("generates only gzip shards with accurate metadata and deterministic UTF-8 contents", async (t) => {
  const root = await tempDirectory(t);
  const { manifest, statistics } = await buildGzipBrowserDictionary(dictionary, root, "fixture.json", "2026-01-01");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.totalEntries, dictionary.entries.length);
  assert.deepEqual(manifest.sourceMetadata, dictionary.metadata);
  let actualBytes = (await readFile(join(root, "manifest.json"))).byteLength;
  let actualUncompressedBytes = actualBytes;
  const originalBytes = new Map<string, Buffer>();
  for (const [direction, infos] of [["first", manifest.firstCharShards], ["last", manifest.lastCharShards]] as const) {
    assert.ok((await readdir(join(root, `by-${direction}`))).every((name) => name.endsWith(".json.gz")));
    for (const [character, info] of Object.entries(infos)) {
      const bytes = await readFile(join(root, info.path));
      originalBytes.set(info.path, bytes);
      const text = gunzipSync(bytes).toString("utf8");
      const expected = dictionary.entries.filter((entry) => (direction === "first" ? entry.firstChar : entry.lastChar) === character);
      assert.equal(text, JSON.stringify(expected));
      assert.equal(info.compression, "gzip");
      assert.ok(info.path.endsWith(".json.gz"));
      assert.equal(info.compressedBytes, bytes.byteLength);
      assert.equal(info.uncompressedBytes, Buffer.byteLength(text));
      assert.ok(info.compressedBytes > 0 && info.uncompressedBytes > 0);
      assert.equal(bytes.readUInt32LE(4), 0); // gzip MTIME is not the current wall clock.
      actualBytes += bytes.byteLength;
      actualUncompressedBytes += Buffer.byteLength(text);
    }
  }
  assert.equal(statistics.totalCompressedBytes, actualBytes);
  assert.equal(statistics.totalUncompressedBytes, actualUncompressedBytes);
  assert.equal(statistics.totalFiles, originalBytes.size + 1);
  await buildGzipBrowserDictionary(dictionary, root, "fixture.json", "2026-01-01");
  for (const [path, bytes] of originalBytes) assert.deepEqual(await readFile(join(root, path)), bytes);
});

test("round-trips generated gzip files through browser loader and multi-category repository", async (t) => {
  const root = await tempDirectory(t);
  await buildGzipBrowserDictionary(dictionary, root, "fixture.json");
  const calls: string[] = [];
  const fetcher: DictionaryFetch = async (url) => {
    calls.push(url);
    const bytes = await readFile(join(root, url.replace("https://fixture.test/dictionary/", "")));
    return { ok: true, json: async (): Promise<unknown> => JSON.parse(bytes.toString("utf8")), arrayBuffer: async () => arrayBuffer(bytes) };
  };
  for (const base of ["https://fixture.test/dictionary", "https://fixture.test/dictionary/"]) {
    const loader = new BrowserDictionaryLoader(base, fetcher, decode);
    for (const entry of dictionary.entries) {
      await loader.ensureFirstChar(entry.firstChar);
      assert.deepEqual(loader.repository.findByReading(entry.reading, scope)[0], entry);
    }
    await loader.ensureLastChar("う");
    assert.equal(loader.repository.findByReading("とうきょう", { ...scope, places: false }).length, 0);
  }
  assert.ok(calls.includes("https://fixture.test/dictionary/by-first/u3068.json.gz"));
  assert.ok(calls.every((url) => !url.includes("dictionary//")));
});

test("cleans stale json and gzip artifacts before regeneration", async (t) => {
  const root = await tempDirectory(t);
  await mkdir(join(root, "by-first"));
  await mkdir(join(root, "by-last"));
  await writeFile(join(root, "manifest.json"), "{}");
  await writeFile(join(root, "by-first/u0001.json"), "[]");
  await writeFile(join(root, "by-last/u0002.json.gz"), gzipSync("[]"));
  await buildGzipBrowserDictionary(dictionary, root, "fixture.json");
  await assert.rejects(readFile(join(root, "by-first/u0001.json")), /ENOENT/);
  await assert.rejects(readFile(join(root, "by-last/u0002.json.gz")), /ENOENT/);
});

test("clean preflight refuses foreign files, tracked files, and broad directories without deleting", async (t) => {
  const root = await tempDirectory(t);
  const output = join(root, "output");
  await mkdir(output);
  await writeFile(join(output, "manifest.json"), "{}");
  await writeFile(join(output, "README.md"), "keep");
  await assert.rejects(cleanBrowserDictionaryOutput(output), /non-generated/);
  assert.equal(await readFile(join(output, "manifest.json"), "utf8"), "{}");
  await rm(join(output, "README.md"));
  const exec = promisify(execFile);
  await exec("git", ["init", root]);
  await exec("git", ["-C", root, "add", "output/manifest.json"]);
  await assert.rejects(cleanBrowserDictionaryOutput(output), /Git-tracked/);
  assert.equal(await readFile(join(output, "manifest.json"), "utf8"), "{}");
  await assert.rejects(cleanBrowserDictionaryOutput(process.cwd()), /Unsafe/);
});

test("reports compressed and uncompressed maxima separately and guards empty statistics", () => {
  const info = (path: string, compressedBytes: number, uncompressedBytes: number) => ({ path, compression: "gzip" as const, entries: 1, compressedBytes, uncompressedBytes });
  const manifest: GzipBrowserDictionaryManifest = {
    schemaVersion: 2, generatedAt: "fixed", sourceDictionary: "fixture", sourceMetadata: dictionary.metadata, totalEntries: 2,
    firstCharShards: { a: info("a", 10, 100), b: info("b", 50, 80) },
    lastCharShards: { c: info("c", 20, 200), d: info("d", 50, 90) },
  };
  const stats = browserDictionaryCompressionStatistics(manifest, 10);
  assert.equal(stats.totalCompressedBytes, 140);
  assert.equal(stats.totalUncompressedBytes, 480);
  assert.equal(stats.compressionRatio, 140 / 480);
  assert.equal(stats.spaceSavedPercentage, (1 - 140 / 480) * 100);
  assert.equal(stats.largestCompressedFirstShard?.character, "b");
  assert.equal(stats.largestUncompressedFirstShard?.character, "a");
  assert.equal(stats.largestCompressedLastShard?.character, "d");
  assert.equal(stats.largestUncompressedLastShard?.character, "c");
  const empty = browserDictionaryCompressionStatistics({ ...manifest, totalEntries: 0, firstCharShards: {}, lastCharShards: {} }, 0);
  assert.equal(empty.compressionRatio, 0);
  assert.equal(empty.averageCompressedShardBytes, 0);
  assert.equal(empty.averageUncompressedShardBytes, 0);
  assert.equal(empty.largestCompressedFirstShard, null);
});

function loaderWithGzip(payload: () => { ok: boolean; bytes: Uint8Array }, decoder = decode) {
  return new BrowserDictionaryLoader("/dictionary", async (url) => {
    if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ totalEntries: 3, firstCharShards: { "と": { path: "by-first/u3068.json.gz", compression: "gzip" } }, lastCharShards: {} }) };
    const { ok, bytes } = payload();
    return { ok, json: async () => { throw new Error("gzip must not use response.json()"); }, arrayBuffer: async () => arrayBuffer(bytes) };
  }, decoder);
}

test("gzip cache covers both concurrent fetch and decompression", async () => {
  let fetches = 0;
  let decodes = 0;
  const loader = loaderWithGzip(() => { fetches += 1; return { ok: true, bytes: gzipSync(JSON.stringify(dictionary.entries)) }; }, async (bytes) => { decodes += 1; await Promise.resolve(); return decode(bytes); });
  await Promise.all([loader.ensureFirstChar("と"), loader.ensureFirstChar("と")]);
  assert.equal(fetches, 1);
  assert.equal(decodes, 1);
});

for (const [label, ok, bytes, message] of [
  ["HTTP", false, new Uint8Array(), /HTTP fetch failure/],
  ["corrupt gzip", true, new Uint8Array([1, 2, 3]), /gzip decompression failure/],
  ["invalid JSON", true, gzipSync("{bad json"), /JSON parse failure/],
] as const) {
  test(`rejects ${label} and retries the shard without retaining a rejected promise`, async () => {
    let attempts = 0;
    const loader = loaderWithGzip(() => ++attempts === 1 ? { ok, bytes } : { ok: true, bytes: gzipSync(JSON.stringify(dictionary.entries)) });
    await assert.rejects(loader.ensureFirstChar("と"), message);
    assert.equal(loader.getShardState("first", "と"), "UNLOADED");
    assert.equal(loader.repository.findByReading("とうきょう").length, 0);
    await loader.ensureFirstChar("と");
    assert.equal(loader.repository.findByReading("とうきょう", scope).length, 1);
    assert.equal(attempts, 2);
  });
}

test("reports unsupported browser decompression without adding a fallback library", async () => {
  await assert.rejects(decodeGzipDictionary(arrayBuffer(gzipSync("[]")), null), /This browser does not support gzip dictionary decompression/);
});
