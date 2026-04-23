import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { formatMonthLabel } from '../../utils/dates';
import './SpendingDonut.css';

const CX = 100;
const CY = 100;
const R_OUT = 76;
const R_IN = 50;

function ringSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  a0: number,
  a1: number
) {
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

type DonutSeg = {
  id: number;
  name: string;
  color: string;
  path: string;
  opacity: number;
  spent: number;
};

type SpendingDonutProps = {
  groups: BudgetGroup[];
  /** When set, legend rows open Transactions for that budget group’s categories in this month. */
  monthKey?: string;
  onLegendGroupClick?: (group: BudgetGroup) => void;
};

export function SpendingDonut({
  groups,
  monthKey,
  onLegendGroupClick,
}: SpendingDonutProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  /** Drives donut dimming; updated from both the ring and the legend. */
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
  /** Floating card only while hovering donut slices (not the list). */
  const [tooltip, setTooltip] = useState<{
    name: string;
    spent: number;
    x: number;
    y: number;
  } | null>(null);

  const updateTooltipFromDonut = useCallback(
    (e: React.MouseEvent, seg: DonutSeg) => {
      const root = sectionRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      setActiveSegmentId(seg.id);
      setTooltip({
        name: seg.name,
        spent: seg.spent,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    []
  );

  const leaveDonutSegment = useCallback(
    (e: React.MouseEvent<SVGPathElement>) => {
      const next = e.relatedTarget as Node | null;
      const svg = e.currentTarget.ownerSVGElement;
      if (next && svg?.contains(next)) return;
      setTooltip(null);
      if (!sectionRef.current?.contains(next)) {
        setActiveSegmentId(null);
      }
    },
    []
  );

  const syncLegendHighlight = useCallback((seg: DonutSeg) => {
    setActiveSegmentId(seg.id);
  }, []);

  const leaveLegendArea = useCallback((e: React.MouseEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && sectionRef.current?.contains(next)) return;
    setActiveSegmentId(null);
  }, []);

  const { segments, pctSpent, totalBudget } = useMemo(() => {
    const alloc = (groups ?? []).filter((g) => (g.budget_cents ?? 0) > 0);
    const tb = alloc.reduce((s, g) => s + g.budget_cents, 0);
    const ts = alloc.reduce((s, g) => s + g.spent_cents, 0);
    const pct =
      tb > 0 ? Math.min(999, Math.round((ts / tb) * 100)) : 0;

    let acc = -Math.PI / 2;
    const segs: DonutSeg[] = [];
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
    <section
      ref={sectionRef}
      className="spending-donut"
      aria-label="Spending allocation"
    >
      {tooltip ? (
        <div
          className="spending-donut__tooltip"
          role="tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="spending-donut__tooltip-title">{tooltip.name}</div>
          <div className="spending-donut__tooltip-row">
            <span className="spending-donut__tooltip-label">Spent</span>
            <span className="spending-donut__tooltip-value">
              {formatCurrency(tooltip.spent)}
            </span>
          </div>
          {monthKey ? (
            <div className="spending-donut__tooltip-muted">
              {formatMonthLabel(monthKey)}
            </div>
          ) : null}
        </div>
      ) : null}

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
          {segments.map((s) => {
            const inactive =
              activeSegmentId != null && activeSegmentId !== s.id;
            return (
              <path
                key={s.id}
                d={s.path}
                fill={s.color}
                fillOpacity={inactive ? s.opacity * 0.38 : s.opacity}
                stroke="transparent"
                strokeWidth={6}
                vectorEffect="non-scaling-stroke"
                className="spending-donut__segment"
                onMouseEnter={(e) => updateTooltipFromDonut(e, s)}
                onMouseMove={(e) => updateTooltipFromDonut(e, s)}
                onMouseLeave={leaveDonutSegment}
              />
            );
          })}
          <text
            className="spending-donut__center-pct spending-donut__center-text"
            x={CX}
            y={CY - 4}
            textAnchor="middle"
          >
            {pctSpent}%
          </text>
          <text
            className="spending-donut__center-sub spending-donut__center-text"
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
        {segments.map((s) => {
          const g = groups.find((x) => x.id === s.id);
          const canDrill =
            !!onLegendGroupClick &&
            !!g &&
            (g.categories?.length ?? 0) > 0;
          const row = (
            <>
              <svg
                className="spending-donut__swatch"
                viewBox="0 0 10 10"
                width="10"
                height="10"
                aria-hidden
              >
                <circle
                  cx="5"
                  cy="5"
                  r="5"
                  fill={s.color}
                  opacity={s.opacity}
                />
              </svg>
              <span className="spending-donut__legend-name">{s.name}</span>
              <span className="spending-donut__legend-amt">
                {formatCurrency(s.spent)}
              </span>
            </>
          );
          return (
            <li
              key={s.id}
              className="spending-donut__legend-item-wrap"
              onMouseEnter={() => syncLegendHighlight(s)}
              onMouseMove={() => syncLegendHighlight(s)}
              onMouseLeave={leaveLegendArea}
            >
              {canDrill && g ? (
                <button
                  type="button"
                  className="spending-donut__legend-item spending-donut__legend-item--clickable"
                  aria-label={
                    monthKey
                      ? `View transactions for ${s.name} in ${monthKey}`
                      : `View transactions for ${s.name}`
                  }
                  onClick={() => onLegendGroupClick(g)}
                >
                  {row}
                </button>
              ) : (
                <div className="spending-donut__legend-item">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
