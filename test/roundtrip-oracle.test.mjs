import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze, repair } from "../src/index.js";
import {
  attr,
  childElement,
  elementsByLocalName,
  inlineSignature,
  parseXml,
  textContent
} from "../src/xml.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = path.join(root, "test/articulate-xliff-corpus");

async function readCorpus(relativePath) {
  return readFile(path.join(corpusRoot, relativePath), "utf8");
}

function virtualFile(name, text) {
  return {
    name,
    async text() {
      return text;
    }
  };
}

function targetProfiles(xmlText) {
  const document = parseXml(xmlText);
  return elementsByLocalName(document.documentElement, "trans-unit").map((unit) => {
    const target = childElement(unit, "target");
    return {
      text: target ? textContent(target) : "",
      inlineSignature: target ? inlineSignature(target) : []
    };
  });
}

function transUnitIds(xmlText) {
  const document = parseXml(xmlText);
  return elementsByLocalName(document.documentElement, "trans-unit").map((unit) => attr(unit, "id"));
}

test("safe repair roundtrip preserves target text and inline signatures", async () => {
  const manifest = JSON.parse(await readCorpus("proof-corpus/manifest.json"));
  const originalText = await readCorpus(manifest.defaultOriginal);
  const originalIds = transUnitIds(originalText);
  const safeCases = manifest.cases.filter((item) => item.expected.repairability === "repairable");

  assert.ok(safeCases.length > 0);

  for (const item of safeCases) {
    const translatedBase = await readCorpus(item.translated);
    const translatedText = item.prependBom ? `\uFEFF${translatedBase}` : translatedBase;
    const translatedName = item.translatedFileName || path.basename(item.translated);
    const beforeTargets = targetProfiles(translatedText);

    const repairResult = await repair([
      virtualFile("valid-original.xlf", originalText),
      virtualFile(translatedName, translatedText)
    ]);

    assert.equal(repairResult.ok, true, `${item.id}: repair succeeds`);
    assert.deepEqual(targetProfiles(repairResult.text), beforeTargets, `${item.id}: target payload preserved`);
    assert.deepEqual(transUnitIds(repairResult.text), originalIds, `${item.id}: original ids restored`);

    const repairedPreview = await analyze([
      virtualFile("valid-original.xlf", originalText),
      virtualFile(translatedName, repairResult.text)
    ]);
    assert.equal(repairedPreview.summary.criticalIssues, 0, `${item.id}: repaired pair has no critical issues`);
  }
});
