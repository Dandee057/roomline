import { create } from "zustand";

/**
 * Photos and 3D models uploaded in the catalogue editor live in this browser's IndexedDB, because they're too
 * big for localStorage. Products refer to them as "asset:<key>"; `useAssets` turns those keys into object URLs
 * the page can show. Anything else (a web address) is used as it is.
 */

const DB = "roomline", STORE = "assets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface Assets { urls: Record<string, string> }
export const useAssets = create<Assets>()(() => ({ urls: {} }));

export const isAsset = (ref: string | undefined): ref is string => !!ref && ref.startsWith("asset:");
const keyOf = (ref: string) => ref.slice("asset:".length);

/** The address to load: an object URL for an uploaded asset (once it's read), or the web address itself. */
export function resolveRef(ref: string | undefined, urls: Record<string, string>): string | undefined {
  if (!ref) return undefined;
  return isAsset(ref) ? urls[keyOf(ref)] : ref;
}
export const useAssetUrl = (ref: string | undefined) => useAssets((s) => resolveRef(ref, s.urls));

export async function putAsset(blob: Blob, prefix: string): Promise<string> {
  const key = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await tx("readwrite", (s) => s.put(blob, key));
  useAssets.setState((st) => ({ urls: { ...st.urls, [key]: URL.createObjectURL(blob) } }));
  return "asset:" + key;
}

export async function getAsset(ref: string): Promise<Blob | undefined> {
  return isAsset(ref) ? ((await tx("readonly", (s) => s.get(keyOf(ref)))) as Blob | undefined) : undefined;
}

/** Read every referenced asset that isn't loaded yet. Missing ones are skipped (the product falls back). */
export async function loadAssets(refs: (string | undefined)[]): Promise<void> {
  const want = [...new Set(refs.filter(isAsset).map(keyOf))].filter((k) => !useAssets.getState().urls[k]);
  if (!want.length) return;
  try {
    const found: Record<string, string> = {};
    for (const k of want) {
      const blob = (await tx("readonly", (s) => s.get(k))) as Blob | undefined;
      if (blob) found[k] = URL.createObjectURL(blob);
    }
    useAssets.setState((st) => ({ urls: { ...st.urls, ...found } }));
  } catch { /* no IndexedDB (private mode): products show their built-in look */ }
}

/** Delete stored assets nothing refers to any more. */
export async function pruneAssets(keep: (string | undefined)[]): Promise<void> {
  try {
    const used = new Set(keep.filter(isAsset).map(keyOf));
    const keys = (await tx("readonly", (s) => s.getAllKeys())) as string[];
    for (const k of keys) if (!used.has(k)) {
      await tx("readwrite", (s) => s.delete(k));
      const url = useAssets.getState().urls[k];
      if (url) URL.revokeObjectURL(url);
    }
  } catch { /* nothing to tidy */ }
}
