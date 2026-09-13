import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { buildGzipBrowserDictionary } from "../dictionary/browser/nodeBuildBrowserDictionary.js";
import type { GeneratedDictionary } from "../dictionary/types.js";

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

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const input = resolve(options.inputPath);
  const output = resolve(options.outputDirectory);
  const dictionary = JSON.parse(await readFile(input, "utf8")) as GeneratedDictionary;
  const result = await buildGzipBrowserDictionary(dictionary, output, basename(input));
  console.log(JSON.stringify(result.statistics, null, 2));
  console.log("gzip reduces transfer/storage bytes; expanded JSON and parsed object memory are unchanged.");
}

await main();
