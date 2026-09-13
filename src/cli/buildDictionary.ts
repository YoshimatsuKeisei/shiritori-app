import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildDictionary } from "../dictionary/import/index.js";

interface Arguments { jmdictPath?: string; jmnedictPath?: string; outputPath: string }

function parseArguments(values: readonly string[]): Arguments {
  let jmdictPath: string | undefined;
  let jmnedictPath: string | undefined;
  let outputPath = "data/generated/dictionary.json";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if ((value === "--jmdict" || value === "--jmnedict" || value === "--out") && !next) {
      throw new Error(`${value} requires a file path.`);
    }
    if (value === "--jmdict") { jmdictPath = next; index += 1; }
    else if (value === "--jmnedict") { jmnedictPath = next; index += 1; }
    else if (value === "--out") { outputPath = next ?? outputPath; index += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return {
    ...(jmdictPath ? { jmdictPath: resolve(jmdictPath) } : {}),
    ...(jmnedictPath ? { jmnedictPath: resolve(jmnedictPath) } : {}),
    outputPath: resolve(outputPath),
  };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const dictionary = await buildDictionary(options);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(dictionary)}\n`, "utf8");
  const statistics = dictionary.metadata.statistics!;
  process.stdout.write([
    "Dictionary build complete",
    "",
    `Total entries: ${statistics.totalEntries}`,
    "",
    "By source:",
    `  JMdict: ${statistics.bySource.JMdict}`,
    `  JMnedict: ${statistics.bySource.JMnedict}`,
    "",
    "JMdict:",
    `  common nouns: ${statistics.jmdict.commonNouns}`,
    `  proverbs: ${statistics.jmdict.proverbs}`,
    "",
    `JMnedict total entries: ${statistics.bySource.JMnedict}`,
    "Category memberships:",
    ...Object.entries(statistics.jmnedict).map(([type, count]) => `  ${type}: ${count}`),
    "Note: entries may belong to multiple categories; membership totals may exceed the entry count.",
    "",
    `Output: ${options.outputPath}`,
    "",
  ].join("\n"));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
