import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { analyze } from "../src/index.js";

const appSource = await readFile(new URL("../macos/Web/app.js", import.meta.url), "utf8");
const preview = (count) => ({
  repairability: { verdict: "repairable" },
  summary: { totalIssues: count },
  issues: []
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// A small event/DOM boundary for testing app.js promise ownership only.
// Real File reads, rendered HTML and native saves require separate app verification.
function mount() {
  const nodes = new Map();
  function element() {
    return {
      hidden: true, disabled: false, textContent: "", value: "", files: [], dataset: {},
      events: {}, classList: { add() {}, remove() {} },
      addEventListener(name, handler) { this.events[name] = handler; },
      replaceChildren() {}, append() {}, scrollIntoView() {}
    };
  }
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const analyses = [], repairs = [], saves = [];
  const pendingCall = (calls, pair) => {
    const call = { pair, ...deferred() };
    calls.push(call);
    return call.promise;
  };
  const window = {
    addEventListener() {}, clearTimeout() {}, setTimeout() {},
    untwineDemo: { original: "original", translated: "translated" },
    webkit: { messageHandlers: { untwineSave: { postMessage: (payload) => saves.push(payload) } } }
  };
  runInNewContext(appSource, {
    document: { querySelector: node, createElement: element }, window, Error,
    File: class { constructor(parts, name) { this.name = name; } },
    UntwineEngine: {
      analyze: (pair) => pendingCall(analyses, pair),
      repair: (pair) => pendingCall(repairs, pair)
    }
  });
  return {
    node, analyses, repairs, saves,
    click: (id) => node(`#${id}`).events.click(),
    select(role, name) {
      node(`#${role}File`).files = [{ name }];
      node(`#${role}File`).events.change();
    },
    pair(name) {
      this.select("original", `${name}-original.xlf`);
      this.select("translated", `${name}-translated.xlf`);
    }
  };
}

test("reset discards late analysis and immediately restores idle controls", async () => {
  const ui = mount();
  ui.pair("A");
  const analysis = ui.click("analyzeButton");
  ui.click("resetButton");
  assert.equal(ui.node("#analyzeButton").textContent, "Analyze pair");
  assert.equal(ui.node("#analyzeButton").disabled, true);
  ui.analyses[0].resolve(preview(1));
  await analysis;
  assert.equal(ui.node("#resultPanel").hidden, true);
  assert.equal(ui.node("#analyzeButton").disabled, true);
});

test("replaced pair keeps newer analysis busy when old analysis rejects", async () => {
  const ui = mount();
  ui.pair("A");
  const old = ui.click("analyzeButton");
  ui.pair("B");
  const current = ui.click("analyzeButton");
  ui.analyses[0].reject(new Error("stale failure"));
  await old;
  assert.equal(ui.node("#toast").hidden, true);
  assert.equal(ui.node("#analyzeButton").disabled, true);
  assert.equal(ui.node("#analyzeButton").textContent, "Analyzing…");
  ui.analyses[1].resolve(preview(2));
  await current;
  assert.equal(ui.node("#totalCount").textContent, "2");
});

test("late repair cannot save or poison the replacement pair's repair cache", async () => {
  const ui = mount();
  ui.pair("A");
  const analysisA = ui.click("analyzeButton");
  ui.analyses[0].resolve(preview(1));
  await analysisA;
  const repairA = ui.click("repairButton");
  ui.click("resetButton");
  assert.equal(ui.node("#repairButton").disabled, false);
  ui.pair("B");
  const analysisB = ui.click("analyzeButton");
  ui.analyses[1].resolve(preview(2));
  await analysisB;
  const repairB = ui.click("repairButton");
  ui.repairs[0].resolve({ ok: true, text: "text A" });
  await repairA;
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.node("#repairButton").disabled, true);
  assert.equal(ui.node("#repairButton").textContent, "Preparing safe copy…");
  ui.repairs[1].resolve({ ok: true, text: "text B" });
  await repairB;
  await ui.click("repairButton");
  assert.equal(ui.repairs.length, 2);
  assert.equal(ui.saves.length, 2);
  for (const save of ui.saves) {
    assert.equal(save.name, "B-translated.repaired.xlf");
    assert.equal(save.text, "text B");
  }
  assert.equal(ui.repairs[0].pair[1].name, "A-translated.xlf");
  assert.equal(ui.repairs[1].pair[1].name, "B-translated.xlf");
});

test("late analysis cannot replace a completed newer result", async () => {
  const ui = mount();
  ui.pair("A");
  const old = ui.click("analyzeButton");
  ui.pair("B");
  const current = ui.click("analyzeButton");
  ui.analyses[1].resolve(preview(2));
  await current;
  ui.analyses[0].resolve(preview(1));
  await old;
  assert.equal(ui.node("#totalCount").textContent, "2");
});

test("old demo finalization cannot enable a newer pending demo", async () => {
  const ui = mount();
  const old = ui.click("demoButton");
  ui.click("resetButton");
  assert.equal(ui.node("#demoButton").disabled, false);
  const current = ui.click("demoButton");
  ui.analyses[0].resolve(preview(1));
  await old;
  assert.equal(ui.node("#demoButton").disabled, true);
  assert.equal(ui.node("#demoButton").textContent, "Loading demo…");
  ui.analyses[1].resolve(preview(2));
  await current;
  assert.equal(ui.node("#demoButton").disabled, false);
  assert.equal(ui.node("#totalCount").textContent, "2");
});

test("shareable native report retains positions and excludes identifiers and raw XML metadata", async () => {
  const ui = mount();
  ui.pair("private-file");
  const analysis = ui.click("analyzeButton");
  const fixture = (id) => `<?xml version="1.0" encoding="UTF-8"?>
    <xliff xmlns="urn:private-namespace" version="1.2"><file original="private-course"><body>
      <trans-unit id="${id}"><source>private-source</source><target>private-target</target></trans-unit>
    </body></file></xliff>`;
  const result = await analyze([
    { name: "private-file-original.xlf", text: () => fixture("private-original-id") },
    { name: "private-file-translated.xlf", text: () => fixture("private-translated-id") }
  ]);
  assert.equal(result.files[0].namespace, "urn:private-namespace");
  assert.match(result.sampleDiff.before, /private-translated-id/);
  ui.analyses[0].resolve(result);
  await analysis;
  ui.click("reportButton");

  assert.equal(ui.saves.length, 1);
  const { kind, name, text } = ui.saves[0];
  assert.equal(kind, "report");
  assert.equal(name, "untwine-diagnosis.json");
  assert.doesNotMatch(text, /private-|id="/);
  const report = JSON.parse(text).result;
  assert.equal(report.issues.find(({ category }) => category === "changed_trans_unit_id").location, "translated trans-unit 1");
  assert.deepEqual(Object.keys(report.sampleDiff).sort(), ["description", "repairClass"]);
  assert.equal(report.sampleDiff.repairClass, "restore_trans_unit_id");
});
