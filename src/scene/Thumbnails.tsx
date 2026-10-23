import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { allProducts, type Product } from "../model/catalogue.ts";
import { DEFAULT_CONFIG } from "../shelving/config.ts";
import { thumbKey, useCatalogue } from "../admin/catalogueStore.ts";
import { useAssets } from "../admin/assets.ts";
import { ProductModel } from "./ProductModel.tsx";

/**
 * Renders a small picture of every product from its own 3D model, a few products per frame, into an offscreen
 * target of the main canvas (no second WebGL context). The catalogue shows these until a product has a photo.
 */
const SIZE = 192, BATCH = 6;

export function Thumbnails() {
  const version = useCatalogue((s) => s.version);
  const thumbs = useCatalogue((s) => s.thumbs);
  const urls = useAssets((s) => s.urls);
  const preview = useCatalogue((s) => s.preview);
  // The next product without a current thumbnail, the one being edited first. Uploaded models must be readable.
  const next = useMemo(() => [...(preview ? [preview] : []), ...allProducts()]
    .filter((p) => !thumbs[thumbKey(p)] && (!p.model?.startsWith("asset:") || urls[p.model.slice(6)])).filter((p, i, a) => a.findIndex((q) => thumbKey(q) === thumbKey(p)) === i).slice(0, BATCH),
    // version: allProducts() changed
    [version, thumbs, urls, preview]);
  return <>{next.map((p) => <Shot key={thumbKey(p)} p={p} />)}</>;
}

function Shot({ p }: { p: Product }) {
  const gl = useThree((s) => s.gl);
  const [scene] = useState(() => {
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight("#ffffff", "#b9b2a6", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 2.4); sun.position.set(2, 4, 3); s.add(sun);
    return s;
  });
  const content = useRef<THREE.Group>(null);
  const ready = useRef(0);
  const done = useRef(false);
  const dims = { w: p.w, d: p.d, h: p.h, price: p.price, name: p.name };
  useEffect(() => () => { done.current = true; }, []);

  useFrame(() => {
    if (done.current || !content.current || content.current.children.length === 0) return;
    if (++ready.current < 2) return; // one frame for a model that just loaded to settle
    done.current = true;
    const box = new THREE.Box3().setFromObject(content.current);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const dir = new THREE.Vector3(0.85, p.kind === "rug" ? 1.6 : 0.62, 1.15).normalize();
    cam.position.copy(sphere.center).addScaledVector(dir, sphere.radius / Math.sin((15 * Math.PI) / 180) * 1.02);
    cam.lookAt(sphere.center);
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prev = { target: gl.getRenderTarget(), shadows: gl.shadowMap.enabled, color: gl.getClearColor(new THREE.Color()), alpha: gl.getClearAlpha() };
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    const px = new Uint8Array(SIZE * SIZE * 4);
    gl.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
    gl.setRenderTarget(prev.target);
    gl.setClearColor(prev.color, prev.alpha);
    rt.dispose();
    const c = document.createElement("canvas"); c.width = c.height = SIZE;
    const ctx = c.getContext("2d")!, img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4); // rows come bottom-up
    ctx.putImageData(img, 0, 0);
    useCatalogue.getState().setThumb(thumbKey(p), c.toDataURL("image/png"));
  });

  return createPortal(
    <group ref={content}>
      <Suspense fallback={null}>
        <ProductModel wait p={p} dims={dims} shelving={p.kind === "shelving" ? DEFAULT_CONFIG : undefined} />
      </Suspense>
    </group>,
    scene
  );
}

/** What to show for a product: its photo, else its rendered thumbnail. */
export function useProductImage(p: Product | undefined): string | undefined {
  const photo = useAssets((s) => (p?.photo ? (p.photo.startsWith("asset:") ? s.urls[p.photo.slice(6)] : p.photo) : undefined));
  const thumb = useCatalogue((s) => (p ? s.thumbs[thumbKey(p)] : undefined));
  return photo ?? thumb;
}
