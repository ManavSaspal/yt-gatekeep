// Gatekeeper — central knobs. Everything tunable lives here.
// Attaches to globalThis.GK so one file works in three classic-script contexts:
// content scripts (globalThis === window), the service worker
// (globalThis === self, loaded via importScripts), and the popup (<script src>).
// No ESM export/import — content scripts are classic scripts and would fail to parse them.

globalThis.GK = {
  // --- Model / providers (all OpenAI-compatible, browser-callable) ---
  MODEL: 'anthropic/claude-haiku-4.5', // fallback default (OpenRouter)
  OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',
  APP_TITLE: 'Gatekeeper', // sent as X-Title to OpenRouter only

  DEFAULT_PROVIDER: 'openrouter',
  // Each provider exposes the same OpenAI chat-completions shape, so only the
  // base URL, key, and model differ. Switchable in Settings to compare quality.
  PROVIDERS: {
    openrouter: {
      label: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      keyHint: 'sk-or-v1-…',
      keyUrl: 'https://openrouter.ai/keys',
      defaultModel: 'anthropic/claude-haiku-4.5',
      modelHint: 'see openrouter.ai/models',
      free: false,
    },
    gemini: {
      label: 'Gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      keyHint: 'AIza… (free, no card)',
      keyUrl: 'https://aistudio.google.com/apikey',
      defaultModel: 'gemini-2.5-flash',
      modelHint: 'e.g. gemini-2.5-flash / -flash-lite',
      free: true,
    },
    groq: {
      label: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      keyHint: 'gsk_… (free, no card)',
      keyUrl: 'https://console.groq.com/keys',
      defaultModel: 'llama-3.3-70b-versatile',
      modelHint: 'see console.groq.com/docs/models',
      free: true,
    },
  },

  // --- Timing (ms) ---
  HEARTBEAT_INTERVAL_MS: 5000, // content flushes buffered active-ms this often
  HEARTBEAT_CLAMP_MS: 7000, // sanity cap on active-ms credited per flush
  IDLE_THRESHOLD_S: 60, // chrome.idle detection interval (seconds) — used for 'locked' only
  DWELL_MS: 12000, // active time on a video before it is judged
  JUDGE_TIMEOUT_MS: 8000, // API call timeout -> fail open
  UNLOCK_WINDOW_MS: 10 * 60 * 1000, // friend-key unlock validity

  // --- Leisure blocks (no goal, full YouTube, time-boxed) ---
  LEISURE_DURATIONS_MIN: [15, 30, 45, 60], // durations offered for a leisure block
  DEFAULT_LEISURE_WINDOW: { start: '21:00', end: '00:00' }, // when leisure is allowed

  // --- Judgment ---
  BLOCK_CONFIDENCE_THRESHOLD: 0.5, // below this, a block is downgraded to allow (near-miss)
  TRAIL_MAX: 5, // verdicts carried for drift detection
  DESC_CHARS: 300, // description characters sent to the model

  STATES: {
    NO_SESSION: 'NO_SESSION',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
  },

  // --- Messages passed between content <-> worker <-> popup ---
  MSG: {
    HEARTBEAT: 'heartbeat', // content -> worker: active tick
    SESSION_CHANGED: 'session_changed', // worker/popup -> content: re-read state, re-render
    JUDGE_VIDEO: 'judge_video', // content -> worker: metadata, please judge
    VERDICT: 'verdict', // worker -> content: judgment result
    GET_TIME: 'get_time', // popup -> worker: {accruedMs, budgetMs, accruing}
    GET_STATE: 'get_state', // popup/content -> worker: full session snapshot
    VALIDATE_GOAL: 'validate_goal', // popup -> worker: check goal vs work context -> {approved, reason}
    START_SESSION: 'start_session', // popup -> worker: create a goal session
    START_LEISURE: 'start_leisure', // popup -> worker: create a leisure block
    END_SESSION: 'end_session', // popup -> worker: end session (free)
    EXPIRE: 'expire', // worker -> content: block ended, pause + wall
    OPEN_POPUP: 'open_popup', // content -> worker: try to open the action popup
    LOG_EVENT: 'log_event', // content -> worker: append a log row (e.g. override)
    CLOSE_TAB: 'close_tab', // content -> worker: close this tab ("End this")
    NAV: 'nav', // worker -> content: SPA navigation detected (backup signal)
  },

  // --- YouTube DOM selectors (fallback metadata + surface stripping) ---
  SEL: {
    title: 'ytd-watch-metadata h1 yt-formatted-string',
    channel: 'ytd-channel-name #text a',
    description: '#description-inline-expander',
    video: 'video',
  },

  // "HH:MM" -> minutes-of-day.
  parseHM(s) {
    const [h, m] = String(s || '').split(':').map((n) => parseInt(n, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  },

  // Given now (ms) and a {start,end} window, return whether we're inside it and
  // the wall-clock timestamp of the window end (the hard cap for a leisure block).
  // "00:00" end means end-of-day midnight. Windows crossing midnight are supported.
  leisureBounds(now, win) {
    win = win || this.DEFAULT_LEISURE_WINDOW;
    const startMin = this.parseHM(win.start);
    let endMin = this.parseHM(win.end);
    if (endMin === 0) endMin = 1440; // midnight = end of day
    const d = new Date(now);
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const wraps = endMin <= startMin;
    const nowMin = Math.floor((now - base) / 60000);
    const inWindow = wraps
      ? nowMin >= startMin || nowMin < endMin
      : nowMin >= startMin && nowMin < endMin;
    let endAt = base + endMin * 60000;
    if (wraps && nowMin >= startMin) endAt += 24 * 60 * 60000; // ends next day
    return { inWindow, endAt, startMin, endMin };
  },
};
