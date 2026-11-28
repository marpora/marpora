import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { releaseMetadata, prepareAssets, publishRelease } from '../scripts/release.mjs'

function fixture(t, version = '0.3.1') {
  const root = mkdtempSync(join(tmpdir(), 'marpora-release-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'src-tauri')); mkdirSync(join(root, 'docs/releases'), { recursive: true }); mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }))
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package]\nname = "marpora"\nversion = "${version}"\n`)
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), `[[package]]\nname = "marpora"\nversion = "${version}"\n`)
  writeFileSync(join(root, 'docs/releases/default.md'), 'Test release notes')
  const metadata = releaseMetadata(`v${version}`, root), directory = join(root, 'assets')
  for (const name of metadata.names.slice(0, 2)) { const dmg = Buffer.alloc(1024); dmg.write('koly', 512); writeFileSync(join(directory, name), dmg) }
  return { root, directory, metadata }
}
const ok = (value = '') => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' })
const remote = files => files.map(file => ({ name: file.name, size: file.size, digest: file.digest, state: 'uploaded' }))

test('version tags must match every package manifest', t => {
  const f = fixture(t)
  assert.throws(() => releaseMetadata('v0.3.2', f.root), /must match/)
  writeFileSync(join(f.root, 'src-tauri/tauri.conf.json'), '{"version":"0.4.0"}')
  assert.throws(() => releaseMetadata('v0.3.1', f.root), /must agree/)
})
test('both architectures are required and checksums use downloadable basenames', t => {
  const f = fixture(t), files = prepareAssets(f.metadata, f.directory)
  const sums = readFileSync(join(f.directory, 'SHA256SUMS.txt'), 'utf8')
  assert.equal(files.length, 3); assert.match(sums, /  Marpora_0.3.1_aarch64.dmg\n/); assert.match(sums, /  Marpora_0.3.1_x64.dmg\n/)
  rmSync(join(f.directory, f.metadata.names[1]))
  assert.throws(() => prepareAssets(f.metadata, f.directory))
})
test('a renamed non-DMG file cannot be published', t => {
  const f = fixture(t)
  writeFileSync(join(f.directory, f.metadata.names[0]), 'not a disk image')
  assert.throws(() => prepareAssets(f.metadata, f.directory), /Not a UDIF/)
})
test('create draft, resolve draft ID, upload installers, verify digests, then publish', t => {
  const f = fixture(t), files = prepareAssets(f.metadata, f.directory), calls = []
  let exists = false
  const run = args => {
    calls.push(args)
    if (args[1] === 'view') return exists ? ok({ databaseId: 42, isDraft: true }) : { status: 1, stdout: '', stderr: 'release not found' }
    if (args[1] === 'create') exists = true
    if (args[0] === 'api') return ok({ assets: remote(files), draft: true })
    return ok()
  }
  const url = publishRelease({ tag: 'v0.3.1', repository: 'marpora/marpora', ...f, run })
  assert.equal(url, 'https://github.com/marpora/marpora/releases/tag/v0.3.1')
  assert.deepEqual(calls.map(args => args.slice(0, 2).join(' ')), ['release view', 'release create', 'release view', 'release upload', 'api repos/marpora/marpora/releases/42', 'release edit'])
  assert.ok(calls[1].includes('--draft')); assert.ok(calls.at(-1).includes('--draft=false'))
})
test('remote digest mismatch leaves an existing draft unpublished', t => {
  const f = fixture(t), files = prepareAssets(f.metadata, f.directory), calls = []
  const run = args => {
    calls.push(args)
    if (args[1] === 'view') return ok({ databaseId: 42, isDraft: true })
    return args[0] === 'api' ? ok({ draft: true, assets: remote(files).map(asset => ({ ...asset, digest: 'sha256:wrong' })) }) : ok()
  }
  assert.throws(() => publishRelease({ tag: 'v0.3.1', repository: 'marpora/marpora', ...f, run }), /does not match/)
  assert.ok(!calls.some(args => args[1] === 'edit'))
  assert.ok(!calls.some(args => args[1] === 'create'))
})
test('published binaries are never overwritten on rerun', t => {
  const f = fixture(t), files = prepareAssets(f.metadata, f.directory), calls = []
  const run = args => { calls.push(args); return args[1] === 'view' ? ok({ databaseId: 42, isDraft: false, url: 'published' }) : ok({ assets: remote(files) }) }
  assert.equal(publishRelease({ tag: 'v0.3.1', repository: 'marpora/marpora', ...f, run }), 'published')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(args => args[1] === 'view' || args[0] === 'api'))
})
test('permission/network failures cannot be mistaken for a missing release', t => {
  const f = fixture(t), calls = []
  const run = args => { calls.push(args); return { status: 1, stdout: '', stderr: 'HTTP 403 forbidden' } }
  assert.throws(() => publishRelease({ tag: 'v0.3.1', repository: 'marpora/marpora', ...f, run }), /403/)
  assert.equal(calls.length, 1)
})
test('prerelease tags stay prereleases and do not replace latest', t => {
  const f = fixture(t, '0.4.0-beta.1'), files = prepareAssets(f.metadata, f.directory), calls = []
  let exists = false
  const run = args => {
    calls.push(args)
    if (args[1] === 'view') return exists ? ok({ databaseId: 42, isDraft: true }) : { status: 1, stdout: '', stderr: 'release not found' }
    if (args[1] === 'create') exists = true
    return args[0] === 'api' ? ok({ draft: true, assets: remote(files) }) : ok()
  }
  publishRelease({ tag: 'v0.4.0-beta.1', repository: 'marpora/marpora', ...f, run })
  assert.ok(calls[1].includes('--prerelease')); assert.ok(calls.at(-1).includes('--latest=false'))
})
