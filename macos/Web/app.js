// Keep UI aliases block-scoped: the generated classic runtime declares the
// canonical analyze and repair functions in the page's global script scope.
{
const { analyze, repair } = globalThis.UntwineEngine;

const state = {
  original: null,
  translated: null,
  preview: null,
  repairResult: null
};
let operationGeneration = 0;

const elements = {
  originalInput: document.querySelector("#originalFile"),
  translatedInput: document.querySelector("#translatedFile"),
  originalDropzone: document.querySelector("#originalDropzone"),
  translatedDropzone: document.querySelector("#translatedDropzone"),
  originalChoice: document.querySelector("#originalChoice"),
  translatedChoice: document.querySelector("#translatedChoice"),
  pairStatus: document.querySelector("#pairStatus"),
  analyzeButton: document.querySelector("#analyzeButton"),
  demoButton: document.querySelector("#demoButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultState: document.querySelector("#resultState"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  criticalCount: document.querySelector("#criticalCount"),
  totalCount: document.querySelector("#totalCount"),
  issueList: document.querySelector("#issueList"),
  outputHint: document.querySelector("#outputHint"),
  repairButton: document.querySelector("#repairButton"),
  reportButton: document.querySelector("#reportButton"),
  resetButton: document.querySelector("#resetButton"),
  toast: document.querySelector("#toast")
};

const verdictCopy = {
  clean: {
    label: "Clean",
    tone: "clean",
    title: "No structural blockers found",
    body: "The original and translated XLIFF 1.2 structures match the checks Untwine can perform. Try the translated file in the exact Articulate course it came from.",
    output: "Save the diagnosis before retrying the import if you need an audit trail."
  },
  repairable: {
    label: "Repairable",
    tone: "clean",
    title: "A deterministic safe repair is available",
    body: "Untwine can restore file metadata without changing translated target text or protected inline tags.",
    output: "Save a repaired copy, then import that copy into the exact Articulate course used for the original export."
  },
  manual_review: {
    label: "Review",
    tone: "review",
    title: "This file needs human review",
    body: "The translated structure drifted in a way that may affect text or protected tags. Untwine will explain the issue but will not guess at a repair.",
    output: "Save the report and send it to the translator or localization owner."
  },
  unrepairable: {
    label: "Blocked",
    tone: "blocked",
    title: "No safe file-level repair is available",
    body: "The pair no longer has the structure required for a deterministic metadata-only repair.",
    output: "Save the report, then re-export from the exact course or restart from the matching original file."
  },
  unsupported: {
    label: "Unsupported",
    tone: "blocked",
    title: "This pair is outside the current boundary",
    body: "Untwine for Mac currently supports Articulate-style XLIFF 1.2 pairs. It does not rewrite malformed XML or XLIFF 2.0.",
    output: "Save the report for a precise handoff. No repaired file will be created."
  }
};

elements.originalInput.addEventListener("change", () => selectInputFile("original", elements.originalInput.files?.[0]));
elements.translatedInput.addEventListener("change", () => selectInputFile("translated", elements.translatedInput.files?.[0]));
elements.analyzeButton.addEventListener("click", runAnalysis);
elements.demoButton.addEventListener("click", loadDemo);
elements.repairButton.addEventListener("click", saveRepair);
elements.reportButton.addEventListener("click", saveReport);
elements.resetButton.addEventListener("click", reset);

configureDropzone("original", elements.originalDropzone);
configureDropzone("translated", elements.translatedDropzone);

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

window.untwineDidSave = ({ message }) => showToast(message);

function configureDropzone(role, dropzone) {
  for (const eventName of ["dragenter", "dragover"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  }

  dropzone.addEventListener("drop", (event) => {
    selectInputFile(role, event.dataTransfer?.files?.[0]);
  });
}

function selectInputFile(role, file) {
  if (!file) {
    return;
  }

  if (!/\.(xlf|xliff)$/i.test(file.name)) {
    showToast("Choose an .xlf or .xliff file.");
    return;
  }

  state[role] = file;
  state.preview = null;
  state.repairResult = null;
  elements.resultPanel.hidden = true;
  invalidatePendingWork();

  const dropzone = role === "original" ? elements.originalDropzone : elements.translatedDropzone;
  const choice = role === "original" ? elements.originalChoice : elements.translatedChoice;
  dropzone.classList.add("has-file");
  choice.textContent = file.name;

  updatePairState();
}

function updatePairState() {
  const ready = Boolean(state.original && state.translated);
  elements.analyzeButton.disabled = !ready;
  elements.pairStatus.textContent = ready
    ? "Pair ready. Analysis stays on this Mac."
    : state.original || state.translated
      ? "Add the second file to complete the pair."
      : "Add both files to begin.";
}

async function runAnalysis() {
  if (!state.original || !state.translated) {
    return;
  }

  const pair = [state.original, state.translated];
  const operation = invalidatePendingWork();
  setBusy(true, "Analyzing structure…");
  try {
    const preview = await analyze(pair);
    if (operation !== operationGeneration) return;
    state.preview = preview;
    state.repairResult = null;
    renderResult(state.preview);
  } catch (error) {
    if (operation !== operationGeneration) return;
    showToast(error instanceof Error ? error.message : "Untwine could not analyze this pair.");
  } finally {
    if (operation === operationGeneration) setBusy(false);
  }
}

function renderResult(preview) {
  const verdict = preview.repairability?.verdict || "unsupported";
  const copy = verdictCopy[verdict] || verdictCopy.unsupported;

  elements.resultState.textContent = copy.label;
  elements.resultState.dataset.tone = copy.tone;
  elements.resultTitle.textContent = copy.title;
  elements.resultBody.textContent = copy.body;
  elements.criticalCount.textContent = String(preview.summary?.criticalIssues ?? 0);
  elements.totalCount.textContent = String(preview.summary?.totalIssues ?? 0);
  elements.outputHint.textContent = copy.output;
  elements.repairButton.hidden = verdict !== "repairable";

  elements.issueList.replaceChildren();
  if (!preview.issues?.length) {
    const item = document.createElement("li");
    item.className = "is-empty";
    item.textContent = "No issues detected inside the current XLIFF 1.2 safety boundary.";
    elements.issueList.append(item);
  } else {
    for (const issue of preview.issues) {
      const item = document.createElement("li");
      const location = issue.location ? `${issue.location}: ` : "";
      item.textContent = `${location}${issue.message}`;
      elements.issueList.append(item);
    }
  }

  elements.resultPanel.hidden = false;
  scrollIntoViewRespectingMotion(elements.resultPanel, "start");
}

async function saveRepair() {
  if (!state.original || !state.translated || state.preview?.repairability?.verdict !== "repairable") {
    return;
  }

  const pair = [state.original, state.translated];
  const operation = invalidatePendingWork();
  elements.repairButton.disabled = true;
  elements.repairButton.textContent = "Preparing safe copy…";
  try {
    const result = state.repairResult || await repair(pair);
    if (operation !== operationGeneration) return;
    state.repairResult = result;
    if (!result.ok || typeof result.text !== "string") {
      showToast("Untwine blocked this repair after its final safety check.");
      return;
    }

    requestSave({
      kind: "repair",
      name: repairedFileName(pair[1].name),
      text: result.text,
      mimeType: result.mimeType || "application/xliff+xml"
    });
  } catch (error) {
    if (operation !== operationGeneration) return;
    showToast(error instanceof Error ? error.message : "Untwine could not prepare the repaired copy.");
  } finally {
    if (operation === operationGeneration) {
      elements.repairButton.disabled = false;
      elements.repairButton.textContent = "Save repaired copy";
    }
  }
}

function saveReport() {
  if (!state.preview) {
    return;
  }

  const { summary, repairability, unsupported, issues, sampleDiff } = state.preview;
  const report = {
    product: "Untwine for Mac",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    scope: "Articulate-style original and translated XLIFF 1.2 pair",
    privacy: "Generated locally from issue categories, segment positions, and repair guidance.",
    caveat: "A clean or repaired result does not guarantee that Articulate will accept the import.",
    result: {
      summary,
      repairability,
      unsupported,
      issues,
      sampleDiff: sampleDiff ? { repairClass: sampleDiff.repairClass, description: sampleDiff.description } : null
    }
  };

  requestSave({
    kind: "report",
    name: "untwine-diagnosis.json",
    text: `${JSON.stringify(report, null, 2)}\n`,
    mimeType: "application/json"
  });
}

function requestSave(payload) {
  const nativeHandler = window.webkit?.messageHandlers?.untwineSave;
  if (nativeHandler) {
    nativeHandler.postMessage({ action: "save", ...payload });
    return;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload.text], { type: payload.mimeType }));
  link.download = payload.name;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadDemo() {
  let operation = operationGeneration;
  try {
    const demo = window.untwineDemo;
    if (typeof demo?.original !== "string" || typeof demo?.translated !== "string") {
      throw new Error("The bundled demo files are unavailable.");
    }

    selectInputFile("original", new File([demo.original], "demo-articulate-original.xlf", { type: "application/xliff+xml" }));
    selectInputFile("translated", new File([demo.translated], "demo-articulate-translated-safe-repair.xlf", { type: "application/xliff+xml" }));
    const analysis = runAnalysis();
    operation = operationGeneration;
    elements.demoButton.disabled = true;
    elements.demoButton.textContent = "Loading demo…";
    await analysis;
  } catch (error) {
    if (operation !== operationGeneration) return;
    showToast(error instanceof Error ? error.message : "Untwine could not load the demo.");
  } finally {
    if (operation === operationGeneration) {
      elements.demoButton.disabled = false;
      elements.demoButton.textContent = "Use safe demo";
    }
  }
}

function invalidatePendingWork() {
  // File selection and reset cancel ownership of any pending engine result.
  operationGeneration += 1;
  elements.repairButton.disabled = false;
  elements.repairButton.textContent = "Save repaired copy";
  elements.demoButton.disabled = false;
  elements.demoButton.textContent = "Use safe demo";
  setBusy(false);
  return operationGeneration;
}

function setBusy(busy, message = "") {
  elements.analyzeButton.disabled = busy || !state.original || !state.translated;
  elements.analyzeButton.textContent = busy ? "Analyzing…" : "Analyze pair";
  if (message) {
    elements.pairStatus.textContent = message;
  } else {
    updatePairState();
  }
}

function repairedFileName(originalName) {
  const match = /\.(xlf|xliff)$/i.exec(originalName);
  const extension = match?.[1]?.toLowerCase() || "xlf";
  const stem = originalName.replace(/\.(xlf|xliff)$/i, "") || "translated";
  return `${stem}.repaired.${extension}`;
}

function reset() {
  state.original = null;
  state.translated = null;
  state.preview = null;
  state.repairResult = null;

  elements.originalInput.value = "";
  elements.translatedInput.value = "";
  elements.originalChoice.textContent = "Choose original file";
  elements.translatedChoice.textContent = "Choose translated file";
  elements.originalDropzone.classList.remove("has-file");
  elements.translatedDropzone.classList.remove("has-file");
  elements.resultPanel.hidden = true;
  invalidatePendingWork();
  scrollIntoViewRespectingMotion(elements.originalDropzone, "center");
}

function scrollIntoViewRespectingMotion(element, block) {
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block
  });
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

let toastTimer = null;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

window.untwineAppReady = true;
window.webkit?.messageHandlers?.untwineReady?.postMessage({ ready: true });
}
