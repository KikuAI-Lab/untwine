import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyze as canonicalAnalyze, repair as canonicalRepair } from "../src/index.js";

const runtimePath = process.argv[2];
assert.ok(runtimePath, "Pass the generated engine-runtime.js path.");

delete globalThis.UntwineEngine;
await import(pathToFileURL(path.resolve(runtimePath)).href);

const runtime = globalThis.UntwineEngine;
assert.equal(typeof runtime?.analyze, "function", "Generated runtime must expose analyze().");
assert.equal(typeof runtime?.repair, "function", "Generated runtime must expose repair().");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const corpusRoot = path.resolve(scriptDirectory, "../test/articulate-xliff-corpus");
const manifest = JSON.parse(await readFile(path.join(corpusRoot, "proof-corpus/manifest.json"), "utf8"));

function virtualFile(name, text) {
  return {
    name,
    async text() {
      return text;
    }
  };
}

async function inputPair(item) {
  const originalRelative = item.original || manifest.defaultOriginal;
  const translatedRelative = item.translated;
  const originalText = await readFile(path.join(corpusRoot, originalRelative), "utf8");
  const translatedBase = await readFile(path.join(corpusRoot, translatedRelative), "utf8");
  const translatedText = item.prependBom ? `\uFEFF${translatedBase}` : translatedBase;
  const originalName = item.original ? path.basename(item.original) : "valid-original.xlf";
  const translatedName = item.translatedFileName || path.basename(item.translated);

  return [
    virtualFile(originalName, originalText),
    virtualFile(translatedName, translatedText)
  ];
}

for (const item of manifest.cases) {
  const canonicalPreview = await canonicalAnalyze(await inputPair(item));
  const runtimePreview = await runtime.analyze(await inputPair(item));
  assert.deepEqual(runtimePreview, canonicalPreview, `${item.id}: runtime analyze parity`);

  const canonicalRepairResult = await canonicalRepair(await inputPair(item));
  const runtimeRepairResult = await runtime.repair(await inputPair(item));
  assert.deepEqual(runtimeRepairResult, canonicalRepairResult, `${item.id}: runtime repair parity`);
}

console.log(`Verified generated Mac engine parity across ${manifest.cases.length} proof cases.`);
