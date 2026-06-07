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
