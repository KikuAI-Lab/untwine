#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyze, repair } from "../src/index.js";

const USAGE = `Usage:
  articulate-xliff-doctor analyze <original.xlf> <translated.xlf> [--json]
  articulate-xliff-doctor repair <original.xlf> <translated.xlf> --out <repaired.xlf>

Examples:
  articulate-xliff-doctor analyze original.xlf translated.xlf
  articulate-xliff-doctor analyze original.xlf translated.xlf --json
  articulate-xliff-doctor repair original.xlf translated.xlf --out translated.repaired.xlf`;

async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    return 0;
  }

  if (command !== "analyze" && command !== "repair") {
    console.error(`Unknown command: ${command}`);
    console.error(USAGE);
    return 1;
  }

  const parsed = parseArgs(args);
  const { json, outPath, positional } = parsed;

  if (positional.length !== 2) {
    console.error("Expected exactly two files: original XLIFF and translated XLIFF.");
    console.error(USAGE);
    return 1;
  }

  if (command === "repair" && !outPath) {
    console.error("Repair requires --out <repaired.xlf>.");
    console.error(USAGE);
    return 1;
  }

  const files = await Promise.all(positional.map(fileFromPath));

  if (command === "analyze") {
    const result = await analyze(files);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 2;
    }
    printHumanAnalysis(result);
    return result.ok ? 0 : 2;
  }

  const result = await repair(files);
  if (!result.ok) {
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Repair blocked: ${result.reason}`);
      printHumanAnalysis(result.preview);
    }
    return 2;
  }

  await writeFile(outPath, result.text, "utf8");
  if (json) {
    console.log(JSON.stringify({ ...result, output: outPath, text: undefined }, null, 2));
  } else {
    console.log(`Wrote repaired XLIFF: ${outPath}`);
    console.log(`Critical issues after repair: ${result.report.after.criticalIssues}`);
  }
  return 0;
}

function parseArgs(args) {
  const positional = [];
  let json = false;
  let outPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--out") {
      outPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    positional.push(item);
  }

  return { json, outPath, positional };
}

async function fileFromPath(filePath) {
  const text = await readFile(filePath, "utf8");
  return {
    name: path.basename(filePath),
    async text() {
      return text;
    }
  };
}

function printHumanAnalysis(result) {
  console.log(`Verdict: ${result.repairability.verdict}`);
  console.log(`Critical issues: ${result.summary.criticalIssues}`);
  console.log(`Total issues: ${result.summary.totalIssues}`);

  if (result.unsupported.unsupported) {
    console.log(`Unsupported: ${result.unsupported.code}`);
  }

  if (!result.issues.length) {
    console.log("No import-blocking issues found.");
    return;
  }

  console.log("");
  console.log("Issues:");
  for (const item of result.issues) {
    const safe = item.safe ? " safe-repair" : "";
    const role = item.role ? ` ${item.role}` : "";
    console.log(`- [${item.severity}]${role} ${item.category}${safe}: ${item.message}`);
  }
}

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
