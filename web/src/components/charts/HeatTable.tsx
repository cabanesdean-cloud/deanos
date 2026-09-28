/** Correlation matrix as a shaded table: sequential blue by |ρ|, sign shown in the number. */
export function HeatTable({ labels, values, caption }: { labels: string[]; values: number[][]; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="table" style={{ width: "auto" }}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th key={l} scope="col">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" style={{ color: "var(--fg)" }}>
                {labels[i]}
              </th>
              {row.map((v, j) => {
                const strength = i === j ? 0 : Math.min(1, Math.abs(v));
                return (
                  <td
                    key={j}
                    style={{
                      background: `color-mix(in srgb, var(--series-1) ${Math.round(strength * 55)}%, transparent)`,
                      color: i === j ? "var(--fg-3)" : "var(--fg)",
                      minWidth: 52,
                    }}
                  >
                    {i === j ? "1" : v.toFixed(2).replace("-", "−")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
