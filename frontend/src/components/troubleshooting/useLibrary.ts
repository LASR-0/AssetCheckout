import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  troubleshootingConfigQuery,
  troubleshootingLibraryQuery,
  troubleshootingSubjectsQuery,
} from "@/api/queries";
import type { SubjectKind, SymptomCategoryListing } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                  THE WHOLE LIBRARY                              |
///  +-----------------------------------------------------------------+
//
//  Every subject, every listed symptom, the support config and the "Most
//  looked up" row, from three cached calls. The front page searches all of
//  it at once; an article reads its category's name and the subjects that
//  share it; the editor's branch picker reaches across subjects.
//
//  ONE ROW PER SYMPTOM. An article can be listed under several subjects
//  (a dock problem under Laptops and Docks); search shows it once, under the
//  first subject in the library's order, and names the others in its path.
///  +-----------------------------------------------------------------+

export type LibrarySubject = {
  key: string;
  kind: SubjectKind;
  label: string;
  labelSingular: string;
  /** Listed symptoms, written or not. Zero shows "Nothing written yet". */
  count: number;
};

export type LibraryRow = {
  id: string;
  label: string;
  hasArticle: boolean;
  subjectKey: string;
  categoryId: string;
  categoryName: string;
  glyph: string;
  /** Every subject listing it, as labels, in library order. */
  subjects: string[];
};

const EMPTY: Record<string, SymptomCategoryListing[]> = {};

export function useLibrary() {
  const subjectsQ = useQuery(troubleshootingSubjectsQuery);
  const libraryQ = useQuery(troubleshootingLibraryQuery);
  const configQ = useQuery(troubleshootingConfigQuery);

  const taxonomy = libraryQ.data?.taxonomy ?? EMPTY;

  const subjects = useMemo((): LibrarySubject[] => {
    const count = (key: string) =>
      (taxonomy[key] ?? []).reduce((n, c) => n + c.symptoms.length, 0);
    return (subjectsQ.data ?? []).map((s) => ({
      key: s.key,
      kind: s.kind,
      label: s.label,
      labelSingular: s.labelSingular,
      count: count(s.key),
    }));
  }, [subjectsQ.data, taxonomy]);

  const rows = useMemo((): LibraryRow[] => {
    const label = new Map(subjects.map((s) => [s.key, s.label]));
    // Library order: the subject list's own, then anything it didn't name.
    const order = [...subjects.map((s) => s.key), ...Object.keys(taxonomy)];
    const byId = new Map<string, LibraryRow>();
    for (const key of order) {
      for (const category of taxonomy[key] ?? []) {
        for (const symptom of category.symptoms) {
          const name = label.get(key) ?? key;
          const seen = byId.get(symptom.id);
          if (seen) {
            if (!seen.subjects.includes(name)) seen.subjects.push(name);
            continue;
          }
          byId.set(symptom.id, {
            id: symptom.id,
            label: symptom.label,
            hasArticle: symptom.hasArticle,
            subjectKey: key,
            categoryId: category.id,
            categoryName: category.name,
            glyph: category.glyph,
            subjects: [name],
          });
        }
      }
    }
    return [...byId.values()];
  }, [subjects, taxonomy]);

  const popular = useMemo(
    () =>
      (libraryQ.data?.popular ?? [])
        .map((p) => rows.find((r) => r.id === p.symptomId))
        .filter((r): r is LibraryRow => !!r),
    [libraryQ.data, rows]
  );

  return {
    subjects,
    taxonomy,
    rows,
    popular,
    config: configQ.data ?? null,
    loading: libraryQ.isPending || subjectsQ.isPending,
    failed: libraryQ.isError,
    subjectOf: (key: string | null | undefined) => subjects.find((s) => s.key === key) ?? null,
  };
}

/** Symptoms whose wording or category matches, in library order. */
export function searchLibrary(rows: LibraryRow[], query: string): LibraryRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return rows.filter(
    (r) => r.label.toLowerCase().includes(needle) || r.categoryName.toLowerCase().includes(needle)
  );
}

/** The design's popular chips drop the "My " / "How do I " lead-in. */
export function shortLabel(label: string): string {
  const short = label.replace(/^(My |How do I |Where do I )/, "").replace(/\?$/, "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}
