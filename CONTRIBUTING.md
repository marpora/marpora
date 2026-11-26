# Contributing

Use the setup and checks in [README.md](README.md). Small, focused changes are easiest to review. English and Chinese reports are both welcome.

For editor changes, preserve Markdown bytes, unknown Marp directives, front matter, comments, BOM and line endings. Check both live and source modes, tab switching and undo. Do not serialize rendered HTML back into Markdown.

For preview/export changes, use the ten-page UIC fixture and a plain document. Check fonts, local resources, fragment visibility, page count and aspect ratio. Render PDF output and inspect it visually. Keep arbitrary authored JavaScript disabled in previews.

Keep the app lightweight: load specialized renderers on demand and avoid bundling a browser or Node runtime. Check native resource grants when adding file features. Add tests for behavior that could otherwise regress; avoid tests that merely repeat implementation details.

Please describe the actual behavior change, how you verified it and any platform you could not test. Do not claim a Windows/Linux runtime check based only on a macOS build.
