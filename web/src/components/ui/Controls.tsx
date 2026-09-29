"use client";

import { useId, useRef } from "react";

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span className="small muted">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const id = useId();
  // Value committed by the last pointerup, so a touch drag that also fires touchend commits once.
  const committed = useRef<number | null>(null);
  const commitOnce = (v: number) => {
    if (committed.current === v) return;
    committed.current = v;
    onCommit?.(v);
  };
  return (
    <div className="slider" style={{ minWidth: 220, flex: "1 1 220px" }}>
      <div className="slider__head">
        <label htmlFor={id} className="muted">
          {label}
        </label>
        <output htmlFor={id} style={{ fontWeight: 500 }}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => {
          committed.current = null;
        }}
        onPointerUp={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          committed.current = v;
          onCommit?.(v);
        }}
        // Touch: iOS may end a drag with a cancel (or only a touchend) instead of pointerup.
        onPointerCancel={(e) => commitOnce(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commitOnce(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
