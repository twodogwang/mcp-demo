import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_VERSION = "0.0.0";
const MAX_LOOKUP_DEPTH = 6;

let cachedVersion: string | null = null;

// 源码在 src/server/、构建产物在 dist/src/server/,与包根 package.json 的层级不同,
// 所以从模块位置向上查找而不是写死相对路径。
export function resolvePackageVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < MAX_LOOKUP_DEPTH; depth += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        version?: unknown;
      };
      if (typeof pkg.version === "string" && pkg.version.trim()) {
        cachedVersion = pkg.version.trim();
        return cachedVersion;
      }
    } catch {
      // 该层没有可读的 package.json,继续向上
    }

    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  cachedVersion = FALLBACK_VERSION;
  return cachedVersion;
}
