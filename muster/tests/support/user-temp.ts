import { execFileSync } from "node:child_process";

// The per-user temp dir a fenced sandbox must allow on macOS, read independently of src/sandbox.ts.
export const USER_TEMP_WRITES: string[] =
  process.platform === "darwin" ? [execFileSync("getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" }).trim()] : [];
