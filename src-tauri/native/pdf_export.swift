import AppKit
import WebKit
import PDFKit

// A small helper linked only against macOS frameworks. It never ships a browser.
@MainActor
final class Renderer: NSObject, WKNavigationDelegate {
    let input: URL
    let output: URL
    let pages: Int
    let size: CGSize
    let webView: WKWebView
    let window: NSWindow
    let document = PDFDocument()
    var index = 0

    init(input: URL, output: URL, pages: Int, size: CGSize) {
        self.input = input
        self.output = output
        self.pages = pages
        self.size = size
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: configuration)
        window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: .borderless, backing: .buffered, defer: false)
        super.init()
        window.isReleasedWhenClosed = false
        window.contentView = webView
        webView.navigationDelegate = self
    }

    func start() {
        webView.loadFileURL(input, allowingReadAccessTo: input.deletingLastPathComponent())
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { self.fail("System WebKit PDF export timed out.") }
    }

    func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(message.utf8))
        exit(1)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { renderNext() }

    func renderNext() {
        let script = """
        if (window.MarporaExport && pages > 0) window.MarporaExport.show(index, true);
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; })));
        await new Promise(resolve => setTimeout(resolve, 80));
        return true;
        """
        Task { @MainActor in
            do {
                _ = try await webView.callAsyncJavaScript(script, arguments: ["index": index, "pages": pages], in: nil, contentWorld: .page)
                self.capture()
            } catch { self.fail(error.localizedDescription) }
        }
    }

    func capture() {
        let configuration = WKPDFConfiguration()
        configuration.rect = CGRect(origin: .zero, size: size)
        webView.createPDF(configuration: configuration) { result in
            switch result {
            case .failure(let error): self.fail(error.localizedDescription)
            case .success(let data):
                guard let page = PDFDocument(data: data)?.page(at: 0) else { self.fail("WebKit returned an empty page.") }
                self.document.insert(page, at: self.index)
                self.index += 1
                if self.index < self.pages { self.renderNext() }
                else {
                    guard self.document.write(to: self.output) else { self.fail("Cannot write PDF output.") }
                    exit(0)
                }
            }
        }
    }


}

guard CommandLine.arguments.count == 6,
      let pages = Int(CommandLine.arguments[3]), pages > 0,
      let width = Double(CommandLine.arguments[4]), let height = Double(CommandLine.arguments[5]) else { exit(2) }
MainActor.assumeIsolated {
    let application = NSApplication.shared
    application.setActivationPolicy(.prohibited)
    let renderer = Renderer(input: URL(fileURLWithPath: CommandLine.arguments[1]), output: URL(fileURLWithPath: CommandLine.arguments[2]), pages: pages, size: CGSize(width: width, height: height))
    renderer.start()
    withExtendedLifetime(renderer) { application.run() }
}
