import { useEffect, useState } from "react";
import { useStore } from "../store.ts";
import { onToast } from "./toast.ts";

/** Floating controls over the view: plan or 3D, wall snapping, and re-framing the room. */
export function Toolbar() {
  const mode = useStore((s) => s.mode);
  const snap = useStore((s) => s.snap);
  const scope = useStore((s) => s.scope);
  const { setMode, toggleSnap, reframe, setScope, setTab } = useStore.getState();
  return (
    <div className="toolbar" role="toolbar" aria-label="View">
      <div className="views" role="group" aria-label="Show">
        <button type="button" aria-pressed={scope === "room"} onClick={() => { setScope("room"); setTab("furniture"); }}>Room</button>
        <button type="button" aria-pressed={scope === "house"} onClick={() => setScope("house")}>House</button>
      </div>
      <div className="views" role="group" aria-label="View">
        <button type="button" aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button>
        <button type="button" aria-pressed={mode === "plan"} onClick={() => setMode("plan")}>Plan</button>
      </div>
      <button type="button" aria-pressed={snap} onClick={toggleSnap} title="Snap to walls and a 5 cm grid">Snap</button>
      <button type="button" onClick={reframe}>Fit</button>
    </div>
  );
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => onToast((text) => setMsg({ text, id: Date.now() })), []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2800); return () => clearTimeout(t); }, [msg]);
  return <div className="toast" role="status" aria-live="polite">{msg && <span key={msg.id}>{msg.text}</span>}</div>;
}
