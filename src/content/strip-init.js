// Gatekeeper — runs at document_start, before first paint.
// Its only job: set <html data-gatekeeper> (and the comments flag) from storage
// as early as possible so strip.css applies the right layer with no flash, and
// hard-redirect /shorts/* away before the reel can load.
//
// Classic content script. Depends on globalThis.GK (loaded just before this).

(() => {
  const html = document.documentElement;

  // Shorts are a stream with no stable item to judge — redirect immediately.
  // Do this synchronously; no storage read needed.
  if (location.pathname.startsWith('/shorts/')) {
    location.replace('https://www.youtube.com/results');
    return;
  }

  function apply(session, config) {
    const state = session ? session.state : GK.STATES.NO_SESSION;

    const leisure = session && session.mode === 'leisure';
    if ((config && config.strippingOff) || (state === GK.STATES.ACTIVE && leisure)) {
      // Friend-key global disable, or an active leisure block -> full YouTube.
      html.dataset.gatekeeper = 'off';
    } else if (state === GK.STATES.ACTIVE) {
      html.dataset.gatekeeper = 'active';
    } else {
      // NO_SESSION or EXPIRED -> wall. content.js paints it.
      html.dataset.gatekeeper = 'wall';
    }

    if (config && config.hideComments) {
      html.dataset.gkComments = 'hide';
    } else {
      delete html.dataset.gkComments;
    }
  }

  // Async read — but because strip.css hides the whole app until an attribute is
  // present, the gap between now and this callback cannot show the homepage.
  chrome.storage.local.get(['session', 'config'], (out) => {
    apply(out.session, out.config);
  });

  // React to state changes pushed while the page is open (session start/end/expire).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.session || changes.config) {
      chrome.storage.local.get(['session', 'config'], (out) => apply(out.session, out.config));
    }
  });
})();
