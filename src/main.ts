import { mount } from 'svelte'
import './app.css'

// Audience windows never mount the editor, restore drafts, or receive speaker notes.
const audience = (window as Window & { __MARPORA_AUDIENCE_SESSION__?: string }).__MARPORA_AUDIENCE_SESSION__ || new URLSearchParams(location.search).get('audience')
if (audience) {
  void import('./components/Audience.svelte').then(({ default: Audience }) => mount(Audience, { target: document.getElementById('app')!, props: { id: audience } }))
} else {
  void import('./App.svelte').then(({ default: App }) => mount(App, { target: document.getElementById('app')! }))
}
