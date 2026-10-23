import { useId, type ReactNode } from "react";

/** Small, accessible form controls shared by the panel. */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-head"><span className="field-label">{label}</span>{hint && <span className="field-hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange, format = String }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
      <output aria-live="polite">{format(value)}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
    </div>
  );
}

export interface Choice<T> { value: T; label: ReactNode; disabled?: boolean; title?: string; swatch?: string }

/** A row of mutually exclusive buttons, exposed as a radio group. */
export function Segmented<T extends string | number>({ label, value, choices, onChange, wrap }: { label: string; value: T; choices: Choice<T>[]; onChange: (v: T) => void; wrap?: boolean }) {
  const name = useId();
  return (
    <div className={"segmented" + (wrap ? " wrap" : "")} role="radiogroup" aria-label={label}>
      {choices.map((c) => (
        <label key={String(c.value)} className={c.disabled ? "disabled" : undefined} title={c.title}>
          <input type="radio" name={name} checked={c.value === value} disabled={c.disabled} onChange={() => onChange(c.value)} />
          {c.swatch && <i className="swatch" style={{ background: c.swatch }} aria-hidden="true" />}
          <span>{c.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled, note }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <label className={"toggle" + (disabled ? " disabled" : "")}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span className="toggle-text">{label}{note && <small>{note}</small>}</span>
    </label>
  );
}
