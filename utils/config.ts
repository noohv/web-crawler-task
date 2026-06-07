import path from "node:path";

/**
 * Configuration for crawling the multi-step quiz "pipe".
 *
 * The crawler only records paths under `requiredPathPrefix` and only when
 * `origin` matches. `genderSeeds` controls which variant of the wizard
 * traversal to run so we can cover the union of visited steps.
 */
export type CrawlConfig = {
  startUrl: string;
  origin: string; // e.g. https://fasting.best.me
  requiredPathPrefix: string; // e.g. /ae-en/automatic-qa-test-13-may-ph/

  // Some quiz answers (notably gender) lead to different subsequent steps.
  genderSeeds: string[]; // e.g. ["Female", "Male"]

  maxSeedUrls: number;
  maxWizardStepsPerSeed: number;
  maxUniquePaths: number;

  numericDefaults: {
    name: string;
    ageYears: number;
    heightFt: number;
    heightIn: number;
    currentWeightLbs: number;
    goalWeightLbs: number;
  };
};

/**
 * Default crawl configuration for `fasting.best.me`'s wizard.
 *
 * If you need to crawl a different site/pipe, update `startUrl`,
 * `origin`, and `requiredPathPrefix`.
 */
export const defaultCrawlConfig: CrawlConfig = {
  startUrl: "https://fasting.best.me/ae-en/automatic-qa-test-pipe-13-may-ph/",
  origin: "https://fasting.best.me",
  requiredPathPrefix: "/ae-en/automatic-qa-test-pipe-13-may-ph/",

  genderSeeds: ["Male"],

  // Keep conservative for a first working stage; we can raise later.
  maxSeedUrls: 500,
  maxWizardStepsPerSeed: 80,
  maxUniquePaths: 500,

  numericDefaults: {
    name: "Test",
    ageYears: 30,
    heightFt: 5,
    heightIn: 5,
    currentWeightLbs: 170,
    goalWeightLbs: 150,
  },
};

/** Output filename for `crawlIdentifiedPathsWithLocalStorageCache`. */
export const IDENTIFIED_PATHS_FILE_NAME = "identified_paths.json";

/** Output directory for the screenshots captured for each discovered path. */
export const SCREENSHOTS_DIR_NAME = "screenshots";

/** Absolute output path for `identified_paths.json`. */
export const IDENTIFIED_PATHS_FILE_PATH = path.join(
  "out",
  IDENTIFIED_PATHS_FILE_NAME,
);

/** Absolute output path for the `screenshots/` directory. */
export const SCREENSHOTS_DIR_PATH = path.join("out", SCREENSHOTS_DIR_NAME);

/** Output filename for the mapping produced by `captureIdentifiedPages`. */
export const SCREENSHOTS_MANIFEST_FILE_NAME = "screenshots_manifest.json";
export const SCREENSHOTS_MANIFEST_FILE_PATH = path.join(
  "out",
  SCREENSHOTS_MANIFEST_FILE_NAME,
);

/** Output filename for the cached `localStorage` snapshots per step. */
export const STEP_LOCAL_STORAGE_FILE_NAME = "step_local_storage.json";
export const STEP_LOCAL_STORAGE_FILE_PATH = path.join(
  "out",
  STEP_LOCAL_STORAGE_FILE_NAME,
);

/** Output filename for the generated language/spelling validation report. */
export const VALIDATION_REPORT_FILE_NAME = "validation_report.json";
export const VALIDATION_REPORT_FILE_PATH = path.join(
  "out",
  VALIDATION_REPORT_FILE_NAME,
);
