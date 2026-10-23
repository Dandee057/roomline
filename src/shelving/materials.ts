import * as THREE from "three";
import { FRAMES, SHELVES, type FrameFinish, type ShelfMaterial } from "./config.ts";

/**
 * One set of materials for the whole unit. Finishes change by easing these materials' colours (see Shelving),
 * not by swapping materials, so a colour change fades instead of snapping. Wood grain is a greyscale texture
 * painted once on a canvas and tinted by the material colour, so every wood shares it.
 */

function grainTexture(): THREE.CanvasTexture {
  const w = 512, h = 128, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e6e6e6"; g.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Long, slightly wavy grain lines along the shelf, with a few darker streaks
  for (let i = 0; i < 140; i++) {
    const y0 = rnd() * h, amp = 1 + rnd() * 3, freq = 0.004 + rnd() * 0.01, phase = rnd() * 10;
    g.strokeStyle = `rgba(60, 45, 30, ${0.04 + rnd() * (i % 9 === 0 ? 0.22 : 0.08)})`;
    g.lineWidth = 0.6 + rnd() * (i % 9 === 0 ? 2.2 : 1.1);
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function perforatedTexture(): THREE.CanvasTexture {
  const s = 64, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, s, s);
  g.fillStyle = "#000";
  for (const [x, y] of [[16, 16], [48, 48]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface Materials {
  frame: THREE.MeshStandardMaterial;
  shelf: THREE.MeshStandardMaterial;
  carcass: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  grain: THREE.Texture;
}

export function createMaterials(frame: FrameFinish, shelf: ShelfMaterial): Materials {
  const f = FRAMES[frame], s = SHELVES[shelf];
  const grain = grainTexture();
  const perf = perforatedTexture();
  perf.repeat.set(24, 48);
  return {
    frame: new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metalness, roughness: f.roughness }),
    shelf: new THREE.MeshStandardMaterial({ color: s.color, map: s.grain ? grain : null, roughness: s.grain ? 0.62 : 0.4, metalness: s.grain ? 0 : 0.7 }),
    carcass: new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metalness * 0.8, roughness: 0.6 }),
    panel: new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metalness, roughness: 0.6, alphaMap: perf, alphaTest: 0.5, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: "#26272b", roughness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#c9ccd1", metalness: 1, roughness: 0.25 }),
    grain
  };
}
