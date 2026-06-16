---
name: growth
description: >-
  Route growth, virality, creator distribution, share-loop, share-page, Open
  Graph preview, short-link attribution, first-run consumer AI onboarding, and
  AI audio audience strategy work in this repo to the checked-in guides first,
  then to the right execution skill. Use when the task involves growth strategy,
  social distribution, referral mechanics, share UX, activation/onboarding
  patterns, or AI-audio go-to-market patterns; not for pure copy work (use
  david-ogilvy), frontend implementation alone (use react), backend edge/link
  infrastructure alone (use cloudflare), or deploys (use deploy).
---

# Growth (Gist)

## Purpose

**This repo** keeps long-form growth context in checked-in guides. Use those for
strategy, audience segmentation, channel tradeoffs, share mechanics, and
distribution patterns before improvising advice.

Use this skill as a **router**: load the smallest relevant set of guides, then
handoff to the right implementation or copy skill when the task stops being
primarily growth work.

## Use When

- Defining or reviewing **growth strategy** for Gist.
- Working on **virality**, **share loops**, **referrals**, **creator
  distribution**, **affiliate loops**, or **audience segmentation**.
- Evaluating **consumer AI subscription or content apps** where model costs,
  agent-led onboarding, social learning loops, or AI-native retention math
  materially affect growth strategy.
- Designing or critiquing **share pages**, **share modals**, **Open Graph
  previews**, **audiogram/video export**, or **short-link attribution** from a
  growth perspective.
- Shaping **first-run onboarding**, **time-to-value**, **activation**, or
  **blank-prompt / articulation-barrier** UX from a growth (not ops) angle.
- Evaluating **AI audio** go-to-market patterns: music, voice, TTS,
  creator-facing distribution, or B2B audio positioning.
- The user asks how to structure a growth workflow and you need the repo's
  checked-in guidance rather than generic startup advice.

## Do Not Use When

- The task is primarily **copywriting** for users, admins, marketing surfaces,
  onboarding, or emails — use **`david-ogilvy`**.
- The task is primarily **frontend implementation** of React UI or client-side
  behavior — use **`react`**.
- The task is primarily **Cloudflare/Workers/D1/KV** implementation for
  redirects, attribution, or backend infra — use **`cloudflare`**.
- The task is only editing or ingesting markdown guides — use **`markdown`** or
  **`guide-ingest`**.
- The task is shipping, migrations, or deployment — use **`deploy`**.

## Procedure

1. **Start with the right guide** (paths from repo root):
   - [Growth-hacker-subscription-playbook.md](../../../README/Guides/growth/Growth-hacker-subscription-playbook.md) — consumer subscription growth, PLG, onboarding/paywalls, churn, save flows, and benchmarks.
   - [Onboarding-guide.md](../../../README/Guides/growth/Onboarding-guide.md) — first-run consumer AI onboarding psychology and patterns (aha moment, articulation barrier, lifecycle email, reverse trials, virality); external research, not Gist requirements.
   - [Growth-hacker-subscription-playbook-v2.md](../../../README/Guides/growth/Growth-hacker-subscription-playbook-v2.md) — AI-native growth architecture for consumer AI, including AI-native unit economics, social learning loops, model routing, and agent-led onboarding.
   - [AI-audio-viral-growth-guide.md](../../../README/Guides/growth/AI-audio-viral-growth-guide.md) — growth strategy, segments, channels, compliance risks, and case-study narratives for AI audio.
   - [share-page-guide.md](../../../README/Guides/content/share-page-guide.md) — UGC landing pages, consumption vs conversion, CTAs, and viral landing-page patterns.
   - [Share-Modals-react-guide.md](../../../README/Guides/frontend/Share-Modals-react-guide.md) — copy link, Web Share API, dedicated buttons, and modal UX tradeoffs.
   - [social-og-field-guide.md](../../../README/Guides/frontend/social-og-field-guide.md) — platform preview behavior, OG tags, image shapes, and testing.
   - [cloudflare-link-shortening-guide.md](../../../README/Guides/backend/Cloudflare/cloudflare-link-shortening-guide.md) — short links, crawler-aware HTML, edge attribution, and redirect constraints.
   - [React-Audio-Autoplay-iMessage-guide.md](../../../README/Guides/frontend/React-Audio-Autoplay-iMessage-guide.md) — audio preview and playback constraints when the growth task touches inline listening or iMessage.
2. **Read the smallest relevant set**:
   - **Non-AI subscription apps:** start with the subscription growth playbook for consumer subscription mechanics, onboarding/paywalls, churn, save flows, and benchmarks.
   - **AI consumer/content apps:** start with the baseline subscription playbook, then layer in `Growth-hacker-subscription-playbook-v2.md` for AI-native adaptation (model costs, routing, contribution economics, and social growth mechanics).
   - **First-run onboarding / activation (especially generative UI):** add `Onboarding-guide.md` when the question is time-to-value, blank prompts, progressive disclosure, lifecycle messaging, or reverse trials.
   - **AI audio / channel strategy:** add the AI audio viral growth guide when the audience, channel mix, or creator-distribution question is audio-specific.
   - **Landing pages / conversion:** add the share page guide.
   - **Share UX / CTA surfaces:** add the share modals guide.
   - **Preview cards / unfurls / audiograms:** add the OG field guide.
   - **Short URLs / attribution / bot-specific behavior:** add the Cloudflare link-shortening guide.
3. **Separate growth advice from execution**:
   - Growth questions should answer **who**, **where**, **why**, and **what to test**.
   - Do not drift into implementation detail unless the task clearly requires it.
4. **Use current docs when claims depend on live platform behavior**:
   - For browser/library/platform API details, use Context7 or vendor docs rather
     than relying on old growth-blog claims.
5. **Then hand off** to the right skill if the task becomes copy, frontend, or
   backend work.

## Handoff

| Need | Skill / doc |
| --- | --- |
| Product, admin, onboarding, or marketing copy | **`david-ogilvy`** |
| Visual hierarchy, restraint, and product UX on share or acquisition surfaces | **`jony-ive`** |
| Motion polish, animation critique, or tuning animated share surfaces | **`interface-craft`** |
| React share surfaces, OG/UI implementation, autoplay, client UX | **`react`** |
| Workers, D1, KV, redirects, edge attribution, crawler handling | **`cloudflare`** |
| AI-model/product strategy beyond growth mechanics | **`ilya-sutskever`** |
| Importing or refreshing a growth guide from research export | **`guide-ingest`** |
| Markdown cleanup or guide edits | **`markdown`** / **`guide-ingest`** |
| Deploy, migrations, staging/prod | **`deploy`** |
