#!/usr/bin/env node
// Recheck the local-coding-model ranking and refresh Local Motion's curated
// ladder.
//
// WHAT: queries Hugging Face for the most-downloaded coder GGUF repositories,
// buckets them by parameter size, and builds a biggest-first ladder of the top
// repo per size tier that ships a single-file Q4_K_M-or-better quant. It then
// compares that to the committed ladder in src/models/defaultRepos.ts.
//
// WHY: the "best local coding model" moves fast (see the seed survey in
// README/Notes/model-selection.md). This keeps the shipped defaults honest
// without a human manually re-surveying Hugging Face every month.
//
// SAFETY: only repositories owned by an allowlisted, reputable publisher can
// ever become a default — auto-adopting an arbitrary trending repo would be a
// supply-chain risk. The script proposes; a human runs --write and commits.
//
// USAGE:
//   node scripts/refresh-model-ranking.mjs            # dry-run report (alias of --check)
//   node scripts/refresh-model-ranking.mjs --check    # exit 1 if the ladder drifted
//   node scripts/refresh-model-ranking.mjs --write     # rewrite the ladder + package.json default
//
// Exit codes: 0 = no drift / written; 1 = drift detected (--check); 2 = could
// not reach Hugging Face (transient; do not treat as drift).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPOS_FILE = join(repoRoot, "src/models/defaultRepos.ts");
const PACKAGE_JSON_FILE = join(repoRoot, "package.json");

// Only these owners can supply a shipped default. Reputable GGUF publishers.
const PUBLISHER_ALLOWLIST = new Set([
  "unsloth",
  "lmstudio-community",
  "bartowski",
  "ggml-org",
  "ggerganov",
  "Qwen",
  "google",
  "mlx-community"
]);

// Biggest-first size tiers. `match` decides which tier a model's parameter
// count belongs to; one repo is chosen per tier to build the ladder.
const SIZE_TIERS = [
  { id: "30b-moe", label: "~30B+ MoE coder", match: (b) => b >= 24 },
  { id: "14b", label: "~12-16B coder", match: (b) => b >= 12 && b < 20 },
  { id: "7b", label: "~6-9B coder", match: (b) => b >= 6 && b < 12 },
  { id: "3b", label: "~2.5-4B coder", match: (b) => b >= 2.5 && b < 6 },
  { id: "1.5b", label: "~1-2B coder", match: (b) => b >= 1 && b < 2.5 }
];

const MIN_DOWNLOADS = 500;
const HF_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  const mode = argv.includes("--write") ? "write" : "check";
  return { mode };
}

function ownerOf(repoId) {
  return repoId.split("/")[0] ?? "";
}

function parameterBillions(text) {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*B\b/i);
  return match ? Number(match[1]) : undefined;
}

function looksLikeCoder(text) {
  return /coder|code/i.test(text);
}

function isShardedGgufName(name) {
  return /-\d{5}-of-\d{5}\.gguf$/i.test(name);
}

function isHealthyQuantName(name) {
  // Single-file Q4_K_* / Q5 / Q6 / Q8 (4-bit or better). Excludes Q2/Q3/IQ2/IQ3.
  const lower = name.toLowerCase();
  if (!lower.endsWith(".gguf") || isShardedGgufName(lower)) {
    return false;
  }
  return /(?:^|[-_.])(q4_k|q4_0|q4_1|q5|q6|q8|f16|bf16)/i.test(lower);
}

async function hfJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(HF_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`Hugging Face ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function topCoderModels() {
  const params = new URLSearchParams({
    search: "coder",
    filter: "gguf",
    sort: "downloads",
    direction: "-1",
    limit: "100"
  });
  const models = await hfJson(`https://huggingface.co/api/models?${params.toString()}`);
  return models
    .map((model) => ({
      repoId: model.modelId ?? model.id ?? "",
      downloads: model.downloads ?? 0,
      tags: model.tags ?? []
    }))
    .filter((model) => model.repoId.includes("/"))
    .filter((model) => PUBLISHER_ALLOWLIST.has(ownerOf(model.repoId)))
    .filter((model) => model.downloads >= MIN_DOWNLOADS)
    .filter((model) => looksLikeCoder(`${model.repoId} ${model.tags.join(" ")}`));
}

