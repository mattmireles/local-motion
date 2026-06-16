import * as net from "node:net";

export async function findFreePort(start = 49152, end = 65535): Promise<number> {
  for (let port = start + Math.floor(Math.random() * 2048); port <= end; port += 1) {
    if (await canBind(port)) {
      return port;
    }
  }
  for (let port = start; port <= end; port += 1) {
    if (await canBind(port)) {
      return port;
    }
  }
  throw new Error("Could not find a free localhost port.");
}

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
