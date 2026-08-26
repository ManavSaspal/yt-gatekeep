// Gatekeeper — the only module that touches chrome.storage.local directly.
// Everything else goes through GKStorage so keys and defaults live in one place.
// Classic script; attaches to globalThis.GKStorage. Depends on globalThis.GK.

(() => {
  const S = chrome.storage.local;

  const DEFAULTS = {
    config: {
      apiKey: '', // OpenRouter key (sk-or-v1-...)
      model: GK.MODEL, // OpenRouter model slug; editable in Settings
      workContext: '',
      friendPasswordHash: '', // SHA-256 hex; friend sets it, user never sees it
      authMode: 'password', // "password" (shipped) | "signature" (stub)
      friendPublicKey: '', // JWK, signature mode only (unused this build)
      hideComments: true,
      uninstallWebhookUrl: '',
      strippingOff: false, // friend-key toggle; default = stripping on
      leisureWindow: { ...GK.DEFAULT_LEISURE_WINDOW }, // when leisure blocks are allowed
    },
    session: {
      state: GK.STATES.NO_SESSION,
      mode: 'goal', // 'goal' (stripped + judged) | 'leisure' (open, time-boxed)
      goal: '',
      goalReason: '', // why the goal was approved against the work context
      accruedMs: 0, // elapsed active time on YouTube this session
      budgetMs: 0, // leisure only: active-time duration of the block
      windowEndAt: 0, // leisure only: hard wall-clock cap (window end timestamp)
      lastHeartbeatAt: 0,
      startedAt: 0,
      trail: [], // [{ videoId, title, channel, verdict }] last TRAIL_MAX
    },
    cache: {}, // { [videoId+goalHash]: { verdict, reason, confidence, at } }
    log: [], // [{ at, videoId, title, channel, goal, verdict, confidence, reason, overridden, overrideReason }]
    recentGoals: [], // last 5 goal strings
    unlockUntil: 0, // ms epoch; friend-key unlock validity
  };

  async function getRaw(key) {
    const out = await S.get(key);
    return out[key];
  }

  // Shallow-merge defaults so newly added fields appear on old stored objects.
  async function get(key) {
    const stored = await getRaw(key);
    const def = DEFAULTS[key];
    if (def && typeof def === 'object' && !Array.isArray(def)) {
      return { ...def, ...(stored || {}) };
    }
    return stored === undefined ? structuredCloneSafe(def) : stored;
  }

  async function set(key, value) {
    await S.set({ [key]: value });
    return value;
  }

  // Read-modify-write a plain object key.
  async function patch(key, partial) {
    const current = await get(key);
    const next = { ...current, ...partial };
    await S.set({ [key]: next });
    return next;
  }

  function structuredCloneSafe(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  // --- Convenience helpers used across the codebase ---

  const getConfig = () => get('config');
  const patchConfig = (p) => patch('config', p);
  const getSession = () => get('session');
  const patchSession = (p) => patch('session', p);
  const setSession = (s) => set('session', s);

  async function resetSession() {
    return set('session', structuredCloneSafe(DEFAULTS.session));
  }

  async function pushRecentGoal(goal) {
    const list = (await get('recentGoals')) || [];
    const next = [goal, ...list.filter((g) => g !== goal)].slice(0, 5);
    return set('recentGoals', next);
  }

  async function appendLog(entry) {
    const list = (await get('log')) || [];
    list.push(entry);
    // Keep the log from growing without bound on a personal machine.
    const trimmed = list.slice(-2000);
    return set('log', trimmed);
  }

  async function getCacheEntry(cacheKey) {
    const cache = (await get('cache')) || {};
    return cache[cacheKey];
  }

  async function setCacheEntry(cacheKey, value) {
    const cache = (await get('cache')) || {};
    cache[cacheKey] = value;
    return set('cache', cache);
  }

  async function clearCache() {
    return set('cache', {});
  }

  async function pushTrail(verdictRow) {
    const session = await getSession();
    const trail = [...(session.trail || []), verdictRow].slice(-GK.TRAIL_MAX);
    return patchSession({ trail });
  }

  globalThis.GKStorage = {
    DEFAULTS,
    get,
    set,
    patch,
    getConfig,
    patchConfig,
    getSession,
    patchSession,
    setSession,
    resetSession,
    pushRecentGoal,
    appendLog,
    getCacheEntry,
    setCacheEntry,
    clearCache,
    pushTrail,
  };
})();
