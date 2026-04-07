import React, { useMemo } from 'react';
import { formatCurrency } from '../../services/formatters';
import './SpendingDonut.css';

const CX = 100;
const CY = 100;
const R_OUT = 76;
const R_IN = 50;

function ringSegment(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x1 = cx + rOuter * Math.cos(a0);
  const y1 = cy + rOuter * Math.sin(a0);
  const x2 = cx + rOuter * Math.cos(a1);
  const y2 = cy + rOuter * Math.sin(a1);
  const x3 = cx + rInner * Math.cos(a1);
  const y3 = cy + rInner * Math.sin(a1);
  const x4 = cx + rInner * Math.cos(a0);
  const y4 = cy + rInner * Math.sin(a0);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function SpendingDonut({ groups }) {
  const { segments, pctSpent, totalBudget } = useMemo(() => {
    const alloc = (groups ?? []).filter((g) => (g.budget_cents ?? 0) > 0);
    const tb = alloc.reduce((s, g) => s + g.budget_cents, 0);
    const ts = alloc.reduce((s, g) => s + g.spent_cents, 0);
    const pct =
      tb > 0 ? Math.min(999, Math.round((ts / tb) * 100)) : 0;

    let acc = -Math.PI / 2;
    const segs = [];
    for (const g of alloc) {
      const frac = g.budget_cents / tb;
      const a0 = acc;
      const a1 = acc + frac * Math.PI * 2;
      segs.push({
        id: g.id,
        name: g.name,
        color: g.color,
        path: ringSegment(CX, CY, R_OUT, R_IN, a0, a1),
        opacity: (g.spent_cents ?? 0) > 0 ? 1 : 0.3,
        spent: g.spent_cents ?? 0,
      });
      acc = a1;
    }
    return { segments: segs, pctSpent: pct, totalBudget: tb };
  }, [groups]);

  return (
    <section className="spending-donut" aria-label="Spending allocation">
      <div className="spending-donut__chart-wrap">
        <svg
          className="spending-donut__svg"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`${pctSpent} percent of budget spent`}
        >
          <circle
            className="spending-donut__track"
            cx={CX}
            cy={CY}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke="var(--bar-track)"
            strokeWidth={R_OUT - R_IN}
          />
          {segments.map((s) => (
            <path
              key={s.id}
              d={s.path}
              fill={s.color}
              fillOpacity={s.opacity}
            />
          ))}
          <text
            className="spending-donut__center-pct"
            x={CX}
            y={CY - 4}
            textAnchor="middle"
          >
            {pctSpent}%
          </text>
          <text
            className="spending-donut__center-sub"
            x={CX}
            y={CY + 14}
            textAnchor="middle"
          >
            spent
          </text>
        </svg>
      </div>

      <ul className="spending-donut__legend">
        {segments.length === 0 && (
          <li className="spending-donut__legend-empty">
            {totalBudget === 0
              ? 'Set category budgets to see your allocation.'
              : 'No data yet.'}
          </li>
        )}
        {segments.map((s) => (
          <li key={s.id} className="spending-donut__legend-item">
            <svg
              className="spending-donut__swatch"
              viewBox="0 0 10 10"
              width="10"
              height="10"
              aria-hidden
            >
              <circle cx="5" cy="5" r="5" fill={s.color} opacity={s.opacity} />
            </svg>
            <span className="spending-donut__legend-name">{s.name}</span>
            <span className="spending-donut__legend-amt">
              {formatCurrency(s.spent)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
