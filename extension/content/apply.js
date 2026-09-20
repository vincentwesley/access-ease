// Registered only after the user opts in to "Apply on all sites".
// Content scripts cannot use static import, so shared modules are loaded
// dynamically (they are listed in web_accessible_resources with
// use_dynamic_url, so pages cannot probe for them by a fixed extension URL).
(async () => {
  try {
    const url = (p) => chrome.runtime.getURL(p);
    const [{ loadSettings, STORAGE_KEY, migrate }, { buildCss, fontUrls }, { applyCssInPage }] =
      await Promise.all([
        import(url('lib/settings.js')),
        import(url('lib/css.js')),
        import(url('lib/inject.js')),
      ]);

    let current = null;
    const render = (settings) => {
      current = settings;
      // If "all sites" was turned off, leave the page alone; the panel manages
      // the active tab itself.
      if (!settings.allSites) return;
      applyCssInPage(buildCss(settings, fontUrls(url)), settings.pausedHosts);
    };

    render(await loadSettings());

    // At document_start the page's own CSS has not loaded, so the root font
    // size measured then can be wrong (e.g. html{font-size:62.5%}). Re-measure
    // and re-apply once the page has its styles.
    const again = () => current && current.textScale > 100 && render(current);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', again, { once: true });
    window.addEventListener('load', again, { once: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) render(migrate(changes[STORAGE_KEY].newValue));
    });
  } catch {
    // Extension reloaded/removed, or the page blocked the import: do nothing.
  }
})();
