import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dictionaryBaseUrlFromManifestUrl, dictionaryBlobPutOptions, enumerateBrowserDictionaryUploadFiles, normalizeBlobPrefix, uploadBrowserDictionary } from "./browserDictionaryBlobUpload.js";
import { buildGzipBrowserDictionary } from "../dictionary/browser/nodeBuildBrowserDictionary.js";
import { createWordEntry } from "../dictionary/createWordEntry.js";

async function fixture(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "shiritori-blob-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "by-first")); await mkdir(join(root, "by-last"));
  await writeFile(join(root, "by-first", "u307f.json"), "[]");
  await writeFile(join(root, "by-last", "u3093.json"), "[]");
  await writeFile(join(root, "manifest.json"), JSON.stringify({ totalEntries: 0, firstCharShards: { "み": { path: "by-first/u307f.json", entries: 0, bytes: 2 } }, lastCharShards: { "ん": { path: "by-last/u3093.json", entries: 0, bytes: 2 } } }));
  return root;
}

test("enumerates only the dictionary tree with deterministic POSIX Blob pathnames", async (t) => {
  const files = await enumerateBrowserDictionaryUploadFiles(await fixture(t), "/shiritori-dictionary-v1/");
  assert.deepEqual(files.map((file) => file.relativePath.replaceAll("\\", "/")), ["by-first/u307f.json", "by-last/u3093.json", "manifest.json"]);
  assert.deepEqual(files.map((file) => file.pathname), ["shiritori-dictionary-v1/by-first/u307f.json", "shiritori-dictionary-v1/by-last/u3093.json", "shiritori-dictionary-v1/manifest.json"]);
});

test("limits concurrent shard uploads and publishes manifest last", async (t) => {
  const order: string[] = []; let active = 0; let maximum = 0;
  const result = await uploadBrowserDictionary({ rootDirectory: await fixture(t), prefix: "shiritori-dictionary-v1", token: "secret-for-test", concurrency: 2, upload: async (file) => {
    active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); order.push(file.pathname); active -= 1;
    return { url: `https://store.public.blob.vercel-storage.com/${file.pathname}` };
  } });
  assert.ok(maximum <= 2);
  assert.equal(order.at(-1), "shiritori-dictionary-v1/manifest.json");
  assert.equal(result.baseUrl, "https://store.public.blob.vercel-storage.com/shiritori-dictionary-v1");
  assert.equal(result.files, 3);
});

test("fails clearly for a missing token or incomplete dictionary", async (t) => {
  await assert.rejects(uploadBrowserDictionary({ rootDirectory: "missing", prefix: "v1", token: undefined, upload: async () => ({ url: "" }) }), /BLOB_READ_WRITE_TOKEN is required/);
  const empty = await mkdtemp(join(tmpdir(), "shiritori-empty-")); t.after(() => rm(empty, { recursive: true, force: true }));
  await assert.rejects(enumerateBrowserDictionaryUploadFiles(empty, "v1"), /Run npm run dictionary:browser first/);
});

test("derives the public base URL from the uploaded manifest rather than a hardcoded host", () => {
  assert.equal(dictionaryBaseUrlFromManifestUrl("https://example.test/custom/v2/manifest.json"), "https://example.test/custom/v2");
  assert.throws(() => dictionaryBaseUrlFromManifestUrl("https://example.test/custom/v2/other.json"));
  assert.throws(() => normalizeBlobPrefix(""), /--prefix/);
  assert.throws(() => normalizeBlobPrefix("../v2"), /--prefix/);
});

async function gzipFixture(t: test.TestContext) {
  const root = await fixture(t);
  await buildGzipBrowserDictionary({ metadata: { schemaVersion: 1, generatedAt: "fixed" }, entries: [createWordEntry({ id: "test", source: "JMdict", reading: "りす", surface: "栗鼠", partOfSpeech: ["n"] })] }, root, "fixture.json");
  return root;
}

test("uploads gzip with the right MIME, stored byte counts, immutable options, and manifest last", async (t) => {
  const root = await gzipFixture(t);
  const order: string[] = [];
  let uploadedBytes = 0;
  const result = await uploadBrowserDictionary({ rootDirectory: root, prefix: "dictionaries/full-v1", token: "test-token", upload: async (file, token) => {
    const options = dictionaryBlobPutOptions(file, token);
    assert.equal(options.contentType, file.isManifest ? "application/json" : "application/gzip");
    assert.equal(options.access, "public");
    assert.equal(options.addRandomSuffix, false);
    assert.equal(options.allowOverwrite, false);
    assert.equal("contentEncoding" in options, false);
    assert.equal(options.multipart, false);
    assert.equal(dictionaryBlobPutOptions({ ...file, bytes: 4_000_000 }, token).multipart, true);
    assert.equal(dictionaryBlobPutOptions({ ...file, bytes: 3_999_999 }, token).multipart, false);
    assert.equal(file.bytes, (await readFile(file.absolutePath)).byteLength);
    uploadedBytes += file.bytes;
    order.push(file.pathname);
    return { url: `https://example.test/${file.pathname}` };
  } });
  assert.equal(result.totalBytes, uploadedBytes);
  assert.equal(result.files, 3);
  assert.ok(order.slice(0, -1).every((path) => path.endsWith(".json.gz")));
  assert.equal(order.at(-1), "dictionaries/full-v1/manifest.json");
});

test("refuses missing referenced shards before any upload", async (t) => {
  const root = await gzipFixture(t);
  await rm(join(root, "by-first/u308a.json.gz"));
  let uploads = 0;
  await assert.rejects(uploadBrowserDictionary({ rootDirectory: root, prefix: "full-v1", token: "test", upload: async () => { uploads += 1; return { url: "" }; } }), /Referenced dictionary shard is missing/);
  assert.equal(uploads, 0);
});

test("rejects stale json mixed with gzip and manifest path or byte mismatches", async (t) => {
  const root = await gzipFixture(t);
  const stale = join(root, "by-first/u308a.json");
  await writeFile(stale, "[]");
  await assert.rejects(enumerateBrowserDictionaryUploadFiles(root, "v1"), /Unreferenced dictionary file/);
  await rm(stale);
  await writeFile(join(root, "by-first/u308a.json.gz"), "broken");
  await assert.rejects(enumerateBrowserDictionaryUploadFiles(root, "v1"), /compressed size mismatch/);
  await writeFile(join(root, "manifest.json"), JSON.stringify({ totalEntries: 0, firstCharShards: { "り": { path: "../outside.json.gz", compression: "gzip" } }, lastCharShards: {} }));
  await assert.rejects(enumerateBrowserDictionaryUploadFiles(root, "v1"), /path\/compression mismatch/);
});

test("does not publish a manifest when a gzip shard upload fails", async (t) => {
  const root = await gzipFixture(t);
  let manifestUploaded = false;
  await assert.rejects(uploadBrowserDictionary({ rootDirectory: root, prefix: "v1", token: "test", upload: async (file) => {
    if (file.isManifest) manifestUploaded = true;
    throw new Error("mock upload failure");
  } }), /mock upload failure/);
  assert.equal(manifestUploaded, false);
});
