---
name: gemini-pipeline
description: Operate Gemini and Vertex workflows in this repo. Use when the task involves Vertex endpoint wiring, tuned-model bakeoffs, Gemini batch jobs, Gemini video-analysis flows, or Gemini and Vertex transport behavior on Cloudflare. Do not use for Bedrock operations, Chrome extension runtime bugs, or local Apple Silicon MLX training.
---

# Gemini Pipeline

## Purpose

Use this skill for Gemini and Vertex-specific pipeline work in Gist. It is for
provider wiring, bakeoffs, batch jobs, tuned endpoints, and multimodal Gemini
workflows, not generic backend design.

## Use When

- The task touches Gemini or Vertex provider routing.
- The task is an instant bakeoff, tuned-model bakeoff, or model rerun.
- The task needs Gemini Batch API guidance.
- The task involves Gemini video-analysis or other multimodal Gemini flows.
- The task is a Vertex plus Cloudflare auth, endpoint, or streaming issue.

## Do Not Use When

- The task is Bedrock throttling, auth, or transport work.
- The task is a Chrome extension runtime bug.
- The task is local MLX or Apple Silicon SFT work.
- The task is generic prompt writing with no repo-specific Gemini path.

## Procedure

1. Classify the work first:
   - base-model routing
   - tuned endpoint wiring
   - bakeoff runbook
   - batch job
   - video or multimodal flow
2. Read [references/index.md](references/index.md) and load only the docs that
   match that class.
3. Quantify the request shape before suggesting a fix:
   - environment
   - route
   - model family
   - tuned endpoint versus base model
   - batch versus real-time
4. Prefer the shortest repo runbook over generic Vertex folklore.
5. Keep provider, experiment, and artifact boundaries explicit so new runs stay
   discoverable and comparable.

## Canonical Docs

Read [references/index.md](references/index.md) first. It maps the repo's
canonical Gemini and Vertex runbooks.

## Handoff Rules

- Hand off to `bedrock-ops` when the active provider path is Bedrock.
- Hand off to `scraping` when the real problem is media extraction rather than
  Gemini provider behavior.
- Hand off to `extension-architecture` only when a provider change forces a
  structural refactor in the extension.
