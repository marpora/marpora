# Marpora identity

The mark is a folded **M**: four connected paper planes, joining Markdown writing and slide presentation in one silhouette. The diagonal folds remain visible at small sizes without a border, shadow, gradient or animation.

- **Primary:** [mark.svg](mark.svg), transparent, editable paths on a 128 × 128 grid.
- **GitHub avatar:** [avatar-512.png](avatar-512.png) or [avatar-1024.png](avatar-1024.png). Opaque paper background; tested with a circular crop. Upload the square image without cropping it further.
- **Avatar source:** [avatar.svg](avatar.svg).
- **Single color:** [mark-mono.svg](mark-mono.svg), using `currentColor`. Use dark ink on light backgrounds and white on dark backgrounds.
- **Wordmark:** [wordmark.svg](wordmark.svg). Editable text uses the local system sans-serif; convert the text to outlines in a vector editor when exact typography across machines is required.
- **Design checks:** [identity-board.png](identity-board.png), including 16 / 24 / 32 / 48 px, monochrome and circular crop.
- **App icons:** generated from `avatar.svg` in `src-tauri/icons` for macOS, Windows and Linux.

## Color and spacing

The principal blue is `#2855C5`. Fold faces use `#2448A6`, `#5681DF` and `#1E3F91`; the paper background is `#F6F7FB`. Product accent colors are independent from the brand mark.

Keep at least 16 units of clear space on the 128-unit mark grid. Minimum recommended mark canvas: 16 px; prefer 24 px and above where space allows. Preserve the aspect ratio and geometry. For single-color printing use the monochrome path, rather than approximating the blue faces with gray.

The avatar embeds the original mark at 3× within a 512-unit square, with generous room for circular masks. The background is deliberately square for GitHub; the platform supplies its own mask.
