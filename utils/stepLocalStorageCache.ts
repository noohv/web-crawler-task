import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

export type StepLocalStorageCache = {
  /**
   * The localStorage key used to store the "pipe store" snapshot.
   *
   * Must match the key used by the wizard on the target site.
   */
  pipeStoreKey: string;

  /**
   * Cached localStorage snapshot values per discovered step path.
   * If a snapshot couldn't be read, `value` is `null`.
   */
  items: Array<{ path: string; value: string | null }>;
};

/**
 * Build the `pipe_store_*` localStorage key for this crawl.
 *
 * The exact format must stay consistent with `utils/crawl.ts`.
 */
export function buildPipeStoreKey(requiredPathPrefix: string): string {
  return `pipe_store_${requiredPathPrefix}`;
}

/**
 * Load the cached `step_local_storage.json` and ensure it contains
 * localStorage values for every `requiredPaths` entry.
 *
 * Throws if the file is missing, the pipe store key mismatches, or paths are
 * missing. Used for screenshot-only runs where we don't want to silently
 * skip steps.
 */
export async function loadStepLocalStorageCacheStrict(args: {
  filePath?: string;
  expectedPipeStoreKey: string;
  requiredPaths: Set<string>;
}): Promise<StepLocalStorageCache> {
  const filePath = args.filePath ?? path.join("out", "step_local_storage.json");

  const cacheRaw = await fs.readFile(filePath, "utf8").catch(() => {
    throw new Error(`Missing localStorage cache file: ${filePath}`);
  });

  const cache = JSON.parse(cacheRaw) as StepLocalStorageCache;

  if (cache.pipeStoreKey !== args.expectedPipeStoreKey) {
    throw new Error(
      `localStorage cache pipeStoreKey mismatch: expected ${args.expectedPipeStoreKey}, got ${cache.pipeStoreKey}`,
    );
  }
  if (!Array.isArray(cache.items)) {
    throw new Error(
      `localStorage cache file has invalid shape (missing items array): ${filePath}`,
    );
  }

  const cachedPaths = new Set(cache.items.map((x) => x.path));
  const missingFromCache = Array.from(args.requiredPaths)
    .filter((p) => !cachedPaths.has(p))
    .sort();

  if (missingFromCache.length > 0) {
    throw new Error(
      `localStorage cache missing ${missingFromCache.length} paths (e.g. ${missingFromCache[0]}); refusing to run screenshot-only.`,
    );
  }

  return cache;
}

/**
 * Load `step_local_storage.json` if present, otherwise return `null`.
 *
 * Used by the language/spelling validation stage so it can still run even
 * if localStorage caching wasn't produced.
 */
export async function loadStepLocalStorageCacheOptional(args: {
  filePath?: string;
}): Promise<StepLocalStorageCache | null> {
  const filePath = args.filePath ?? path.join("out", "step_local_storage.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as StepLocalStorageCache;
  } catch {
    return null;
  }
}

/**
 * Convert the cache format into a lookup map: `path -> localStorageValue`.
 */
export function buildLocalStorageByPath(
  cache: StepLocalStorageCache,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const it of cache.items) map.set(it.path, it.value);
  return map;
}

/**
 * Apply the cached pipeStore snapshot into the current page's localStorage.
 *
 * If `value` is `null`, the key is removed instead of being set.
 */
export async function applyPipeStoreKey(
  page: Page,
  pipeStoreKey: string,
  value: string | null,
) {
  await page.evaluate(
    ({ k, v }: { k: string; v: string | null }) => {
      if (v === null) return localStorage.removeItem(k);
      localStorage.setItem(k, v);
    },
    { k: pipeStoreKey, v: value },
  );
}
