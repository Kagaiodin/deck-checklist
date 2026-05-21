/**
 * Collection UI-layer types.
 *
 * Data types (Collection, CollectionPrinting, CollectionMeta) live in
 * src/types/index.ts alongside the rest of the app types.  This file
 * adds the view-level enums and derived shapes used only within the
 * collection feature.
 */

export type CollectionSortKey = "name-asc" | "name-desc" | "qty-desc" | "qty-asc";

export type CollectionFilterKey = "all" | "in-deck" | "free" | "foils" | "duplicates";

export type BulkEditMode = "merge" | "replace";

export interface CommittedInfo {
  total: number;
  deckCount: number;
}

export interface BulkPreview {
  added: number;
  updated: number;
  removed: number;
}

export interface EditingPrinting {
  key: string;
  idx: number;
  qty: string;
  set: string;
  cn: string;
  foil: boolean;
}
