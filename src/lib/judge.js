// Gatekeeper — the model call. Runs in the service worker.
// Classic script; attaches to globalThis.GKJudge. Depends on globalThis.GK.

(() => {
  // Small, stable string hash for cache keys (NOT security — just dedupe).
  function hashGoal(goal) {
    let h = 5381;
    for (let i = 0; i < goal.length; i++) {
      h = (h * 33) ^ goal.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
  }

  function cacheKey(videoId, goal) {
    return `${videoId}:${hashGoal(goal)}`;
  }

  // Build headers for an OpenAI-compatible endpoint. X-Title is OpenRouter-only:
  // sending it to Gemini/Groq would fail CORS preflight and silently fail-open.
  function apiHeaders(endpoint, apiKey) {
    const h = { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` };
    if (endpoint.includes('openrouter.ai')) h['X-Title'] = GK.APP_TITLE;
    return h;
  }

  const SYSTEM_PROMPT = (workContext) =>
    [
      'You are Gatekeeper, a focus filter for one user working on YouTube.',
      'You decide whether a single video serves the user\'s stated session goal.',
      '',
      'The user\'s work context (a glossary of what they are building — NOT a permission list):',
      workContext && workContext.trim() ? workContext.trim() : '(none provided)',
      '',
      'Judge the CURRENT video against the GOAL. Use the recent verdict trail to detect drift:',
      'a session that started on-goal and has wandered off it should start getting blocks.',
      'Be permissive on the first ambiguous video and stricter as drift accumulates.',
      'A single video can be on-goal even from a channel whose other videos are not.',
      '',
      'Respond with JSON only. No prose, no markdown fences. Exactly this shape:',
      '{"verdict":"allow"|"block","confidence":0.0-1.0,"reason":"one line, max 12 words, addressed to the user"}',
    ].join('\n');

  function buildUserMessage(goal, video, trail) {
    const trailText =
      trail && trail.length
        ? trail
            .map(
              (t, i) =>
                `${i + 1}. [${t.verdict}] ${t.title || 'untitled'} — ${t.channel || 'unknown'}`
            )
            .join('\n')
        : '(none yet — this is the first judged video this session)';

    return [
      `GOAL: ${goal}`,
      '',
      'CURRENT VIDEO:',
      `  title: ${video.title || '(unknown)'}`,
      `  channel: ${video.channel || '(unknown)'}`,
      `  duration: ${video.lengthSeconds ? Math.round(video.lengthSeconds / 60) + ' min' : '(unknown)'}`,
      `  description: ${(video.description || '').slice(0, GK.DESC_CHARS)}`,
      '',
      'RECENT VERDICT TRAIL (oldest to newest):',
      trailText,
    ].join('\n');
  }

  // Strip ```json fences and parse defensively. Returns null on any failure.
  function parseVerdict(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim();
    // Remove leading/trailing code fences if the model added them.
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    // If there is surrounding prose, grab the first {...} block.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      text = text.slice(first, last + 1);
    }
    try {
      const obj = JSON.parse(text);
      if (obj.verdict !== 'allow' && obj.verdict !== 'block') return null;
      let confidence = Number(obj.confidence);
      if (!Number.isFinite(confidence)) confidence = 0.5;
      confidence = Math.min(1, Math.max(0, confidence));
      return {
        verdict: obj.verdict,
        confidence,
        reason: String(obj.reason || '').slice(0, 120),
      };
    } catch {
      return null;
    }
  }

  // Calls OpenRouter's chat-completions API directly from the worker (OpenAI
  // format). OpenRouter permits browser-origin calls, so no special CORS header
  // is needed. Returns { ok, verdict } or { ok:false, error } to fail open.
  async function judge({ url, apiKey, model, workContext, goal, video, trail }) {
    if (!apiKey) return { ok: false, error: 'no_api_key' };
    const endpoint = url || GK.OPENROUTER_URL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GK.JUDGE_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: apiHeaders(endpoint, apiKey),
        body: JSON.stringify({
          model: model || GK.MODEL,
          max_tokens: 100,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT(workContext) },
            { role: 'user', content: buildUserMessage(goal, video, trail) },
          ],
        }),
      });

      if (!res.ok) {
        return { ok: false, error: `http_${res.status}` };
      }

      const data = await res.json();
      // OpenRouter surfaces upstream failures in an `error` field even on 200.
      if (data && data.error) return { ok: false, error: 'api_error' };
      const raw =
        data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : null;
      const verdict = parseVerdict(raw);
      if (!verdict) return { ok: false, error: 'unparseable' };
      return { ok: true, verdict };
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Goal validation: is this goal a real work/research intention that fits
  // the user's work context? Returns reasoning either way. ----

  const GOAL_SYSTEM = [
    'You validate a proposed focus-session goal for a YouTube work filter.',
    "Given the user's WORK CONTEXT (a glossary of what they build) and a PROPOSED GOAL,",
    'decide whether the goal is a genuine, specific-enough work or research intention.',
    'Approve reasonable work/research goals — even broadly scoped ones — especially when',
    'they plausibly relate to the work context. Reject goals that are pure leisure or',
    'entertainment, clearly unrelated to the stated work, incoherent, or too vague to',
    'guide later per-video judgments (e.g. "stuff", "youtube", "research", "important").',
    'If no work context is provided, approve any coherent, specific work/research goal.',
    '',
    'Respond with JSON only — no prose, no markdown fences:',
    '{"approved": true|false, "reason": "one line to the user, max 20 words, explaining the',
    'decision relative to their work context"}',
  ].join('\n');

  function parseGoalVerdict(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const f = text.indexOf('{');
    const l = text.lastIndexOf('}');
    if (f !== -1 && l !== -1 && l > f) text = text.slice(f, l + 1);
    try {
      const o = JSON.parse(text);
      if (typeof o.approved !== 'boolean') return null;
      return { approved: o.approved, reason: String(o.reason || '').slice(0, 160) };
    } catch {
      return null;
    }
  }

  // Fail open: a dropped packet must never block starting a session.
  function goalFailOpen(err) {
    return {
      ok: false,
      approved: true,
      reason: `Couldn't check against your work context (${err}) — approved anyway.`,
    };
  }

  async function validateGoal({ url, apiKey, model, workContext, goal }) {
    if (!apiKey) {
      return { ok: true, approved: true, reason: 'No API key set — goal not checked against work context.' };
    }
    const endpoint = url || GK.OPENROUTER_URL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GK.JUDGE_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: apiHeaders(endpoint, apiKey),
        body: JSON.stringify({
          model: model || GK.MODEL,
          max_tokens: 120,
          messages: [
            { role: 'system', content: GOAL_SYSTEM },
            {
              role: 'user',
              content: `WORK CONTEXT:\n${workContext && workContext.trim() ? workContext.trim() : '(none provided)'}\n\nPROPOSED GOAL:\n${goal}`,
            },
          ],
        }),
      });
      if (!res.ok) return goalFailOpen(`http_${res.status}`);
      const data = await res.json();
      if (data && data.error) return goalFailOpen('api_error');
      const raw =
        data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : null;
      const v = parseGoalVerdict(raw);
      if (!v) return goalFailOpen('unparseable');
      return { ok: true, approved: v.approved, reason: v.reason };
    } catch (e) {
      return goalFailOpen(e && e.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  globalThis.GKJudge = {
    judge,
    validateGoal,
    parseVerdict,
    parseGoalVerdict,
    hashGoal,
    cacheKey,
    SYSTEM_PROMPT,
    buildUserMessage,
  };
})();
