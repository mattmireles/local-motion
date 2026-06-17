import * as http from "node:http";
import { isAuthorizedBearer, LOCAL_MOTION_API_KEY, sanitizeExternalChatRequest } from "./openAiChat";

interface ProxyOptions {
  upstreamBaseUrl: string;
  modelId: string;
  /**
   * Fired exactly once, when the proxy serves its first real inbound chat
   * completion. The owner uses it to push a fresh status to the UI so the
   * "Cursor is using your local model" state can appear the moment it is true.
   */
  onClientRequest?: () => void;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

const BODY_READ_TIMEOUT_MS = 60_000;

export class OpenAiProxy {
  private server: http.Server | undefined;
  private port: number | undefined;
  private readonly abortControllers = new Set<AbortController>();
  private readonly sockets = new Set<import("node:net").Socket>();
  // Flips true on the first authorized chat completion this proxy serves.
  // Only chat completions count: /v1/models is also polled by Local Motion's
  // own endpoint verification and by Cursor's model-list refresh, neither of
  // which proves the model is actually in use.
  private clientRequestServed = false;

  constructor(private readonly options: ProxyOptions) {}

  /** Whether a client has issued a real inbound chat completion this run. */
  hasServedClientRequest(): boolean {
    return this.clientRequestServed;
  }

  async start(preferredPort?: number): Promise<string> {
    this.server = http.createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    await this.listen(preferredPort);
    const address = this.server?.address();
    if (!address || typeof address === "string") {
      throw new Error("OpenAI proxy failed to bind a localhost port.");
    }
    this.port = address.port;
    return `http://127.0.0.1:${this.port}/v1`;
  }

  private async listen(preferredPort: number | undefined): Promise<void> {
    try {
      await listen(this.server, preferredPort ?? 0);
    } catch (error) {
      if (preferredPort !== undefined && isPortInUse(error)) {
        await listen(this.server, 0);
        return;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        for (const socket of this.sockets) {
          socket.destroy();
        }
        resolve();
      }, 500);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      if (request.method === "GET" && request.url === "/health") {
        await this.forwardHealth(response);
        return;
      }
      if (!isAuthorizedBearer(request.headers.authorization)) {
        this.writeJson(response, 401, { error: { message: "Unauthorized" } });
        return;
      }
      if (request.method === "GET" && request.url === "/v1/models") {
        this.writeJson(response, 200, {
          object: "list",
          data: [{ id: this.options.modelId, object: "model", owned_by: "local-motion" }]
        });
        return;
      }
      if (request.method === "POST" && request.url === "/v1/chat/completions") {
        // Authorization has already passed above, so this is a genuine client
        // running the local model — the one honest "in use" signal.
        this.noteClientRequest();
        await this.forwardChat(request, response);
        return;
      }
      this.writeJson(response, 404, { error: { message: "Not found" } });
    } catch (error) {
      this.writeError(response, error);
    }
  }

  private async forwardHealth(response: http.ServerResponse): Promise<void> {
    const upstream = await fetch(this.options.upstreamBaseUrl.replace(/\/v1$/, "/health"));
    response.writeHead(upstream.status, filterForwardHeaders(upstream.headers));
    response.end(await upstream.text());
  }

  private async forwardChat(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const raw = await readBody(request, 8 * 1024 * 1024, BODY_READ_TIMEOUT_MS);
    const body = sanitizeExternalChatRequest(JSON.parse(raw || "{}"), this.options.modelId);
    const controller = new AbortController();
    this.abortControllers.add(controller);
    const abortIfOpen = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };
    request.once("aborted", abortIfOpen);
    response.once("close", abortIfOpen);
    try {
      const upstream = await fetch(`${this.options.upstreamBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${LOCAL_MOTION_API_KEY}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      response.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      });
      if (!upstream.body) {
        response.end();
        return;
      }

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          response.end();
          return;
        }
        response.write(Buffer.from(value));
      }
    } catch (error) {
      if (response.headersSent) {
        if (!response.writableEnded) {
          response.destroy();
        }
        return;
      }
      throw error;
    } finally {
      this.abortControllers.delete(controller);
      request.off("aborted", abortIfOpen);
      response.off("close", abortIfOpen);
    }
  }

  private noteClientRequest(): void {
    if (this.clientRequestServed) {
      return;
    }
    this.clientRequestServed = true;
    this.options.onClientRequest?.();
  }

  private writeJson(response: http.ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }

  private writeError(response: http.ServerResponse, error: unknown): void {
    if (response.headersSent) {
      if (!response.writableEnded) {
        response.destroy();
      }
      return;
    }
    this.writeJson(response, 500, {
      error: { message: error instanceof Error ? error.message : String(error) }
    });
  }
}

async function listen(server: http.Server | undefined, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(port, "127.0.0.1", () => resolve());
  });
}

function isPortInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EADDRINUSE";
}

export function filterForwardHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  return result;
}

async function readBody(
  request: http.IncomingMessage,
  maxBytes: number,
  timeoutMs: number
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const timeout = setTimeout(() => {
    request.destroy(new Error("Request body read timed out."));
  }, timeoutMs);

  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error("Request body is too large.");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    clearTimeout(timeout);
  }
}
