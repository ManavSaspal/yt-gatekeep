# 🚪 YT Gatekeep

**Make YouTube usable for work.** YT Gatekeep is a Chrome extension that requires you to declare *why* you're on YouTube, strips away every recommendation and rabbit-hole surface, and uses an LLM to judge each video against your stated goal — so the session that started as "research" doesn't quietly become 90 minutes of unrelated content.

It defends against **drift**, not a single bad click. A blocklist can't tell a needed tutorial from a vlog on the same channel. YT Gatekeep decides **per video, against your intent, every time.**

> Scope: YouTube only. Built for personal use — your own machine, your own API key. Load-unpacked, vanilla MV3, no build step.

---

## ✨ Features

### 🎯 Goal sessions
Nothing on YouTube works until you declare what you're here to do. Type a goal (`research canvas interaction patterns for my app`), and YouTube unlocks — but stripped down to a search bar and a player. No feed, no sidebar, no endscreen.

### 🧠 Per-video LLM judgment
Every watch page is judged after **12 seconds** of active viewing. The judge sees your goal, your work context, the video's metadata, and the **last 5 verdicts this session** — so it catches *drift*, not just individual off-topic videos. Bring your own model: switch between **Gemini, OpenRouter, or Groq** in Settings (there's a free, no-credit-card option — see below).

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

## 🔑 Get an API key (pick a provider)

The judge is just an OpenAI-compatible chat call, so you can point it at any of three providers — switch between them in **Settings** to compare. In the popup, choose the provider, paste its key, and (optionally) set the model.

### 🟢 Gemini — free, no credit card *(recommended to start)*
Best judgment quality among the no-card free tiers, and the easiest setup.
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key** (no billing details required) and copy it (`AIza…`).
3. In YT Gatekeep → Settings → provider **Gemini**, paste the key. Default model `gemini-2.5-flash`.

### 🟢 Groq — free, no credit card
Fast, open models (Llama etc.). Key from [console.groq.com/keys](https://console.groq.com/keys) (`gsk_…`). Default model `llama-3.3-70b-versatile`.

### 🔵 OpenRouter — paid, one key for many models
One key reaches Claude, GPT, Gemini, and more.
1. Sign up at [openrouter.ai](https://openrouter.ai), add a few dollars under **Credits** (pay-as-you-go), set a per-key spend cap.
2. **Keys → Create Key**, copy it (`sk-or-v1-…`). Default model `anthropic/claude-haiku-4.5`.

> **Heads up:** a Claude/ChatGPT *subscription* does **not** include API access — that's a separate, metered product. Use Gemini/Groq for a genuinely free setup. (Free-tier rate limits change over time; check the provider's current limits.)

---

## ⚙️ Configure

Open the popup → **Settings** (🔒 gated by the friend key once one is set):

| Setting | What it does |
|---|---|
| **Judge provider** | Toggle **Gemini / OpenRouter / Groq**. Each keeps its own key + model, so you can switch back and forth to compare. |
| **API key** | The key for the selected provider (required for judging). |
| **Model** | The model slug for the selected provider (a sensible default is pre-filled). |
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

Roughly **~600 input + ~60 output tokens per video judged**. On **Gemini or Groq's free tier that's $0**; on a paid provider it's about a tenth of a cent per check (~$3–5/month at a couple hundred checks a day, usually less). No transcripts are sent (too slow, too costly, unnecessary): just title, channel, the first 300 chars of the description, and duration.

---

## 🔐 Privacy & security

- **Your API key lives in `chrome.storage.local`** and is sent directly to your chosen provider from the extension. This is acceptable **because it's a personal, single-user, load-unpacked extension on your own machine.** Don't publish a build with a key baked in, and don't share your Chrome profile. Set a per-key spend/rate limit where the provider allows it.
- **No analytics, no servers, no tracking.** Everything (sessions, logs, cache, settings) is local to your browser. The only outbound calls are to your chosen judge provider (to judge a video) and, if you configure one, your own uninstall webhook.

---

## 🛠️ Project structure

Vanilla MV3 — no bundler, no framework, no build step.

```
manifest.json            MV3 manifest
src/
  lib/                   constants · storage · judge (Gemini/OpenRouter/Groq) · auth (friend key)
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
