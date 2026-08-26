// Gatekeeper popup — thin client over the worker + storage.
// Depends on globalThis.GK, GKStorage, GKAuth (loaded before this).

(() => {
  const { MSG, STATES } = GK;
  const $ = (id) => document.getElementById(id);

  let clockTimer = null;
  let changeMode = false;

  const send = (type, payload = {}) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ type, ...payload }, resolve));

  // ================= Tabs =================
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'log') renderLog();
      if (tab.dataset.tab === 'settings') openSettingsTab();
    });
  });

  // ================= Goal validation =================
  // Fast local pre-filter only (instant, no API). The substantive check — is
  // this a real goal that fits your work context? — is done by the model in the
  // start flow, which also returns reasoning.
  function validateGoalLocal(raw) {
    const goal = raw.trim();
    if (goal.length < 4) return { ok: false, error: 'Say a little more — at least a few words.' };
    if (/^(https?:\/\/|www\.)/i.test(goal) || /youtube\.com|youtu\.be/i.test(goal)) {
      return { ok: false, error: 'That looks like a link, not a goal. Say what you are here to do.' };
    }
    return { ok: true };
  }

  // ================= Recent goals =================
  async function renderRecent() {
    const recent = (await GKStorage.get('recentGoals')) || [];
    const wrap = $('recent-wrap');
    const list = $('recent-goals');
    if (!recent.length) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    list.innerHTML = '';
    recent.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'recent-goal';
      b.textContent = g;
      b.title = g;
      b.addEventListener('click', () => {
        $('goal').value = g;
      });
      list.appendChild(b);
    });
  }

  // ================= Leisure block =================
  let selectedLeisureDuration = 30;

  function renderLeisureDurations() {
    const wrap = $('leisure-durations');
    wrap.innerHTML = '';
    GK.LEISURE_DURATIONS_MIN.forEach((m) => {
      const b = document.createElement('button');
      b.className = 'dur' + (m === selectedLeisureDuration ? ' selected' : '');
      b.textContent = `${m}m`;
      b.addEventListener('click', () => {
        selectedLeisureDuration = m;
        renderLeisureDurations();
      });
      wrap.appendChild(b);
    });
  }

  function to12h(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map((n) => parseInt(n, 10));
    if (!Number.isFinite(h)) return hhmm;
    const ap = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')}${ap}`;
  }

  // Leisure can only be started inside the window; otherwise show when it opens.
  async function renderLeisureSection() {
    const cfg = await GKStorage.getConfig();
    const win = cfg.leisureWindow || GK.DEFAULT_LEISURE_WINDOW;
    const { inWindow } = GK.leisureBounds(Date.now(), win);
    $('leisure-durations').classList.toggle('hidden', !inWindow);
    $('start-leisure-btn').classList.toggle('hidden', !inWindow);
    if (inWindow) {
      renderLeisureDurations();
      $('leisure-note').textContent = `Full YouTube until the block ends or ${to12h(win.end)}, whichever comes first.`;
    } else {
      $('leisure-note').textContent = `Leisure browsing is available ${to12h(win.start)}–${to12h(win.end)}.`;
    }
  }

  $('start-leisure-btn').addEventListener('click', async () => {
    const res = await send(MSG.START_LEISURE, { durationMs: selectedLeisureDuration * 60 * 1000 });
    if (res && res.ok) {
      await refresh();
    } else {
      $('leisure-note').textContent = 'The leisure window just closed — goal sessions only now.';
    }
  });

  // ================= Start / End =================
  $('start-btn').addEventListener('click', async () => {
    const raw = $('goal').value;
    const v = validateGoalLocal(raw);
    const err = $('goal-error');
    if (!v.ok) {
      err.textContent = v.error;
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');
    const goal = raw.trim();

    // Validate against the work context (LLM). Fails open on API errors.
    const btn = $('start-btn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Checking goal…';
    const check = await send(MSG.VALIDATE_GOAL, { goal });
    btn.disabled = false;
    btn.textContent = label;

    if (!check || !check.approved) {
      err.textContent = (check && check.reason) || 'Could not validate that goal.';
      err.classList.remove('hidden');
      return;
    }

    if (changeMode) {
      // In-place mid-session goal change (already unlocked to get here).
      await GKStorage.patchSession({ goal, goalReason: check.reason, trail: [] });
      await GKStorage.clearCache();
      changeMode = false;
    } else {
      await send(MSG.START_SESSION, { goal, goalReason: check.reason });
    }
    $('goal').value = '';
    await refresh();
  });

  $('end-btn').addEventListener('click', async () => {
    await send(MSG.END_SESSION);
    await refresh();
  });

  // ================= Change goal (gated) =================
  $('change-goal-btn').addEventListener('click', async () => {
    const unlocked = await requireFriendKey('Changing the goal mid-session needs the friend key.');
    if (!unlocked) return;
    const session = await GKStorage.getSession();
    changeMode = true;
    $('goal').value = session.goal;
    showCreateView(false);
    $('start-btn').textContent = 'Update goal';
  });

  // ================= View switching =================
  function showCreateView() {
    $('create-view').classList.remove('hidden');
    $('active-view').classList.add('hidden');
    if (!changeMode) $('start-btn').textContent = 'Start session';
  }

  function showActiveView() {
    $('create-view').classList.add('hidden');
    $('active-view').classList.remove('hidden');
  }

  // ================= Live clock =================
  function fmt(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  async function tickClock() {
    const snap = await send(MSG.GET_TIME);
    if (!snap) return;
    if (snap.state !== STATES.ACTIVE) {
      // Session ended while popup open — re-render.
      await refresh();
      return;
    }
    const stateEl = $('clock-state');
    if (snap.mode === 'leisure') {
      $('clock').textContent = fmt(snap.remainingMs || 0);
      stateEl.textContent = snap.accruing ? 'counting down' : 'paused';
    } else {
      $('clock').textContent = fmt(snap.elapsedMs);
      stateEl.textContent = snap.accruing ? 'counting — you’re on youtube' : 'paused — not on youtube';
    }
    stateEl.classList.toggle('frozen', !snap.accruing);
  }

  function startClock() {
    stopClock();
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }

  // ================= Refresh (decide which session sub-view) =================
  async function refresh() {
    const session = await GKStorage.getSession();
    await renderRecent();

    if (session.state === STATES.ACTIVE && !changeMode) {
      showActiveView();
      const leisure = session.mode === 'leisure';
      $('goal-block').classList.toggle('hidden', leisure);
      $('leisure-block').classList.toggle('hidden', !leisure);
      $('goal-actions').classList.toggle('hidden', leisure);
      $('clock-label').textContent = leisure ? 'Leisure block' : 'Active time on YouTube';
      $('active-fine').textContent = leisure
        ? 'Full YouTube, no goal. Ends when the block runs out or at the window end.'
        : 'Ending is always free. Changing the goal needs the friend key.';
      $('active-goal').textContent = session.goal;
      $('goal-reason').textContent = !leisure && session.goalReason ? `✓ ${session.goalReason}` : '';
      startClock();
    } else {
      stopClock();
      showCreateView();
      await renderLeisureSection();
    }
  }

  // ================= Friend-key modal =================
  let keyResolver = null;
  async function requireFriendKey(subText) {
    if (await GKAuth.isUnlocked()) return true;
    const configured = await GKAuth.hasFriendKey();
    return new Promise((resolve) => {
      keyResolver = resolve;
      $('key-modal-sub').textContent = configured
        ? subText
        : 'No friend key is set yet. Set one under Settings first.';
      $('key-input').value = '';
      $('key-input').disabled = !configured;
      $('key-confirm').disabled = !configured;
      $('key-error').classList.add('hidden');
      $('key-modal').classList.remove('hidden');
      if (configured) $('key-input').focus();
    });
  }
  function closeKeyModal(result) {
    $('key-modal').classList.add('hidden');
    const r = keyResolver;
    keyResolver = null;
    if (r) r(result);
  }
  $('key-cancel').addEventListener('click', () => closeKeyModal(false));
  $('key-confirm').addEventListener('click', async () => {
    const res = await GKAuth.verifyPassword($('key-input').value);
    if (res.ok) {
      closeKeyModal(true);
    } else {
      $('key-error').classList.remove('hidden');
    }
  });
  $('key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('key-confirm').click();
  });

  // ================= Log =================
  async function renderLog() {
    const log = (await GKStorage.get('log')) || [];
    const count = log.length;
    $('log-count').textContent = count
      ? `${count} judgment${count === 1 ? '' : 's'} recorded`
      : '';
    const list = $('log-list');
    if (!count) {
      list.innerHTML = '<div class="log-empty">No judgments yet.</div>';
      return;
    }
    list.innerHTML = '';
    [...log].reverse().forEach((e) => {
      const row = document.createElement('div');
      row.className = 'log-row';
      const cls = e.verdict === 'allow' ? 'v-allow' : e.verdict === 'block' ? 'v-block' : 'v-error';
      const badge = e.overridden ? 'overridden' : e.verdict;
      const when = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <div class="lr-top">
          <span class="lr-title">${esc(e.title || 'Untitled')}</span>
          <span class="lr-verdict ${cls}">${esc(badge)}</span>
        </div>
        <div class="lr-reason">${esc(e.reason || '')}</div>
        <div class="lr-meta">${esc(e.channel || '')} · ${when}${
          e.overrideReason ? ' · “' + esc(e.overrideReason) + '”' : ''
        }</div>`;
      list.appendChild(row);
    });
  }

  // ================= Settings =================
  // Once a friend key exists, the whole Settings tab is locked behind it — so a
  // deep-in-a-session you can't quietly pull out the API key or disable stripping.
  // Before any friend key is set, settings are open (bootstrap: that's where you
  // set the friend key in the first place).
  async function openSettingsTab() {
    const configured = await GKAuth.hasFriendKey();
    const unlocked = await GKAuth.isUnlocked();
    const locked = configured && !unlocked;
    $('settings-locked').classList.toggle('hidden', !locked);
    $('settings-content').classList.toggle('hidden', locked);
    if (!locked) loadSettings();
  }

  $('settings-unlock-btn').addEventListener('click', async () => {
    const ok = await requireFriendKey('Opening Settings needs the friend key.');
    if (ok) openSettingsTab();
  });

  async function loadSettings() {
    const cfg = await GKStorage.getConfig();
    $('cfg-apikey').value = cfg.apiKey || '';
    $('cfg-model').value = cfg.model || GK.MODEL;
    $('cfg-context').value = cfg.workContext || '';
    $('cfg-comments').checked = !!cfg.hideComments;
    $('cfg-stripping-off').checked = !!cfg.strippingOff;
    const win = cfg.leisureWindow || GK.DEFAULT_LEISURE_WINDOW;
    $('cfg-leisure-start').value = win.start;
    $('cfg-leisure-end').value = win.end;
    $('cfg-webhook').value = cfg.uninstallWebhookUrl || '';
    $('cfg-friendpw').value = '';
    $('friendpw-status').textContent = cfg.friendPasswordHash
      ? 'A friend key is set.'
      : 'No friend key set.';
  }

  // Persists all settings. Returns false if a gated toggle was declined.
  // The friend password is left untouched when the field is blank — so it is
  // remembered across saves and you never have to re-type it.
  async function saveSettings() {
    const cfg = await GKStorage.getConfig();
    const wantStrippingOff = $('cfg-stripping-off').checked;

    // Disabling stripping is gated; re-enabling it is free.
    if (wantStrippingOff && !cfg.strippingOff) {
      const unlocked = await requireFriendKey('Disabling surface stripping needs the friend key.');
      if (!unlocked) {
        $('cfg-stripping-off').checked = false;
        return false;
      }
    }

    await GKStorage.patchConfig({
      apiKey: $('cfg-apikey').value.trim(),
      model: $('cfg-model').value.trim() || GK.MODEL,
      workContext: $('cfg-context').value.trim(),
      hideComments: $('cfg-comments').checked,
      strippingOff: wantStrippingOff,
      leisureWindow: {
        start: $('cfg-leisure-start').value || GK.DEFAULT_LEISURE_WINDOW.start,
        end: $('cfg-leisure-end').value || GK.DEFAULT_LEISURE_WINDOW.end,
      },
      uninstallWebhookUrl: $('cfg-webhook').value.trim(),
    });

    const pw = $('cfg-friendpw').value;
    if (pw) {
      await GKAuth.setFriendPassword(pw);
      $('cfg-friendpw').value = '';
    }
    return true;
  }

  function flashSaved(msg) {
    const el = $('settings-saved');
    el.textContent = msg;
    setTimeout(() => (el.textContent = ''), 1800);
  }

  // Save and stay open (unlock window unchanged).
  $('save-settings').addEventListener('click', async () => {
    if (!(await saveSettings())) return;
    flashSaved('Saved.');
    loadSettings();
  });

  // Save, then re-lock immediately using the existing (old) password — no need
  // to wait out the 10-minute unlock window.
  $('save-lock').addEventListener('click', async () => {
    if (!(await saveSettings())) return;
    if (!(await GKAuth.hasFriendKey())) {
      flashSaved('Set a friend password first, then lock.');
      loadSettings();
      return;
    }
    await GKStorage.set('unlockUntil', 0); // lock now; the old password reopens it
    openSettingsTab(); // re-renders -> shows the lock screen
  });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ================= Boot =================
  refresh();
})();