async function hasHealthySingleFileQuant(repoId) {
  try {
    const model = await hfJson(`https://huggingface.co/api/models/${repoId}`);
    return (model.siblings ?? []).some((sibling) => isHealthyQuantName(sibling.rfilename ?? ""));
  } catch {
    return false;
  }
}

async function buildProposedLadder() {
  const models = await topCoderModels();
  const ladder = [];
  const chosen = [];
  for (const tier of SIZE_TIERS) {
    const ranked = models
      .filter((model) => {
        const billions = parameterBillions(model.repoId);
        return billions !== undefined && tier.match(billions);
      })
      .sort((a, b) => b.downloads - a.downloads);

    let picked;
    for (const candidate of ranked) {
      // eslint-disable-next-line no-await-in-loop -- sequential keeps HF load gentle
      if (await hasHealthySingleFileQuant(candidate.repoId)) {
        picked = candidate;
        break;
      }
    }
    if (picked) {
      ladder.push(picked.repoId);
      chosen.push({ tier: tier.label, repoId: picked.repoId, downloads: picked.downloads });
    } else {
      chosen.push({ tier: tier.label, repoId: undefined, downloads: 0 });
    }
  }
  return { ladder, chosen };
}

function readLadderBlock(source) {
  const match = source.match(/\/\* BEGIN curated-ladder[\s\S]*?\/\* END curated-ladder \*\//);
  if (!match) {
    throw new Error("Could not find the curated-ladder block in defaultRepos.ts");
  }
  const repos = [...match[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { block: match[0], repos };
}

function rebuildLadderBlock(repos) {
  const body = repos
    .map((repoId, index) => `  ${JSON.stringify(repoId)}${index < repos.length - 1 ? "," : ""}`)
    .join("\n");
  return [
    "/* BEGIN curated-ladder (managed by scripts/refresh-model-ranking.mjs) */",
    body,
    "  /* END curated-ladder */"
  ].join("\n");
}

async function writeLadder(proposed) {
  const source = await readFile(DEFAULT_REPOS_FILE, "utf8");
  const { block } = readLadderBlock(source);
  const next = source.replace(block, rebuildLadderBlock(proposed));
  await writeFile(DEFAULT_REPOS_FILE, next, "utf8");

  const pkg = await readFile(PACKAGE_JSON_FILE, "utf8");
  const nextPkg = pkg.replace(
    /("localMotion\.defaultModelRepo":\s*\{[\s\S]*?"default":\s*)"[^"]*"/,
    `$1${JSON.stringify(proposed[0])}`
  );
  await writeFile(PACKAGE_JSON_FILE, nextPkg, "utf8");
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2));
  const source = await readFile(DEFAULT_REPOS_FILE, "utf8");
  const current = readLadderBlock(source).repos;

  let proposal;
  try {
    proposal = await buildProposedLadder();
  } catch (error) {
    console.warn(`model-ranking: could not reach Hugging Face (${error.message}). Skipping.`);
    process.exit(2);
  }

  const { ladder, chosen } = proposal;
  console.log("Source: https://tomtunguz.com/local-coding-models/ (seed) + Hugging Face downloads");
  console.log("Proposed ladder (biggest-first):");
  for (const row of chosen) {
    console.log(`  ${row.repoId ? `${row.repoId}  (${row.downloads.toLocaleString()} dl)` : "(no allowlisted single-file repo found)"}  [${row.tier}]`);
  }

  if (ladder.length < 2) {
    console.warn("model-ranking: too few tiers resolved to propose a ladder safely. Skipping.");
    process.exit(2);
  }

  console.log("\nCurrent ladder:");
  current.forEach((repoId) => console.log(`  ${repoId}`));

  if (arraysEqual(ladder, current)) {
    console.log("\nNo drift: the committed ladder matches the live ranking.");
    process.exit(0);
  }

  if (mode === "write") {
    await writeLadder(ladder);
    console.log("\nWrote the new ladder to src/models/defaultRepos.ts and package.json.");
    console.log("Run `npm test` to verify, then commit.");
    process.exit(0);
  }

  console.log("\nDrift detected. Run `npm run models:refresh` to apply, then `npm test` and commit.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
