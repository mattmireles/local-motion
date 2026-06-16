import * as net from "node:net";

export interface PortHolder {
  server: net.Server;
  port: number;
}

/** Binds an ephemeral localhost port and keeps the socket open until released. */
export async function reserveLocalhostPort(): Promise<PortHolder> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a localhost port."));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

export async function releasePortHolder(holder: PortHolder): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    holder.server.close((error) => (error ? reject(error) : resolve()));
  });
}
