import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { put } from "@vercel/blob";

import { normalizeBlobPrefix, uploadBrowserDictionary } from "./browserDictionaryBlobUpload.js";

function parsePrefix(values: readonly string[]): string {
  const index = values.indexOf("--prefix");
  if (index < 0 || !values[index + 1]) throw new Error("--prefix is required. Example: --prefix shiritori-dictionary-v1");
  if (values.length !== 2 || index !== 0) throw new Error("Only --prefix <version-prefix> is supported.");
  return normalizeBlobPrefix(values[index + 1]!);
}

async function main(): Promise<void> {
  const prefix = parsePrefix(process.argv.slice(2));
  try {
    const result = await uploadBrowserDictionary({
      rootDirectory: resolve("public/dictionary"), prefix, token: process.env.BLOB_READ_WRITE_TOKEN,
      upload: async (file, token) => put(file.pathname, await readFile(file.absolutePath), {
        access: "public", token, contentType: "application/json", addRandomSuffix: false,
        allowOverwrite: false, multipart: file.bytes >= 4_000_000,
      }),
      log: console.log,
    });
    console.log(`Uploaded: ${result.files} files`);
    console.log(`Total bytes: ${result.totalBytes}`);
    console.log(`Dictionary base URL:\n${result.baseUrl}`);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Upload failed. Prefix "${prefix}" may contain partial files; use a new version prefix before retrying.`);
    process.exitCode = 1;
  }
}

await main();
