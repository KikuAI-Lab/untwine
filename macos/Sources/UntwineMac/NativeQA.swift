#if DEBUG
import AppKit
import Darwin
import CoreFoundation
import WebKit

/// Generated fixtures only. This replaces file selection and save destination;
/// it does not exercise NSOpenPanel/NSSavePanel or prove Articulate acceptance.
@MainActor
final class NativeQA {
  static var requested: Bool { Bundle.main.object(forInfoDictionaryKey: "UntwineNativeQA") != nil }
  private let output: URL
  private let original: String
  private let translated: String
  private var timeout: DispatchWorkItem?
  private var started = false
  private var awaitingSave = false
  private var finished = false
  private var savedBytes = 0
  private enum Refused: Error { case unsafe }

  init() throws {
    guard let flag = Bundle.main.object(forInfoDictionaryKey: "UntwineNativeQA") as? NSNumber,
          CFGetTypeID(flag) == CFBooleanGetTypeID(), flag.boolValue,
          let identifier = Bundle.main.bundleIdentifier,
          identifier.hasPrefix("dev.kikuai.untwine.qa."),
          identifier.count > "dev.kikuai.untwine.qa.".count,
          identifier.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "-") }),
          let account = getpwuid(getuid()), let directory = account.pointee.pw_dir,
          let resources = Bundle.main.resourceURL else { throw Refused.unsafe }
    let accountHome = String(cString: directory)
    let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
    guard home.path == accountHome + "/Library/Containers/" + identifier + "/Data" else { throw Refused.unsafe }
    let tmp = home.appendingPathComponent("tmp", isDirectory: true)
    try Self.checkPath(tmp, directory: true)
    let fixtureRoot = resources.appendingPathComponent("Web/qa", isDirectory: true)
    let originalURL = fixtureRoot.appendingPathComponent("original.xlf")
    let translatedURL = fixtureRoot.appendingPathComponent("translated.xlf")
    try Self.checkPath(originalURL, directory: false)
    try Self.checkPath(translatedURL, directory: false)
    original = try Self.readFixture(originalURL)
    translated = try Self.readFixture(translatedURL)
    output = tmp.appendingPathComponent("untwine-native-qa", isDirectory: true)
    // mkdir is exclusive: never replace or clean an existing run.
    guard mkdir(output.path, 0o700) == 0 else { throw Refused.unsafe }
  }

  private static func checkPath(_ url: URL, directory: Bool) throws {
    guard url.isFileURL, url.path == url.standardizedFileURL.path else { throw Refused.unsafe }
    var current = URL(fileURLWithPath: "/", isDirectory: true)
    for component in url.pathComponents.dropFirst() {
      current.appendPathComponent(component)
      let values = try current.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey, .isRegularFileKey])
      guard values.isSymbolicLink == false else { throw Refused.unsafe }
      if current.path == url.path {
        guard (directory ? values.isDirectory == true : values.isRegularFile == true) else { throw Refused.unsafe }
      } else {
        guard values.isDirectory == true else { throw Refused.unsafe }
      }
    }
  }

  private static func requireAbsent(_ url: URL) throws {
    var metadata = stat()
    guard lstat(url.path, &metadata) == -1, errno == ENOENT else { throw Refused.unsafe }
  }

  private static func readFixture(_ url: URL) throws -> String {
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 0, size <= 1_048_576 else { throw Refused.unsafe }
    let data = try Data(contentsOf: url)
    guard data.count <= 1_048_576, let text = String(data: data, encoding: .utf8) else { throw Refused.unsafe }
    return text
  }

  func armTimeout() {
    let item = DispatchWorkItem { [weak self] in self?.fail("timeout") }
    timeout = item
    DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: item)
  }

  func start(in webView: WKWebView?) {
    guard !started, !finished, let webView else { return }
    started = true
    // Arguments are serialized by WebKit, never interpolated into source.
    webView.callAsyncJavaScript("""
      if (window.untwineAppReady !== true) throw new Error('not_ready');
      for (const [id, name, text] of [
        ['originalFile', 'original.xlf', original],
        ['translatedFile', 'translated.xlf', translated]
      ]) {
        const input = document.getElementById(id);
        if (!input || input.type !== 'file') throw new Error('missing_input');
        const transfer = new DataTransfer();
        transfer.items.add(new File([text], name, {type:'application/xliff+xml'}));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      const analyze = document.getElementById('analyzeButton');
      if (!analyze || analyze.disabled) throw new Error('pair_not_ready');
      analyze.click();
      return true;
      """, arguments: ["original": original, "translated": translated], in: nil, in: .page) { [weak self, weak webView] result in
        guard let self, !self.finished else { return }
        switch result {
        case .success: self.poll(in: webView)
        case .failure: self.fail("input_or_analysis_failed")
        }
      }
  }

  private func poll(in webView: WKWebView?) {
    guard !finished, let webView else { return }
    webView.evaluateJavaScript("""
      (() => {
        const panel = document.getElementById('resultPanel');
        const repair = document.getElementById('repairButton');
        const analyze = document.getElementById('analyzeButton');
        if (!panel || !repair || !analyze) return 'invalid';
        if (!panel.hidden && !analyze.disabled) {
          return !repair.hidden && !repair.disabled && document.getElementById('resultState')?.textContent === 'Repairable'
            ? 'repairable' : 'unexpected_result';
        }
        return 'pending';
      })()
      """) { [weak self, weak webView] value, error in
        guard let self, !self.finished else { return }
        guard error == nil, let state = value as? String else { self.fail("result_poll_failed"); return }
        if state == "pending" {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self, weak webView] in self?.poll(in: webView) }
        } else if state == "repairable" {
          self.awaitingSave = true
          webView?.evaluateJavaScript("document.getElementById('repairButton').click();") { [weak self] _, error in
            if error != nil { self?.fail("repair_click_failed") }
          }
        } else { self.fail("unexpected_analysis_result") }
      }
  }

  func save(kind: String, name: String, text: String, notify: (@escaping () -> Void) -> Void) {
    guard !finished else { return }
    guard awaitingSave, kind == "repair", name == "translated.repaired.xlf", !text.isEmpty,
          text.utf8.count <= 4_194_304 else { fail("unexpected_save"); return }
    awaitingSave = false
    do {
      try Self.checkPath(output, directory: true)
      let destination = output.appendingPathComponent("translated.repaired.xlf")
      try Self.requireAbsent(destination)
      try writeSavedText(text, to: destination)
      savedBytes = text.utf8.count
      notify { [weak self] in self?.finish(status: "passed", reason: "bridge_saved") }
    } catch { fail("atomic_save_failed") }
  }

  func fail(_ reason: String) { finish(status: "failed", reason: reason) }

  private func finish(status: String, reason: String) {
    guard !finished else { return }
    finished = true
    timeout?.cancel()
    do {
      try Self.checkPath(output, directory: true)
      let receipt = output.appendingPathComponent("receipt.json")
      try Self.requireAbsent(receipt)
      let data = try JSONSerialization.data(withJSONObject: [
        "status": status, "reason": reason,
        "fileName": savedBytes > 0 ? "translated.repaired.xlf" : "",
        "bytes": savedBytes,
        "scope": "generated_file_inputs_native_bridge_atomic_save",
        "nativeDialogsExercised": false
      ], options: [.sortedKeys])
      try data.write(to: receipt, options: [.withoutOverwriting])
    } catch { fputs("Untwine QA could not write receipt.\n", stderr) }
    NSApp.terminate(nil)
  }
}
#endif
