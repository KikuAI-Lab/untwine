import {
  attr,
  attrMeta,
  childElement,
  elementsByLocalName,
  inlineSignature,
  parseXml,
  XmlParseError
} from "./xml.js";

const TOOL_ID = "fix-articulate-xliff-import-error";
const SUPPORTED_EXTENSIONS = new Set(["xlf", "xliff"]);
const SUPPORTED_XLIFF_VERSION = "1.2";
const XLIFF_12_NAMESPACE = "urn:oasis:names:tc:xliff:document:1.2";

export async function analyze(files) {
  const internal = await analyzeInternal(files);
  return internal.result;
}

export async function repair(files, options = {}) {
  const internal = await analyzeInternal(files);
  const { result, translated, original } = internal;

  if (result.repairability.verdict === "clean") {
    return repairedArtifact(result, result, translated.text, [], true);
  }

  if (result.repairability.verdict !== "repairable") {
    return {
      ok: false,
      reason: result.repairability.verdict,
      preview: result,
      text: null,
      fileName: null,
      mimeType: null,
      diff: [],
      checklist: [
        {
          label: "Only safe repair classes are enabled",
          status: "fail"
        }
      ],
      analyticsEvent: {
        event: "repair_blocked",
        payload: createAnalyticsPayload("repair_blocked", result)
      }
    };
  }

  const edits = repairEdits(internal, options);
  const repairedText = applyEdits(translated.text, edits);
  const repairedInternal = await analyzeInternal([
    virtualFile("original.xlf", original.text),
    virtualFile("translated.xlf", repairedText)
  ]);

  return repairedArtifact(result, repairedInternal.result, repairedText, edits, repairedInternal.result.summary.criticalIssues === 0);
}

export function createAnalyticsPayload(event, previewResult) {
  const issueCounts = {};
  for (const issue of previewResult.issues ?? []) {
    issueCounts[issue.category] = (issueCounts[issue.category] ?? 0) + 1;
  }

  return {
    event,
    tool: TOOL_ID,
    file_count: previewResult.fileCount ?? previewResult.files?.length ?? 0,
    status: previewResult.ok ? "clean" : "issues_detected",
    issue_counts: issueCounts,
    total_issues: previewResult.summary?.totalIssues ?? 0,
    critical_issues: previewResult.summary?.criticalIssues ?? 0,
    repairability: previewResult.repairability?.verdict ?? "unknown",
    unsupported_code: previewResult.unsupported?.code ?? null
  };
}

async function analyzeInternal(files) {
  const inputFiles = Array.isArray(files) ? files : [];
  const issues = [];

  if (inputFiles.length !== 2) {
    const result = buildResult({
      files: [],
      issues: [
        issue("invalid_file_pair", "critical", "Upload exactly two files: original XLIFF first, translated XLIFF second.")
      ],
      fileCount: inputFiles.length,
      transUnitCounts: { original: 0, translated: 0 }
    });
    return { result, original: null, translated: null, issues };
  }

  const [original, translated] = await Promise.all([
    inspectFile(inputFiles[0], "original"),
    inspectFile(inputFiles[1], "translated")
  ]);

  issues.push(...original.issues, ...translated.issues);

  if (original.supportedForComparison && translated.supportedForComparison) {
    comparePair(original, translated, issues);
  }

  const result = buildResult({
    files: [original.publicFile, translated.publicFile],
    issues,
    fileCount: inputFiles.length,
    transUnitCounts: {
      original: original.transUnits.length,
      translated: translated.transUnits.length
    }
  });

  return {
    result,
    original,
    translated,
    issues
  };
}

