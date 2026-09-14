import assert from "node:assert/strict";
import { DecompressionStream as NodeDecompressionStream } from "node:stream/web";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { createWordEntry } from "../createWordEntry.js";
import type { WordEntry } from "../types.js";
import { decodeGzipDictionary } from "./decompress.js";
import { BrowserDictionaryLoader, type DictionaryFetch } from "./loader.js";
import { dictionaryMetricsOptions, type DictionaryTimingEvent, type DictionaryTimingOptions } from "./timing.js";
import type { BrowserDictionaryManifest, BrowserDictionaryShardInfo } from "./types.js";

const first = createWordEntry({ id: "first", source: "JMdict", reading: "しりとり", surface: "しりとり" });
const second = createWordEntry({ id: "second", source: "JMnedict", reading: "りす", surface: "理須", properNounTypes: ["PERSON", "PLACE"] });
const decode = (bytes: ArrayBuffer) => decodeGzipDictionary(bytes, NodeDecompressionStream as unknown as typeof DecompressionStream);

function fixture(gzip: boolean, timing: DictionaryTimingOptions = {}) {
  const calls: string[] = [];
  const payloads = new Map<string, unknown>();
  const info = (path: string, entries: WordEntry[]): BrowserDictionaryShardInfo => {
    payloads.set(`/fixture/${path}`, entries);
    const text = JSON.stringify(entries);
    return gzip
      ? { path, entries: entries.length, compression: "gzip", compressedBytes: gzipSync(text).byteLength, uncompressedBytes: Buffer.byteLength(text) }
      : { path, entries: entries.length, bytes: Buffer.byteLength(text) };
  };
  const extension = gzip ? ".json.gz" : ".json";
  const manifest: BrowserDictionaryManifest = {
    schemaVersion: gzip ? 2 : 1, generatedAt: "fixed", sourceDictionary: "fixture",
    sourceMetadata: { schemaVersion: 1, generatedAt: "fixed" }, totalEntries: 2,
    firstCharShards: { "し": info(`first-a${extension}`, [first]), "り": info(`first-b${extension}`, [second]) },
    lastCharShards: { "り": info(`last-a${extension}`, [first]) },
  };
  const fetcher: DictionaryFetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/manifest.json")) return { ok: true, json: async () => manifest };
    assert.ok(payloads.has(url));
    return {
      ok: true,
      json: async () => { assert.equal(gzip, false); return payloads.get(url); },
      arrayBuffer: async () => Uint8Array.from(gzipSync(JSON.stringify(payloads.get(url)))).buffer,
    };
  };
  const loader = new BrowserDictionaryLoader("/fixture", fetcher, decode, timing);
  return { loader, calls, payloads, manifest };
}

for (const gzip of [false, true]) {
  test(`${gzip ? "schema 2 gzip" : "legacy JSON"} loads incrementally with stable repository identity and first/last dedup`, async () => {
    const { loader, calls, manifest } = fixture(gzip);
    const repository = loader.repository;
    assert.equal(repository.size, 0);
    assert.equal((await loader.loadManifest()).schemaVersion, gzip ? 2 : 1);
    await Promise.all([loader.ensureFirstChar("し"), loader.ensureFirstChar("し")]);
    assert.equal(loader.repository, repository);
    assert.deepEqual(repository.findByReading("しりとり"), [first]);
    assert.deepEqual(repository.findByReading("りす"), []);
    await loader.ensureFirstChar("り");
    assert.equal(loader.repository, repository);
    assert.deepEqual(repository.searchWords({}), [first, second]);
    await loader.ensureLastChar("り");
    assert.equal(loader.repository, repository);
    assert.equal(repository.size, 2);
    assert.equal(repository.countWords({ endsWith: "り" }), 1);
    assert.deepEqual(repository.findByReading("りす")[0]?.properNounTypes, ["PERSON", "PLACE"]);
    assert.equal(calls.filter((url) => url.endsWith(manifest.firstCharShards["し"]!.path)).length, 1);
    assert.equal(calls.filter((url) => url.endsWith("manifest.json")).length, 1);
    assert.equal(loader.getShardState("first", "し"), "LOADED");
  });
}

test("fake clock reports gzip phases in completion order with metadata and incremental counts", async () => {
  let tick = 0;
  const events: DictionaryTimingEvent[] = [];
  const { loader, manifest } = fixture(true, { now: () => tick++, onTiming: (event) => events.push(event) });
  await loader.ensureFirstChar("し");
  assert.deepEqual(events.map((event) => event.phase), ["manifest", "shard-fetch", "shard-body-read", "gzip-decode-and-parse", "repository-index", "shard-total"]);
  assert.deepEqual(events.map((event) => event.durationMs), [1, 1, 1, 1, 1, 9]);
  assert.ok(events.every((event) => event.status === "success"));
  const info = manifest.firstCharShards["し"]!;
  assert.equal(info.compression, "gzip");
  if (info.compression !== "gzip") throw new Error("Expected gzip fixture");
  assert.deepEqual(events[4], {
    phase: "repository-index", durationMs: 1, status: "success", direction: "first", character: "し",
    entries: 1, addedEntries: 1, duplicateEntries: 0, compressedBytes: info.compressedBytes, uncompressedBytes: info.uncompressedBytes,
  });
  const firstEventCount = events.length;
  await loader.ensureFirstChar("し");
  assert.equal(events.length, firstEventCount); // Cached fetches and indexes emit nothing.
  await loader.ensureLastChar("り");
  const duplicateEvent = events.filter((event) => event.phase === "repository-index").at(-1)!;
  assert.equal(duplicateEvent.addedEntries, 0);
  assert.equal(duplicateEvent.duplicateEntries, 1);
  assert.equal(duplicateEvent.entries, 1);
  assert.equal(duplicateEvent.direction, "last");
  assert.equal(loader.repository.size, 1);
});

