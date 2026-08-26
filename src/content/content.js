// Gatekeeper — page logic. Runs at document_idle in YouTube's isolated world.
// Owns: the active-time heartbeat, the wall, per-video dwell + judgment request,
// the interstitial and its escalation ladder, SPA navigation, autoplay-off.
//
// Classic content script. Depends on globalThis.GK, globalThis.GKStorage.

(() => {
  const { MSG, STATES, DWELL_MS, HEARTBEAT_INTERVAL_MS } = GK;

  // ---- Local page state ----
  let state = STATES.NO_SESSION;
  let mode = 'goal'; // 'goal' | 'leisure'
  let goal = '';
  let elapsedMs = 0;

  let dwellMs = 0; // active ms accumulated on the current video
  let judged = false; // this video has received a verdict (or was allowed)
  let judging = false; // a judgment request is in flight
  let currentVideoId = null;
  let cachedDetails = null; // from page-probe

  // Track real user interaction, for the non-video (browsing) case only.
  let lastInteraction = Date.now();
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => { lastInteraction = Date.now(); }, { passive: true, capture: true })
  );
  const interactedRecently = () => Date.now() - lastInteraction < 30000;

  // Is any real video actually playing right now? This is the truest signal that
  // the user is watching — and it stays true in fullscreen, with the window
  // unfocused, and with no mouse/keyboard input (all cases the old code wrongly
  // treated as "not active").
  function videoPlaying() {
    for (const v of document.querySelectorAll('video')) {
      if (!v.paused && !v.ended && v.readyState >= 2) return true;
    }
    return false;
  }

  // Time counts while the tab is the foreground tab AND we're engaged: either a
  // video is playing (counts regardless of focus / fullscreen / input), or the
  // user is actively browsing (window focused + recent interaction).
  const isActive = () => {
    if (document.visibilityState !== 'visible') return false; // tab backgrounded
    if (videoPlaying()) return true;
    return document.hasFocus() && interactedRecently();
  };

  const onWatchPage = () =>
    location.pathname === '/watch' && new URLSearchParams(location.search).has('v');

  const videoIdFromUrl = () => new URLSearchParams(location.search).get('v');

  // ---- Send helper (promise over chrome.runtime.sendMessage) ----
  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
          // Swallow "Extension context invalidated" during reloads.
          void chrome.runtime.lastError;
          resolve(resp);
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  // ================================================================
  // 1. Heartbeat + dwell ticker (single 1s loop)
  // ================================================================
  let tick = 0;
  let activeMsBuffer = 0; // exact active ms accumulated since the last flush
  setInterval(() => {
    if (isActive()) {
      activeMsBuffer += 1000;

      // Per-video dwell — goal sessions only. Leisure blocks are never judged.
      if (onWatchPage() && !judged && state === STATES.ACTIVE && mode === 'goal') {
        dwellMs += 1000;
        if (dwellMs >= DWELL_MS && !judging) requestJudgment();
      }
    }

    // Flush the buffered active time to the worker every HEARTBEAT_INTERVAL_MS.
    // Sending measured active-ms (not wall-clock) means the worker never has to
    // guess, and a suspended laptop can't dump time (the buffer only grows while
    // this timer is actually running and active).
    tick += 1;
    if (tick % (HEARTBEAT_INTERVAL_MS / 1000) === 0 && activeMsBuffer > 0) {
      const deltaMs = activeMsBuffer;
      activeMsBuffer = 0;
      send(MSG.HEARTBEAT, { deltaMs }).then((resp) => {
        if (resp && typeof resp.elapsedMs === 'number') elapsedMs = resp.elapsedMs;
      });
    }
  }, 1000);

  // ================================================================
  // 2. State sync (storage + explicit messages)
  // ================================================================
  async function refreshState() {
    const session = await GKStorage.getSession();
    state = session.state;
    mode = session.mode || 'goal';
    goal = session.goal;
    elapsedMs = session.accruedMs || 0;
    render();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.session) refreshState();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === MSG.SESSION_CHANGED) refreshState();
    if (msg.type === MSG.EXPIRE) applyExpired();
    if (msg.type === MSG.VERDICT) handleVerdict(msg);
    if (msg.type === MSG.NAV) onNavigate();
  });

  // A leisure block ran out: the worker has already reset the session to
  // NO_SESSION. Pause immediately and re-read state so the wall paints.
  function applyExpired() {
    pauseVideo();
    refreshState();
  }

  // ================================================================
  // 3. Rendering: wall vs stripped view
  // ================================================================
  function render() {
    if (state === STATES.ACTIVE) {
      removeWall();
      // Autoplay-off is a goal-mode discipline; leisure leaves YouTube untouched.
      if (mode === 'goal' && onWatchPage()) forceAutoplayOff();
    } else {
      // NO_SESSION or EXPIRED -> wall.
      pauseVideo();
      renderWall();
    }
  }

  function pauseVideo() {
    const v = document.querySelector(GK.SEL.video);
    if (v && !v.paused) v.pause();
  }

  function renderWall() {
    if (document.getElementById('gk-wall')) {
      updateWallCopy();
      return;
    }
    const wall = document.createElement('div');
    wall.id = 'gk-wall';
    wall.innerHTML = `
      <div class="gk-card">
        <div class="gk-logo">Gatekeeper</div>
        <h1 id="gk-wall-title"></h1>
        <p id="gk-wall-sub"></p>
        <button id="gk-wall-btn">Open Gatekeeper</button>
      </div>`;
    injectStyles();
    (document.body || document.documentElement).appendChild(wall);
    wall.querySelector('#gk-wall-btn').addEventListener('click', () => send(MSG.OPEN_POPUP, {}));
    updateWallCopy();
  }

  function updateWallCopy() {
    const title = document.getElementById('gk-wall-title');
    const sub = document.getElementById('gk-wall-sub');
    if (!title || !sub) return;
    if (state === STATES.EXPIRED) {
      title.textContent = 'Session over';
      sub.textContent =
        'Your active-time budget is used up. Click the Gatekeeper icon in your toolbar to start a new session.';
    } else {
      title.textContent = 'No active session';
      sub.textContent =
        'YouTube is locked until you declare what you are here to do. Click the Gatekeeper icon in your toolbar.';
    }
  }

  function removeWall() {
    const w = document.getElementById('gk-wall');
    if (w) w.remove();
  }

  // ================================================================
  // 4. Metadata extraction (page-probe + DOM fallback)
  // ================================================================
  function injectProbe() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('src/content/page-probe.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || !e.data.__gk) return;
    if (e.data.type === 'player-details' && e.data.details) {
      cachedDetails = e.data.details;
    }
  });

  function domFallback() {
    const t = document.querySelector(GK.SEL.title);
    const c = document.querySelector(GK.SEL.channel);
    const d = document.querySelector(GK.SEL.description);
    return {
      videoId: videoIdFromUrl() || '',
      title: t ? t.textContent.trim() : '',
      channel: c ? c.textContent.trim() : '',
      description: d ? d.textContent.trim() : '',
      lengthSeconds: 0,
    };
  }

  function collectMetadata() {
    const dom = domFallback();
    const p = cachedDetails && cachedDetails.videoId === dom.videoId ? cachedDetails : null;
    return {
      videoId: dom.videoId,
      title: (p && p.title) || dom.title,
      channel: (p && p.channel) || dom.channel,
      description: (p && p.description) || dom.description,
      lengthSeconds: (p && p.lengthSeconds) || dom.lengthSeconds,
    };
  }

  // ================================================================
  // 5. Judgment request + verdict handling
  // ================================================================
  async function requestJudgment() {
    if (judging || judged) return;
    judging = true;
    const meta = collectMetadata();
    if (!meta.videoId) {
      judging = false;
      return;
    }
    const resp = await send(MSG.JUDGE_VIDEO, { video: meta });
    judging = false;
    if (resp) handleVerdict(resp);
  }

  function handleVerdict(resp) {
    judged = true;
    // Worker already resolved confidence, near-miss and fail-open.
    if (resp.action === 'block') {
      showInterstitial(resp);
    }
    // 'allow' -> silence is the reward. Nothing happens.
  }

  // ================================================================
  // 6. Interstitial — a hard block. No override.
  // ================================================================
  function showInterstitial(resp) {
    pauseVideo();
    injectStyles();
    removeInterstitial();

    const reasonText = resp.reason || 'This video does not serve your goal.';

    const el = document.createElement('div');
    el.id = 'gk-interstitial';
    el.innerHTML = `
      <div class="gk-card gk-inter">
        <div class="gk-logo">Gatekeeper</div>
        <div class="gk-video-title">${escapeHtml(resp.title || 'This video')}</div>
        <div class="gk-reason">${escapeHtml(reasonText)}</div>
        <div class="gk-meta">
          <span class="gk-goal">Goal: ${escapeHtml(goal)}</span>
          <span class="gk-remaining">${fmtElapsed(elapsedMs)} on YouTube</span>
        </div>
        <div class="gk-actions">
          <button id="gk-end" class="gk-primary">End this</button>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(el);
    el.querySelector('#gk-end').addEventListener('click', () => send(MSG.CLOSE_TAB, {}));
  }

  function removeInterstitial() {
    const el = document.getElementById('gk-interstitial');
    if (el) el.remove();
  }

  // ================================================================
  // 7. Autoplay off
  // ================================================================
  function forceAutoplayOff() {
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
      if (btn) {
        btn.click();
        clearInterval(iv);
      } else if (tries >= 10) {
        clearInterval(iv);
      }
    }, 500);
  }

  // ================================================================
  // 8. SPA navigation
  // ================================================================
  function onNavigate() {
    const vid = videoIdFromUrl();
    if (onWatchPage() && vid !== currentVideoId) {
      currentVideoId = vid;
      dwellMs = 0;
      judged = false;
      judging = false;
      cachedDetails = null;
      removeInterstitial();
      if (state === STATES.ACTIVE && mode === 'goal') {
        injectProbe();
        forceAutoplayOff();
      }
    }
    render();
  }

  window.addEventListener('yt-navigate-finish', onNavigate);
  // Some navigations only fire popstate; cover both.
  window.addEventListener('popstate', () => setTimeout(onNavigate, 50));

  // ================================================================
  // 9. Styles for our overlays (kept out of strip.css so we can theme freely)
  // ================================================================
  function injectStyles() {
    if (document.getElementById('gk-style')) return;
    const style = document.createElement('style');
    style.id = 'gk-style';
    style.textContent = `
      #gk-wall, #gk-interstitial {
        background: rgba(9,9,11,0.92); backdrop-filter: blur(8px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #fafafa;
      }
      #gk-wall .gk-card, #gk-interstitial .gk-card {
        background: #18181b; border: 1px solid #27272a; border-radius: 16px;
        padding: 32px 36px; max-width: 460px; width: calc(100% - 48px);
        box-shadow: 0 24px 60px rgba(0,0,0,0.5); text-align: left;
      }
      .gk-logo { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
        color: #a1a1aa; margin-bottom: 18px; }
      #gk-wall h1 { font-size: 26px; margin: 0 0 10px; font-weight: 650; }
      #gk-wall p { font-size: 15px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.5; }
      #gk-wall button, .gk-actions button {
        font: inherit; cursor: pointer; border-radius: 10px; padding: 11px 18px;
        border: 1px solid transparent; font-size: 14px; font-weight: 550;
      }
      #gk-wall button { background: #fafafa; color: #09090b; width: 100%; }
      .gk-inter .gk-video-title { font-size: 20px; font-weight: 650; margin-bottom: 8px; line-height: 1.3; }
      .gk-inter .gk-reason { font-size: 15px; color: #fca5a5; margin-bottom: 16px; }
      .gk-inter .gk-meta { display: flex; justify-content: space-between; gap: 12px;
        font-size: 12.5px; color: #a1a1aa; margin-bottom: 18px;
        border-top: 1px solid #27272a; padding-top: 14px; }
      .gk-inter .gk-goal { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gk-inter .gk-remaining { flex-shrink: 0; }
      .gk-terminal { font-size: 13px; color: #fbbf24; margin: 0 0 16px; line-height: 1.4; }
      .gk-reason-box, .gk-key-box { margin-bottom: 16px; }
      .gk-reason-box input, .gk-key-box input {
        width: 100%; box-sizing: border-box; font: inherit; font-size: 14px;
        padding: 10px 12px; border-radius: 9px; border: 1px solid #3f3f46;
        background: #09090b; color: #fafafa; }
      .gk-key-err { color: #fca5a5; font-size: 12px; margin-top: 6px; }
      .gk-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .gk-primary { background: #fafafa; color: #09090b; flex: 1; min-width: 120px; }
      .gk-secondary { background: #27272a; color: #fafafa; border-color: #3f3f46 !important; }
      .gk-danger { background: #7f1d1d; color: #fecaca; }
      .gk-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtElapsed(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ================================================================
  // 10. Boot
  // ================================================================
  refreshState().then(() => {
    currentVideoId = videoIdFromUrl();
    if (onWatchPage() && state === STATES.ACTIVE && mode === 'goal') injectProbe();
  });
})();
