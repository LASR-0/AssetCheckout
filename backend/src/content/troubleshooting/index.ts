///  +-----------------------------------------------------------------+
///  |            TROUBLESHOOTING CONTENT — PUBLIC SURFACE             |
///  +-----------------------------------------------------------------+
//
//  Import from here, not from the content modules. Anything that reaches
//  past this barrel into devices/ or articles/ has bypassed validation and
//  bound itself to the disk implementation, which is the one thing the
//  repository interface exists to prevent.
///  +-----------------------------------------------------------------+

export { troubleshootingRepository, createDiskRepository, parseContent } from "./repository.js";

export type {
  TroubleshootingRepository,
  SymptomListing,
  SymptomCategoryListing,
  SymptomSearchResult,
  DeviceSummary,
  DevicePickerTile,
} from "./repository.js";

export {
  DEVICE_LABELS,
  deviceKeyForCategoryName,
  deviceKeysForCategories,
} from "./deviceKeys.js";

export { DEVICE_KEYS } from "./schema.js";

export type {
  Article,
  Branch,
  Device,
  DeviceKey,
  Step,
  Symptom,
  SymptomCategory,
} from "./schema.js";
