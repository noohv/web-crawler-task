import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

export type StepLocalStorageCache = {
  pipeStoreKey: string;
  items: Array<{ path: string; value: string | null }>;
};

export function buildPipeStoreKey(requiredPathPrefix: string): string {
  return `pipe_store_${requiredPathPrefix}`;
}

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

export function buildLocalStorageByPath(
  cache: StepLocalStorageCache,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const it of cache.items) map.set(it.path, it.value);
  return map;
}

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
