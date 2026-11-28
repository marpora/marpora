import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, lstatSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export function releaseMetadata(tag, root = projectRoot) {
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || tag !== `v${version}`) throw new Error(`Tag ${tag} must match package version v${version}`)
  const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')).version
  const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8').split(/^\[/m).find(section => section.startsWith('package]'))?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  const cargoLock = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8').split('[[package]]').find(section => /^name\s*=\s*"marpora"/m.test(section))?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
  if ([tauri, cargo, cargoLock, lock.version, lock.packages?.['']?.version].some(value => value !== version)) throw new Error('Package, lockfile, Cargo and Tauri versions must agree')
  return { tag, version, prerelease: version.includes('-'), names: [`Marpora_${version}_aarch64.dmg`, `Marpora_${version}_x64.dmg`, 'SHA256SUMS.txt'] }
}

export function prepareAssets(metadata, directory) {
  const files = metadata.names.slice(0, 2).map(name => {
    const path = resolve(directory, name)
    if (!lstatSync(path).isFile()) throw new Error(`Expected regular release asset: ${name}`)
    const bytes = readFileSync(path)
    if (bytes.length < 512 || bytes.subarray(bytes.length - 512, bytes.length - 508).toString() !== 'koly') throw new Error(`Not a UDIF disk image: ${name}`)
    return { name, path, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
  })
  const path = resolve(directory, 'SHA256SUMS.txt')
  const bytes = Buffer.from(files.map(file => `${file.digest.slice(7)}  ${file.name}`).join('\n') + '\n')
  writeFileSync(path, bytes)
  return [...files, { name: 'SHA256SUMS.txt', path, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }]
}

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', env: process.env })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
function checked(run, args) {
  const result = run(args)
  if (result.status !== 0) throw new Error(result.stderr || `GitHub CLI failed: ${args.slice(0, 2).join(' ')}`)
  return result.stdout
}
export function verifyAssets(release, files) {
  for (const file of files) {
    const asset = release.assets?.find(asset => asset.name === file.name)
    if (!asset || asset.state !== 'uploaded' || asset.size !== file.size || asset.digest !== file.digest) throw new Error(`Release asset does not match verified build: ${file.name}`)
  }
}
export function publishRelease({ tag, repository, directory, root = projectRoot, run = gh }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Set GH_REPO to owner/repository')
  const metadata = releaseMetadata(tag, root)
  const files = prepareAssets(metadata, directory)
  const viewArgs = ['release', 'view', tag, '--repo', repository, '--json', 'databaseId,isDraft,url']
  const existing = run(viewArgs)
  let summary
  if (existing.status === 0) summary = JSON.parse(existing.stdout)
  else if (!/release not found|HTTP 404/i.test(existing.stderr)) throw new Error(existing.stderr || 'Could not check existing release')
  const readRelease = id => {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid GitHub release ID')
    // GitHub's /releases/tags endpoint excludes drafts. Resolve their ID with
    // gh release view, then read assets through the authenticated ID endpoint.
    return JSON.parse(checked(run, ['api', `repos/${repository}/releases/${id}`]))
  }
  if (summary && !summary.isDraft) {
    // Published binaries are immutable here: a rerun must never silently replace them.
    verifyAssets(readRelease(summary.databaseId), files)
    return summary.url
  }
  if (!summary) {
    const specific = resolve(root, `docs/releases/${tag}.md`)
    const notes = existsSync(specific) ? specific : resolve(root, 'docs/releases/default.md')
    const args = ['release', 'create', tag, '--repo', repository, '--verify-tag', '--draft', '--title', `Marpora ${tag}`, '--notes-file', notes]
    if (!existsSync(specific)) args.push('--generate-notes')
    if (metadata.prerelease) args.push('--prerelease')
    checked(run, args)
    summary = JSON.parse(checked(run, viewArgs))
  }
  checked(run, ['release', 'upload', tag, '--repo', repository, ...files.map(file => file.path), '--clobber'])
  // All assets must have the expected names, sizes and GitHub SHA-256 digests
  // before the draft becomes publicly downloadable.
  verifyAssets(readRelease(summary.databaseId), files)
  checked(run, ['release', 'edit', tag, '--repo', repository, '--draft=false', `--prerelease=${metadata.prerelease}`, metadata.prerelease ? '--latest=false' : '--latest=true'])
  return `https://github.com/${repository}/releases/tag/${tag}`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, tag, directory] = process.argv.slice(2)
    if (operation === 'check') console.log(JSON.stringify(releaseMetadata(tag)))
    else if (operation === 'publish') console.log(publishRelease({ tag, directory: resolve(directory || 'release-assets'), repository: process.env.GH_REPO }))
    else throw new Error('Usage: node scripts/release.mjs check|publish vX.Y.Z [asset-directory]')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
