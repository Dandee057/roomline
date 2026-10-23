import { Component, Suspense, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Product } from "../model/catalogue.ts";
import type { Dims } from "../model/plan.ts";
import type { Config as ShelvingConfig } from "../shelving/config.ts";
import { useAssetUrl } from "../admin/assets.ts";
import { FurnitureModel } from "./Furniture.tsx";

/**
 * A product in 3D. If the catalogue gives it a glTF model, that's shown, scaled to fit inside the product's
 * W × D × H and standing on the floor, so every fit check stays exact. Until the model loads, or if it can't,
 * the procedural model stands in.
 */
export function ProductModel({ p, dims, shelving, wait }: { p: Product; dims: Dims; shelving?: ShelvingConfig; /** Show nothing until the model loads (for thumbnails). */ wait?: boolean }) {
  const url = useAssetUrl(p.model);
  const fallback = <FurnitureModel p={p} dims={dims} shelving={shelving} />;
  if (!url || p.kind === "shelving") return fallback;
  return (
    <Fallback key={url} fallback={fallback}>
      <Suspense fallback={wait ? null : fallback}>
        <Gltf url={url} dims={dims} rot={p.modelRot ?? 0} />
      </Suspense>
    </Fallback>
  );
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn("Roomline: couldn't load a product model, showing the built-in one.", e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Fit an object into a box of w × h × d metres: turned, uniformly scaled, centred, standing on y = 0. */
export function fitObject(obj: THREE.Object3D, w: number, h: number, d: number, rot: number): THREE.Group {
  const turned = new THREE.Group();
  turned.rotation.y = (rot * Math.PI) / 180;
  turned.add(obj);
  turned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turned), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = Math.min(w / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6), d / Math.max(size.z, 1e-6));
  const outer = new THREE.Group();
  outer.scale.setScalar(s);
  turned.position.set(-c.x, -box.min.y, -c.z);
  outer.add(turned);
  return outer;
}

function Gltf({ url, dims, rot }: { url: string; dims: Dims; rot: number }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return fitObject(copy, dims.w / 100, Math.max(dims.h, 1) / 100, dims.d / 100, rot);
  }, [scene, dims.w, dims.d, dims.h, rot]);
  return <primitive object={obj} />;
}
