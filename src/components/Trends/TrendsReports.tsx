import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TopMerchantsResult, TrendData } from '../../../ipc-contract';
import { api } from '../../services/api';
import { formatCurrency } from '../../services/formatters';
import { formatMonthLabel } from '../../utils/dates';
import {
  compareMonths,
  monthsWithActivity,
  type Mover,
} from '../../utils/categoryMovers';
import './TrendsReports.css';

type ReportId = 'category' | 'merchants' | 'months';

const REPORTS: { id: ReportId; label: string; blurb: string }[] = [
  {
    id: 'category',
    label: 'One category over time',
    blurb: 'Month by month for a single category, against its own average.',
  },
  {
    id: 'merchants',
    label: 'Top merchants',
    blurb: 'Where the money actually went, and how that shifted.',
  },
  {
    id: 'months',
    label: 'Compare two months',
    blurb: 'Every category that moved between any two months.',
  },
];

function signed(cents: number): string {
  const sign = cents > 0 ? '+' : '−';
  return `${sign}${formatCurrency(Math.abs(cents))}`;
}

function pctText(current: number, prior: number): string {
  if (prior <= 0) return current > 0 ? 'new' : '—';
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return 'flat';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Bar scaled against the largest value in its own column. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <span className="trends-reports__bar-track" aria-hidden>
      <span
        className="trends-reports__bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </span>
  );
}

