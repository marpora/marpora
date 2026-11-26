import css from 'katex/dist/katex.min.css?raw'

// Every supported WebView understands WOFF2. Shipping the WOFF and TTF
// fallbacks as well would duplicate the same math fonts three times.
const assets = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true, query: '?url', import: 'default',
})
const fonts = new Map(Object.entries(assets).map(([path, url]) => [path.split('/').pop(), url]))

export default css.replace(/src:[^;}]+/g, (declaration) => {
  const filename = declaration.match(/url\(["']?fonts\/([^"')]+\.woff2)/)?.[1]
  const url = filename ? fonts.get(filename) : undefined
  return url ? `src:url("${url}") format("woff2")` : declaration
})
