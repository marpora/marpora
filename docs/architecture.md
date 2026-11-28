# Implementation notes

## Source-preserving editing and tabs

A workspace tab owns its source, saved snapshot, original encoding format and view settings. The CodeMirror document is the editing truth; decorations/widgets add live formatting. Metadata, raw HTML, comments and directives retain their original source representation. No render-to-Markdown serializer runs during saving.

One DOM editor is active at a time. `EditorSessions` caches immutable CodeMirror states, selection, history and scroll positions. Restoring a state reconfigures its extensions to the current component and preferences. Saving captures the target tab and source before awaiting a dialog; switching tabs cannot send a save result to a different document. Recovery stores all dirty Markdown buffers, but restores them without disk paths so a stale permission or external file is not overwritten accidentally.

Block preview spacing is padding on a measured wrapper, never vertical margins on a block widget. CodeMirror excludes margins from its height map, which otherwise makes later visual lines map to the wrong source position.

Slides are a read-only display surface: pointer events pass through the script-free iframe to the parent preview pane, and the slide iframe is excluded from the Tab sequence. This is necessary because WebKit blocks even parent-registered event callbacks inside a sandbox without scripts. The pane takes focus on clicks; arrow-key navigation is scoped to that focused surface. Source cursor movement continues to follow the editor without changing its saved text.

## File access

Rust tracks canonical documents and explicitly opened directory roots. Folder listing is lazy and skips hidden/build directories and symlinks. Opening descendants and resolving resources checks canonical paths against the granted root, including symlink resolution. Single-file access limits resources to the document's parent directory. Directory roots are session-only. Original files are not rewritten by HTML/PDF export or preview.

Markdown/HTML inputs are bounded to 16 MiB, PDFs to 64 MiB, and individual embedded resources to 20 MiB. Markdown save retains BOM and LF/CRLF, checks the saved disk snapshot, writes a temporary file in the destination directory, syncs, and replaces the destination. Export similarly persists a complete temporary output only after conversion succeeds.

## Rendering

Marp and KaTeX load on demand. Ordinary previews use Markdown-it. Authored HTML is sanitized and previewed in an iframe whose CSP and sandbox disable scripts. Marp HTML imports extract its SVG slides and CSS into this same preview surface. Imported HTML/PDF is read-only. PDF.js and its worker load only for PDF tabs; only the current page is rasterized. Fonts, CMaps and optional WASM decoding assets ship locally, without the rest of the upstream viewer application.

## Export

Standalone HTML starts from the same sanitized render, embeds image/font/CSS resources as data URLs and adds only an app-owned navigation script. It uses print CSS with an exact slide aspect ratio and all fragments visible. A missing resource fails the export rather than silently dropping content. There is no Markdown mutation and no automatic source save.

macOS builds compile a small Swift helper in `build.rs` for the target architecture, linked to system AppKit, WebKit and PDFKit. The helper uses a nonpersistent WebView, waits for fonts/images and captures each slide independently through `WKWebView.createPDF`. PDFKit joins those pages. Ordinary documents use an existing browser for print pagination; this avoids an unstable WebKit print-operation path with long documents. The helper runs in a disposable directory with a bounded runtime; it is not a bundled browser.

Windows/Linux use supported standard installation paths for an existing Chrome/Edge/Chromium, with a separate temporary profile and headless printing. macOS can fall back to an existing browser if native export fails. No browser downloader, Node runtime or Chromium binary is distributed. Platform/browser rendering differences still require platform tests.

The application CSP permits local worker execution and WASM for PDF decoding. This does not change the script-free preview iframe policy. Referenced remote images/fonts may use the network; the application itself has no telemetry or hosted API.

## Dual-screen Presenter

The existing main window becomes a presenter console while its editor remains mounted and hidden. A dedicated audience WebView is created through Rust on the selected display using physical monitor coordinates; windowed rehearsal is also supported. Display identifiers include geometry and scale and are revalidated before opening and during the session. Closing either window or losing the projection display cleans up the session. Each audience window has a unique session label, so delayed destroy events cannot end a newer presentation.

The main frontend owns a frozen rendered deck, slide/fragment reducer and monotonic elapsed timer. Audience keyboard commands return to that controller; only the controller increments position revisions. Rust stores the latest bounded position and ignores older revisions, and the audience subscribes before requesting its initial snapshot. Reopening/reloading the audience therefore cannot roll back a newer position. Reverse navigation goes through fragments and restores all fragments when returning to the previous slide. Thumbnail jumps reset fragments on the target slide.

Audience snapshots explicitly omit speaker notes and source paths. Local images and CSS resources are embedded once per session; audience frames contain sanitized slide markup and cannot execute authored scripts. Standard Marp HTML notes are extracted separately from SVGs. The current slide, next slide and thumbnail strip reuse the same script-free surface and official Marpit SVG polyfill. All thumbnails share one frame rather than allocating one WebView/frame per slide. The UIC presenter extension informed the resizable panes, double-click reset, persistent layout and synchronized thumbnail interaction; its MIT license remains in `examples/uic/LICENSE`.

Browser development uses a separate pop-up and a session-scoped BroadcastChannel instead of native commands. It has the same authoritative reducer and revision checks, but no monitor selection. No HTTP/WebSocket server, browser engine download or new runtime dependency is introduced. Presenter Pro features such as remote control, annotations and countdowns are outside this basic implementation.