async function inspectFile(file, role) {
  const payload = await readFilePayload(file);
  const issues = [];

  if (!SUPPORTED_EXTENSIONS.has(payload.extension)) {
    issues.push(
      issue("wrong_extension", "critical", "Use .xlf or .xliff files exported for Articulate import.", {
        role
      })
    );
  }

  if (payload.hasBom) {
    issues.push(
      issue("encoding_bom", "warning", "The XML file starts with a UTF-8 BOM that can confuse fragile importers.", {
        role,
        repairClass: "remove_bom",
        repairData: { start: 0, end: 1, replacement: "" }
      })
    );
  }

  if (payload.encodingDeclaration.value && payload.encodingDeclaration.value.toUpperCase() !== "UTF-8") {
    issues.push(
      issue("encoding_declaration_mismatch", "warning", "The XML declaration does not advertise UTF-8 encoding.", {
        role,
        repairClass: "normalize_xml_encoding_declaration",
        repairData: {
          start: payload.encodingDeclaration.valueStart,
          end: payload.encodingDeclaration.valueEnd,
          replacement: "UTF-8"
        }
      })
    );
  }

  let document = null;
  let root = null;
  let version = null;
  let namespace = null;
  let transUnits = [];
  let parseOk = false;

  try {
    document = parseXml(payload.text);
    root = document.documentElement;
    parseOk = true;
  } catch (error) {
    const category = error instanceof XmlParseError ? error.code : "malformed_xml";
    issues.push(
      issue(category, "critical", parseFailureMessage(category), {
        role,
        position: error.position ?? null
      })
    );
  }

  if (parseOk) {
    if (!root || root.localName !== "xliff") {
      issues.push(
        issue("wrong_wrapper", "critical", "The XML root element is not an XLIFF <xliff> wrapper.", {
          role
        })
      );
    } else {
      version = attr(root, "version");
      namespace = attr(root, "xmlns");
      if (version !== SUPPORTED_XLIFF_VERSION) {
        issues.push(
          issue("unsupported_xliff_version", "critical", "This checker supports XLIFF 1.2 only.", {
            role,
            version
          })
        );
      }
      transUnits = elementsByLocalName(root, "trans-unit");
    }
  }

  const blockingCategories = new Set(["wrong_extension", "malformed_xml", "invalid_entities", "wrong_wrapper", "unsupported_xliff_version"]);
  const supportedForComparison = !issues.some((item) => blockingCategories.has(item.category)) && parseOk && root?.localName === "xliff" && version === SUPPORTED_XLIFF_VERSION;

  return {
    role,
    text: payload.text,
    document,
    root,
    version,
    namespace,
    transUnits,
    issues,
    supportedForComparison,
    publicFile: {
      role,
      extension: payload.extension || null,
      hasBom: payload.hasBom,
      declaredEncoding: payload.encodingDeclaration.value,
      parse: {
        ok: parseOk
      },
      xliffVersion: version,
      namespace,
      transUnitCount: transUnits.length
    }
  };
}

function comparePair(original, translated, issues) {
  if (original.version !== translated.version || original.namespace !== translated.namespace || translated.namespace !== XLIFF_12_NAMESPACE) {
    issues.push(
      issue("namespace_version_drift", "critical", "The translated file no longer matches the original XLIFF 1.2 namespace/version contract.", {
        role: "translated"
      })
    );
  }

  if (original.transUnits.length !== translated.transUnits.length) {
    issues.push(
      issue("missing_trans_unit_id", "critical", "The translated file has a different number of trans-unit records.", {
        role: "translated"
      })
    );
  }

  const unitCount = Math.min(original.transUnits.length, translated.transUnits.length);
  for (let index = 0; index < unitCount; index += 1) {
    compareUnit(original.transUnits[index], translated.transUnits[index], index, issues);
  }
}

function compareUnit(originalUnit, translatedUnit, unitIndex, issues) {
  const originalId = attr(originalUnit, "id");
  const translatedId = attr(translatedUnit, "id");
  const translatedIdMeta = attrMeta(translatedUnit, "id");

  if (!translatedId && originalId) {
    issues.push(
      issue("missing_trans_unit_id", "critical", "A translated trans-unit is missing the ID required for Articulate import.", {
        role: "translated",
        unitIndex,
        repairClass: "restore_trans_unit_id",
        repairData: {
          insertAt: translatedUnit.openTagEnd - 1,
          replacement: ` id="${escapeAttribute(originalId)}"`,
          to: originalId
        }
      })
    );
  } else if (originalId && translatedId && originalId !== translatedId) {
    issues.push(
      issue("changed_trans_unit_id", "critical", "A translated trans-unit ID differs from the original Articulate export.", {
        role: "translated",
        unitIndex,
        repairClass: "restore_trans_unit_id",
        repairData: {
          start: translatedIdMeta.valueStart,
          end: translatedIdMeta.valueEnd,
          replacement: originalId,
          from: translatedId,
          to: originalId
        }
      })
    );
  }

  const translatedTarget = childElement(translatedUnit, "target");
  if (!translatedTarget) {
    issues.push(
      issue("missing_target", "critical", "A translated trans-unit is missing its target element.", {
        role: "translated",
        unitIndex,
        repairClass: "add_missing_target_from_source_manual_only",
        safe: false
      })
    );
    return;
  }

  const originalSource = childElement(originalUnit, "source");
  if (!originalSource) {
    return;
  }

  const originalSignature = inlineSignature(originalSource);
  const translatedSignature = inlineSignature(translatedTarget);

  if (originalSignature.length !== translatedSignature.length) {
    issues.push(
      issue("source_target_tag_count_drift", "critical", "Protected inline tag counts differ between original source and translated target.", {
        role: "translated",
        unitIndex,
        safe: false
      })
    );
    return;
  }

  if (originalSignature.join("|") !== translatedSignature.join("|")) {
    issues.push(
      issue("protected_inline_tag_rewrite", "critical", "Protected inline tags appear to have been rewritten by a CAT tool.", {
        role: "translated",
        unitIndex,
        safe: false
      })
    );
  }
}

