import type { Page } from "@playwright/test";
import type { CrawlConfig } from "./config";
import type { StepLocalStorageCache } from "./stepLocalStorageCache";
import { navigateToUrl, type IdentifiedPath } from "./helpers";

function normalizePath(pathname: string): string {
  // We want stable keys: keep leading slash; trim trailing slashes except root.
  if (pathname !== "/" && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function isInPrefix(
  url: string,
  origin: string,
  requiredPathPrefix: string,
): boolean {
  try {
    const u = new URL(url);
    return u.origin === origin && u.pathname.startsWith(requiredPathPrefix);
  } catch {
    return false;
  }
}

function getPathKey(url: string): string {
  return normalizePath(new URL(url).pathname);
}

async function waitShortForUrlChange(
  page: Page,
  prevUrl: string,
  timeoutMs: number,
) {
  // Some quiz option clicks auto-navigate; in that case we want to continue quickly.
  try {
    await page.waitForFunction((u) => window.location.href !== u, prevUrl, {
      timeout: timeoutMs,
    });
  } catch {
    // ignore timeouts
  }
}

async function clickByButtonName(
  page: Page,
  name: RegExp | string,
): Promise<boolean> {
  const btn = page.getByRole("button", { name });
  try {
    if (!(await btn.isVisible())) return false;
    await btn.click({ timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function clickVisibleImageButtons(page: Page): Promise<boolean> {
  const imgButtons = page.locator(".image-button");
  const count = await imgButtons.count().catch(() => 0);
  // Your rule: click all `.image-button` elements (when present/visible).
  // Some wizards require selecting multiple visual options per step.
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const btn = imgButtons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    try {
      await btn.click({ timeout: 1500 });
      clicked = true;
    } catch {
      // Ignore per-button failures; try the next one.
    }
  }
  return clicked;
}

async function tryFillKnownNumericFields(
  page: Page,
  cfg: CrawlConfig,
): Promise<boolean> {
  // Fill numeric/text inputs so the quiz can progress.
  // We keep this intentionally heuristic-driven (role/placeholder matching),
  // because the UI is a multi-step wizard.

  let didFill = false;

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const isGoalWeight = /goal\s*weight/i.test(bodyText);

  const heightCmDefault = (() => {
    const totalInches =
      cfg.numericDefaults.heightFt * 12 + cfg.numericDefaults.heightIn;
    return Math.round(totalInches * 2.54);
  })();

  const weightKgValue = (() => {
    const lbsValue = isGoalWeight
      ? cfg.numericDefaults.goalWeightLbs
      : cfg.numericDefaults.currentWeightLbs;
    return lbsValue / 2.20462;
  })();

  // Name step (placeholder is "Your name").
  const nameBox = page.getByPlaceholder(/your name/i);
  if (await nameBox.isVisible().catch(() => false)) {
    await nameBox.fill(cfg.numericDefaults.name);
    didFill = true;
  }

  // Age step.
  const yearsBox = page.getByRole("textbox", { name: /years/i });
  if (await yearsBox.isVisible().catch(() => false)) {
    await yearsBox.fill(String(cfg.numericDefaults.ageYears));
    didFill = true;
  }

  // Height step: metric (cm) OR imperial (ft/in).
  const cmBox = page.getByRole("textbox", { name: /cm/i });
  if (await cmBox.isVisible().catch(() => false)) {
    await cmBox.fill(String(heightCmDefault));
    didFill = true;
  } else {
    const ftInBox = page.getByRole("textbox", { name: /ft in/i });
    const inBox = page
      .getByRole("textbox", { name: /^in$/i })
      .or(page.getByRole("textbox", { name: /in/i }));
    if (
      (await ftInBox.isVisible().catch(() => false)) &&
      (await inBox.isVisible().catch(() => false))
    ) {
      await clickByButtonName(page, /^Imperial$/i).catch(() => {});
      await ftInBox.fill(String(cfg.numericDefaults.heightFt));
      await inBox.fill(String(cfg.numericDefaults.heightIn));
      didFill = true;
    }
  }

  // Weight step (lbs preferred).
  const lbsBox = page.getByRole("textbox", { name: /lbs/i });
  if (await lbsBox.isVisible().catch(() => false)) {
    const value = isGoalWeight
      ? cfg.numericDefaults.goalWeightLbs
      : cfg.numericDefaults.currentWeightLbs;
    await lbsBox.fill(String(value));
    didFill = true;
  }

  // Weight step (kg alternative, if metric mode is active).
  const kgBox = page.getByRole("textbox", { name: /kg/i });
  if (!didFill && (await kgBox.isVisible().catch(() => false))) {
    await kgBox.fill(String(Math.round(weightKgValue * 10) / 10));
    didFill = true;
  }

  return didFill;
}

async function hasVisibleWizardInputFields(page: Page): Promise<boolean> {
  const inputs = page.locator(
    "input:visible, textarea:visible, select:visible",
  );
  const count = await inputs.count().catch(() => 0);
  return count > 0;
}

async function tryFillWizardInputs(
  page: Page,
  cfg: CrawlConfig,
): Promise<boolean> {
  const knownFilled = await tryFillKnownNumericFields(page, cfg).catch(
    () => false,
  );
  if (knownFilled) return true;
  return tryFillGenericVisibleWizardInputs(page, cfg);
}

async function tryFillGenericVisibleWizardInputs(
  page: Page,
  cfg: CrawlConfig,
): Promise<boolean> {
  let didFill = false;

  const heightCmDefault = (() => {
    const totalInches =
      cfg.numericDefaults.heightFt * 12 + cfg.numericDefaults.heightIn;
    return Math.round(totalInches * 2.54);
  })();

  const currentWeightKg = cfg.numericDefaults.currentWeightLbs / 2.20462;
  const goalWeightKg = cfg.numericDefaults.goalWeightLbs / 2.20462;

  const keywordsToNumber = (meta: string): number => {
    const m = meta.toLowerCase();
    if (/(age|year)/i.test(m)) return cfg.numericDefaults.ageYears;
    if (/(goal.*weight|weight.*goal|goal weight)/i.test(m)) {
      return /(kg|kilogram)/i.test(m)
        ? goalWeightKg
        : cfg.numericDefaults.goalWeightLbs;
    }
    if (/(kg|kilogram)/i.test(m)) return currentWeightKg;
    if (/(lbs|pound)/i.test(m)) return cfg.numericDefaults.currentWeightLbs;
    if (/(cm|centimeter)/i.test(m)) return heightCmDefault;
    if (/(ft|feet)/i.test(m)) return cfg.numericDefaults.heightFt;
    if (/(in|inch)/i.test(m)) return cfg.numericDefaults.heightIn;
    return cfg.numericDefaults.ageYears;
  };

  // Fill visible text-like inputs.
  const textInputs = page.locator(
    'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
  );
  const textCount = await textInputs.count().catch(() => 0);
  for (let i = 0; i < textCount; i++) {
    const el = textInputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;

    const meta = await el
      .evaluate((node) => {
        const e = node as HTMLInputElement | HTMLTextAreaElement;
        return `${e.placeholder ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.name ?? ""} ${e.id ?? ""}`;
      })
      .catch(() => "");

    const value = /name/i.test(meta)
      ? cfg.numericDefaults.name
      : cfg.numericDefaults.name;
    try {
      await el.fill(value, { timeout: 1500 });
      didFill = true;
    } catch {
      // ignore
    }
  }

  // Fill visible numeric inputs.
  const numInputs = page.locator('input[type="number"]:visible');
  const numCount = await numInputs.count().catch(() => 0);
  for (let i = 0; i < numCount; i++) {
    const el = numInputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;

    const meta = await el
      .evaluate((node) => {
        const e = node as HTMLInputElement;
        return `${e.placeholder ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.name ?? ""} ${e.id ?? ""}`;
      })
      .catch(() => "");

    const value = keywordsToNumber(meta);
    const str = String(
      Number.isFinite(value)
        ? Math.round(value * 10) / 10
        : cfg.numericDefaults.ageYears,
    );
    try {
      await el.fill(str, { timeout: 1500 });
      didFill = true;
    } catch {
      // ignore
    }
  }

  // Select: pick the first non-disabled option.
  const selects = page.locator("select:visible");
  const selCount = await selects.count().catch(() => 0);
  for (let i = 0; i < selCount; i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;

    const firstValue = await sel
      .evaluate((node) => {
        const s = node as HTMLSelectElement;
        const opts = Array.from(s.options);
        return opts.find((o) => !o.disabled && o.value)?.value ?? null;
      })
      .catch(() => null);
    if (!firstValue) continue;

    try {
      await sel.selectOption(firstValue, { timeout: 1500 });
      didFill = true;
    } catch {
      // ignore
    }
  }

  // Radios/checkboxes: click the first visible unchecked item.
  const toggles = page.locator(
    'input[type="radio"]:visible, input[type="checkbox"]:visible',
  );
  const tCount = await toggles.count().catch(() => 0);
  for (let i = 0; i < tCount; i++) {
    const el = toggles.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const checked = await el.isChecked().catch(() => false);
    if (checked) continue;
    try {
      // check() works for checkbox; for some radio UIs, click is safer.
      await el
        .check({ timeout: 1500 })
        .catch(() => el.click({ timeout: 1500 }));
      didFill = true;
      break;
    } catch {
      // ignore
    }
  }

  return didFill;
}

async function clickFirstVisibleOption(page: Page): Promise<boolean> {
  const options = page.locator(".option");
  const count = await options.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const el = options.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;

    // Some UIs mark inactive options as disabled.
    const hasDisabledClass = await el
      .evaluate((node) => node.classList.contains("is-disabled"))
      .catch(() => false);
    if (hasDisabledClass) continue;

    try {
      await el.click({ timeout: 1500 });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function findVisibleContinueButton(
  page: Page,
): Promise<null | ReturnType<Page["locator"]>> {
  const continueBtns = page.locator(".cta-button");
  const count = await continueBtns.count().catch(() => 0);

  // Prefer the one that actually says "Continue" (if multiple exist).
  for (let i = 0; i < count; i++) {
    const btn = continueBtns.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const text = await btn
      .innerText()
      .catch(() => "")
      .then((t) => t.trim());
    if (/continue/i.test(text)) return btn;
  }

  for (let i = 0; i < count; i++) {
    const btn = continueBtns.nth(i);
    if (await btn.isVisible().catch(() => false)) return btn;
  }
  return null;
}

async function isLocatorDisabled(
  locator: ReturnType<Page["locator"]>,
): Promise<boolean> {
  return locator
    .evaluate((node) => {
      const el = node as HTMLElement;
      const byClass = el.classList.contains("is-disabled");
      const byAttr =
        (el as any).disabled === true ||
        el.getAttribute("aria-disabled") === "true";
      return byClass || byAttr;
    })
    .catch(() => false);
}

async function tryAdvanceQuiz(
  page: Page,
  cfg: CrawlConfig,
  opts: {
    onUrlDiscovered: (url: string) => Promise<void>;
    isAlreadyVisitedPath: (pathKey: string) => boolean;
  },
): Promise<void> {
  let lastPathKey = "";
  let actions = 0;
  let actionsWithoutPathChange = 0;
  const maxActions = cfg.maxWizardStepsPerSeed * 30;
  const maxActionsWithoutPathChange = cfg.maxWizardStepsPerSeed * 2;

  while (
    actions < maxActions &&
    actionsWithoutPathChange < maxActionsWithoutPathChange
  ) {
    actions++;

    const currentUrl = page.url();
    if (!isInPrefix(currentUrl, cfg.origin, cfg.requiredPathPrefix)) return;

    const pathKey = getPathKey(currentUrl);
    if (pathKey !== lastPathKey) {
      lastPathKey = pathKey;
      actionsWithoutPathChange = 0;
      if (!opts.isAlreadyVisitedPath(pathKey))
        await opts.onUrlDiscovered(currentUrl);
    } else {
      actionsWithoutPathChange++;
    }

    // 1. Click image-button options (if present).
    await clickVisibleImageButtons(page).catch(() => {});

    // 2. If there is a Continue button (.cta-button), we attempt to advance.
    const prevUrl = currentUrl;
    const continueBtn = await findVisibleContinueButton(page);

    // Some steps don't have an explicit Continue; clicking an option navigates forward.
    if (!continueBtn) {
      const clickedOption = await clickFirstVisibleOption(page).catch(
        () => false,
      );
      if (clickedOption) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await waitShortForUrlChange(page, prevUrl, 8000);
        await page.waitForTimeout(250).catch(() => {});
        continue;
      }

      // If there are inputs but no Continue/options, fill them and let the UI progress.
      const hasInputs = await hasVisibleWizardInputFields(page).catch(
        () => false,
      );
      if (hasInputs) {
        await tryFillWizardInputs(page, cfg).catch(() => {});
        await page.waitForTimeout(1000).catch(() => {});
        continue;
      }

      // Nothing actionable left.
      return;
    }

    const disabled = await isLocatorDisabled(continueBtn);

    // 3. If Continue is disabled (and marked .is-disabled), select an .option.
    if (disabled) {
      // Some steps are input-only (no `.option` elements visible). In that case,
      // we must not abort; we will fill visible inputs in step 4 below.
      await clickFirstVisibleOption(page).catch(() => false);
      await page.waitForTimeout(250).catch(() => {});
    }

    // 4. If there are input fields, fill them out.
    const hasInputs = await hasVisibleWizardInputFields(page);
    if (hasInputs) {
      await tryFillWizardInputs(page, cfg).catch(() => {});
      await page.waitForTimeout(250).catch(() => {});
    }

    // Click Continue if it's enabled (or became enabled after the above actions).
    const stillDisabled = await isLocatorDisabled(continueBtn);
    if (!stillDisabled) {
      await continueBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitShortForUrlChange(page, prevUrl, 5000);
      await page.waitForTimeout(250).catch(() => {});
      continue;
    }

    // Fallback: if Continue is still disabled, try one more option selection.
    const clickedOption = await clickFirstVisibleOption(page).catch(
      () => false,
    );
    if (!clickedOption) return;
    await page.waitForTimeout(250).catch(() => {});

    const enabledNow = !(await isLocatorDisabled(continueBtn).catch(
      () => true,
    ));
    if (enabledNow) {
      await continueBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitShortForUrlChange(page, prevUrl, 5000);
      await page.waitForTimeout(250).catch(() => {});
      continue;
    }

    return;
  }
}

async function readPipeStoreValueWithRetry(
  page: Page,
  psKey: string,
  opts?: { attempts?: number; delayMs?: number },
) {
  const attempts = opts?.attempts ?? 6;
  const delayMs = opts?.delayMs ?? 200;

  for (let i = 0; i < attempts; i++) {
    // eslint-disable-next-line no-await-in-loop
    const value = await page
      .evaluate((k) => localStorage.getItem(k), psKey)
      .catch(() => null);
    if (value !== null) return value;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(delayMs).catch(() => {});
  }
  // If still null, return null (caller may decide to retry later).
  return null;
}

function extractTotalStepsFromPipeStoreValue(
  raw: string | null,
): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { pipe?: { totalSteps?: number } };
    const totalSteps = parsed?.pipe?.totalSteps;
    return Number.isFinite(totalSteps) ? (totalSteps as number) : null;
  } catch {
    return null;
  }
}

export async function crawlIdentifiedPaths(
  page: Page,
  cfg: CrawlConfig,
): Promise<IdentifiedPath[]> {
  const discoveredByPath = new Map<string, string>(); // pathKey -> representativeUrl

  const recordIfDesired = async (url: string) => {
    if (!isInPrefix(url, cfg.origin, cfg.requiredPathPrefix)) return;
    const pathKey = getPathKey(url);
    if (!isDesiredQuizPath(pathKey, cfg)) return;
    if (!discoveredByPath.has(pathKey)) discoveredByPath.set(pathKey, url);
  };

  const stopWhenLimitReached = () =>
    discoveredByPath.size >= cfg.maxUniquePaths;

  for (const genderSeed of cfg.genderSeeds) {
    if (stopWhenLimitReached()) break;

    await navigateToUrl(page, cfg.startUrl);
    await page.waitForTimeout(500).catch(() => {});

    // If the gender buttons exist, pick the seed; otherwise the quiz UI may handle it.
    await clickByButtonName(page, new RegExp(`^${genderSeed}$`, "i")).catch(
      () => {},
    );
    await page.waitForTimeout(300).catch(() => {});

    await tryAdvanceQuiz(page, cfg, {
      onUrlDiscovered: recordIfDesired,
      isAlreadyVisitedPath: (pathKey: string) => {
        if (stopWhenLimitReached()) return true;
        if (!isDesiredQuizPath(pathKey, cfg)) return true;
        return discoveredByPath.has(pathKey);
      },
    });
  }

  const results: IdentifiedPath[] = Array.from(discoveredByPath.entries())
    .map(([path, representativeUrl]) => ({ path, representativeUrl }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return results;
}

export async function crawlIdentifiedPathsWithLocalStorageCache(
  page: Page,
  cfg: CrawlConfig,
): Promise<{
  paths: IdentifiedPath[];
  stepLocalStorageCache: StepLocalStorageCache;
}> {
  // Enumeration-based discovery (same approach as `crawlIdentifiedPaths`),
  // but also capture the `pipe_store_*` localStorage value for every first-seen path.
  const discoveredByPath = new Map<string, string>(); // pathKey -> representativeUrl
  const localStorageByPath = new Map<string, string | null>(); // pathKey -> pipe_store_* value

  const psKey = pipeStoreKey(cfg);
  const basePrefix = normalizePath(cfg.requiredPathPrefix);

  const getStepIndexFromPathKey = (pathKey: string): number | null => {
    const m = new RegExp(
      `^${escapeRegex(basePrefix)}/(\\d+)-(test|name)$`,
    ).exec(pathKey);
    if (!m) return null;
    const idx = Number(m[1]);
    return Number.isFinite(idx) ? idx : null;
  };

  const readAllLocalStorageValuesNonNull = () => {
    for (const p of discoveredByPath.keys()) {
      if (!localStorageByPath.has(p)) return false;
      const v = localStorageByPath.get(p);
      if (v === null) return false;
    }
    return true;
  };

  // This function is now wizard-driven (no step-by-step URL enumeration).
  // We traverse the quiz by interacting with the UI and record every first-seen path.

  const recordIfDesired = async (url: string) => {
    if (!isInPrefix(url, cfg.origin, cfg.requiredPathPrefix)) return;
    const pathKey = getPathKey(url);
    if (!isDesiredQuizPath(pathKey, cfg)) return;

    if (!discoveredByPath.has(pathKey)) discoveredByPath.set(pathKey, url);

    const existing = localStorageByPath.get(pathKey);
    // If we've already captured a non-null snapshot, keep it stable.
    if (existing !== undefined && existing !== null) return;

    const value = await readPipeStoreValueWithRetry(page, psKey, {
      attempts: 6,
      delayMs: 200,
    });
    if (value !== null || existing === undefined)
      localStorageByPath.set(pathKey, value);
  };

  const recordRoot = async () => {
    const url = page.url();
    if (!isDesiredQuizPath(getPathKey(url), cfg)) return;
    const pathKey = getPathKey(url);
    if (!discoveredByPath.has(pathKey)) discoveredByPath.set(pathKey, url);
    const existing = localStorageByPath.get(pathKey);
    if (existing === undefined || existing === null) {
      const value = await readPipeStoreValueWithRetry(page, psKey, {
        attempts: 6,
        delayMs: 200,
      });
      localStorageByPath.set(pathKey, value);
    }
  };

  // Run traversal once per gender seed so we can capture union coverage.
  for (const genderSeed of cfg.genderSeeds) {
    if (discoveredByPath.size >= cfg.maxUniquePaths) break;

    await navigateToUrl(page, cfg.startUrl);
    await page.waitForTimeout(500).catch(() => {});

    await recordRoot();

    // If gender buttons exist, pick the seed; otherwise the quiz UI may handle it during traversal.
    await clickByButtonName(page, new RegExp(`^${genderSeed}$`, "i")).catch(
      () => {},
    );
    await page.waitForTimeout(300).catch(() => {});

    await tryAdvanceQuiz(page, cfg, {
      onUrlDiscovered: recordIfDesired,
      isAlreadyVisitedPath: (pathKey: string) => {
        if (!isDesiredQuizPath(pathKey, cfg)) return true;
        if (discoveredByPath.size >= cfg.maxUniquePaths) return true;

        const v = localStorageByPath.get(pathKey);
        // If we already have a non-null snapshot, treat as visited.
        // If the snapshot was null, allow revisiting in case it becomes available later.
        return v !== undefined && v !== null;
      },
    });

    // Early exit: if we already discovered all step indices (1..totalSteps) and we
    // have non-null localStorage snapshots for them, there is no point running
    // the same traversal again for other gender seeds.
    const latestPipeStoreValue = await readPipeStoreValueWithRetry(
      page,
      psKey,
      {
        attempts: 4,
        delayMs: 200,
      },
    );
    const totalSteps =
      extractTotalStepsFromPipeStoreValue(latestPipeStoreValue);

    if (totalSteps !== null) {
      const discoveredStepIdx = new Set<number>();
      for (const p of discoveredByPath.keys()) {
        const idx = getStepIndexFromPathKey(p);
        if (idx !== null) discoveredStepIdx.add(idx);
      }

      let allStepsDiscovered = true;
      for (let i = 1; i <= totalSteps; i++) {
        if (!discoveredStepIdx.has(i)) {
          allStepsDiscovered = false;
          break;
        }
      }

      if (allStepsDiscovered && readAllLocalStorageValuesNonNull()) break;
    }
  }

  const paths: IdentifiedPath[] = Array.from(discoveredByPath.entries())
    .map(([path, representativeUrl]) => ({ path, representativeUrl }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const items: Array<{ path: string; value: string | null }> = paths.map(
    (p) => ({
      path: p.path,
      value: localStorageByPath.get(p.path) ?? null,
    }),
  );

  const stepLocalStorageCache: StepLocalStorageCache = {
    pipeStoreKey: psKey,
    items,
  };

  if (paths.length === 0)
    throw new Error("No desired quiz paths were discovered.");

  return { paths, stepLocalStorageCache };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDesiredQuizPath(pathKey: string, cfg: CrawlConfig): boolean {
  const basePrefix = normalizePath(cfg.requiredPathPrefix); // no trailing slash

  // Root "pipe" page (no step suffix) is included in IDENTIFIED_PATHS_FILE_PATH.
  if (pathKey === basePrefix) return true;

  // Step pages like `/.../4-test` and `/.../4-name`.
  const stepRe = new RegExp(`^${escapeRegex(basePrefix)}/\\d+-(test|name)$`);
  return stepRe.test(pathKey);
}

function pipeStoreKey(cfg: CrawlConfig): string {
  // Must match src/autoqa/stepLocalStorageCache.ts buildPipeStoreKey().
  return `pipe_store_${cfg.requiredPathPrefix}`;
}

export async function crawlIdentifiedPathsAndLocalStorageCache(
  page: Page,
  cfg: CrawlConfig,
): Promise<{
  paths: IdentifiedPath[];
  stepLocalStorageCache: StepLocalStorageCache;
}> {
  const discoveredByPath = new Map<string, string>(); // pathKey -> representativeUrl
  const localStorageByPath = new Map<string, string | null>(); // pathKey -> pipe_store_* value

  const psKey = pipeStoreKey(cfg);

  const recordIfDesired = async (url: string) => {
    if (!isInPrefix(url, cfg.origin, cfg.requiredPathPrefix)) return;
    const pathKey = getPathKey(url);
    if (!isDesiredQuizPath(pathKey, cfg)) return;

    if (!discoveredByPath.has(pathKey)) discoveredByPath.set(pathKey, url);

    const existing = localStorageByPath.get(pathKey);
    // If we've already captured a non-null snapshot, keep it stable.
    if (existing !== undefined && existing !== null) return;

    const value = await page.evaluate((k) => localStorage.getItem(k), psKey);
    // If we previously saw null, but now we get a real value, update it.
    if (value !== null || existing === undefined)
      localStorageByPath.set(pathKey, value);
  };

  const recordRoot = async () => {
    const url = page.url();
    if (!isDesiredQuizPath(getPathKey(url), cfg)) return;
    const pathKey = getPathKey(url);
    if (!discoveredByPath.has(pathKey)) discoveredByPath.set(pathKey, url);
    if (!localStorageByPath.has(pathKey)) {
      const value = await page.evaluate((k) => localStorage.getItem(k), psKey);
      localStorageByPath.set(pathKey, value);
    }
  };

  // Run the wizard traversal once per gender seed so we can capture union coverage.
  for (const genderSeed of cfg.genderSeeds) {
    await navigateToUrl(page, cfg.startUrl);
    await page.waitForTimeout(500).catch(() => {});

    await recordRoot();

    // If the gender buttons exist, pick the seed; otherwise the quiz UI may handle it during traversal.
    await clickByButtonName(page, new RegExp(`^${genderSeed}$`, "i")).catch(
      () => {},
    );
    await page.waitForTimeout(300).catch(() => {});

    await tryAdvanceQuiz(page, cfg, {
      onUrlDiscovered: recordIfDesired,
      isAlreadyVisitedPath: (pathKey: string) => {
        if (!isDesiredQuizPath(pathKey, cfg)) return true;
        return localStorageByPath.has(pathKey);
      },
    });
  }

  const paths: IdentifiedPath[] = Array.from(discoveredByPath.entries())
    .map(([path, representativeUrl]) => ({ path, representativeUrl }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Ensure we output a cache entry for every discovered path.
  // If a path was discovered but localStorage was not readable, we keep it as null.
  const items: Array<{ path: string; value: string | null }> = paths.map(
    (p) => ({
      path: p.path,
      value: localStorageByPath.get(p.path) ?? null,
    }),
  );

  const stepLocalStorageCache: StepLocalStorageCache = {
    pipeStoreKey: psKey,
    items,
  };

  // Basic sanity check so Stage 3 doesn't fail later due to empty cache.
  if (paths.length === 0)
    throw new Error("No desired quiz paths were discovered.");

  return { paths, stepLocalStorageCache };
}
