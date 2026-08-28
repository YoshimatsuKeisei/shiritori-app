import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import type { BrowserDictionaryManifest } from "../dictionary/browser/types.js";

export interface BrowserDictionaryUploadFile {
  absolutePath: string;
  relativePath: string;
  pathname: string;
  bytes: number;
  isManifest: boolean;
}

export interface BlobUploadResult { url: string }
export type BlobUploadFunction = (file: BrowserDictionaryUploadFile, token: string) => Promise<BlobUploadResult>;

export function normalizeBlobPrefix(value: string): string {
  const prefix = value.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").some((segment) => !segment || segment === "." || segment === "..") || prefix.includes("\\")) {
    throw new Error("--prefix must be a non-empty, safe Blob pathname prefix.");
  }
  return prefix;
}

export function toBlobPathname(prefix: string, relativePath: string): string {
  return `${normalizeBlobPrefix(prefix)}/${relativePath.split(sep).join("/").replace(/^\/+/, "")}`;
}

export function dictionaryBaseUrlFromManifestUrl(manifestUrl: string): string {
  const suffix = "/manifest.json";
  if (!manifestUrl.endsWith(suffix)) throw new Error("Uploaded manifest URL has an unexpected pathname.");
  return manifestUrl.slice(0, -suffix.length);
}

async function collectFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await collectFiles(path));
    else if (item.isFile()) result.push(path);
  }
  return result;
}

function validateManifest(value: unknown): asserts value is BrowserDictionaryManifest {
  if (!value || typeof value !== "object" || !("totalEntries" in value) || !("firstCharShards" in value) || !("lastCharShards" in value)) {
    throw new Error("Browser dictionary manifest is invalid.");
  }
}

export async function enumerateBrowserDictionaryUploadFiles(rootDirectory: string, prefixValue: string): Promise<BrowserDictionaryUploadFile[]> {
  const root = resolve(rootDirectory);
  const prefix = normalizeBlobPrefix(prefixValue);
  const manifestPath = join(root, "manifest.json");
  const firstDirectory = join(root, "by-first");
  const lastDirectory = join(root, "by-last");
  try {
    if (!(await stat(manifestPath)).isFile() || !(await stat(firstDirectory)).isDirectory() || !(await stat(lastDirectory)).isDirectory()) throw new Error();
  } catch {
    throw new Error("Browser dictionary not found. Run npm run dictionary:browser first.");
  }
  let manifest: unknown;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { throw new Error("Browser dictionary manifest is invalid."); }
  validateManifest(manifest);
  const files = await collectFiles(root);
  const described = await Promise.all(files.map(async (absolutePath) => {
    const relativePath = relative(root, absolutePath);
    return { absolutePath, relativePath, pathname: toBlobPathname(prefix, relativePath), bytes: (await stat(absolutePath)).size, isManifest: relativePath.split(sep).join("/") === "manifest.json" };
  }));
  return described.sort((left, right) => Number(left.isManifest) - Number(right.isManifest) || left.relativePath.localeCompare(right.relativePath));
}

async function uploadWithConcurrency(files: readonly BrowserDictionaryUploadFile[], concurrency: number, upload: BlobUploadFunction, token: string, onUploaded: (file: BrowserDictionaryUploadFile) => void): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++]!;
      await upload(file, token);
      onUploaded(file);
    }
  }));
}

export interface UploadBrowserDictionaryOptions {
  rootDirectory: string;
  prefix: string;
  token: string | undefined;
  upload: BlobUploadFunction;
  concurrency?: number;
  log?: (message: string) => void;
}

export async function uploadBrowserDictionary(options: UploadBrowserDictionaryOptions): Promise<{ files: number; totalBytes: number; baseUrl: string }> {
  if (!options.token) throw new Error("BLOB_READ_WRITE_TOKEN is required.");
  const files = await enumerateBrowserDictionaryUploadFiles(options.rootDirectory, options.prefix);
  const manifest = files.find((file) => file.isManifest);
  if (!manifest) throw new Error("Browser dictionary manifest is missing.");
  const shards = files.filter((file) => !file.isManifest);
  const log = options.log ?? (() => undefined);
  let completed = 0;
  const progress = (file: BrowserDictionaryUploadFile) => { completed += 1; log(`[${completed}/${files.length}] ${file.relativePath.split(sep).join("/")}`); };
  await uploadWithConcurrency(shards, options.concurrency ?? 4, options.upload, options.token, progress);
  const manifestResult = await options.upload(manifest, options.token);
  progress(manifest);
  return { files: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), baseUrl: dictionaryBaseUrlFromManifestUrl(manifestResult.url) };
}
