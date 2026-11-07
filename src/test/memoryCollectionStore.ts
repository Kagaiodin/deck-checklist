import { createCollectionStore } from "../store/collection";
import type { Collection, CollectionMeta } from "../types/index";

/** A real Collection store over in-memory storage, seeded with the given values. */
export function memoryCollectionStore(collection: Collection = {}, meta: CollectionMeta | null = null) {
  const data = { collection: JSON.stringify(collection), meta: JSON.stringify(meta) };
  return createCollectionStore({
    loadCollection: () => data.collection,
    loadMeta: () => data.meta,
    saveCollection: json => { data.collection = json; },
    saveMeta: json => { data.meta = json; },
  });
}
