# 🚪 YT Gatekeep

**Make YouTube usable for work.** YT Gatekeep is a Chrome extension that requires you to declare *why* you're on YouTube, strips away every recommendation and rabbit-hole surface, and uses an LLM to judge each video against your stated goal — so the session that started as "research" doesn't quietly become 90 minutes of unrelated content.

It defends against **drift**, not a single bad click. A blocklist can't tell a needed tutorial from a vlog on the same channel. YT Gatekeep decides **per video, against your intent, every time.**

> Scope: YouTube only. Built for personal use — your own machine, your own API key. Load-unpacked, vanilla MV3, no build step.

---

## ✨ Features

### 🎯 Goal sessions
Nothing on YouTube works until you declare what you're here to do. Type a goal (`research canvas interaction patterns for my app`), and YouTube unlocks — but stripped down to a search bar and a player. No feed, no sidebar, no endscreen.

### 🧠 Per-video LLM judgment
Every watch page is judged after **12 seconds** of active viewing by a cheap model (default **Claude Haiku 4.5** via OpenRouter). The judge sees your goal, your work context, the video's metadata, and the **last 5 verdicts this session** — so it catches *drift*, not just individual off-topic videos.

- ✅ **Allowed** → nothing happens. Silence is the reward.
- 🛑 **Blocked** → the player is covered by an interstitial explaining why, with your goal and remaining time in view.
- 🌐 **Any API error / timeout → fails open.** A dropped packet never punishes you; the video plays and the toolbar shows a small badge.

### 🧹 Surface stripping (drift-proofing)
While a goal session is active, YouTube is reduced to search + player. Hidden: the homepage feed, related/up-next sidebar, endscreen cards, Shorts (and `/shorts/*` redirects to search), trending, and notifications. Comments are hidden by default (toggleable). Autoplay is forced off. The hiding CSS is injected at `document_start`, so there's **no flash** of the homepage before it's stripped.

### ⏱️ Honest active-time counter
A live count-up of time actually spent on YouTube. It counts **only while a video is genuinely playing** — including fullscreen, an unfocused window, and no mouse/keyboard input — or while you're actively browsing. It **freezes** when the video is paused and you're idle, when you switch tabs, or when the screen is locked. (No wall-clock guessing; measured from real playback.)

### 🎬 Leisure blocks
Sometimes you just want to watch. A **leisure block** is unfiltered, full YouTube — but **time-boxed** and only startable inside a window you configure (default 9pm–midnight). It ends automatically at the shorter of your chosen duration or the window's end, then returns to the wall. Guilt-free, bounded, and off by default outside your window.

### 🔒 Friend key (accountability)
Certain guardrails shouldn't be undoable by a distracted mid-session you. A **friend password** (set once, only its hash is stored) gates:

- Opening **Settings** at all
- Changing the goal mid-session
- Disabling surface stripping

It does **not** gate the things that should stay free: starting a session, **ending** a session (always one tap, never taxed), or starting a leisure block. Settings has two save buttons — **Save** (stay open) and **Save & lock** (re-lock immediately).

### 📜 Session log
Every judgment, verdict, and reason is written to a local log you can view in the popup. Not framed as guilt — most of the behavior change comes from the count simply being visible.

### 📡 Uninstall signal (optional)
Set a webhook URL and YT Gatekeep pings it if the extension is ever removed. No extension can stop its own uninstall from inside the browser — social accountability is the only thing that reaches that moment.

---

## 🧭 How it works

Three objects:

- **Work context** — a short paragraph naming what you're building. A *glossary* for the judge (so it understands "my canvas app"), not a permission list. Edited rarely.
- **Session** — a goal, created from the popup. Nothing on YouTube works without one.
- **Judgment** — an LLM verdict on one video, given the goal, the work context, the video metadata, and the recent verdict trail.

You're trusted at the moment you declare a goal — no sincerity check. All the enforcement weight sits on the **per-video judge** and the **stripped interface**, not on the door.

---

## 📦 Install

YT Gatekeep isn't on the Chrome Web Store — you load it unpacked (30 seconds).

1. **Get the code**
   - Click the green **Code** button above → **Download ZIP**, then unzip it.
   - *Or* clone it:
     ```bash
     git clone https://github.com/ManavSaspal/yt-gatekeep.git
     ```
