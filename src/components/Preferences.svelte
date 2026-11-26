<script lang="ts">
  import { translator } from '../lib/i18n'
  import type { Preferences } from '../lib/preferences'
  let { value, onchange, onclose }: { value: Preferences; onchange: (value: Preferences) => void; onclose: () => void } = $props()
  const t = $derived(translator(value.language))
  const colors = ['system', 'blue', 'teal', 'rose', 'amber'] as const
</script>

<div class="preferences-panel" role="region" aria-label={t('preferences')}>
  <div class="preferences-heading"><strong>{t('preferences')}</strong><button class="icon-button" onclick={onclose} aria-label={t('close')}>×</button></div>
  <label for="language">{t('language')}</label>
  <select id="language" value={value.language} onchange={(event) => onchange({ ...value, language: event.currentTarget.value as Preferences['language'] })}>
    <option value="en">English</option><option value="zh">简体中文</option>
  </select>
  <label for="appearance">{t('appearance')}</label>
  <select id="appearance" value={value.appearance} onchange={(event) => onchange({ ...value, appearance: event.currentTarget.value as Preferences['appearance'] })}>
    <option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option>
  </select>
  <label for="accent">{t('accent')}</label>
  <select id="accent" value={value.accent} onchange={(event) => onchange({ ...value, accent: event.currentTarget.value as Preferences['accent'] })}>
    {#each colors as color}<option value={color}>{t(color)}</option>{/each}
  </select>
  <p>{t('preferencesHint')}</p>
</div>
