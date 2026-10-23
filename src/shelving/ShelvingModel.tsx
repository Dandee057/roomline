import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { FRAMES, SHELVES, type Config } from "./config.ts";
import { layout, type Part } from "./layout.ts";
import { createMaterials, type Materials } from "./materials.ts";

/**
 * Shelfline's shelving unit as a piece of furniture: the same layout and easing as the configurator, driven by a
 * `config` prop instead of a store. Units are metres, centred on the origin, front facing +z.
 */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateZ(Math.PI / 2);
const SMOOTH = 0.16;

function materialFor(kind: Part["kind"], m: Materials): THREE.Material {
  switch (kind) {
    case "shelf": case "drawer": return m.shelf;
    case "carcass": return m.carcass;
    case "panel": return m.panel;
    case "handle": return m.chrome;
    case "foot": return m.rubber;
    default: return m.frame;
  }
}

function Box({ part, material }: { part: Part; material: THREE.Material }) {
  const ref = useRef<THREE.Mesh>(null!);
  useLayoutEffect(() => { ref.current.position.set(...part.pos); ref.current.scale.set(...part.size); ref.current.rotation.z = part.rotZ ?? 0; }, []); // starts in place
  useFrame((_, dt) => {
    const m = ref.current;
    easing.damp3(m.position, part.pos, SMOOTH, dt);
    easing.damp3(m.scale, part.size, SMOOTH, dt);
    easing.damp(m.rotation, "z", part.rotZ ?? 0, SMOOTH, dt);
  });
  return <mesh ref={ref} geometry={part.kind === "foot" ? CYLINDER : BOX} material={material} castShadow={part.kind !== "panel"} receiveShadow />;
}

function Castor({ part, m }: { part: Part; m: Materials }) {
  const h = part.size[1];
  return (
    <group position={part.pos}>
      <mesh geometry={BOX} material={m.chrome} position={[0, h / 2 - 0.004, 0]} scale={[0.04, 0.006, 0.04]} />
      <mesh geometry={WHEEL} material={m.rubber} position={[0, -h / 2 + h * 0.32, 0.006]} scale={[0.02, h * 0.64, h * 0.64]} castShadow />
    </group>
  );
}

export function ShelvingModel({ config }: { config: Config }) {
  const l = useMemo(() => layout(config), [config]);
  const m = useMemo(() => createMaterials(config.frame, config.shelf), []); // created once; finishes ease below
  useEffect(() => { m.shelf.map = SHELVES[config.shelf].grain ? m.grain : null; m.shelf.needsUpdate = true; }, [config.shelf, m]);
  useFrame((_, dt) => {
    const f = FRAMES[config.frame], s = SHELVES[config.shelf];
    for (const mat of [m.frame, m.carcass, m.panel]) easing.dampC(mat.color, f.color, 0.2, dt);
    easing.dampC(m.shelf.color, s.color, 0.2, dt);
    easing.damp(m.frame, "metalness", f.metalness, 0.2, dt);
    easing.damp(m.shelf, "metalness", s.grain ? 0 : 0.7, 0.2, dt);
  });
  return <group>{l.parts.map((p) => (p.kind === "castor" ? <Castor key={p.key} part={p} m={m} /> : <Box key={p.key} part={p} material={materialFor(p.kind, m)} />))}</group>;
}
