// Gatekeeper — runs in the PAGE's main world (injected via a <script> tag by
// content.js) so it can read window.ytInitialPlayerResponse, which the isolated
// content-script world cannot see. Posts the videoDetails back via window.postMessage.
//
// Also nudges autoplay off: YouTube stores the preference under this key.

(() => {
  function readDetails() {
    try {
      const pr = window.ytInitialPlayerResponse;
      const vd = pr && pr.videoDetails;
      if (!vd) return null;
      return {
        videoId: vd.videoId || '',
        title: vd.title || '',
        channel: vd.author || '',
        description: vd.shortDescription || '',
        lengthSeconds: Number(vd.lengthSeconds) || 0,
      };
    } catch {
      return null;
    }
  }

  function post() {
    const details = readDetails();
    window.postMessage({ __gk: true, type: 'player-details', details }, '*');
  }

  // ytInitialPlayerResponse may not be ready the instant we inject; retry briefly.
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const details = readDetails();
    if (details || tries >= 10) {
      clearInterval(timer);
      window.postMessage({ __gk: true, type: 'player-details', details: details || null }, '*');
    }
  }, 150);

  post();
})();
