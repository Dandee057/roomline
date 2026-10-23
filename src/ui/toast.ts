/** A tiny toast channel: anything can call toast(), the <Toaster> shows the latest message. */
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
export function toast(msg: string): void { listeners.forEach((l) => l(msg)); }
export function onToast(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
