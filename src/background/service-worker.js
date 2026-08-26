// Gatekeeper — service worker. Classic (not module) so importScripts works and
// one constants.js serves content, popup, and worker without ESM parse issues.
//
// Owns: the active-time ledger, judgment orchestration, session lifecycle,
// friend-key gating, the action badge, SPA-nav backup, and the uninstall URL.

importScripts(
  '/src/lib/constants.js',
  '/src/lib/storage.js',
  '/src/lib/judge.js',
  '/src/lib/auth.js'
);

const { MSG, STATES } = GK;

// ====================================================================
// Lifecycle: uninstall URL + defaults
// ====================================================================
chrome.runtime.onInstalled.addListener(() => {
  syncUninstallUrl();
});
chrome.runtime.onStartup.addListener(() => {
  syncUninstallUrl();
});

async function syncUninstallUrl() {
  const cfg = await GKStorage.getConfig();
  if (cfg.uninstallWebhookUrl) {
    try {
      chrome.runtime.setUninstallURL(cfg.uninstallWebhookUrl);
    } catch {
      /* invalid URL — ignore */
    }
  } else {
    try {
      chrome.runtime.setUninstallURL('');
    } catch {
      /* ignore */
    }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) syncUninstallUrl();
});

// ====================================================================
// Broadcast helpers
// ====================================================================
async function broadcast(type, payload = {}) {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type, ...payload }, () => void chrome.runtime.lastError);
  }
}

function setBadge(on) {
  try {
    chrome.action.setBadgeText({ text: on ? '!' : '' });
    if (on) chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  } catch {
    /* ignore */
  }
}

// ====================================================================
// Time ledger
// ====================================================================
// Accrues elapsed *active* time. The content script measures actual active ms
// (see isActive/videoPlaying) and sends it as deltaMs; the worker just adds it.
// Goal sessions have no budget/expiry. Leisure blocks end when the active-time
// duration runs out OR the wall-clock passes the window end.
async function accrue(msg) {
  const now = Date.now();
  const session = await GKStorage.getSession();
  if (session.state !== STATES.ACTIVE) {
    return { accruing: false, elapsedMs: session.accruedMs || 0 };
  }

  // Backstop only on a LOCKED screen — never on plain 'idle'. Watching a video
  // is input-idle by nature, and blocking on 'idle' was the counter bug.
  const idleState = await chrome.idle.queryState(GK.IDLE_THRESHOLD_S);
  if (idleState === 'locked') {
    if (session.mode === 'leisure' && session.windowEndAt && now >= session.windowEndAt) {
      await endLeisureBlock();
      return { accruing: false, elapsedMs: session.accruedMs, ended: true };
    }
    return { accruing: false, elapsedMs: session.accruedMs };
  }

  // Trust the measured active-ms from the page; just sanity-cap per flush.
  const delta = Math.max(0, Math.min(Number(msg && msg.deltaMs) || 0, GK.HEARTBEAT_CLAMP_MS));
  const accruedMs = session.accruedMs + delta;

  if (session.mode === 'leisure') {
    const overDuration = session.budgetMs > 0 && accruedMs >= session.budgetMs;
    const overWindow = session.windowEndAt > 0 && now >= session.windowEndAt;
    if (overDuration || overWindow) {
      await endLeisureBlock();
      return { accruing: false, elapsedMs: accruedMs, ended: true };
    }
  }

  await GKStorage.patchSession({ accruedMs, lastHeartbeatAt: now });
  const remainingMs =
    session.mode === 'leisure' ? Math.max(0, session.budgetMs - accruedMs) : null;
  return { accruing: true, elapsedMs: accruedMs, remainingMs };
}

async function timeSnapshot() {
  const session = await GKStorage.getSession();
  const now = Date.now();
  const accruing =
    session.state === STATES.ACTIVE &&
    session.lastHeartbeatAt > 0 &&
    now - session.lastHeartbeatAt < GK.HEARTBEAT_CLAMP_MS;
  // Include the in-flight interval so the count ticks smoothly between heartbeats
  // (capped at one flush interval — the most that can be un-flushed).
  const inflight = accruing ? Math.min(now - session.lastHeartbeatAt, GK.HEARTBEAT_INTERVAL_MS) : 0;
  const elapsedMs = (session.accruedMs || 0) + inflight;
  return {
    state: session.state,
    mode: session.mode,
    goal: session.goal,
    elapsedMs,
    remainingMs: session.mode === 'leisure' ? Math.max(0, (session.budgetMs || 0) - elapsedMs) : null,
    accruing,
  };
}

// ====================================================================
// Session lifecycle
// ====================================================================
// Validate a goal against the work context (LLM). Fails open.
async function handleValidateGoal({ goal }) {
  const cfg = await GKStorage.getConfig();
  return GKJudge.validateGoal({
    apiKey: cfg.apiKey,
    model: cfg.model,
    workContext: cfg.workContext,
    goal,
  });
}

async function startSession({ goal, goalReason }) {
  await GKStorage.setSession({
    ...GKStorage.DEFAULTS.session,
    state: STATES.ACTIVE,
    mode: 'goal',
    goal,
    goalReason: goalReason || '',
    accruedMs: 0,
    lastHeartbeatAt: 0,
    startedAt: Date.now(),
    trail: [],
  });
  await GKStorage.clearCache();
  await GKStorage.pushRecentGoal(goal);
  await broadcast(MSG.SESSION_CHANGED);
  return { ok: true };
}

