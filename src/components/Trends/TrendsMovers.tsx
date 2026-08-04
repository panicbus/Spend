import { useCallback, useMemo, useState } from 'react';
import type { TrendData } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { currentMonthKey } from '../../utils/dates';
import type { Mover, MoverComparison } from '../../utils/categoryMovers';
import { latestComparison } from '../../utils/categoryMovers';
import './TrendsMovers.css';

function deltaLabel(m: Mover): string {
  const sign = m.deltaCents > 0 ? '+' : '−';
  return `${sign}${formatCurrency(Math.abs(m.deltaCents))}`;
}

function pctLabel(m: Mover): string {
  if (m.pct == null) return 'new this month';
  const rounded = Math.round(m.pct);
  // Match the true minus used by the dollar delta rather than a hyphen.
  if (rounded < 0) return `\u2212${Math.abs(rounded)}%`;
  return `+${rounded}%`;
}

export function moversSummaryText(
  built: MoverComparison,
  currentInProgress: boolean
): string {
  const line = (m: Mover) =>
    `  ${m.name}: ${deltaLabel(m)} (${pctLabel(m)}) — ${formatCurrency(
      m.priorCents
    )} → ${formatCurrency(m.currentCents)}`;
  const currentLabel = currentInProgress
    ? `${built.current.label} so far`
    : built.current.label;
  const parts = [`${currentLabel} vs ${built.prior.label}`, ''];
  if (built.up.length) {
    parts.push('Spending more:', ...built.up.map(line), '');
  }
  if (built.down.length) {
    parts.push('Spending less:', ...built.down.map(line));
  }
  return parts.join('\n').trim();
}

export type TrendsMoversProps = {
  data: TrendData;
  /** Opens the category's transactions for the month being compared. */
  onCategoryClick: (categoryId: number, monthKey: string) => void;
};

/**
 * What changed between the last two months in the range — the question people
 * actually ask of a budget, and the one the monthly charts make you eyeball.
 */
export function TrendsMovers({ data, onCategoryClick }: TrendsMoversProps) {
  const built = useMemo(() => latestComparison(data), [data]);
  const currentInProgress =
    built != null && built.current.monthKey === currentMonthKey();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(
        moversSummaryText(built, currentInProgress)
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [built, currentInProgress]);

  if (!built) return null;
  const { current, prior, up, down } = built;

  const column = (title: string, rows: Mover[], tone: 'up' | 'down') => (
    <div className="trends-movers__col">
      <h3 className={`trends-movers__col-title trends-movers__col-title--${tone}`}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="trends-movers__empty">No meaningful change.</p>
      ) : (
        <ul className="trends-movers__list">
          {rows.map((m) => (
            <li key={m.categoryId}>
              <button
                type="button"
                className="trends-movers__row"
                onClick={() => onCategoryClick(m.categoryId, current.monthKey)}
                title={`${m.name} · ${m.groupName} — view ${current.label} transactions`}
              >
                <span
                  className="trends-movers__dot"
                  style={{ background: m.color }}
                  aria-hidden
                />
                <span className="trends-movers__name">{m.name}</span>
                <span className="trends-movers__was">
                  {formatCurrency(m.priorCents)} → {formatCurrency(m.currentCents)}
                </span>
                <span className={`trends-movers__delta trends-movers__delta--${tone}`}>
                  {deltaLabel(m)}
                  <span className="trends-movers__pct">{pctLabel(m)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="trends-chart-card trends-movers">
      <div className="trends-movers__head">
        <div>
          <h2 className="trends-chart-card__heading">What changed</h2>
          <p className="trends-chart-card__desc">
            Biggest category moves,{' '}
            {currentInProgress ? `${current.label} so far` : current.label}{' '}
            vs {prior.label}
          </p>
        </div>
        <button
          type="button"
          className="trends-movers__copy"
          onClick={() => void copy()}
        >
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
      <div className="trends-movers__cols">
        {column('Spending more', up, 'up')}
        {column('Spending less', down, 'down')}
      </div>
    </section>
  );
}
