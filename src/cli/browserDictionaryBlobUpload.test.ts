import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dictionaryBaseUrlFromManifestUrl, enumerateBrowserDictionaryUploadFiles, normalizeBlobPrefix, uploadBrowserDictionary } from "./browserDictionaryBlobUpload.js";

async function fixture(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "shiritori-blob-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "by-first")); await mkdir(join(root, "by-last"));
  await writeFile(join(root, "by-first", "u307f.json"), "[]");
  await writeFile(join(root, "by-last", "u3093.json"), "[]");
  await writeFile(join(root, "manifest.json"), JSON.stringify({ totalEntries: 0, firstCharShards: {}, lastCharShards: {} }));
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
