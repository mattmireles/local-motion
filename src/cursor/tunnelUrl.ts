export interface NormalizedTunnelUrl {
  url?: string;
  invalid: boolean;
}

export function normalizePublicHttpsTunnelUrl(value: string): NormalizedTunnelUrl {
  const raw = value.trim();
  if (!raw) {
    return { invalid: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { invalid: true };
  }

  if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) {
    return { invalid: true };
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
  return {
    url: `${parsed.origin}${normalizedPath}`,
    invalid: false
  };
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    return true;
  }
  if (host.includes(":")) {
    return true;
  }

  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127
  );
}
