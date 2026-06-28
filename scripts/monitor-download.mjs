#!/usr/bin/env node
/**
 * Watch a Local Motion `.part` GGUF download and print progress + speed.
 *
 * Usage:
 *   node scripts/monitor-download.mjs
 *   node scripts/monitor-download.mjs /path/to/file.gguf.part
 *   node scripts/monitor-download.mjs --interval 2
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const DEFAULT_STORAGE =
  path.join(
    process.env.HOME ?? "",
    "Library/Application Support/Cursor/User/globalStorage/local-motion.local-motion/models"
  );

function parseArgs(argv) {
  let intervalSec = 5;
  let partPath;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--interval" || arg === "-i") {
      intervalSec = Number(argv[++i]);
      continue;
    }
    if (!arg.startsWith("-")) {
      partPath = arg;
    }
  }
  return { intervalSec, partPath };
}

function findLatestPart(modelsRoot) {
  let newest;
  let newestMtime = 0;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".gguf.part")) {
        continue;
      }
      const stat = fs.statSync(full);
      if (stat.mtimeMs >= newestMtime) {
        newestMtime = stat.mtimeMs;
        newest = full;
      }
    }
  }
  walk(modelsRoot);
  return newest;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "?";
  }
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "?";
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

async function fetchTotalBytes(partPath) {
  const match = partPath.match(/models\/([^/]+)\/([^/]+)\.gguf\.part$/i);
  if (!match) {
    return undefined;
  }
  const [, repoKey, fileBase] = match;
  const repoId = repoKey
    .replace(/^([^-]+)-([^-]+)-/, "$1/$2-")
    .replace(/-([^-]+)-gguf-.+$/, (_, tail) => {
      void tail;
      return "";
    });
  // Repo folder uses safeId(repo-revision); recover revision from suffix after `-gguf-`.
  const revisionMatch = repoKey.match(/-gguf-([a-f0-9]{40})$/i);
  const revision = revisionMatch?.[1] ?? "main";
  const fileName = `${fileBase}.gguf`;

  // safeId lowercases and strips punctuation; best-effort map back to HF repo id.
  const guessedRepoId = repoKey.includes("unsloth-qwen3")
    ? "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF"
    : undefined;
  const candidates = [guessedRepoId, repoId].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = `https://huggingface.co/${candidate}/resolve/${revision}/${fileName}?download=true`;
      const response = await fetch(url, {
        method: "GET",
        headers: { range: "bytes=0-0" },
        redirect: "follow"
      });
      const range = response.headers.get("content-range");
      const totalMatch = range?.match(/\/(\d+)$/);
      if (totalMatch) {
        return Number(totalMatch[1]);
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function statSize(partPath) {
  try {
    return fs.statSync(partPath).size;
  } catch {
    return 0;
  }
}

async function main() {
  const { intervalSec, partPath: argPath } = parseArgs(process.argv);
  const partPath = argPath ?? findLatestPart(DEFAULT_STORAGE);
  if (!partPath) {
    console.error(`No .gguf.part download found under ${DEFAULT_STORAGE}`);
    process.exit(1);
  }

  let totalBytes = await fetchTotalBytes(partPath);
  let lastBytes = statSize(partPath);
  let lastTime = Date.now();
  let stalledTicks = 0;

  console.log(`Monitoring: ${partPath}`);
  if (totalBytes) {
    console.log(`Total size: ${formatBytes(totalBytes)}`);
  } else {
    console.log("Total size: unknown (will show bytes downloaded only)");
  }
  console.log(`Sample every ${intervalSec}s — Ctrl+C to stop\n`);

  const printRow = (bytes, rate) => {
    const pct = totalBytes ? Math.min(100, (bytes / totalBytes) * 100) : undefined;
    const eta =
      totalBytes && rate > 0 ? formatDuration((totalBytes - bytes) / rate) : "?";
    const pctText = pct !== undefined ? `${pct.toFixed(1)}%` : "—";
    const rateText = rate > 0 ? formatBytes(rate) + "/s" : "0 B/s";
    process.stdout.write(
      `\r${new Date().toLocaleTimeString()}  ${pctText.padStart(6)}  ${formatBytes(bytes).padStart(10)} / ${totalBytes ? formatBytes(totalBytes).padStart(10) : "?".padStart(10)}  ${rateText.padStart(12)}  ETA ${eta}`
    );
  };

  printRow(lastBytes, 0);

  const timer = setInterval(async () => {
    const bytes = statSize(partPath);
    const now = Date.now();
    const elapsed = (now - lastTime) / 1000;
    const rate = elapsed > 0 ? (bytes - lastBytes) / elapsed : 0;

    if (bytes === lastBytes) {
      stalledTicks += 1;
    } else {
      stalledTicks = 0;
    }

    if (!totalBytes && stalledTicks === 0 && bytes > 0) {
      totalBytes = await fetchTotalBytes(partPath);
    }

    printRow(bytes, Math.max(0, rate));

    if (totalBytes && bytes >= totalBytes) {
      console.log("\n\nDownload complete.");
      clearInterval(timer);
      process.exit(0);
    }

    if (stalledTicks >= 6) {
      console.log("\n\nNo growth for 30s — download may be paused, retrying, or finished.");
    }

    lastBytes = bytes;
    lastTime = now;
  }, intervalSec * 1000);

  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("\nStopped.");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
