import { dlopen, FFIType, read } from "bun:ffi";

export type CloneResult = { ok: true } | { ok: false; detail: string };

export interface CloneLibrary {
  clonefile(src: string, dst: string, flags: number): number;
  errno(): number;
}

const LIBSYSTEM = "/usr/lib/libSystem.B.dylib";

function openLibSystem(): CloneLibrary {
  const { symbols } = dlopen(LIBSYSTEM, {
    clonefile: { args: [FFIType.cstring, FFIType.cstring, FFIType.u32], returns: FFIType.i32 },
    __error: { args: [], returns: FFIType.ptr },
  });
  return {
    clonefile: (src, dst, flags) => symbols.clonefile(src, dst, flags),
    errno: () => read.i32(symbols.__error(), 0),
  };
}

export function makeCloneDirectory(open: () => CloneLibrary): (src: string, dst: string) => CloneResult {
  return (src, dst) => {
    try {
      const lib = open();
      if (lib.clonefile(src, dst, 0) === 0) return { ok: true };
      return { ok: false, detail: `errno=${lib.errno()}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  };
}

export const cloneDirectory = makeCloneDirectory(openLibSystem);
