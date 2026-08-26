# 🚪 YT Gatekeep

**YouTube, but it keeps you honest.** 💛

You open YouTube for *one* tutorial and resurface an hour later watching someone restore a rusty pan. YT Gatekeep gently catches that. You tell it what you came to do, it hides all the tempting rabbit-hole stuff, and it quietly checks each video against your goal — the good stuff plays, and the "wait, why am I watching this?" stuff gets a friendly stop sign.

It's free, it lives entirely in your browser, and it's on your side. 🌱

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Add a free AI key](#add-a-free-ai-key)
- [How to use it](#how-to-use-it)
- [Settings, explained](#settings-explained)
- [Switching AI providers](#switching-ai-providers)
- [Cost](#cost)
- [Privacy and your data](#privacy-and-your-data)
- [For tinkerers](#for-tinkerers)

## What it does

- 🎯 **Asks what you're here for.** Nothing loads until you type a goal, like *"learn French"* or *"research canvas UIs."*
- 🧹 **Clears the clutter.** No homepage feed, no sidebar, no Shorts, no endscreen — just a search bar and your video.
- 🧠 **Keeps you pointed at your goal.** A little AI reads each video's title and description and asks *"does this actually help?"* On-topic videos just play. Off-topic ones get paused with a one-line reason.
- 🧾 **Learns your world (once).** Add a **Work context** in Settings — a few lines on your projects, what you're learning, the tools you use — so the AI *gets* your goals instead of guessing. Once a friend password is set, it's locked behind it too. 🔒
- ⏱️ **Shows you the truth about your time.** A live timer counts only while you're really watching (yes, even in fullscreen).
- 🎬 **Leaves room to just chill.** Want to relax? Start a **Leisure block** — full YouTube, no judging — but it's time-boxed, and only during hours you pick.
- 🔒 **Has your back against… you.** Set an optional friend password so a distracted, deep-in-it you can't quietly switch the guardrails off.

## Install

About two minutes, no technical background needed. 🚀

1. **Grab the files.** Click the green **Code** button up top → **Download ZIP**, then unzip it.
   *(Comfortable with the terminal? `git clone https://github.com/ManavSaspal/yt-gatekeep.git`)*
2. Open **`chrome://extensions`** in Chrome.
3. Flip on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and choose the **yt-gatekeep** folder.
5. Pin the little 🚪 icon so it's always one click away.

Works in Chrome, Brave, Edge, and Arc. 🎉

## Add a free AI key

YT Gatekeep uses an AI to judge videos, and **Gemini is free with no credit card.** Just a minute:

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with your Google account.
2. Click **Create API key** and copy it.
3. In the extension: click 🚪 → **Settings** → pick **Gemini** → paste your key → **Save**. Done! 🙌

> 💡 A Claude or ChatGPT *subscription* doesn't include this — API keys are a separate thing. That's why we point you at the free options. You can also use Groq (free) or OpenRouter (paid) — see [Switching AI providers](#switching-ai-providers).

## How to use it

**When you're working:**
> Click 🚪 → type your goal → **Start**. Search and watch as normal. Anything off-track gets gently stopped with a reason. Click **End** whenever you're done — that's always free and instant. ✅

**When you just want to unwind:**
> Click 🚪 → pick how long under **Leisure block** → **Start**. Full YouTube, no judging, for exactly as long as you chose (within the hours you set). 🍿

## Settings, explained

Everything lives behind the 🚪 icon → **Settings**. Here's what each thing does:

| Setting | What it's for |
|---|---|
| **Judge provider** | Choose **Gemini**, **Groq**, or **OpenRouter**. Each remembers its own key + model, so you can switch to compare. |
| **API key** | The key for whichever provider you picked. |
| **Model** | Which model does the judging (a sensible default is filled in for you). |
| **Work context** | A few sentences about your projects, studies, and tools so the AI understands your goals. Write once, edit rarely. |
| **Hide comments** | Tidy the watch page by hiding comments (on by default). |
| **Disable surface stripping** 🔒 | Show full YouTube even during a goal session. Needs the friend password. |
| **Leisure window** | The hours when leisure blocks are allowed (e.g. after 9pm). |
| **Friend password** | Your accountability lock (more below). Leave the box blank to keep your current one. |
| **Uninstall webhook** | Optional — pings a URL if the extension is ever removed, so a friend knows. |

**About that friend password 🔒** — once you set one, the *whole* Settings area locks behind it. That's on purpose: a focused, sober you sets things up, and a distracted, three-videos-deep you can't quietly undo them. Ending a session and starting a leisure block always stay free — the lock is only for loosening the guardrails.

## Switching AI providers

The judge is just a standard AI chat call, so you can point it at any of three providers and flip between them in Settings anytime:

- 🟢 **Gemini — free, no card.** The easiest start and the best quality of the free options. Key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- 🟢 **Groq — free, no card.** Fast, open models. Key from [console.groq.com/keys](https://console.groq.com/keys).
- 🔵 **OpenRouter — paid.** One key reaches Claude, GPT, Gemini and more. Key from [openrouter.ai/keys](https://openrouter.ai/keys) (add a little credit first).

Each provider keeps its own key and model, so switching back and forth to compare is one click — nothing gets wiped.

> Free-tier limits change over time, so if judging suddenly stops, check your provider's current limits or try another one.

## Cost

Tiny to nothing. Each video check is about **600 words in, a sentence out**. On **Gemini or Groq's free tier that's $0**; on a paid provider it's roughly a tenth of a cent per check (a few dollars a month at most). No transcripts are ever sent — just the title, channel, a snippet of the description, and the length.

## Privacy and your data

- **Your stuff stays yours.** No tracking, no accounts, no servers. Sessions, logs, and settings all live in your browser.
- **The only thing that leaves** is a video's title and description, sent to the AI provider you chose so it can make its call.
- **Your API key is stored in your browser** — just don't share your Chrome profile and you're set.
- **The AI won't be perfect**, and that's okay. When it stops a video you disagree with, you can keep watching. It's a nudge, not a cage. 🤝

## For tinkerers

Plain Chrome extension (Manifest V3) — no build step, no frameworks. Load it unpacked and poke around. The provider list, timings, and wording all live in `src/lib/constants.js`.

```
manifest.json            the extension manifest
src/
  lib/                   constants · storage · judge (Gemini/OpenRouter/Groq) · auth
  background/            the service worker: timekeeping, judging, sessions
  content/               the on-page bits: clutter-hiding, the wall, the stop sign
  popup/                 the little window behind the icon
```

Made with care. MIT licensed — take it, remix it, share it. 🚪✨
