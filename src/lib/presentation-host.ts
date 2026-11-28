import { invoke } from '@tauri-apps/api/core'
import { desktop } from './files'
import { audienceSnapshot, isAction, preparePresentation, reducePosition, timerAction, type Display, type PresentationAction, type PresenterSession, type AudienceSnapshot } from './presentation'
import type { RenderedPreview } from './render'
import type { Language } from './i18n'

export async function presentationDisplays(): Promise<Display[]> { return desktop ? invoke('presentation_displays') : [] }
export interface PresentationOptions { result: RenderedPreview; path: string | null; title: string; language: Language; slide: number; monitorId: string | null }
export class PresentationHost {
  readonly id = crypto.randomUUID()
  session: PresenterSession | null = null
  private disposed = false
  private popup: Window | null = null
  private channel?: BroadcastChannel
  private cleanups: Array<() => void> = []
  private health?: ReturnType<typeof setInterval>
  private timeout?: ReturnType<typeof setTimeout>
  constructor(private readonly options: PresentationOptions, private readonly changed: (session: PresenterSession) => void, private readonly ended: (reason: string, slide: number) => void, private readonly failed: (error: unknown) => void) {}
  async start() {
    // Open synchronously in the click gesture; preparing images may take time.
    if (!desktop) {
      const url = new URL(window.location.href); url.searchParams.set('audience', this.id); url.hash = ''
      this.channel = new BroadcastChannel(`marpora.presentation.${this.id}`)
      this.channel.onmessage = ({ data }) => {
        if (this.disposed || data?.id !== this.id) return
        if (data.kind === 'hello') this.sendSnapshot()
        if (data.kind === 'ready') this.ready()
        if (data.kind === 'action' && isAction(data.action)) this.action(data.action)
      }
      this.popup = window.open(url, `marpora-audience-${this.id}`, 'popup,width=1100,height=720')
      if (!this.popup) { this.channel.close(); this.channel = undefined; throw new Error('MAR_PORA:popupBlocked') }
    } else {
      const { listen } = await import('@tauri-apps/api/event')
      const registrations = await Promise.allSettled([
        listen<{ id: string; action: PresentationAction }>('presentation-command', ({ payload }) => { if (payload.id === this.id && isAction(payload.action)) this.action(payload.action) }),
        listen<{ id: string }>('presentation-ready', ({ payload }) => { if (payload.id === this.id) this.ready() }),
        listen<{ id: string; reason: string }>('presentation-closed', ({ payload }) => { if (payload.id === this.id) void this.stop(payload.reason) }),
      ])
      for (const registration of registrations) if (registration.status === 'fulfilled') this.cleanups.push(registration.value)
      if (this.disposed) { this.cleanups.splice(0).forEach(cleanup => cleanup()); return }
      const failure = registrations.find(registration => registration.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    try {
      const deck = await preparePresentation(this.options.result, this.options.path)
      if (this.disposed) return
      const position = { slide: Math.max(0, Math.min(this.options.slide, deck.fragments.length - 1)), step: 0, revision: 0 }
      this.session = { id: this.id, title: this.options.title, language: this.options.language, deck, position, notes: this.options.result.notes.map(notes => [...notes]), timer: { elapsed: 0, startedAt: null }, ready: false }
      if (desktop) await invoke('presentation_open', { snapshot: audienceSnapshot(this.session), monitorId: this.options.monitorId })
      else this.sendSnapshot()
      if (this.disposed) { if (desktop) await invoke('presentation_close', { id: this.id }); return }
      this.changed(this.session)
      this.timeout = setTimeout(() => { if (!this.session?.ready) { this.failed(new Error('MAR_PORA:audienceTimeout')); void this.stop() } }, 20000)
      this.health = setInterval(() => {
        if (desktop) void invoke<boolean>('presentation_health', { id: this.id }).then(alive => { if (!alive && !this.disposed) void this.stop('audience-closed') }).catch(error => { if (!this.disposed) this.failed(error) })
        else if (this.popup?.closed) void this.stop('audience-closed')
      }, 1500)
    } catch (error) { await this.stop(); throw error }
  }
  private sendSnapshot() { if (this.session && !this.disposed) this.channel?.postMessage({ kind: 'snapshot', id: this.id, snapshot: audienceSnapshot(this.session) }) }
  private ready() {
    if (!this.session || this.disposed || this.session.ready) return
    clearTimeout(this.timeout)
    this.session = { ...this.session, ready: true, timer: { elapsed: 0, startedAt: performance.now() } }; this.changed(this.session)
  }
  action(action: PresentationAction) {
    if (this.disposed || !this.session) return
    if (action.kind === 'end') { void this.stop(); return }
    if (action.kind === 'timer-toggle' || action.kind === 'timer-reset') {
      if (this.session.ready) { this.session = { ...this.session, timer: timerAction(this.session.timer, action.kind) }; this.changed(this.session) }
      return
    }
    const position = reducePosition(this.session.deck.fragments, this.session.position, action)
    if (position === this.session.position) return
    this.session = { ...this.session, position }; this.changed(this.session)
    if (desktop) void invoke('presentation_update', { id: this.id, position }).catch(error => { if (!this.disposed) this.failed(error) })
    else this.channel?.postMessage({ kind: 'position', id: this.id, position })
  }
  showAudience() {
    if (this.disposed) return
    if (desktop) void invoke('presentation_focus', { id: this.id }).catch(error => { if (!this.disposed) this.failed(error) })
    else this.popup?.focus()
  }
  async stop(reason = 'ended') {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.timeout); clearInterval(this.health)
    this.cleanups.splice(0).forEach(cleanup => cleanup())
    this.channel?.postMessage({ kind: 'ended', id: this.id }); this.channel?.close()
    this.popup?.close()
    if (desktop) { try { await invoke('presentation_close', { id: this.id }) } catch (error) { this.failed(error) } }
    this.ended(reason, this.session?.position.slide ?? this.options.slide)
  }
}
