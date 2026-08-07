///  +-----------------------------------------------------------------+
///  |            TROUBLESHOOTING CONTENT — PUBLIC SURFACE             |
///  +-----------------------------------------------------------------+
//
//  Import from here, not from the content modules. Anything that reaches
//  past this barrel into subjects/ or articles/ has bypassed validation and
//  bound itself to the disk implementation, which is the one thing the
//  repository interface exists to prevent.
///  +-----------------------------------------------------------------+

export { troubleshootingRepository, createDiskRepository, parseContent } from "./repository.js";

export type {
  TroubleshootingRepository,
  SymptomListing,
  SymptomCategoryListing,
  SymptomSearchResult,
  SubjectSummary,
  SubjectPickerTile,
} from "./repository.js";

export {
  SUBJECT_LABELS,
  deviceKeyForCategoryName,
  deviceKeysForCategories,
} from "./subjects.js";

export { DEVICE_KEYS, APP_KEYS, SUBJECT_KEYS } from "./schema.js";

export type {
  Article,
  Branch,
  Subject,
  SubjectKey,
  SubjectKind,
  DeviceKey,
  Step,
  Symptom,
  SymptomCategory,
} from "./schema.js";
