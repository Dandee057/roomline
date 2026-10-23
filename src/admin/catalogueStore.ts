import { create } from "zustand";
import { NO_CHANGES, allProducts, isBuiltIn, normaliseChanges, normaliseProduct, setCatalogue, type CatalogueChanges, type Product } from "../model/catalogue.ts";
import { loadAssets, pruneAssets } from "./assets.ts";

/**
 * The catalogue editor's changes, kept in this browser's localStorage. They're read synchronously when the app
 * starts, before the saved plan, so rooms holding custom products open with them. This is a demo back office:
 * a real retailer would load products from its own product system instead, with proper sign-in.
 */

const KEY = "roomline.catalogue";
function read(): CatalogueChanges {
  try { const raw = localStorage.getItem(KEY); return raw ? normaliseChanges(JSON.parse(raw)) : NO_CHANGES; } catch { return NO_CHANGES; }
}

interface CatalogueState {
  changes: CatalogueChanges;
  /** Bumps on every change so lists re-render. */
  version: number;
  /** Rendered thumbnails by thumbKey. */
  thumbs: Record<string, string>;
  save(p: Product): void;
  reset(id: string): void;
  setHidden(id: string, hide: boolean): void;
  remove(id: string): void;
  /** Replace or reset everything. Custom products still in `inUse` are kept, hidden, so no room loses a piece. */
  replace(changes: CatalogueChanges, inUse: Set<string>): void;
  resetAll(inUse: Set<string>): void;
  setThumb(key: string, url: string): void;
  /** The product being edited, so its thumbnail can be drawn before it's saved. */
  preview: Product | null;
  setPreview(p: Product | null): void;
}

const initial = read();
setCatalogue(initial);

export const useCatalogue = create<CatalogueState>()((set, get) => {
  const commit = (changes: CatalogueChanges) => {
    setCatalogue(changes);
    set((s) => ({ changes, version: s.version + 1 }));
    try { localStorage.setItem(KEY, JSON.stringify(changes)); }
    catch { /* full or unavailable: changes last until the page closes */ }
    const refs = allProducts().flatMap((p) => [p.photo, p.model]);
    void loadAssets(refs).then(() => pruneAssets(refs));
  };
  return {
    changes: initial, version: 0, thumbs: {},
    save: (p) => { const q = normaliseProduct(p, p.id); const c = get().changes; commit({ ...c, products: { ...c.products, [q.id]: q } }); },
    reset: (id) => { const { [id]: _, ...rest } = get().changes.products; commit({ ...get().changes, products: rest }); },
    setHidden: (id, hide) => {
      const c = get().changes, h = c.hidden.filter((x) => x !== id);
      commit({ ...c, hidden: hide ? [...h, id] : h });
    },
    remove: (id) => {
      if (isBuiltIn(id)) return;
      const c = get().changes, { [id]: _, ...rest } = c.products;
      commit({ products: rest, hidden: c.hidden.filter((x) => x !== id) });
    },
    replace: (changes, inUse) => commit(keepInUse(normaliseChanges(changes), get().changes, inUse)),
    resetAll: (inUse) => commit(keepInUse(NO_CHANGES, get().changes, inUse)),
    setThumb: (key, url) => set((s) => ({ thumbs: { ...s.thumbs, [key]: url } })),
    preview: null,
    setPreview: (preview) => set({ preview })
  };
});

void loadAssets(allProducts().flatMap((p) => [p.photo, p.model]));

function keepInUse(next: CatalogueChanges, prev: CatalogueChanges, inUse: Set<string>): CatalogueChanges {
  const kept = Object.values(prev.products).filter((p) => !isBuiltIn(p.id) && inUse.has(p.id) && !next.products[p.id]);
  if (!kept.length) return next;
  return { products: { ...next.products, ...Object.fromEntries(kept.map((p) => [p.id, p])) }, hidden: [...new Set([...next.hidden, ...kept.map((p) => p.id)])] };
}

/** Thumbnails depend only on how a product looks. */
export const thumbKey = (p: Product) => [p.id, p.kind, p.w, p.d, p.h, p.color, p.model ?? "", p.modelRot ?? 0].join("|");
