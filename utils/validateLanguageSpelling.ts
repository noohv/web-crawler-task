import type { Page } from "@playwright/test";
import {
  writeJsonToOut,
  readIdentifiedPaths,
  type IdentifiedPath,
  navigateToUrl,
} from "./helpers";
import { VALIDATION_REPORT_FILE_NAME } from "./config";
import {
  applyPipeStoreKey,
  loadStepLocalStorageCacheOptional,
} from "./stepLocalStorageCache";

type LanguageResult = {
  francCode: string;
  pass: boolean;
};

type SpellingResult = {
  wordsChecked: number;
  misspelledCount: number;
  misspelledSample: string[];
  pass: boolean;
};

type PageReport = {
  path: string;
  url: string;
  language: LanguageResult;
  spelling: SpellingResult;
};

function tokenizeWords(text: string): string[] {
  // Keep only alphabetic words; drop numbers and punctuation.
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).map((w) =>
    w.toLowerCase(),
  );
}

async function loadIdentifiedItems(): Promise<IdentifiedPath[]> {
  const items = await readIdentifiedPaths();
  if (items.length === 0) throw new Error("No identified paths found.");
  return items;
}

async function loadLocalStorageContext(): Promise<{
  pipeStoreKey: string | null;
  localStorageByPath: Map<string, string | null>;
}> {
  const stepLocalStorageCache = await loadStepLocalStorageCacheOptional({});
  if (!stepLocalStorageCache) {
    return {
      pipeStoreKey: null,
      localStorageByPath: new Map(),
    };
  }

  const localStorageByPath = new Map<string, string | null>();
  for (const it of stepLocalStorageCache.items) {
    localStorageByPath.set(it.path, it.value);
  }

  return {
    pipeStoreKey: stepLocalStorageCache.pipeStoreKey,
    localStorageByPath,
  };
}

async function loadLanguageTools(): Promise<{
  franc: (text: string) => string;
  spell: { correct: (word: string) => string | false | null | undefined };
}> {
  // Lazy-load ESM dependencies once.
  const { franc } = await import("franc-min");
  const enDictMod = await import("dictionary-en");
  const nspellMod = await import("nspell");
  const spell = nspellMod.default(enDictMod.default);
  return { franc, spell };
}

function buildIgnoreWords(): Set<string> {
  return new Set([
    "fasting",
    "best",
    "me",
    "fastingbest",
    "fastingbestme",
    "fastingbest.me",
    "facebook",
    "ender",
    "ender.com",
    "ender.com",
  ]);
}

async function getNormalizedBodyText(page: Page): Promise<string> {
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  return bodyText.replace(/\s+/g, " ").trim();
}

function computeLanguage(franc: (text: string) => string, text: string) {
  const francCode = franc(text);
  return { francCode, pass: francCode === "eng" };
}

function computeSpelling(args: {
  spell: { correct: (word: string) => string | false | null | undefined };
  normalized: string;
  ignoreWords: Set<string>;
}): SpellingResult {
  const { spell, normalized, ignoreWords } = args;

  // Spelling: sample first N words to keep runtime reasonable.
  const words = tokenizeWords(normalized);
  const sampleWords = words.slice(0, 2500);

  let misspelledCount = 0;
  const misspelledFreq = new Map<string, number>();

  // Avoid overwhelming checks.
  const wordsToCheck = sampleWords
    .filter((w) => !ignoreWords.has(w))
    .filter((w) => w.length >= 3 && w.length <= 20);

  for (const w of wordsToCheck) {
    const correct = spell.correct(w);
    if (!correct) {
      misspelledCount++;
      misspelledFreq.set(w, (misspelledFreq.get(w) ?? 0) + 1);
    }
  }

  const wordsChecked = wordsToCheck.length;
  const misspellingRatio = wordsChecked ? misspelledCount / wordsChecked : 0;

  const spellingPass =
    wordsChecked > 200 ? misspellingRatio <= 0.02 : misspelledCount <= 5;

  const misspelledSample = Array.from(misspelledFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  return {
    wordsChecked,
    misspelledCount,
    misspelledSample,
    pass: spellingPass,
  };
}

async function processOneItem(args: {
  page: Page;
  item: IdentifiedPath;
  pipeStoreKey: string | null;
  localStorageByPath: Map<string, string | null>;
  franc: (text: string) => string;
  spell: { correct: (word: string) => string | false | null | undefined };
  ignoreWords: Set<string>;
}): Promise<PageReport> {
  const {
    page,
    item,
    pipeStoreKey,
    localStorageByPath,
    franc,
    spell,
    ignoreWords,
  } = args;

  if (pipeStoreKey) {
    const v = localStorageByPath.get(item.path) ?? null;
    await applyPipeStoreKey(page, pipeStoreKey, v);
  }

  await navigateToUrl(page, item.representativeUrl);
  await page.waitForTimeout(400);

  const normalized = await getNormalizedBodyText(page);

  const langText = normalized.slice(0, 6000);
  const language = computeLanguage(franc, langText);
  const spelling = computeSpelling({ spell, normalized, ignoreWords });

  return {
    path: item.path,
    url: item.representativeUrl,
    language,
    spelling,
  };
}

function buildReport(pages: PageReport[]) {
  const total = pages.length;
  const languagePassCount = pages.filter((p) => p.language.pass).length;
  const spellingPassCount = pages.filter((p) => p.spelling.pass).length;

  return {
    generatedAt: new Date().toISOString(),
    totalPages: total,
    languagePassPages: languagePassCount,
    spellingPassPages: spellingPassCount,
    pages,
  };
}

/**
 * Validate language and spelling for every discovered step page.
 *
 * Writes a detailed report to `out/validation_report.json`.
 */
export async function validateLanguageSpelling(page: Page): Promise<void> {
  /**
   * Validate that each discovered step page:
   * - has English language content (via franc) and
   * - doesn't contain too many misspelled words (via nspell).
   *
   * Writes results to `out/validation_report.json`.
   */
  const items = await loadIdentifiedItems();
  const { pipeStoreKey, localStorageByPath } = await loadLocalStorageContext();
  const { franc, spell } = await loadLanguageTools();
  const ignoreWords = buildIgnoreWords();

  const pages: PageReport[] = [];

  await navigateToUrl(page, items[0].representativeUrl);

  // Sequential run to avoid memory spikes.
  for (const item of items) {
    pages.push(
      await processOneItem({
        page,
        item,
        pipeStoreKey,
        localStorageByPath,
        franc,
        spell,
        ignoreWords,
      }),
    );
  }

  const report = buildReport(pages);
  await writeJsonToOut(VALIDATION_REPORT_FILE_NAME, report);

  if (report.totalPages === 0) throw new Error("Validation produced no pages.");
}
