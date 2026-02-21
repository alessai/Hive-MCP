/** Log to stderr (safe for MCP stdio servers — stderr doesn't interfere with JSON-RPC on stdout) */
export function log(msg: string): void {
  process.stderr.write(`[hive ${new Date().toISOString()}] ${msg}\n`);
}
