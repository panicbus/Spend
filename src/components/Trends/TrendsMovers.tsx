import { useCallback, useMemo, useState } from 'react';
import type { TrendData } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { currentMonthKey } from '../../utils/dates';
import './TrendsMovers.css';

/** Moves smaller than this are noise in a month-to-month comparison. */
const MIN_MOVE_CENTS = 1000;

/** How many categories to show on each side. */
const TOP_N = 5;

type Mover = {
  categoryId: number;
  name: string;
  groupName: string;
  color: string;
  currentCents: number;
  priorCents: number;
  deltaCents: number;
  /** Null when there is no prior spend to compare against. */
  pct: number | null;
};

function buildMovers(data: TrendData): {
  current: TrendData['months'][number];
  prior: TrendData['months'][number];
  /** True when the newer month is the one still being lived in. */
  currentInProgress: boolean;
  up: Mover[];
  down: Mover[];
} | null {
  // Months with nothing in them are not a comparison — on the 1st of a month
  // the newest one is empty, which would read as "everything down 100%".
  const months = data.months.filter(
    (m) => m.totalSpendingCents > 0 || m.byCategory.length > 0
  );
  if (months.length < 2) return null;
  const current = months[months.length - 1];
  const prior = months[months.length - 2];

  const byId = new Map<number, Mover>();
  const put = (
    slice: TrendData['months'][number]['byCategory'][number],
    field: 'currentCents' | 'priorCents'
  ) => {
    const existing = byId.get(slice.categoryId);
    if (existing) {
      existing[field] += slice.amountCents;
      return;
    }
    byId.set(slice.categoryId, {
      categoryId: slice.categoryId,
      name: slice.name,
      groupName: slice.groupName,
      color: slice.color,
      currentCents: field === 'currentCents' ? slice.amountCents : 0,
      priorCents: field === 'priorCents' ? slice.amountCents : 0,
      deltaCents: 0,
      pct: null,
    });
  };
  for (const s of prior.byCategory) put(s, 'priorCents');
  for (const s of current.byCategory) put(s, 'currentCents');

  const movers: Mover[] = [];
  for (const m of byId.values()) {
    m.deltaCents = m.currentCents - m.priorCents;
    m.pct = m.priorCents > 0 ? (m.deltaCents / m.priorCents) * 100 : null;
    if (Math.abs(m.deltaCents) >= MIN_MOVE_CENTS) movers.push(m);
  }

  const up = movers
    .filter((m) => m.deltaCents > 0)
    .sort((a, b) => b.deltaCents - a.deltaCents)
    .slice(0, TOP_N);
  const down = movers
    .filter((m) => m.deltaCents < 0)
    .sort((a, b) => a.deltaCents - b.deltaCents)
    .slice(0, TOP_N);

  if (up.length === 0 && down.length === 0) return null;
  return {
    current,
    prior,
    currentInProgress: current.monthKey === currentMonthKey(),
    up,
    down,
  };
}

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

function summaryText(
  built: NonNullable<ReturnType<typeof buildMovers>>
): string {
  const line = (m: Mover) =>
    `  ${m.name}: ${deltaLabel(m)} (${pctLabel(m)}) — ${formatCurrency(
      m.priorCents
    )} → ${formatCurrency(m.currentCents)}`;
  const currentLabel = built.currentInProgress
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
  const built = useMemo(() => buildMovers(data), [data]);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(summaryText(built));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [built]);

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
            {built.currentInProgress ? `${current.label} so far` : current.label}{' '}
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