function buildResult({ files, issues, fileCount, transUnitCounts }) {
  const unsupported = unsupportedBucket(issues);
  const repairability = repairabilityVerdict(issues, unsupported);
  const summary = {
    totalIssues: issues.length,
    criticalIssues: issues.filter((item) => item.severity === "critical").length,
    repairableIssues: issues.filter((item) => item.repairClass && item.safe !== false).length,
    transUnitCounts
  };
  const result = {
    ok: issues.length === 0,
    tool: TOOL_ID,
    route: "/fix-articulate-xliff-import-error",
    fileCount,
    files,
    compatibility: {
      compatible: issues.length === 0,
      hints: compatibilityHints(issues)
    },
    unsupported,
    summary,
    issues: issues.map(publicIssue),
    sampleIssues: issues.slice(0, 2).map(publicIssue),
    sampleDiff: sampleDiff(issues),
    repairability
  };
  result.analyticsEvent = {
    event: "preview_completed",
    payload: createAnalyticsPayload("preview_completed", result)
  };
  return result;
}

function issue(category, severity, message, details = {}) {
  return {
    id: category,
    category,
    severity,
    importBlocking: severity === "critical",
    message,
    safe: details.safe,
    role: details.role,
    unitIndex: details.unitIndex,
    repairClass: details.repairClass,
    repairData: details.repairData,
    position: details.position,
    version: details.version
  };
}

function publicIssue(item) {
  const output = {
    id: `${item.category}${item.unitIndex === undefined ? "" : `-${item.unitIndex + 1}`}`,
    category: item.category,
    severity: item.severity,
    importBlocking: item.importBlocking,
    message: item.message
  };
  if (item.role) {
    output.role = item.role;
  }
  if (item.unitIndex !== undefined) {
    output.location = `translated trans-unit ${item.unitIndex + 1}`;
  }
  if (item.repairClass) {
    output.repairClass = item.repairClass;
    output.safeRepair = item.safe !== false;
  }
  return output;
}

function unsupportedBucket(issues) {
  const priority = ["wrong_extension", "malformed_xml", "invalid_entities", "wrong_wrapper", "unsupported_xliff_version", "invalid_file_pair"];
  const found = priority.find((category) => issues.some((item) => item.category === category));
  if (!found) {
    return {
      unsupported: false,
      code: null,
      reason: null
    };
  }
  return {
    unsupported: true,
    code: found,
    reason: unsupportedReason(found)
  };
}

function repairabilityVerdict(issues, unsupported) {
  if (unsupported.unsupported) {
    return {
      verdict: "unsupported",
      reasons: [unsupported.reason]
    };
  }
  if (issues.length === 0) {
    return {
      verdict: "clean",
      reasons: []
    };
  }
  if (issues.every((item) => item.repairClass && item.safe !== false)) {
    return {
      verdict: "repairable",
      reasons: ["Only safe repair classes were detected."]
    };
  }
  if (issues.some((item) => item.category === "missing_target" || item.category === "source_target_tag_count_drift" || item.category === "protected_inline_tag_rewrite")) {
    return {
      verdict: "manual_review",
      reasons: ["The tool can diagnose this structure drift but will not rewrite translated text automatically."]
    };
  }
  return {
    verdict: "unrepairable",
    reasons: ["No safe repair class is available."]
  };
}

function compatibilityHints(issues) {
  if (issues.length === 0) {
    return ["The original and translated XLIFF 1.2 structures are compatible for this check."];
  }
  return [...new Set(issues.map((item) => item.message))].slice(0, 3);
}

function sampleDiff(issues) {
  const changedId = issues.find((item) => item.category === "changed_trans_unit_id" && item.repairData);
  if (changedId) {
    return {
      repairClass: "restore_trans_unit_id",
      description: "Restore translated trans-unit ID from the original file at the same position.",
      before: `id="${changedId.repairData.from}"`,
      after: `id="${changedId.repairData.to}"`
    };
  }

  const bom = issues.find((item) => item.category === "encoding_bom");
  if (bom) {
    return {
      repairClass: "remove_bom",
      description: "Remove UTF-8 BOM before the XML declaration.",
      before: "UTF-8 BOM + <?xml",
      after: "<?xml"
    };
  }

  const encoding = issues.find((item) => item.category === "encoding_declaration_mismatch" && item.repairData);
  if (encoding) {
    return {
      repairClass: "normalize_xml_encoding_declaration",
      description: "Normalize XML declaration encoding to UTF-8.",
      before: "encoding is not UTF-8",
      after: 'encoding="UTF-8"'
    };
  }

  return null;
}

