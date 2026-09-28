export type LegendItem = { label: string; color: string; kind?: "swatch" | "line" | "dashed" };

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend__item" key={it.label}>
          {it.kind === "swatch" ? (
            <span className="legend__swatch" style={{ background: it.color }} />
          ) : (
            <span
              className="legend__line"
              style={
                it.kind === "dashed"
                  ? { backgroundImage: `linear-gradient(90deg, ${it.color} 60%, transparent 0)`, backgroundSize: "6px 2px" }
                  : { background: it.color }
              }
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
