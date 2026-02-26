import fs from "node:fs";
import path from "node:path";

/** Check that a path is an executable file (not a directory) */
function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a binary is available in PATH (no subprocess spawning).
 * Returns the full path to the binary if found, or null.
 */
export function findBinary(command: string): string | null {
  if (!command) return null;

  // Absolute path — check directly
  if (path.isAbsolute(command)) {
    return isExecutableFile(command) ? command : null;
  }

  const pathEnv = process.env.PATH || "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const dirs = pathEnv.split(delimiter).filter(Boolean);

  for (const dir of dirs) {
    const fullPath = path.join(dir, command);
    if (isExecutableFile(fullPath)) return fullPath;
  }

  return null;
}

/** Check if a binary exists in PATH */
export function isBinaryAvailable(command: string): boolean {
  return findBinary(command) !== null;
}