function repairEdits(internal) {
  const edits = [];
  for (const item of internal.issues) {
    if (!item.repairClass || item.safe === false || !item.repairData) {
      continue;
    }
    if (item.repairData.insertAt !== undefined) {
      edits.push({
        start: item.repairData.insertAt,
        end: item.repairData.insertAt,
        replacement: item.repairData.replacement,
        repairClass: item.repairClass,
        description: item.message
      });
      continue;
    }
    edits.push({
      start: item.repairData.start,
      end: item.repairData.end,
      replacement: item.repairData.replacement,
      repairClass: item.repairClass,
      description: item.message,
      before: item.repairData.from,
      after: item.repairData.to ?? item.repairData.replacement
    });
  }
  return edits;
}

function applyEdits(text, edits) {
  let output = text;
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  for (const edit of ordered) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return output;
}

function repairedArtifact(beforeResult, afterResult, text, edits, ok) {
  const event = ok ? "repair_completed" : "repair_completed_with_remaining_issues";
  const analyticsPayload = createAnalyticsPayload(event, beforeResult);
  analyticsPayload.remaining_issue_counts = createAnalyticsPayload("repair_after_check", afterResult).issue_counts;
  analyticsPayload.remaining_critical_issues = afterResult.summary.criticalIssues;

  return {
    ok,
    fileName: "articulate-import-safe.repaired.xlf",
    mimeType: "application/xliff+xml",
    text,
    report: {
      before: beforeResult.summary,
      after: afterResult.summary,
      issues: beforeResult.issues
    },
    diff: edits.map((edit) => ({
      repairClass: edit.repairClass,
      description: edit.description,
      before: edit.before ?? "present",
      after: edit.after ?? edit.replacement
    })),
    checklist: [
      {
        label: "XML parses after repair",
        status: afterResult.files[1]?.parse.ok ? "pass" : "fail"
      },
      {
        label: "XLIFF 1.2 wrapper remains supported",
        status: afterResult.unsupported.unsupported ? "fail" : "pass"
      },
      {
        label: "No import-blocking issues remain after safe repairs",
        status: afterResult.summary.criticalIssues === 0 ? "pass" : "fail"
      },
      {
        label: "Translated target text was not semantically rewritten",
        status: "pass"
      }
    ],
    analyticsEvent: {
      event,
      payload: analyticsPayload
    }
  };
}

async function readFilePayload(file) {
  let text = "";
  let hasBom = false;

  if (file && typeof file.arrayBuffer === "function") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
  } else if (file && typeof file.text === "function") {
    text = await file.text();
    hasBom = text.startsWith("\uFEFF");
  } else {
    text = "";
  }

  if (text.startsWith("\uFEFF")) {
    hasBom = true;
  }

  return {
    text,
    hasBom,
    extension: extensionFromName(file?.name ?? ""),
    encodingDeclaration: findXmlEncodingDeclaration(text)
  };
}

function findXmlEncodingDeclaration(text) {
  const declaration = /<\?xml\b[^>]*\?>/i.exec(text.slice(0, 256));
  if (!declaration) {
    return {
      value: null,
      valueStart: null,
      valueEnd: null
    };
  }
  const encoding = /encoding\s*=\s*(["'])([^"']+)\1/i.exec(declaration[0]);
  if (!encoding) {
    return {
      value: null,
      valueStart: null,
      valueEnd: null
    };
  }
  const valueStart = declaration.index + encoding.index + encoding[0].indexOf(encoding[2]);
  return {
    value: encoding[2],
    valueStart,
    valueEnd: valueStart + encoding[2].length
  };
}

function extensionFromName(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function parseFailureMessage(category) {
  if (category === "invalid_entities") {
    return "The XML contains invalid or unsupported entities.";
  }
  return "The XML is not well formed and cannot be safely inspected.";
}

function unsupportedReason(category) {
  const reasons = {
    invalid_file_pair: "Upload exactly the original and translated XLIFF files.",
    wrong_extension: "Only .xlf and .xliff files are supported here.",
    malformed_xml: "The translated XML is malformed, so safe comparison is not possible.",
    invalid_entities: "The XML contains invalid entities that must be fixed before import.",
    wrong_wrapper: "The XML root is not an XLIFF wrapper.",
    unsupported_xliff_version: "This checker supports XLIFF 1.2 only."
  };
  return reasons[category] ?? "This file is outside the current support scope.";
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function virtualFile(name, text) {
  return {
    name,
    type: "application/xliff+xml",
    async arrayBuffer() {
      return new TextEncoder().encode(text).buffer;
    },
    async text() {
      return text;
    }
  };
}
