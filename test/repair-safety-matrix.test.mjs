import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const repairabilityToAction = {
  clean: "clean",
  repairable: "safe_repair",
  manual_review: "manual_review",
  unrepairable: "unrepairable",
  unsupported: "unsupported"
};

test("repair safety matrix covers the proof corpus and issue categories", async () => {
  const manifest = await readJson("test/articulate-xliff-corpus/proof-corpus/manifest.json");
  const matrix = await readJson("docs/architecture/repair-safety-matrix.json");

  const casePolicies = new Map(matrix.proofCorpusCasePolicy.map((item) => [item.caseId, item.expectedAction]));
  const categoryPolicies = new Set(matrix.categoryPolicy.map((item) => item.category));

  for (const item of manifest.cases) {
    assert.equal(
      casePolicies.get(item.id),
      repairabilityToAction[item.expected.repairability],
      `${item.id} has a safety-matrix action`
    );

    for (const category of item.expected.categories) {
      assert.equal(categoryPolicies.has(category), true, `${category} has a category policy`);
    }
  }
});

test("safe repair classes stay metadata-only", async () => {
  const matrix = await readJson("docs/architecture/repair-safety-matrix.json");
  const safeClasses = matrix.safeRepairClasses.map((item) => item.id).sort();

  assert.deepEqual(safeClasses, [
    "normalize_xml_encoding_declaration",
    "remove_bom",
    "restore_trans_unit_id"
  ]);

  for (const repairClass of matrix.safeRepairClasses) {
    assert.equal(repairClass.action, "safe_repair");
    assert.equal(repairClass.mustNotChange.includes("target text"), true, `${repairClass.id} preserves target text`);
    assert.equal(repairClass.mustNotChange.includes("inline tags"), true, `${repairClass.id} preserves inline tags`);
  }
});
