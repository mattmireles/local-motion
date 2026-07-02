import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { MachineProfile } from "../types";

const execFile = promisify(childProcess.execFile);

/**
 * Fraction of total unified memory offered to the model at install time.
 *
 * The binding physical constraint on Apple Silicon is Metal's wired-memory
 * ceiling (`MTLDevice.recommendedMaxWorkingSetSize`), not free RAM: GGUF
 * weights are GPU-wired, and Metal refuses allocations past that ceiling no
 * matter how idle the machine is. Measured at 81% of total RAM on a 64GB
 * M2 Ultra (55,662,788,608 bytes); 0.80 sits just under it. macOS handles
 * everything else — cache eviction, compression of idle apps — so a
 * separate reserve for "other apps" would be double-counting.
 */
const METAL_WIRED_LIMIT_FRACTION = 0.8;

/**
 * The model memory budget, synchronously and without subprocesses — the one
 * number the context fit needs. {@link profileMachine} reports the same value
 * as `recommendedModelMemoryBytes` so the panel and the spawn agree.
 */
export function modelMemoryBudgetBytes(): number {
  return Math.floor(os.totalmem() * METAL_WIRED_LIMIT_FRACTION);
}

/** One predicate for both {@link profileMachine} and the spawn-time fit. */
export function isAppleSiliconHost(): boolean {
  return process.platform === "darwin" && process.arch === "arm64";
}

export async function profileMachine(storageRoot: string): Promise<MachineProfile> {
  const [cpuBrand, availableMemoryBytes, availableDiskBytes] = await Promise.all([
    readCpuBrand(),
    readAvailableMemory(),
    readAvailableDisk(storageRoot)
  ]);

  const totalMemoryBytes = os.totalmem();
  const isMac = process.platform === "darwin";
  const isAppleSilicon = isAppleSiliconHost();

  return {
    platform: process.platform,
    arch: process.arch,
    cpuBrand,
    isMac,
    isAppleSilicon,
    totalMemoryBytes,
    availableMemoryBytes,
    recommendedModelMemoryBytes: modelMemoryBudgetBytes(),
    storageRoot,
    availableDiskBytes
  };
}

async function readCpuBrand(): Promise<string> {
  if (process.platform !== "darwin") {
    return os.cpus()[0]?.model ?? "Unknown CPU";
  }
  try {
    const { stdout } = await execFile("/usr/sbin/sysctl", ["-n", "machdep.cpu.brand_string"]);
    return stdout.trim() || os.cpus()[0]?.model || "Unknown CPU";
  } catch {
    return os.cpus()[0]?.model ?? "Unknown CPU";
  }
}

async function readAvailableMemory(): Promise<number> {
  if (process.platform !== "darwin") {
    return os.freemem();
  }

  try {
    const { stdout } = await execFile("/usr/bin/vm_stat", []);
    const pageSizeMatch = stdout.match(/page size of (\d+) bytes/i);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
    const pages = new Map<string, number>();

    for (const line of stdout.split("\n")) {
      const match = line.match(/^Pages\s+([^:]+):\s+([0-9.]+)\.?$/i);
      if (match) {
        pages.set(match[1].trim().toLowerCase(), Number(match[2]));
      }
    }

    const free =
      (pages.get("free") ?? 0) +
      (pages.get("inactive") ?? 0) +
      (pages.get("speculative") ?? 0) +
      (pages.get("purgeable") ?? 0);

    return free > 0 ? free * pageSize : os.freemem();
  } catch {
    return os.freemem();
  }
}

async function readAvailableDisk(storageRoot: string): Promise<number> {
  const target = path.resolve(storageRoot);
  try {
    const { stdout } = await execFile("/bin/df", ["-Pk", target]);
    const lines = stdout.trim().split("\n");
    const columns = lines[lines.length - 1]?.trim().split(/\s+/);
    const availableKilobytes = Number(columns?.[3]);
    return Number.isFinite(availableKilobytes) ? availableKilobytes * 1024 : 0;
  } catch {
    return 0;
  }
}