2. **Open** `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `yt-gatekeep` folder.
5. (Recommended) Pin the 🚪 icon from the puzzle-piece menu so it's always visible.

Works in any Chromium browser (Chrome, Brave, Edge, Arc).

---

## 🔑 Get an OpenRouter API key

The judge runs through [OpenRouter](https://openrouter.ai) (one key, many models, and it works from the browser).

1. Sign up at [openrouter.ai](https://openrouter.ai) (Google/GitHub login).
2. Add a few dollars of credit under **Settings → Credits** (pay-as-you-go).
3. **Settings → Keys → Create Key**, name it `gatekeeper`, and copy it (`sk-or-v1-…`). You can set a per-key spend limit here as a safety cap.

> **Heads up:** a Claude/ChatGPT *subscription* does **not** include API access — that's a separate, metered product. OpenRouter billing is its own thing.

---

## ⚙️ Configure

Open the popup → **Settings** (🔒 gated by the friend key once one is set):

| Setting | What it does |
|---|---|
| **OpenRouter API key** | `sk-or-v1-…` — required for judging. |
| **Model** | Any OpenRouter slug. Default `anthropic/claude-haiku-4.5`; verify at [openrouter.ai/models](https://openrouter.ai/models). |
| **Work context** | A glossary of what you're building, so the judge understands your goals. Not a permission list. |
| **Hide comments** | On by default. |
| **Disable surface stripping** 🔒 | Show full YouTube even in a goal session (friend key). |
| **Leisure window** | The time range when leisure blocks may be started. |
| **Friend key password** | Set/rotate the accountability password. Leave blank to keep the current one. |
| **Uninstall webhook URL** | Optional endpoint pinged on removal. |

---

## ▶️ Using it

**Focused work:**
1. Click 🚪 → type your goal → **Start goal session**.
2. Search and watch. On-goal videos just play; off-goal ones get stopped with a reason.
3. Click **End session** the moment you're done — it's always free.

**Just watching:** click 🚪 → pick a duration under **Leisure block** → **Start leisure block** (only inside your configured window). Full YouTube, time-boxed.

---

## 💸 Cost

Roughly **~600 input + ~60 output tokens per video judged**. On Claude Haiku that's about **a tenth of a cent per check** — around **$3–5/month** at a couple hundred checks a day, usually less. No transcripts are sent (too slow, too costly, unnecessary): just title, channel, the first 300 chars of the description, and duration.

---

## 🔐 Privacy & security

- **Your API key lives in `chrome.storage.local`** and is sent directly to OpenRouter from the extension. This is acceptable **because it's a personal, single-user, load-unpacked extension on your own machine.** Don't publish a build with a key baked in, and don't share your Chrome profile. Set a per-key spend limit on OpenRouter.
- **No analytics, no servers, no tracking.** Everything (sessions, logs, cache, settings) is local to your browser. The only outbound calls are to OpenRouter (to judge a video) and, if you configure one, your own uninstall webhook.

---

## ⚠️ Known limitations

Stated plainly so they're not a surprise:

- The extension can be **disabled in two seconds** from `chrome://extensions`. Only the uninstall webhook (social cost) reaches that moment.
- **Incognito** windows run without extensions by default.
- **Safari, and phones**, exist and aren't covered.
- The model will be **wrong in both directions** sometimes. The interstitial's override exists because of this — it's a feature, not a leak.

---

## 🛠️ Project structure

Vanilla MV3 — no bundler, no framework, no build step.

```
manifest.json            MV3 manifest
src/
  lib/                   constants · storage · judge (OpenRouter) · auth (friend key)
  background/            service worker: time ledger, judgment, session lifecycle
  content/               strip.css + document_start injector, page logic, page-probe
  popup/                 the popup UI (Session · Log · Settings)
icons/                   toolbar icons
scripts/generate-icons.js   regenerates the placeholder icons
```

Time is metered by a **content-script heartbeat** (not `setInterval` in the worker — MV3 kills idle workers): the page measures real active-ms and flushes them to the worker, which also revives it.

---

## 📄 License

[MIT](LICENSE) — do what you like, no warranty.
