// Register service worker — loaded via <script> in root layout
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed (e.g. localhost HTTP) — non-fatal
    })
  })
}
