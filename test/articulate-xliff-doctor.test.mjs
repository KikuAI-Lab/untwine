import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze, repair } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = path.join(root, "test/articulate-xliff-corpus");
const cliPath = path.join(root, "bin/articulate-xliff-doctor.js");

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

function sortedCategories(preview) {
  return [...new Set(preview.issues.map((issue) => issue.category))].sort();
}

test("runs the analyzer and repair flow across the public proof corpus", async () => {
  const manifest = JSON.parse(await readCorpus("proof-corpus/manifest.json"));

  for (const item of manifest.cases) {
    const originalText = await readCorpus(item.original || manifest.defaultOriginal);
    const translatedBase = await readCorpus(item.translated);
    const translatedText = item.prependBom ? `\uFEFF${translatedBase}` : translatedBase;
    const originalName = item.original ? path.basename(item.original) : "valid-original.xlf";
    const translatedName = item.translatedFileName || path.basename(item.translated);
    const expected = item.expected;

    const preview = await analyze([
      virtualFile(originalName, originalText),
      virtualFile(translatedName, translatedText)
    ]);

    assert.equal(preview.ok, expected.ok, `${item.id}: ok`);
    assert.equal(preview.repairability.verdict, expected.repairability, `${item.id}: repairability`);
    assert.equal(preview.unsupported.code, expected.unsupportedCode, `${item.id}: unsupported code`);
    assert.deepEqual(sortedCategories(preview), [...expected.categories].sort(), `${item.id}: categories`);

    const repairResult = await repair([
      virtualFile(originalName, originalText),
      virtualFile(translatedName, translatedText)
    ]);

    assert.equal(repairResult.ok, expected.repairOk, `${item.id}: repair ok`);
    if (expected.remainingCriticalAfterRepair !== undefined) {
      assert.equal(
        repairResult.report.after.criticalIssues,
        expected.remainingCriticalAfterRepair,
        `${item.id}: remaining critical`
      );
    }
  }
});

test("detects protected inline drift across explicit XLIFF 1.2 inline tag families", async () => {
  const originalText = await readCorpus("proof-corpus/files/inline-families-original.xlf");
  const cleanTranslatedText = await readCorpus("proof-corpus/files/inline-families-clean-translated.xlf");
  const driftTranslatedText = await readCorpus("proof-corpus/files/inline-families-rewrite-translated.xlf");

  const cleanPreview = await analyze([
    virtualFile("inline-families-original.xlf", originalText),
    virtualFile("inline-families-clean-translated.xlf", cleanTranslatedText)
  ]);
  const driftPreview = await analyze([
    virtualFile("inline-families-original.xlf", originalText),
    virtualFile("inline-families-rewrite-translated.xlf", driftTranslatedText)
  ]);

  assert.equal(cleanPreview.ok, true);
  assert.deepEqual(cleanPreview.issues, []);
  assert.equal(driftPreview.repairability.verdict, "manual_review");
  assert.equal(driftPreview.issues.length, 5);
  assert.deepEqual(sortedCategories(driftPreview), ["protected_inline_tag_rewrite"]);
});

test("safe repair preserves translated target text while restoring structural metadata", async () => {
  const originalText = await readCorpus("test/fixtures/valid-original.xlf");
  const translatedText = await readCorpus("proof-corpus/files/missing-id-translated.xlf");

  const repairResult = await repair([
    virtualFile("valid-original.xlf", originalText),
    virtualFile("missing-id-translated.xlf", translatedText)
  ]);

  assert.equal(repairResult.ok, true);
  assert.match(repairResult.text, /<trans-unit id="slide-1-title">/);
  assert.match(repairResult.text, /<target>Bienvenue <x id="1" ctype="x-bold"\/> learner<\/target>/);
  assert.match(repairResult.text, /<target>Click <g id="2" ctype="x-link">continue<\/g>\.<\/target>/);
});

test("safe repair removes empty namespaces only inside translatable content", async () => {
  const originalText = await readCorpus("test/fixtures/valid-original.xlf");
  const translatedText = await readCorpus("proof-corpus/files/empty-xmlns-translated.xlf");

  const preview = await analyze([
    virtualFile("valid-original.xlf", originalText),
    virtualFile("empty-xmlns-translated.xlf", translatedText)
  ]);
  const repairResult = await repair([
    virtualFile("valid-original.xlf", originalText),
    virtualFile("empty-xmlns-translated.xlf", translatedText)
  ]);

  assert.equal(preview.repairability.verdict, "repairable");
  assert.deepEqual(sortedCategories(preview), ["empty_default_namespace_attribute"]);
  assert.equal(preview.issues.length, 4);
  assert.equal(repairResult.ok, true);
  assert.doesNotMatch(repairResult.text, /xmlns=""/);
  assert.match(repairResult.text, /<target>Bienvenue <x id="1" ctype="x-bold"\/> apprenant<\/target>/);
  assert.equal(repairResult.diff.length, 4);
  assert.ok(repairResult.diff.every((item) => item.repairClass === "remove_empty_default_namespace_attribute"));

  const noteNamespaceText = translatedText
    .replaceAll(' xmlns=""', "")
    .replace(
      "<target>Bienvenue",
      '<note xmlns="">Keep this namespace boundary</note>\n        <target>Bienvenue xmlns=""'
    );
  const notePreview = await analyze([
    virtualFile("valid-original.xlf", originalText),
    virtualFile("translated-with-note.xlf", noteNamespaceText)
  ]);
  const noteRepair = await repair([
    virtualFile("valid-original.xlf", originalText),
    virtualFile("translated-with-note.xlf", noteNamespaceText)
  ]);

  assert.equal(notePreview.repairability.verdict, "clean");
  assert.equal(noteRepair.text, noteNamespaceText);
  assert.match(noteRepair.text, /<note xmlns="">Keep this namespace boundary<\/note>/);
  assert.match(noteRepair.text, /<target>Bienvenue xmlns=""/);
});

test("CLI analyzes a broken translated file and writes a safe repaired XLIFF", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xliff-doctor-"));
  const original = path.join(corpusRoot, "test/fixtures/valid-original.xlf");
  const translated = path.join(corpusRoot, "proof-corpus/files/missing-id-translated.xlf");
  const output = path.join(tempDir, "translated.repaired.xlf");

  try {
    const analyzeResult = spawnSync(process.execPath, [cliPath, "analyze", original, translated], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(analyzeResult.status, 2);
    assert.match(analyzeResult.stdout, /Verdict: repairable/);
    assert.match(analyzeResult.stdout, /missing_trans_unit_id/);

    const repairResult = spawnSync(process.execPath, [cliPath, "repair", original, translated, "--out", output], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(repairResult.status, 0);
    assert.match(repairResult.stdout, /Wrote repaired XLIFF/);

    const repaired = await readFile(output, "utf8");
    assert.match(repaired, /<trans-unit id="slide-1-title">/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
