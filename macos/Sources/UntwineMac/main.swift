import AppKit
import Darwin
import UniformTypeIdentifiers
import WebKit

private let saveMessageHandler = "untwineSave"
private let readyMessageHandler = "untwineReady"

func writeSavedText(_ text: String, to destination: URL) throws {
  let fileManager = FileManager.default
  let stagingDirectory = try fileManager.url(
    for: .itemReplacementDirectory,
    in: .userDomainMask,
    appropriateFor: destination,
    create: true
  )
  defer { try? fileManager.removeItem(at: stagingDirectory) }

  let staged = stagingDirectory.appendingPathComponent("output")
  try Data(text.utf8).write(to: staged)

  // Publish the completed file only if the chosen name is still free.
  guard renamex_np(staged.path, destination.path, UInt32(RENAME_EXCL)) == 0 else {
    let failure = errno
    if failure == EEXIST {
      throw CocoaError(.fileWriteFileExists, userInfo: [
        NSLocalizedDescriptionKey: "A file already exists at this location. Choose a new filename."
      ])
    }
    throw POSIXError(POSIXErrorCode(rawValue: failure) ?? .EIO)
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
  private var window: NSWindow?
  private var webView: WKWebView?
  private var bundledWebRoot: URL?
  private var hasShownFatalError = false
  private var hasInterfaceStarted = false
  private var startupCheck: DispatchWorkItem?
#if DEBUG
  private var nativeQA: NativeQA?
#endif

  func applicationDidFinishLaunching(_ notification: Notification) {
#if DEBUG
    if NativeQA.requested {
      do {
        nativeQA = try NativeQA()
        nativeQA?.armTimeout()
      } catch {
        fputs("Untwine QA refused unsafe or unavailable setup.\n", stderr)
        NSApp.terminate(nil)
        return
      }
    } else {
      configureMainMenu()
    }
#else
    configureMainMenu()
#endif

    let contentController = WKUserContentController()
    contentController.add(self, name: saveMessageHandler)
    contentController.add(self, name: readyMessageHandler)

    let configuration = WKWebViewConfiguration()
    configuration.userContentController = contentController
    configuration.websiteDataStore = .nonPersistent()

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    window.title = "Untwine"
    window.titlebarAppearsTransparent = true
    window.minSize = NSSize(width: 820, height: 620)
    window.contentView = webView
    window.center()
#if DEBUG
    if nativeQA == nil { window.makeKeyAndOrderFront(nil) }
    else { window.ignoresMouseEvents = true }
#else
    window.makeKeyAndOrderFront(nil)
#endif

    self.window = window
    self.webView = webView

    loadBundledInterface(in: webView)
#if DEBUG
    if nativeQA == nil { NSApp.activate(ignoringOtherApps: true) }
#else
    NSApp.activate(ignoringOtherApps: true)
#endif
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    true
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    if message.name == readyMessageHandler {
      hasInterfaceStarted = true
      startupCheck?.cancel()
      startupCheck = nil
#if DEBUG
      if message.frameInfo.isMainFrame { nativeQA?.start(in: message.webView) }
#endif
      return
    }

    guard message.name == saveMessageHandler,
          let body = message.body as? [String: Any],
          let action = body["action"] as? String,
          action == "save",
          let kind = body["kind"] as? String,
          let proposedName = body["name"] as? String,
          let text = body["text"] as? String
    else {
#if DEBUG
      if message.name == saveMessageHandler { nativeQA?.fail("unexpected_save") }
#endif
      return
    }

#if DEBUG
    if let nativeQA {
      guard message.frameInfo.isMainFrame else { nativeQA.fail("unexpected_frame"); return }
      nativeQA.save(kind: kind, name: proposedName, text: text) { [weak self] completion in
        self?.webView?.evaluateJavaScript("window.untwineDidSave?.({saved:true,message:'Saved translated.repaired.xlf'});") { _, _ in
          completion()
        }
      }
      return
    }
#endif
    presentSavePanel(kind: kind, proposedName: proposedName, text: text)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }

    if url.scheme == "about" {
      decisionHandler(.allow)
      return
    }

    if url.isFileURL, let bundledWebRoot {
      let allowedRoot = bundledWebRoot.resolvingSymlinksInPath()
      let candidate = url.resolvingSymlinksInPath()
      let allowedPrefix = allowedRoot.path.hasSuffix("/") ? allowedRoot.path : "\(allowedRoot.path)/"
      if candidate.path == allowedRoot.path || candidate.path.hasPrefix(allowedPrefix) {
        decisionHandler(.allow)
        return
      }
    }

    decisionHandler(.cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
    guard !hasInterfaceStarted else { return }

    let check = DispatchWorkItem { [weak self, weak webView] in
      guard let self, !self.hasInterfaceStarted, let webView else { return }
      webView.evaluateJavaScript("window.untwineAppReady === true") { [weak self] result, error in
        guard let self, !self.hasInterfaceStarted else { return }
        if error == nil, result as? Bool == true {
          self.hasInterfaceStarted = true
          return
        }
        self.showFatalError("Untwine's local interface did not finish starting.")
      }
    }
    startupCheck = check
    DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: check)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
    showFatalError("Untwine could not load its local interface: \(error.localizedDescription)")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
    showFatalError("Untwine could not start its local interface: \(error.localizedDescription)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    startupCheck?.cancel()
    showFatalError("Untwine's local WebKit process stopped unexpectedly.")
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping ([URL]?) -> Void
  ) {
#if DEBUG
    if let nativeQA {
      nativeQA.fail("unexpected_open_panel")
      completionHandler(nil)
      return
    }
#endif
    guard let window else {
      completionHandler(nil)
      return
    }

    let openPanel = NSOpenPanel()
    openPanel.allowsMultipleSelection = parameters.allowsMultipleSelection
    openPanel.canChooseDirectories = parameters.allowsDirectories
    openPanel.canChooseFiles = !parameters.allowsDirectories
    openPanel.allowedContentTypes = [
      UTType(filenameExtension: "xlf", conformingTo: .xml),
      UTType(filenameExtension: "xliff", conformingTo: .xml)
    ].compactMap { $0 }

    openPanel.beginSheetModal(for: window) { response in
      completionHandler(response == .OK ? openPanel.urls : nil)
    }
  }

  private func loadBundledInterface(in webView: WKWebView) {
    guard let resources = Bundle.main.resourceURL else {
      showFatalError("Untwine could not locate its bundled resources.")
      return
    }

    let webRoot = resources.appendingPathComponent("Web", isDirectory: true)
    let indexURL = webRoot.appendingPathComponent("index.html", isDirectory: false)
    guard FileManager.default.fileExists(atPath: indexURL.path) else {
      showFatalError("Untwine's local interface is missing from the app bundle.")
      return
    }

    bundledWebRoot = webRoot
    webView.loadFileURL(indexURL, allowingReadAccessTo: webRoot)
  }

  private func presentSavePanel(kind: String, proposedName: String, text: String) {
    guard let window else { return }

    let savePanel = NSSavePanel()
    savePanel.canCreateDirectories = true
    savePanel.isExtensionHidden = false
    savePanel.nameFieldStringValue = safeFileName(proposedName, kind: kind)

    savePanel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let destination = savePanel.url else {
        self?.notifyWebView(saved: false, message: "Save cancelled")
        return
      }

      do {
        try writeSavedText(text, to: destination)
        self?.notifyWebView(saved: true, message: "Saved \(destination.lastPathComponent)")
      } catch {
        self?.showError("Untwine could not save the file.", detail: error.localizedDescription)
        self?.notifyWebView(saved: false, message: "Save failed")
      }
    }
  }

  private func safeFileName(_ proposedName: String, kind: String) -> String {
    let candidate = URL(fileURLWithPath: proposedName).lastPathComponent
    let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
    let fallback = kind == "report" ? "untwine-diagnosis.json" : "articulate-import-safe.repaired.xlf"
    guard !trimmed.isEmpty, trimmed != ".", trimmed != ".." else { return fallback }

    let capped = String(trimmed.prefix(180))
    if kind == "report" {
      return capped.lowercased().hasSuffix(".json") ? capped : "\(capped).json"
    }

    let lowercased = capped.lowercased()
    return lowercased.hasSuffix(".xlf") || lowercased.hasSuffix(".xliff") ? capped : "\(capped).xlf"
  }

  private func notifyWebView(saved: Bool, message: String) {
    guard let webView,
          let data = try? JSONSerialization.data(withJSONObject: ["saved": saved, "message": message]),
          let payload = String(data: data, encoding: .utf8)
    else {
      return
    }

    webView.evaluateJavaScript("window.untwineDidSave?.(\(payload));")
  }

  private func showFatalError(_ message: String) {
#if DEBUG
    if let nativeQA { nativeQA.fail("interface_failure"); return }
#endif
    guard !hasShownFatalError else { return }
    hasShownFatalError = true
    showError("Untwine could not start.", detail: message)
  }

  private func showError(_ message: String, detail: String) {
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = message
    alert.informativeText = detail
    if let window {
      alert.beginSheetModal(for: window)
    } else {
      alert.runModal()
    }
  }

  private func configureMainMenu() {
    let mainMenu = NSMenu()

    let applicationItem = NSMenuItem()
    let applicationMenu = NSMenu()
    applicationMenu.addItem(withTitle: "About Untwine", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    applicationMenu.addItem(.separator())
    applicationMenu.addItem(withTitle: "Quit Untwine", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    applicationItem.submenu = applicationMenu
    mainMenu.addItem(applicationItem)

    let editItem = NSMenuItem()
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = editMenu
    mainMenu.addItem(editItem)

    NSApp.mainMenu = mainMenu
  }
}

MainActor.assumeIsolated {
  let application = NSApplication.shared
  let delegate = AppDelegate()
#if DEBUG
  application.setActivationPolicy(NativeQA.requested ? .prohibited : .regular)
#else
  application.setActivationPolicy(.regular)
#endif
  application.delegate = delegate
  withExtendedLifetime(delegate) {
    application.run()
  }
}
