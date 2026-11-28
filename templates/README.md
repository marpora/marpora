# Marpora templates

Four original, offline presentation packs are included under the project's MIT license. They use system fonts, CSS and Marp's own math renderer, without photographs, web fonts or external scripts.

| Pack | Best for | Visual language |
| --- | --- | --- |
| Orbit | Product launches and technical demos | Oversized type, charcoal and warm light, deliberate contrast, orbital line art |
| Chalk | Lectures, workshops and training | Forest green and warm paper, learning objectives, worked examples, prediction and reveal |
| Thesis | Research talks and defenses | Serif display type, ink blue, equations, study design, evidence and uncertainty |
| Brief | Business proposals and decisions | Warm paper, restrained orange, trade-offs, ownership and next steps |

Use `title`, `statement`, `section` or `closing` in a Marp `class` directive. Column layouts use `<div class="columns">` (or `columns three`) with Markdown-enabled child blocks, as shown in the starters.

Each directory contains `manifest.json`, `theme.css`, `starter.md` and a rendered `cover.png`. Every starter has seven slides with presenter notes. Names and descriptions in the library follow the English/Chinese interface preference; starter prose is English and can be edited freely. Orbit is an original keynote-style design, not an Apple template or an affiliated product.

## Use

Open **Templates** in Marpora, preview the pages and choose **Create presentation**. This creates an unsaved tab. **Apply theme** changes the current Markdown's `theme` value in one undoable editor transaction. YAML source is never serialized; unsupported complex theme values request a Source edit. Other front matter, comments, slide separators, BOM and line endings remain intact.

**Download pack** saves a portable `.marpora.json` file. **Import theme or pack** installs it into the local library using IndexedDB. Installed themes work in newly opened documents, exports and Presenter after an application restart. Theme names cannot shadow built-ins or another installed theme. Local storage is optional for built-in packs; imported packs require it. The library supports up to 50 imported packs.

For external Marp tools, use a pack's `theme.css` with `starter.md`, for example:

```sh
marp --theme templates/orbit/theme.css templates/orbit/starter.md
```

The optional `<pause>` marker uses Marpora's known UIC extension. Ordinary Marp asterisk-list fragments do not require it.

## Package v1

A pack is JSON with the manifest fields plus two strings, `css` and `starter`. Required metadata: `schemaVersion: 1`, publisher-qualified `id`, semantic `version`, localized `name` and `description`, `category`, `author`, `license`, unique `theme`, supported `layouts`, and `minAppVersion`.

CSS must declare the same `@theme` as the starter's front matter. Data URLs may carry images/fonts. Referenced files must be embedded; remote imports and arbitrary JavaScript engines are outside this format. A pack is presentation data, never an executable plugin. Applying a theme is separate from installation. Duplicate package IDs or theme names are rejected; automatic updates and removal are not part of v0.4.0.

## Build a catalog

```sh
npm run templates:catalog
```

`dist-catalog/` contains `catalog.json`, versioned JSON packs, cover previews and the license. It can be copied to a static HTTPS host without running Node on the server. Catalog entries record byte length and SHA-256 for each immutable package. Checksums detect a mismatch; they are not signatures or proof of authorship. v0.4.0 imports local files explicitly and does not fetch a remote catalog automatically.

To refresh actual rendered previews while the development server is running:

```sh
npm run templates:previews
```

This development-only script uses Playwright to capture all 28 sample pages and report layout overflow. It does not add a browser to the application.

See [hosting and marketplace design](../docs/template-platform.md) for the repository, domain, download and creator-payment plan.
