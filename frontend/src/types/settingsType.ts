export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};
 
export type StandardModelsConfig = Record<string, CategoryStandardModels>;