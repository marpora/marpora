import { describe, expect, test } from 'vitest'
import { reducePosition, timerAction, elapsedTime, formatTime, audienceSnapshot, preparePresentation, keyAction, isAction, type PresenterSession } from '../src/lib/presentation'
import { importHtml, renderPreview } from '../src/lib/render'
import { errorMessage } from '../src/lib/i18n'
import { uic } from '../src/lib/samples'

describe('presentation position', () => {
  test('fragments precede advancing, reverse navigation restores the prior complete slide', () => {
    const fragments = [2, 0, 1]
    let position = { slide: 0, step: 0, revision: 0 }
    const next = () => position = reducePosition(fragments, position, { kind: 'next' })
    expect(next()).toEqual({ slide: 0, step: 1, revision: 1 })
    expect(next()).toEqual({ slide: 0, step: 2, revision: 2 })
    expect(next()).toEqual({ slide: 1, step: 0, revision: 3 })
    expect(reducePosition(fragments, position, { kind: 'previous' })).toEqual({ slide: 0, step: 2, revision: 4 })
    position = { slide: 2, step: 1, revision: 7 }
    expect(next()).toBe(position)
    expect(reducePosition(fragments, position, { kind: 'goto', slide: 2 })).toEqual({ slide: 2, step: 0, revision: 8 })
    expect(reducePosition(fragments, position, { kind: 'goto', slide: NaN })).toBe(position)
    expect(reducePosition(fragments, position, { kind: 'goto', slide: 99 }).slide).toBe(2)
    expect(reducePosition(fragments, position, { kind: 'first' })).toEqual({ slide: 0, step: 0, revision: 8 })
    expect(reducePosition([], position, { kind: 'next' })).toBe(position)
  })
  test('keyboard shortcuts leave forms, modifiers and button activation alone', () => {
    expect(keyAction(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toEqual({ kind: 'next' })
    expect(keyAction(new KeyboardEvent('keydown', { key: 'ArrowLeft', metaKey: true }))).toBeUndefined()
    const button = document.createElement('button'), event = new KeyboardEvent('keydown', { key: ' ' })
    button.addEventListener('keydown', event => expect(keyAction(event)).toBeUndefined()); button.dispatchEvent(event)
    expect(isAction({ kind: 'goto', slide: 2 })).toBe(true)
    expect(isAction({ kind: 'goto', slide: '2' })).toBe(false)
    expect(isAction({ kind: 'edit', source: 'bad' })).toBe(false)
  })
})

test('timer uses elapsed time, supports pause/resume and keeps reset paused', () => {
  let timer = { elapsed: 0, startedAt: 100 as number | null }
  expect(elapsedTime(timer, 10100)).toBe(10000)
  timer = timerAction(timer, 'timer-toggle', 10100)
  expect(elapsedTime(timer, 90000)).toBe(10000)
  timer = timerAction(timer, 'timer-toggle', 90000)
  expect(elapsedTime(timer, 92000)).toBe(12000)
  timer = timerAction(timer, 'timer-reset', 92000)
  expect(elapsedTime(timer, 93000)).toBe(1000)
  expect(timerAction({ elapsed: 555, startedAt: null }, 'timer-reset', 93000)).toEqual({ elapsed: 0, startedAt: null })
  expect(formatTime(3661000)).toBe('1:01:01')
})

test('UIC deck stays intact, retains fragments, and audience payload excludes notes and source paths', async () => {
  const result = await renderPreview(uic, { mode: 'slides' })
  const before = JSON.stringify(result)
  const deck = await preparePresentation(result, null)
  const session: PresenterSession = { id: 'id', title: 'UIC', language: 'en', deck, position: { slide: 0, step: 0, revision: 0 }, notes: result.notes, timer: { elapsed: 0, startedAt: null }, ready: false }
  expect(deck.fragments).toEqual([0, 0, 0, 0, 2, 2, 0, 0, 0, 0])
  expect(JSON.stringify(audienceSnapshot(session))).not.toContain('Presenter notes')
  expect(audienceSnapshot(session)).not.toHaveProperty('notes')
  expect(JSON.stringify(result)).toBe(before)
})

test('exported Marp HTML recovers private notes separately from the script-free audience deck', async () => {
  const rendered = await renderPreview('---\nmarp: true\n---\n# Visible\n\n<!-- SECRET NOTE -->', { mode: 'slides' })
  const source = `<style>${rendered.css}</style>${rendered.html}<div class="bespoke-marp-note" data-index="0"><p>SECRET NOTE</p></div><script>window.injected = true</script>`
  const imported = importHtml(source)
  expect(imported.result.notes).toEqual([['SECRET NOTE']])
  const deck = await preparePresentation(imported.result, null)
  expect(deck.html).not.toContain('SECRET NOTE')
  expect(deck.html).not.toContain('<script')
})


test('presentation errors localize both native strings and frontend Error objects', () => {
  expect(errorMessage(new Error('MAR_PORA:popupBlocked'), 'en')).toContain('Allow pop-up windows')
  expect(errorMessage('MAR_PORA:displayDisconnected', 'zh')).toContain('投影屏幕')
})
