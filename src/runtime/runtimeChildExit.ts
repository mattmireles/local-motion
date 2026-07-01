export interface RuntimeChildLike {
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export interface RuntimeChildExitHandlers {
  appendLine(line: string): void;
  isCurrentChild(child: RuntimeChildLike): boolean;
  clearChild(): void;
  clearSession(): void;
  stopTunnel(): void | Promise<void>;
  stopProxy(): void | Promise<void>;
  clearProxy(): void;
  onStatusChanged(): void;
}

export function attachRuntimeChildExitHandler(child: RuntimeChildLike, handlers: RuntimeChildExitHandlers): void {
  child.on("exit", (code, signal) => {
    handlers.appendLine(`llama-server exited: code=${code ?? "none"} signal=${signal ?? "none"}`);
    if (!handlers.isCurrentChild(child)) {
      return;
    }
    handlers.clearChild();
    handlers.clearSession();
    void handlers.stopTunnel();
    void handlers.stopProxy();
    handlers.clearProxy();
    handlers.onStatusChanged();
  });
}
