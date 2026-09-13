export type GzipDictionaryDecoder = (bytes: ArrayBuffer) => Promise<unknown>;

/** The server supplies raw gzip files, not JSON decoded via HTTP Content-Encoding. */
export async function decodeGzipDictionary(
  bytes: ArrayBuffer,
  Decompressor: typeof DecompressionStream | null = globalThis.DecompressionStream ?? null,
): Promise<unknown> {
  if (!Decompressor) {
    throw new Error("This browser does not support gzip dictionary decompression.");
  }
  let text: string;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new Decompressor("gzip"));
    text = await new Response(stream).text();
  } catch (cause: unknown) {
    throw new Error("Dictionary gzip decompression failure.", { cause });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause: unknown) {
    throw new Error("Dictionary JSON parse failure after gzip decompression.", { cause });
  }
}
