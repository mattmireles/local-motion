#!/usr/bin/env node
// Verify Local Motion's pinned one-click model list.
//
// WHAT: checks the chosen Hugging Face GGUF repos still exist and expose a
// single-file Q4_K_M-or-better quant, then compares the result to the committed
// list in src/models/defaultRepos.ts.
//
// WHY: the one-click path is deliberately opinionated: Qwen3-Coder first,
// Gemma 4 26B A4B as the only automatic fallback. This script catches broken or
// renamed repos without auto-downgrading users to older Qwen2.5 models.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPOS_FILE = join(repoRoot, "src/models/defaultRepos.ts");
const PACKAGE_JSON_FILE = join(repoRoot, "package.json");

const ONE_CLICK_REPOS = [
  "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
  "unsloth/gemma-4-26B-A4B-it-GGUF"
];

const PUBLISHER_ALLOWLIST = new Set(["unsloth"]);
const HF_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  return { mode: argv.includes("--write") ? "write" : "check" };
}

function ownerOf(repoId) {
  return repoId.split("/")[0] ?? "";
}

function isShardedGgufName(name) {
  return /-\d{5}-of-\d{5}\.gguf$/i.test(name);
}

function isHealthyQuantName(name) {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".gguf") || isShardedGgufName(lower) || lower.startsWith("mtp/") || lower.includes("mmproj")) {
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

async function repoHealth(repoId) {
  if (!PUBLISHER_ALLOWLIST.has(ownerOf(repoId))) {
    return { repoId, ok: false, message: "publisher is not allowlisted" };
  }
  const model = await hfJson(`https://huggingface.co/api/models/${repoId}`);
  const healthyFile = (model.siblings ?? []).find((sibling) => isHealthyQuantName(sibling.rfilename ?? ""));
  return {
    repoId,
    ok: healthyFile !== undefined,
    message: healthyFile ? `ok (${healthyFile.rfilename})` : "missing single-file Q4+ GGUF"
  };
}

async function buildProposedLadder() {
  const checks = [];
  for (const repoId of ONE_CLICK_REPOS) {
    // eslint-disable-next-line no-await-in-loop -- sequential keeps HF load gentle.
    checks.push(await repoHealth(repoId));
  }
  return {
    ladder: checks.filter((check) => check.ok).map((check) => check.repoId),
    checks
  };
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
  await writeFile(DEFAULT_REPOS_FILE, source.replace(block, rebuildLadderBlock(proposed)), "utf8");

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

  console.log("Pinned one-click repos:");
  for (const check of proposal.checks) {
    console.log(`  ${check.repoId}: ${check.message}`);
  }

  if (proposal.ladder.length !== ONE_CLICK_REPOS.length) {
    console.warn("model-ranking: one or more pinned one-click repos failed health checks. Skipping.");
    process.exit(2);
  }

  console.log("\nCurrent ladder:");
  current.forEach((repoId) => console.log(`  ${repoId}`));

  if (arraysEqual(proposal.ladder, current)) {
    console.log("\nNo drift: the committed one-click repos match the pinned defaults.");
    process.exit(0);
  }

  if (mode === "write") {
    await writeLadder(proposal.ladder);
    console.log("\nWrote the pinned one-click repos to src/models/defaultRepos.ts and package.json.");
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