test("legacy JSON timing treats response.json as body read and parse without a gzip phase", async () => {
  const events: DictionaryTimingEvent[] = [];
  const { loader } = fixture(false, { now: () => 0, onTiming: (event) => events.push(event) });
  await loader.ensureFirstChar("し");
  assert.deepEqual(events.map((event) => event.phase), ["manifest", "shard-fetch", "shard-body-read", "repository-index", "shard-total"]);
  assert.equal(events.at(-1)?.addedEntries, 1);
});

test("index validation failure is atomic, clears failed promise, and retries overlaps safely", async () => {
  const events: DictionaryTimingEvent[] = [];
  const { loader, payloads, manifest } = fixture(true, { now: () => 0, onTiming: (event) => events.push(event) });
  const repository = loader.repository;
  await loader.ensureFirstChar("し");
  const path = `/fixture/${manifest.firstCharShards["り"]!.path}`;
  payloads.set(path, [first, second, { id: "invalid" }]);
  await assert.rejects(loader.ensureFirstChar("り"), /Invalid dictionary entry/);
  assert.equal(loader.getShardState("first", "り"), "UNLOADED");
  assert.equal(repository.size, 1);
  assert.deepEqual(repository.searchWords({}), [first]);
  assert.deepEqual(events.slice(-2).map(({ phase, status }) => ({ phase, status })), [
    { phase: "repository-index", status: "error" }, { phase: "shard-total", status: "error" },
  ]);
  payloads.set(path, [first, second]);
  await loader.ensureFirstChar("り");
  assert.equal(loader.repository, repository);
  assert.deepEqual(repository.searchWords({}), [first, second]);
  assert.equal(loader.getShardState("first", "り"), "LOADED");
  assert.equal(events.at(-1)?.addedEntries, 1);
  assert.equal(events.at(-1)?.duplicateEntries, 1);
});

test("body download failure remains retryable and reports a failed body phase", async () => {
  const events: DictionaryTimingEvent[] = [];
  const { manifest } = fixture(true);
  let attempts = 0;
  const loader = new BrowserDictionaryLoader("/fixture", async (url) => ({
    ok: true,
    json: async () => { assert.ok(url.endsWith("manifest.json")); return manifest; },
    arrayBuffer: async () => {
      if (++attempts === 1) throw new Error("broken body");
      return Uint8Array.from(gzipSync(JSON.stringify([first]))).buffer;
    },
  }), decode, { now: () => 0, onTiming: (event) => events.push(event) });
  await assert.rejects(loader.ensureFirstChar("し"), /HTTP body read failure/);
  assert.equal(loader.repository.size, 0);
  assert.equal(loader.getShardState("first", "し"), "UNLOADED");
  assert.ok(events.some((event) => event.phase === "shard-body-read" && event.status === "error"));
  await loader.ensureFirstChar("し");
  assert.equal(loader.repository.size, 1);
});

test("disabled metrics never read the injected clock", async () => {
  const { loader } = fixture(true, { now: () => { throw new Error("Clock must not run"); } });
  await loader.ensureFirstChar("し");
  assert.equal(loader.repository.size, 1);
});

test("throwing timing callbacks cannot break manifest, index, load state, or cache", async () => {
  const { loader, calls } = fixture(true, { onTiming: () => { throw new Error("Logging failed"); } });
  await loader.ensureFirstChar("し");
  await loader.ensureFirstChar("し");
  assert.equal(loader.repository.size, 1);
  assert.equal(loader.getShardState("first", "し"), "LOADED");
  assert.equal(calls.length, 2);
});

test("dictionaryMetrics logs only with explicit query opt-in and works without window", () => {
  const logged: DictionaryTimingEvent[] = [];
  const log = (event: DictionaryTimingEvent) => logged.push(event);
  for (const search of ["", "?dictionaryMetrics=0", "?dictionaryMetrics=true", "?other=1"]) {
    assert.deepEqual(dictionaryMetricsOptions(search, log), {});
  }
  assert.equal(logged.length, 0);
  const event: DictionaryTimingEvent = { phase: "manifest", durationMs: 1, status: "success" };
  dictionaryMetricsOptions("?dictionaryMetrics=1", log).onTiming?.(event);
  assert.deepEqual(logged, [event]);
});
