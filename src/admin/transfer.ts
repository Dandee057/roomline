import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { normaliseChanges, type CatalogueChanges } from "../model/catalogue.ts";
import { getAsset, isAsset, putAsset } from "./assets.ts";

/** Export, import and upload helpers for the catalogue editor. */

const FORMAT = "roomline-catalogue";

const toDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(r.error); r.readAsDataURL(b);
});

/** The editor's changes as one JSON file, with uploaded photos and models inlined so it opens anywhere. */
export async function exportCatalogue(changes: CatalogueChanges): Promise<Blob> {
  const assets: Record<string, string> = {};
  for (const p of Object.values(changes.products)) for (const ref of [p.photo, p.model]) {
    if (isAsset(ref) && !assets[ref]) { const b = await getAsset(ref); if (b) assets[ref] = await toDataUrl(b); }
  }
  return new Blob([JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), ...changes, assets }, null, 1)], { type: "application/json" });
}

/** Read an exported file back: inlined files are stored again in this browser and the products point at them. */
export async function importCatalogue(file: File): Promise<CatalogueChanges> {
  const json = JSON.parse(await file.text());
  if (!json || json.format !== FORMAT) throw new Error("That isn't a Roomline catalogue file.");
  const assets: Record<string, string> = json.assets && typeof json.assets === "object" ? json.assets : {};
  const remap: Record<string, string> = {};
  for (const [ref, data] of Object.entries(assets)) {
    if (typeof data !== "string" || !data.startsWith("data:")) continue;
    const blob = await (await fetch(data)).blob();
    remap[ref] = await putAsset(blob, ref.includes("model") ? "model" : "photo");
  }
  for (const p of Object.values((json.products ?? {}) as Record<string, { photo?: string; model?: string }>)) {
    if (p.photo && remap[p.photo]) p.photo = remap[p.photo];
    if (p.model && remap[p.model]) p.model = remap[p.model];
  }
  return normaliseChanges(json);
}

/** A photo, scaled down to at most 800 px and stored as WebP (JPEG where WebP isn't supported). */
export async function storePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPEG, PNG or WebP).");
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.86)) ?? await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error("Couldn't read that image.");
  return putAsset(blob, "photo");
}

export interface ModelInfo { ref: string; size: { w: number; d: number; h: number }; triangles: number }

let draco: DRACOLoader | undefined;
/** Check a .glb file, measure it (glTF units are metres) and store it. */
export async function storeModel(file: File): Promise<ModelInfo> {
  const buf = await file.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== "glTF") throw new Error("Choose a .glb file (binary glTF). A .gltf with separate files can be packed into one .glb first.");
  if (buf.byteLength > 25 * 1024 * 1024) throw new Error("That model is over 25 MB. Compress it first (for example with gltf-transform) so the page stays quick.");
  const loader = new GLTFLoader();
  draco ??= new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
  loader.setDRACOLoader(draco);
  const gltf = await loader.parseAsync(buf, "");
  const box = new THREE.Box3().setFromObject(gltf.scene), s = box.getSize(new THREE.Vector3());
  let triangles = 0;
  gltf.scene.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  const ref = await putAsset(new Blob([buf], { type: "model/gltf-binary" }), "model");
  return { ref, size: { w: Math.round(s.x * 100), d: Math.round(s.z * 100), h: Math.round(s.y * 100) }, triangles: Math.round(triangles) };
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
