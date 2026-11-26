# Repository and website plan

Keep **`marpora/marpora` as the application source**. Its existing URL, issue history, stars, release tags and package workflow remain stable. A product website does not need the short repository name.

| Repository | Purpose | Status |
| --- | --- | --- |
| `marpora/marpora` | Desktop source, issues, documentation, builds and releases | Existing |
| `marpora/.github` | Public organization profile at `profile/README.md`; shared community files when useful | Organization profile |
| `marpora/marpora.github.io` | Product website, downloads, screenshots and guides | Proposed; not created in this change |
| `marpora/templates` | Reusable Marp themes, example Markdown, assets, licenses and rendered previews | Proposed; not created in this change |

GitHub Pages uses an organization repository named `<organization>.github.io` for the root site. It can later use a custom domain without renaming the app repository. Website copy and screenshots can iterate separately from desktop releases.

Start a template catalog as a repository, with one directory per template, a license, source attribution, theme CSS, example Markdown, thumbnail, and compatibility metadata. A website can read that catalog later. Keep engine JavaScript explicitly reviewed and opt-in; theme content should not imply executing an unknown plugin.

The current UIC sample remains an attributed regression fixture in the application while the catalog is planned. No UIC-specific top-level action is needed.

## GitHub copy

**Organization display name:** Marpora

**Organization / repository description:** A lightweight, local-first Markdown editor with live editing and Marp slides. macOS first.

**Tagline:** Write locally. Present freely.

**Topics:** markdown, markdown-editor, marp, slides, tauri, svelte, typescript, macos, cross-platform, local-first.

Use the repository URL as the organization website until there is an actual public product site. Do not advertise a nonexistent download or domain. The avatar PNGs in `brand` are ready for the organization settings; the square image already contains space for GitHub's circular crop.

References: [GitHub organization profiles](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile), [GitHub Pages repository naming](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