// Leisure block: no goal, no judge, no stripping — but time-boxed, and only
// startable inside the configured window. Ends at min(duration, window end).
async function startLeisure({ durationMs }) {
  const cfg = await GKStorage.getConfig();
  const { inWindow, endAt } = GK.leisureBounds(Date.now(), cfg.leisureWindow);
  if (!inWindow) return { ok: false, reason: 'outside_window' };
  await GKStorage.setSession({
    ...GKStorage.DEFAULTS.session,
    state: STATES.ACTIVE,
    mode: 'leisure',
    goal: '',
    accruedMs: 0,
    budgetMs: durationMs,
    windowEndAt: endAt,
    lastHeartbeatAt: 0,
    startedAt: Date.now(),
  });
  await GKStorage.clearCache();
  await broadcast(MSG.SESSION_CHANGED);
  setBadge(false);
  return { ok: true };
}

// A leisure block ran out (duration or window end). Back to the wall.
async function endLeisureBlock() {
  await GKStorage.resetSession();
  await GKStorage.clearCache();
  await broadcast(MSG.EXPIRE); // immediate pause on open tabs
  await broadcast(MSG.SESSION_CHANGED);
}

async function endSession() {
  await GKStorage.resetSession();
  await GKStorage.clearCache();
  await GKStorage.set('unlockUntil', 0);
  await broadcast(MSG.SESSION_CHANGED);
  setBadge(false);
  return { ok: true };
}

// ====================================================================
// Judgment
// ====================================================================
function deriveAction(verdict) {
  if (verdict.verdict === 'allow') return 'allow';
  if (verdict.confidence < GK.BLOCK_CONFIDENCE_THRESHOLD) return 'allow'; // near-miss
  return 'block';
}

async function judgeVideo({ video }) {
  const session = await GKStorage.getSession();
  if (session.state !== STATES.ACTIVE) return { action: 'allow' };

  const key = GKJudge.cacheKey(video.videoId, session.goal);

  // Cache is dedupe only (back button, reopened tabs). No re-bill, no re-log.
  const cached = await GKStorage.getCacheEntry(key);
  if (cached) {
    return {
      action: deriveAction(cached),
      reason: cached.reason,
      title: video.title,
      videoId: video.videoId,
      cached: true,
    };
  }

  const cfg = await GKStorage.getConfig();
  const result = await GKJudge.judge({
    apiKey: cfg.apiKey,
    model: cfg.model,
    workContext: cfg.workContext,
    goal: session.goal,
    video,
    trail: session.trail || [],
  });

  // Fail open on any error / timeout / unparseable.
  if (!result.ok) {
    setBadge(true);
    await GKStorage.appendLog({
      at: Date.now(),
      videoId: video.videoId,
      title: video.title,
      channel: video.channel,
      goal: session.goal,
      verdict: 'error',
      confidence: 0,
      reason: `fail-open (${result.error})`,
      overridden: false,
      overrideReason: '',
    });
    return { action: 'allow', failOpen: true, error: result.error };
  }

  setBadge(false);
  const verdict = result.verdict;
  const action = deriveAction(verdict);

  await GKStorage.setCacheEntry(key, {
    verdict: verdict.verdict,
    reason: verdict.reason,
    confidence: verdict.confidence,
    at: Date.now(),
  });
  await GKStorage.pushTrail({
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    verdict: verdict.verdict,
  });
  await GKStorage.appendLog({
    at: Date.now(),
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    goal: session.goal,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    reason: verdict.reason,
    // A sub-threshold block that we allowed is a near-miss worth marking.
    nearMiss: verdict.verdict === 'block' && action === 'allow',
    overridden: false,
    overrideReason: '',
  });

  return { action, reason: verdict.reason, title: video.title, videoId: video.videoId };
}

// ====================================================================
// SPA navigation backup (PRD wants both signals)
// ====================================================================
chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    chrome.tabs.sendMessage(details.tabId, { type: MSG.NAV }, () => void chrome.runtime.lastError);
  },
  { url: [{ hostSuffix: 'youtube.com', pathPrefix: '/watch' }] }
);

// ====================================================================
// Message router
// ====================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  (async () => {
    switch (msg.type) {
      case MSG.HEARTBEAT:
        sendResponse(await accrue(msg));
        break;
      case MSG.GET_TIME:
      case MSG.GET_STATE:
        sendResponse(await timeSnapshot());
        break;
      case MSG.JUDGE_VIDEO:
        sendResponse(await judgeVideo(msg));
        break;
      case MSG.VALIDATE_GOAL:
        sendResponse(await handleValidateGoal(msg));
        break;
      case MSG.START_SESSION:
        sendResponse(await startSession(msg));
        break;
      case MSG.START_LEISURE:
        sendResponse(await startLeisure(msg));
        break;
      case MSG.END_SESSION:
        sendResponse(await endSession());
        break;
      case MSG.CLOSE_TAB:
        if (sender.tab && sender.tab.id != null) chrome.tabs.remove(sender.tab.id);
        sendResponse({ ok: true });
        break;
      case MSG.OPEN_POPUP:
        try {
          chrome.action.openPopup();
        } catch {
          /* needs user gesture / newer Chrome; user can click the toolbar icon */
        }
        sendResponse({ ok: true });
        break;
      default:
        sendResponse(undefined);
    }
  })();

  return true; // keep the channel open for the async response
});