function CategoryOverTime({
  data,
  onMonthClick,
}: {
  data: TrendData;
  onMonthClick: (categoryId: number, monthKey: string) => void;
}) {
  const categories = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; groupName: string; color: string }>();
    for (const m of data.months) {
      for (const c of m.byCategory) {
        if (!seen.has(c.categoryId)) {
          seen.set(c.categoryId, {
            id: c.categoryId,
            name: c.name,
            groupName: c.groupName,
            color: c.color,
          });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const active = categoryId ?? categories[0]?.id ?? null;

  const series = useMemo(() => {
    if (active == null) return [];
    return data.months.map((m) => ({
      monthKey: m.monthKey,
      label: m.label,
      cents: m.byCategory
        .filter((c) => c.categoryId === active)
        .reduce((sum, c) => sum + c.amountCents, 0),
    }));
  }, [active, data]);

  if (categories.length === 0) {
    return <p className="trends-reports__empty">No categories with spending yet.</p>;
  }

  const cat = categories.find((c) => c.id === active) ?? categories[0];
  const max = Math.max(...series.map((s) => s.cents), 1);
  const spent = series.filter((s) => s.cents > 0);
  const average = spent.length
    ? Math.round(spent.reduce((sum, s) => sum + s.cents, 0) / spent.length)
    : 0;
  const total = series.reduce((sum, s) => sum + s.cents, 0);

  return (
    <>
      <div className="trends-reports__controls">
        <label className="trends-reports__field">
          <span className="trends-reports__field-label">Category</span>
          <select
            className="trends-reports__select"
            value={String(cat.id)}
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.groupName}
              </option>
            ))}
          </select>
        </label>
        <div className="trends-reports__stats">
          <span>
            <strong>{formatCurrency(total)}</strong> total
          </span>
          <span>
            <strong>{formatCurrency(average)}</strong> per active month
          </span>
        </div>
      </div>
      <ul className="trends-reports__list">
        {series.map((s) => (
          <li key={s.monthKey}>
            <button
              type="button"
              className="trends-reports__row trends-reports__row--month"
              onClick={() => onMonthClick(cat.id, s.monthKey)}
              title={`View ${cat.name} transactions for ${s.label}`}
            >
              <span className="trends-reports__month">{s.label}</span>
              <Bar value={s.cents} max={max} color={cat.color} />
              <span className="trends-reports__amt">
                {formatCurrency(s.cents)}
              </span>
              <span className="trends-reports__vs">
                {s.cents > average
                  ? `${signed(s.cents - average)} vs avg`
                  : s.cents === average
                    ? 'at avg'
                    : `${signed(s.cents - average)} vs avg`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function TopMerchants({
  data,
  onMerchantClick,
}: {
  data: TrendData;
  onMerchantClick: (merchant: string) => void;
}) {
  const [result, setResult] = useState<TopMerchantsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api
      .getTopMerchants({
        startMonthKey: data.startMonthKey,
        endMonthKey: data.endMonthKey,
        limit: 12,
      })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data.startMonthKey, data.endMonthKey]);

  if (error) {
    return (
      <p className="trends-reports__empty" role="alert">
        {error}
      </p>
    );
  }
  if (!result) return <p className="trends-reports__empty">Loading…</p>;
  if (result.merchants.length === 0) {
    return <p className="trends-reports__empty">No merchant spending in this range.</p>;
  }

  const max = Math.max(...result.merchants.map((m) => m.totalCents), 1);
  return (
    <>
      <p className="trends-reports__note">
        Compared with {formatMonthLabel(result.priorStartMonthKey)} –{' '}
        {formatMonthLabel(result.priorEndMonthKey)}, the window before this one.
      </p>
      <ul className="trends-reports__list">
        {result.merchants.map((m) => (
          <li key={m.merchant}>
            <button
              type="button"
              className="trends-reports__row trends-reports__row--merchant"
              onClick={() => onMerchantClick(m.merchant)}
              title={`View ${m.merchant} transactions`}
            >
              <span className="trends-reports__name">{m.merchant}</span>
              <Bar value={m.totalCents} max={max} color="var(--accent)" />
              <span className="trends-reports__amt">
                {formatCurrency(m.totalCents)}
              </span>
              <span className="trends-reports__meta">
                {m.transactionCount}× · {formatCurrency(m.averageCents)} avg
              </span>
              <span
                className={
                  m.deltaCents > 0
                    ? 'trends-reports__delta trends-reports__delta--up'
                    : m.deltaCents < 0
                      ? 'trends-reports__delta trends-reports__delta--down'
                      : 'trends-reports__delta'
                }
              >
                {pctText(m.totalCents, m.priorTotalCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CompareMonths({
  data,
  onCategoryClick,
}: {
  data: TrendData;
  onCategoryClick: (categoryId: number, monthKey: string) => void;
}) {
  const months = useMemo(() => monthsWithActivity(data), [data]);
  const [priorKey, setPriorKey] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);

  if (months.length < 2) {
    return (
      <p className="trends-reports__empty">
        Two months with activity are needed to compare.
      </p>
    );
  }

  const prior =
    months.find((m) => m.monthKey === priorKey) ?? months[months.length - 2];
  const current =
    months.find((m) => m.monthKey === currentKey) ?? months[months.length - 1];
  const built = compareMonths(prior, current, 0);
  const rows = [...built.up, ...built.down];

  const monthSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <label className="trends-reports__field">
      <span className="trends-reports__field-label">{label}</span>
      <select
        className="trends-reports__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {months.map((m) => (
          <option key={m.monthKey} value={m.monthKey}>
            {m.label} {m.year}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <div className="trends-reports__controls">
        {monthSelect('From', prior.monthKey, setPriorKey)}
        {monthSelect('To', current.monthKey, setCurrentKey)}
      </div>
      {rows.length === 0 ? (
        <p className="trends-reports__empty">
          Nothing moved by more than $10 between these months.
        </p>
      ) : (
        <ul className="trends-reports__list">
          {rows.map((m: Mover) => (
            <li key={m.categoryId}>
              <button
                type="button"
                className="trends-reports__row trends-reports__row--compare"
                onClick={() => onCategoryClick(m.categoryId, current.monthKey)}
                title={`View ${m.name} transactions for ${current.label}`}
              >
                <span
                  className="trends-reports__dot"
                  style={{ background: m.color }}
                  aria-hidden
                />
                <span className="trends-reports__name">{m.name}</span>
                <span className="trends-reports__meta">
                  {formatCurrency(m.priorCents)} → {formatCurrency(m.currentCents)}
                </span>
                <span
                  className={
                    m.deltaCents > 0
                      ? 'trends-reports__delta trends-reports__delta--up'
                      : 'trends-reports__delta trends-reports__delta--down'
                  }
                >
                  {signed(m.deltaCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export type TrendsReportsProps = {
  data: TrendData;
  onCategoryMonthClick: (categoryId: number, monthKey: string) => void;
  onMerchantClick: (merchant: string) => void;
};

/**
 * A short menu of ready-made reports. People rarely know what they want to see
 * until they are shown the options, so each one is a click with its own
 * controls rather than something to describe from scratch.
 */
export function TrendsReports({
  data,
  onCategoryMonthClick,
  onMerchantClick,
}: TrendsReportsProps) {
  const [active, setActive] = useState<ReportId>('category');
  const report = REPORTS.find((r) => r.id === active) ?? REPORTS[0];

  const renderActive = useCallback(() => {
    if (active === 'merchants') {
      return <TopMerchants data={data} onMerchantClick={onMerchantClick} />;
    }
    if (active === 'months') {
      return <CompareMonths data={data} onCategoryClick={onCategoryMonthClick} />;
    }
    return <CategoryOverTime data={data} onMonthClick={onCategoryMonthClick} />;
  }, [active, data, onCategoryMonthClick, onMerchantClick]);

  return (
    <section className="trends-chart-card trends-reports">
      <h2 className="trends-chart-card__heading">Reports</h2>
      <p className="trends-chart-card__desc">{report.blurb}</p>
      <div className="trends-reports__tabs" role="tablist" aria-label="Reports">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === active}
            className={
              r.id === active
                ? 'trends-reports__tab trends-reports__tab--active'
                : 'trends-reports__tab'
            }
            onClick={() => setActive(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {renderActive()}
    </section>
  );
}
