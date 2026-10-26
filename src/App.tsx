import { useEffect } from "react";
import { Stage } from "./scene/Stage.tsx";
import { Panel } from "./ui/Panel.tsx";
import { Toaster, Toolbar } from "./ui/Toolbar.tsx";
import { useStore } from "./store.ts";
import { product } from "./model/catalogue.ts";
import { toast } from "./ui/toast.ts";

export function App() {
  // "See it in my room": a product page can link to Roomline with ?add=<product id>, e.g. ?add=sofa3
  useEffect(() => {
    const url = new URL(location.href), id = url.searchParams.get("add");
    if (!id || !product(id)) return;
    useStore.getState().addItem(id);
    toast(`${product(id)!.name} added to your ${useStore.getState().plan.rooms.find((r) => r.id === useStore.getState().room)?.name.toLowerCase() ?? "room"}. Drag it into place.`);
    url.searchParams.delete("add");
    history.replaceState(null, "", url.pathname + url.search + location.hash);
  }, []);

  // Keyboard: undo/redo, and for the selected piece: rotate, nudge, duplicate, delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("textarea, select") || (t instanceof HTMLInputElement && t.type !== "radio" && t.type !== "checkbox")) return;
      const s = useStore.getState(), mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && key === "y") { e.preventDefault(); s.redo(); return; }
      // In the house view the arrow keys move the chosen room, 10 cm at a time (Shift: 1 cm)
      if (s.scope === "house" && key.startsWith("arrow")) {
        const d = e.shiftKey ? 1 : 10, m: Record<string, [number, number]> = { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, -d], arrowdown: [0, d] };
        e.preventDefault(); s.nudgeRoom(s.room, ...m[key]); return;
      }
      const id = s.selected, it = id ? s.plan.items.find((i) => i.id === id) : null;
      if (!it) return;
      const step = e.shiftKey ? 1 : 5;
      const nudge: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (nudge[key]) { e.preventDefault(); s.nudge(it.id, nudge[key][0], nudge[key][1]); }
      else if (key === "r" && !mod) s.rotate(it.id, e.shiftKey ? -90 : 90);
      else if (mod && key === "d") { e.preventDefault(); s.duplicate(it.id); }
      else if (key === "delete" || key === "backspace") { e.preventDefault(); s.remove(it.id); }
      else if (key === "escape") s.select(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <main className="viewport">
        <header className="brand">
          <h1>Roomline</h1>
          <p>Plan your room, see what fits</p>
        </header>
        <Stage />
        <Toolbar />
      </main>
      <Panel />
      <Toaster />
    </div>
  );
}
