# Releases

Main pushes and manual branch runs build macOS installers as 30-day Actions artifacts. Pushing a version tag such as `v0.3.2` also publishes the installers to a persistent GitHub Release. No personal access token is needed: only the release job receives `contents: write` via `GITHUB_TOKEN`.

## Publish a version

1. Synchronize the version in `package.json`, `package-lock.json` (root and root package), `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (the `marpora` package) and `src-tauri/tauri.conf.json`.
2. Add optional release notes at `docs/releases/vX.Y.Z.md`. Without that file, the workflow combines the standard macOS installation note with GitHub-generated change notes.
3. Run the normal project checks, `npm run test:release` and `node scripts/release.mjs check vX.Y.Z`.
4. Commit and push the release commit, then push an annotated tag pointing at it:

```sh
git tag -a vX.Y.Z -m "Marpora vX.Y.Z"
git push origin vX.Y.Z
```

The tag must match every version manifest. The macOS matrix builds Apple Silicon and Intel DMGs, verifies the complete ad-hoc application signature and disk-image checksum, then uploads artifacts. The dependent release job requires both architectures, generates `SHA256SUMS.txt`, uploads all three files to a draft and verifies their names, sizes and GitHub SHA-256 digests before publishing it. A failed architecture cannot produce a partial public release.

Tags with a prerelease suffix, such as `v0.4.0-beta.1`, are published as prereleases and do not replace the latest stable version. Publishing an already complete release with the exact same files is a no-op. Public release binaries are never overwritten automatically; if a rebuilt DMG differs, the job fails rather than replacing it. To retry an upload, rerun only the failed release job so the verified build artifacts are reused. Existing draft notes are preserved.

Current builds are ad-hoc signed, without Apple Developer ID signing or notarization. The release notes say this explicitly. Signing verification does not imply Gatekeeper trust. Intel artifacts are compiled and signature-checked; Intel runtime testing remains separate.

Consumers can verify downloads with:

```sh
shasum -a 256 -c SHA256SUMS.txt
```
