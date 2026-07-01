#!/usr/bin/env node
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { selectBestCompatibleQuantization } from "../out/models/compatibility.js";
import { automagicalModelRepos, DEFAULT_MODEL_REPO } from "../out/models/defaultRepos.js";
import { listQuantizations } from "../out/models/huggingFace.js";
import { downloadGguf } from "../out/runtime/downloader.js";
import { waitForHealth } from "../out/runtime/llamaHealth.js";
import { OpenAiProxy } from "../out/runtime/openAiProxy.js";
import { releasePortHolder, reserveLocalhostPort } from "../out/runtime/ports.js";
import { profileMachine } from "../out/system/machineProfile.js";

const execFile = promisify(childProcess.execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storageRoot = path.resolve(process.env.LOCAL_MOTION_SMOKE_STORAGE ?? path.join(repoRoot, "tmp", "local-runtime-smoke"));
const contextTokens = Number(process.env.LOCAL_MOTION_SMOKE_CONTEXT_TOKENS ?? 2048);
const preferredProxyPort = Number(process.env.LOCAL_MOTION_SMOKE_PROXY_PORT ?? 41434);

let child;
let proxy;

try {
  await fs.promises.mkdir(storageRoot, { recursive: true });
  const llamaServerPath = await resolveLlamaServer();
  const machine = await profileMachine(storageRoot);
  const candidate = await automagicalCandidate(machine);
  console.log(`Selected ${candidate.repoId} ${candidate.fileName}`);

  const modelPath = await downloadGguf(candidate, path.join(storageRoot, "models"), reportDownloadProgress(), new AbortController().signal);
  console.log(`Model ready at ${modelPath}`);

  const holder = await reserveLocalhostPort();
  const upstreamPort = holder.port;
  await releasePortHolder(holder);
  const upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}/v1`;
  const modelId = `local-motion-smoke-${Date.now()}`;
  child = startLlamaServer(llamaServerPath, modelPath, upstreamPort);
  await waitForHealth(upstreamPort, 120_000, { child });

  proxy = new OpenAiProxy({ upstreamBaseUrl, modelId });
  const baseUrl = await proxy.start(preferredProxyPort);
  const apiKey = proxy.apiKey();
  await verifyModels(baseUrl, modelId, apiKey);
  await verifyChat(baseUrl, modelId, apiKey);
  console.log(`Smoke passed: ${modelId} reachable at ${baseUrl}`);
} finally {
  await proxy?.stop();
  await stopChild(child);
}

async function automagicalCandidate(machine) {
  const attempts = [];
  for (const repoId of automagicalModelRepos(DEFAULT_MODEL_REPO)) {
    try {
      const candidate = selectBestCompatibleQuantization(await listQuantizations(repoId, machine, contextTokens));
      if (candidate) {
        return candidate;
      }
      attempts.push(`${repoId}: no compatible quantization`);
    } catch (error) {
      attempts.push(`${repoId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No compatible GGUF quantization found. Tried ${attempts.join("; ")}.`);
}

async function resolveLlamaServer() {
  const candidates = [
    process.env.LOCAL_MOTION_LLAMA_SERVER,
    await commandPath("llama-server"),
    "/opt/homebrew/bin/llama-server",
    "/usr/local/bin/llama-server"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next supported location.
    }
  }
  throw new Error('llama-server is not available. Install it with "brew install llama.cpp" or set LOCAL_MOTION_LLAMA_SERVER.');
}

async function commandPath(command) {
  try {
    const { stdout } = await execFile("/usr/bin/which", [command]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function startLlamaServer(llamaServerPath, modelPath, upstreamPort) {
  const args = [
    "-m",
    modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(upstreamPort),
    "-c",
    String(contextTokens),
    "--parallel",
    "1",
    "-ngl",
    "99"
  ];
  console.log(`Starting llama-server on ${upstreamPort}`);
  const process = childProcess.spawn(llamaServerPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  process.stdout?.on("data", (chunk) => processOutput("llama", chunk));
  process.stderr?.on("data", (chunk) => processOutput("llama", chunk));
  return process;
}

function processOutput(prefix, chunk) {
  const lines = chunk.toString().trim().split("\n").filter(Boolean);
  for (const line of lines.slice(-8)) {
    console.log(`[${prefix}] ${line}`);
  }
}

async function verifyModels(baseUrl, modelId, apiKey) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    throw new Error(`/v1/models failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  const ids = Array.isArray(body.data) ? body.data.map((model) => model.id) : [];
  if (!ids.includes(modelId)) {
    throw new Error(`/v1/models did not include ${modelId}`);
  }
}

async function verifyChat(baseUrl, modelId, apiKey) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "Reply with only the word ok." }],
      stream: false,
      max_tokens: 8
    })
  });
  if (!response.ok) {
    throw new Error(`/v1/chat/completions failed: ${response.status} ${response.statusText} ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("/v1/chat/completions returned no assistant text.");
  }
}

function reportDownloadProgress() {
  let lastPercent = -1;
  return (progress) => {
    const percent = progress.percent === undefined ? undefined : Math.floor(progress.percent);
    if (percent === undefined) {
      return;
    }
    if (percent === 100 || percent >= lastPercent + 5) {
      lastPercent = percent;
      console.log(`Download ${percent}%`);
    }
  };
}

async function stopChild(process) {
  if (!process || process.exitCode !== null || process.signalCode) {
    return;
  }
  process.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      resolve();
    }, 3000);
    process.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
