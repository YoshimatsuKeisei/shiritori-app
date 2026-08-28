import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", apos: "'", gt: ">", lt: "<", quot: "\"",
};

export function decodeXmlText(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&([a-zA-Z0-9_-]+);/gi, (match, numeric: string | undefined, named: string | undefined) => {
    if (numeric) {
      const radix = numeric.startsWith("x") ? 16 : 10;
      return String.fromCodePoint(Number.parseInt(numeric.replace(/^x/, ""), radix));
    }
    return named && XML_ENTITIES[named] !== undefined ? XML_ENTITIES[named] : match;
  }).trim();
}

export function extractTagValues(xml: string, tag: string): string[] {
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
  return Array.from(xml.matchAll(expression), (match) => decodeXmlText(match[1] ?? ""));
}

export function extractBlocks(xml: string, tag: string): string[] {
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "g");
  return Array.from(xml.matchAll(expression), (match) => match[0]);
}

export function extractEntityCode(value: string): string {
  return /^&([a-zA-Z0-9_-]+);$/.exec(value)?.[1] ?? value;
}

export async function* streamXmlEntries(stream: AsyncIterable<Uint8Array | string>): AsyncGenerator<string> {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    while (true) {
      const start = buffer.indexOf("<entry>");
      if (start < 0) {
        if (buffer.length > 64) buffer = buffer.slice(-64);
        break;
      }
      const end = buffer.indexOf("</entry>", start);
      if (end < 0) {
        if (start > 0) buffer = buffer.slice(start);
        break;
      }
      const boundary = end + "</entry>".length;
      yield buffer.slice(start, boundary);
      buffer = buffer.slice(boundary);
    }
  }
  buffer += decoder.end();
  if (buffer.includes("<entry>")) throw new Error("Dictionary XML ended inside an <entry> element.");
}

export function openDictionaryXml(path: string): Readable {
  const input = createReadStream(path);
  return path.toLowerCase().endsWith(".gz") ? input.pipe(createGunzip()) : input;
}
