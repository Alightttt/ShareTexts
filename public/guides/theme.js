// Guides theme bootstrap — runs before paint (blocking <script src>), so a
// saved dark choice is applied with zero flash. CSP-safe: external file,
// no inline script needed. Mirrors src/lib/theme.ts storage conventions
// (sharetext.theme = 'dark' | 'light' | null → system).
(function () {
  try {
    var saved = localStorage.getItem('sharetext.theme');
    var dark = saved === 'dark' ||
      (saved !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) { /* private mode: fall back to system via media query */ }
})();
