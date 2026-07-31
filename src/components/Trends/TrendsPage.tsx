import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import type {
  TrendData,
  TrendGroupLegendItem,
  TrendMonthSnapshot,
  TrendRange,
} from '../../../ipc-contract';
import { useTrends } from '../../hooks/useTrends';
import { api } from '../../services/api';
import { formatCurrency } from '../../services/formatters';
import { MONTH_NOTES_CHANGED_EVENT } from '../../utils/dataChanged';
import { writeStoredMonthKey } from '../../utils/monthKeyStorage';
import type { TrendsReturnContext } from '../../utils/trendsReturnContext';
import { clearBudgetReturnContext } from '../../utils/budgetReturnContext';
import { setTrendsReturnContext } from '../../utils/trendsReturnContext';
import { Button } from '../common/Button';
import './TrendsPage.css';

const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: '1m', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'All time' },
];

/** Keeps bars readable when a range holds only one or two months. */
const MAX_BAR_SIZE = 72;

/**
 * A one- or two-month range leaves a band chart with almost nothing to plot, and
 * Recharts centres what little there is. Cap the plot instead so the bars sit
 * left and the empty space collects on the right.
 */
function plotClass(monthCount: number): string {
  if (monthCount <= 1) return 'trends-chart-card__plot trends-chart-card__plot--one';
  if (monthCount === 2) return 'trends-chart-card__plot trends-chart-card__plot--two';
  return 'trends-chart-card__plot';
}

const INCOME_FILL: string[] = [
  '#1d6b8c',
  '#0d9488',
  '#4f46e5',
  '#b45309',
  '#be185d',
  '#2563eb',
  '#0f766e',
];

function incomeFill(
  sourceId: number,
  sources: TrendData['incomeSources']
): string {
  const idx = sources.findIndex((s) => s.id === sourceId);
  const i = idx >= 0 ? idx : 0;
  return INCOME_FILL[i % INCOME_FILL.length];
}

/**
 * Shift a hex color's lightness by `delta` percentage points (HSL).
 * Used to give stacked segments that share one group color distinct,
 * intentional-looking shades.
 */
function shiftHexLightness(hex: string, delta: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  l = Math.min(0.85, Math.max(0.15, l + delta / 100));

  const hueToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r2: number;
  let g2: number;
  let b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hueToRgb(p, q, h + 1 / 3);
    g2 = hueToRgb(p, q, h);
    b2 = hueToRgb(p, q, h - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/** Evenly spread shades of a base color across `count` stacked segments. */
function categoryShade(base: string, index: number, count: number): string {
  if (count <= 1) return base;
  const range = Math.min(28, (count - 1) * 9);
  const delta = -range / 2 + (range / (count - 1)) * index;
  return shiftHexLightness(base, delta);
}

type VsRow = {
  monthKey: string;
  label: string;
  budgetCents: number;
  actualCents: number;
};

type StackRow = Record<string, string | number>;

function buildVsRows(months: TrendMonthSnapshot[]): VsRow[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    budgetCents: m.totalBudgetCents,
    actualCents: m.totalSpendingCents,
  }));
}

function buildGroupStackRows(
  months: TrendMonthSnapshot[],
  groups: TrendGroupLegendItem[]
): StackRow[] {
  return months.map((m) => {
    const row: StackRow = {
      monthKey: m.monthKey,
      label: m.label,
    };
    for (const g of groups) {
      row[`g_${g.id}`] = 0;
    }
    for (const s of m.byGroup) {
      row[`g_${s.groupId}`] = s.amountCents;
    }
    return row;
  });
}

function buildCategoryStackRowsForGroup(
  months: TrendMonthSnapshot[],
  groupId: number
): StackRow[] {
  const catIds = new Set<number>();
  for (const m of months) {
    for (const c of m.byCategory) {
      if (c.groupId === groupId) catIds.add(c.categoryId);
    }
  }
  const ordered = [...catIds].sort((a, b) => a - b);
  return months.map((m) => {
    const row: StackRow = { monthKey: m.monthKey, label: m.label };
    for (const cid of ordered) {
      row[`c_${cid}`] = 0;
    }
    for (const c of m.byCategory) {
      if (c.groupId === groupId) {
        row[`c_${c.categoryId}`] = c.amountCents;
      }
    }
    return row;
  });
}

function categoryKeysFromGroupRows(rows: StackRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (k.startsWith('c_')) keys.add(k);
    }
  }
  return [...keys].sort();
}

function buildIncomeStackRows(
  months: TrendMonthSnapshot[],
  sources: TrendData['incomeSources']
): StackRow[] {
  return months.map((m) => {
    const row: StackRow = { monthKey: m.monthKey, label: m.label };
    for (const s of sources) {
      row[`i_${s.id}`] = 0;
    }
    for (const slice of m.byIncomeSource ?? []) {
      row[`i_${slice.sourceId}`] = slice.amountCents;
    }
    return row;
  });
}

/** Stacked rows for one income source: segments are description buckets (`byIncomeLine`). */
function buildIncomeLineStackRowsForSource(
  months: TrendMonthSnapshot[],
  sourceId: number
): { rows: StackRow[]; lineLabels: string[] } {
  const labels = new Set<string>();
  for (const m of months) {
    for (const slice of m.byIncomeLine ?? []) {
      if (slice.sourceId === sourceId) labels.add(slice.label);
    }
  }
  const ordered = [...labels].sort((a, b) => a.localeCompare(b));
  const rows = months.map((m) => {
    const row: StackRow = { monthKey: m.monthKey, label: m.label };
    for (let i = 0; i < ordered.length; i++) {
      row[`il_${i}`] = 0;
    }
    for (const slice of m.byIncomeLine ?? []) {
      if (slice.sourceId === sourceId) {
        const idx = ordered.indexOf(slice.label);
        if (idx >= 0) row[`il_${idx}`] = slice.amountCents;
      }
    }
    return row;
  });
  return { rows, lineLabels: ordered };
}

function pctChange(prev: number, cur: number): number | null {
  if (prev === 0) return cur === 0 ? null : null;
  return ((cur - prev) / prev) * 100;
}

function pctOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

function truncateTrendNote(note: string): string {
  return note.length > 100 ? `${note.slice(0, 100)}…` : note;
}

function TrendsTooltipNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="trends-tooltip__note">{truncateTrendNote(note)}</div>
  );
}

type TrendsTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: VsRow }>;
  months: TrendMonthSnapshot[];
  monthNotes?: Record<string, string>;
};

function VsBudgetTooltip({
  active,
  payload,
  months,
  monthNotes,
}: TrendsTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as VsRow | undefined;
  if (!row) return null;
  const idx = months.findIndex((m) => m.monthKey === row.monthKey);
  const prev = idx > 0 ? months[idx - 1] : null;
  const prevActual = prev?.totalSpendingCents ?? 0;
  const ch = pctChange(prevActual, row.actualCents);
  return (
    <div className="trends-tooltip">
      <div className="trends-tooltip__title">{row.label}</div>
      <div className="trends-tooltip__row">
        <span>Budget</span>
        <span>{formatCurrency(row.budgetCents)}</span>
      </div>
      <div className="trends-tooltip__row">
        <span>Actual</span>
        <span>{formatCurrency(row.actualCents)}</span>
      </div>
      {ch != null && prev && (
        <div className="trends-tooltip__muted">
          {prevActual === 0
            ? 'No prior month spending'
            : `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}% vs prior month`}
        </div>
      )}
      <TrendsTooltipNote note={monthNotes?.[row.monthKey]} />
    </div>
  );
}

function StackSliceTooltip({
  active,
  payload,
  monthNotes,
}: {
  active?: boolean;
  payload?: Array<{
    name?: unknown;
    dataKey?: unknown;
    value?: unknown;
    payload?: StackRow;
  }>;
  monthNotes?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p.name != null ? String(p.name) : String(p.dataKey ?? '');
  const cents = Number(p.value) || 0;
  const row = p.payload;
  let total = 0;
  if (row) {
    for (const k of Object.keys(row)) {
      if (k === 'monthKey' || k === 'label') continue;
      total += Number(row[k]) || 0;
    }
  }
  const pct = pctOf(cents, total);
  const mk =
    row && typeof row.monthKey === 'string' ? row.monthKey : undefined;
  return (
    <div className="trends-tooltip">
      <div className="trends-tooltip__title">{String(name)}</div>
      <div className="trends-tooltip__row">
        <span>Amount</span>
        <span>{formatCurrency(cents)}</span>
      </div>
      {pct != null && (
        <div className="trends-tooltip__muted">
          {pct.toFixed(1)}% of month total
        </div>
      )}
      <TrendsTooltipNote note={mk ? monthNotes?.[mk] : undefined} />
    </div>
  );
}

function NetTooltip({
  active,
  payload,
  months,
  monthNotes,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { monthKey: string; netCents: number; label: string } }>;
  months: TrendMonthSnapshot[];
  monthNotes?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const idx = months.findIndex((m) => m.monthKey === row.monthKey);
  const prev = idx > 0 ? months[idx - 1] : null;
  const prevNet = prev?.netCents ?? 0;
  const ch = pctChange(prevNet, row.netCents);
  return (
    <div className="trends-tooltip">
      <div className="trends-tooltip__title">{row.label}</div>
      <div className="trends-tooltip__row">
        <span>Net</span>
        <span>{formatCurrency(row.netCents)}</span>
      </div>
      {ch != null && prev && prevNet !== 0 && (
        <div className="trends-tooltip__muted">
          {ch >= 0 ? '+' : ''}
          {ch.toFixed(1)}% vs prior month
        </div>
      )}
      <TrendsTooltipNote note={monthNotes?.[row.monthKey]} />
    </div>
  );
}

type XTickProps = {
  x?: number;
  y?: number;
  payload?: { value: string };
  months: TrendMonthSnapshot[];
  onMonthClick: (mk: string) => void;
  monthNotes?: Record<string, string>;
};

function ClickableMonthTick({
  x = 0,
  y = 0,
  payload,
  months,
  onMonthClick,
  monthNotes,
}: XTickProps) {
  const mk = payload?.value ?? '';
  const m = months.find((row) => row.monthKey === mk);
  const text = m?.label ?? mk;
  const hasNote = Boolean(monthNotes?.[mk]);
  return (
    <g transform={`translate(${x},${y})`} className="trends-page__x-tick-wrap">
      <text
        role="button"
        tabIndex={0}
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize={12}
        className="trends-page__x-tick"
        onClick={() => onMonthClick(mk)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onMonthClick(mk);
          }
        }}
      >
        {text}
        {hasNote ? (
          <tspan className="trends-page__x-tick-asterisk" dx={2}>
            {' *'}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

export function TrendsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { range, setRange, data, loading, error } = useTrends();
  const [drillGroupId, setDrillGroupId] = useState<number | null>(null);
  const [drillIncomeSourceId, setDrillIncomeSourceId] = useState<number | null>(
    null
  );
  const categorySectionRef = useRef<React.ElementRef<'section'> | null>(null);
  const incomeSectionRef = useRef<React.ElementRef<'section'> | null>(null);
  const pendingScrollToTrendsSectionRef = useRef<'category' | 'income' | null>(
    null
  );
  const [monthNotes, setMonthNotes] = useState<Record<string, string>>({});

  const loadMonthNotesForData = useCallback(async (trend: TrendData) => {
    const keys = trend.months.map((m) => m.monthKey);
    if (keys.length === 0) {
      setMonthNotes({});
      return;
    }
    const entries = await Promise.all(
      keys.map(async (k) => {
        try {
          const n = await api.getMonthNote(k);
          return n.trim() ? ([k, n] as const) : null;
        } catch {
          return null;
        }
      })
    );
    const o: Record<string, string> = {};
    for (const e of entries) {
      if (e) o[e[0]] = e[1];
    }
    setMonthNotes(o);
  }, []);

  useEffect(() => {
    if (!data) {
      setMonthNotes({});
      return;
    }
    void loadMonthNotesForData(data);
  }, [data, loadMonthNotesForData]);

  useEffect(() => {
    const onNotes = () => {
      if (data) void loadMonthNotesForData(data);
    };
    window.addEventListener(MONTH_NOTES_CHANGED_EVENT, onNotes);
    return () =>
      window.removeEventListener(MONTH_NOTES_CHANGED_EVENT, onNotes);
  }, [data, loadMonthNotesForData]);

  useEffect(() => {
    const restore = (
      location.state as { trendsRestore?: TrendsReturnContext } | null
    )?.trendsRestore;
    if (!restore?.range) return;
    pendingScrollToTrendsSectionRef.current =
      restore.drillIncomeSourceId != null ? 'income' : 'category';
    setRange(restore.range);
    setDrillGroupId(
      restore.drillGroupId != null ? restore.drillGroupId : null
    );
    setDrillIncomeSourceId(
      restore.drillIncomeSourceId != null ? restore.drillIncomeSourceId : null
    );
    navigate('/trends', { replace: true, state: null });
  }, [location.state, navigate, setRange, setDrillGroupId, setDrillIncomeSourceId]);

  useEffect(() => {
    if (!pendingScrollToTrendsSectionRef.current) return;
    if (loading || !data) return;
    const target = pendingScrollToTrendsSectionRef.current;
    pendingScrollToTrendsSectionRef.current = null;
    const el =
      target === 'income'
        ? incomeSectionRef.current
        : categorySectionRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [loading, data, drillGroupId, drillIncomeSourceId]);

  const goBudgetMonth = useCallback(
    (monthKey: string) => {
      writeStoredMonthKey(monthKey);
      navigate('/');
    },
    [navigate]
  );

  const goTransactionsCategory = useCallback(
    (
      categoryId: number,
      trend: TrendData,
      activeDrillGroupId: number | null
    ) => {
      const ctx: TrendsReturnContext = {
        range: trend.range,
        drillGroupId: activeDrillGroupId,
        drillIncomeSourceId: null,
        drillIncomeLineLabel: null,
      };
      setTrendsReturnContext(ctx);
      const q = new URLSearchParams({
        rangeFrom: trend.startMonthKey,
        rangeTo: trend.endMonthKey,
        category: String(categoryId),
      });
      navigate(`/transactions?${q.toString()}`, {
        state: { trendsReturn: ctx },
      });
    },
    [navigate]
  );

  const goTransactionsIncome = useCallback(
    (
      trend: TrendData,
      sourceId: number,
      lineLabel: string,
      activeDrillIncomeSourceId: number | null
    ) => {
      const ctx: TrendsReturnContext = {
        range: trend.range,
        drillGroupId: null,
        drillIncomeSourceId: activeDrillIncomeSourceId,
        drillIncomeLineLabel: lineLabel,
      };
      setTrendsReturnContext(ctx);
      clearBudgetReturnContext();
      const q = new URLSearchParams({
        rangeFrom: trend.startMonthKey,
        rangeTo: trend.endMonthKey,
        incomeSource: String(sourceId),
        incomeLine: lineLabel,
      });
      navigate(`/transactions?${q.toString()}`, {
        state: { trendsReturn: ctx },
      });
    },
    [navigate]
  );

  const vsRows = useMemo(
    () => (data ? buildVsRows(data.months) : []),
    [data]
  );
  const groupStackRows = useMemo(
    () => (data ? buildGroupStackRows(data.months, data.groups) : []),
    [data]
  );
  const drillMeta = useMemo(() => {
    if (!data || drillGroupId == null) return null;
    const g = data.groups.find((x) => x.id === drillGroupId);
    if (!g) return null;
    const rows = buildCategoryStackRowsForGroup(data.months, drillGroupId);
    const keys = categoryKeysFromGroupRows(rows);
    const catById = new Map<
      number,
      { name: string; color: string }
    >();
    for (const m of data.months) {
      for (const c of m.byCategory) {
        if (c.groupId === drillGroupId && !catById.has(c.categoryId)) {
          catById.set(c.categoryId, { name: c.name, color: c.color });
        }
      }
    }
    return { groupName: g.name, rows, keys, catById };
  }, [data, drillGroupId]);

  const incomeStackRows = useMemo(
    () => (data ? buildIncomeStackRows(data.months, data.incomeSources) : []),
    [data]
  );

  const incomeDrillMeta = useMemo(() => {
    if (!data || drillIncomeSourceId == null) return null;
    const src = data.incomeSources.find((x) => x.id === drillIncomeSourceId);
    if (!src) return null;
    const { rows, lineLabels } = buildIncomeLineStackRowsForSource(
      data.months,
      drillIncomeSourceId
    );
    return { sourceName: src.name, rows, lineLabels };
  }, [data, drillIncomeSourceId]);

  const netRows = useMemo(
    () =>
      data
        ? data.months.map((m) => ({
            monthKey: m.monthKey,
            label: m.label,
            netCents: m.netCents,
          }))
        : [],
    [data]
  );

  const topBarMax = useMemo(() => {
    if (!data?.topCategories.length) return 1;
    return Math.max(...data.topCategories.map((t) => t.totalCents), 1);
  }, [data]);

  const showCharts = data?.hasTrendsData;
  // One month of activity is the point of the "Last month" range, not a gap in
  // the data, so the import nudge stays out of its way.
  const showSparseCallout =
    !!data && data.hasTrendsData && data.monthsWithActivity < 2 && range !== '1m';

  return (
    <div className="trends-page">
      <header className="trends-page__header">
        <h1 className="trends-page__title">Trends</h1>
        <p className="trends-page__subtitle">
          Your spending and income across time
        </p>
        <div className="trends-page__pills" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={
                opt.value === range
                  ? 'trends-page__pill trends-page__pill--active'
                  : 'trends-page__pill'
              }
              onClick={() => {
                setDrillGroupId(null);
                setDrillIncomeSourceId(null);
                setRange(opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="trends-page__error" role="alert">
          {error}
        </div>
      )}

      {loading && !data && !error && (
        <div className="trends-page__charts" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="trends-chart-card">
              <div className="trends-chart-card__skeleton trends-chart-card__skeleton--tall" />
            </div>
          ))}
        </div>
      )}

      {!loading && data && !data.hasTrendsData && (
        <div className="trends-page__empty">
          <p className="trends-page__empty-text">
            No spending data yet. Import a CSV from Monarch to see your trends.
          </p>
          <Button type="button" onClick={() => navigate('/import')}>
            Import CSV
          </Button>
        </div>
      )}

      {showSparseCallout && (
        <div className="trends-page__callout">
          You have data for {data.monthsWithActivity} month
          {data.monthsWithActivity === 1 ? '' : 's'}. Trends become more useful
          as you import more data — try importing earlier CSVs from Monarch.
        </div>
      )}

      {showCharts && (
        <div className="trends-page__charts">
          <section className="trends-chart-card">
            <h2 className="trends-chart-card__heading">Spending vs. budget</h2>
            <p className="trends-chart-card__desc">
              Total monthly spending compared to your budget
            </p>
            {loading || !data ? (
              <div className="trends-chart-card__skeleton" aria-hidden />
            ) : (
              <>
                <div className="trends-chart-card__legend-inline">
                  <span className="trends-legend-item">
                    <span
                      className="trends-legend-swatch trends-legend-swatch--muted"
                      aria-hidden
                    />
                    Budget
                  </span>
                  <span className="trends-legend-item">
                    <span
                      className="trends-legend-swatch trends-legend-swatch--accent"
                      aria-hidden
                    />
                    Actual (green under budget, red over)
                  </span>
                </div>
                <div className={plotClass(data.months.length)}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      maxBarSize={MAX_BAR_SIZE}
                      data={vsRows}
                      margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                      barGap={4}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        vertical={false}
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="monthKey"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={(props) => (
                          <ClickableMonthTick
                            {...props}
                            months={data.months}
                            onMonthClick={goBudgetMonth}
                            monthNotes={monthNotes}
                          />
                        )}
                        height={36}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          formatCurrency(Math.round(Number(v)))
                        }
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        content={(props) => (
                          <VsBudgetTooltip
                            {...props}
                            months={data.months}
                            monthNotes={monthNotes}
                          />
                        )}
                      />
                      <Bar
                        dataKey="budgetCents"
                        name="Budget"
                        fill="var(--text-tertiary)"
                        fillOpacity={0.35}
                        radius={[4, 4, 0, 0]}
                        animationDuration={400}
                      />
                      <Bar
                        dataKey="actualCents"
                        name="Actual"
                        radius={[4, 4, 0, 0]}
                        animationDuration={400}
                      >
                        {vsRows.map((entry, i) => (
                          <Cell
                            key={entry.monthKey}
                            fill={
                              entry.actualCents <= entry.budgetCents
                                ? 'var(--accent)'
                                : 'var(--danger)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>

          <section
            ref={categorySectionRef}
            id="trends-category-section"
            className="trends-chart-card trends-page__category-section"
          >
            {drillMeta ? (
              <>
                <button
                  type="button"
                  className="trends-page__back"
                  onClick={() => setDrillGroupId(null)}
                >
                  ← Back to all categories
                </button>
                <h2 className="trends-chart-card__heading">
                  {drillMeta.groupName}
                </h2>
                <p className="trends-chart-card__desc">
                  Spending by category within this group. Click a segment to
                  open those transactions for this date range.
                </p>
              </>
            ) : (
              <>
                <h2 className="trends-chart-card__heading">
                  Spending by category
                </h2>
                <p className="trends-chart-card__desc">
                  How your spending breaks down across categories each month
                </p>
              </>
            )}
            {loading || !data ? (
              <div className="trends-chart-card__skeleton" aria-hidden />
            ) : drillMeta ? (
              <>
                <div className={plotClass(data.months.length)}>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      maxBarSize={MAX_BAR_SIZE}
                      data={drillMeta.rows}
                      margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        vertical={false}
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="monthKey"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={(props) => (
                          <ClickableMonthTick
                            {...props}
                            months={data.months}
                            onMonthClick={goBudgetMonth}
                            monthNotes={monthNotes}
                          />
                        )}
                        height={36}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          formatCurrency(Math.round(Number(v)))
                        }
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        content={(props) => (
                          <StackSliceTooltip {...props} monthNotes={monthNotes} />
                        )}
                        shared={false}
                      />
                      {drillMeta.keys.map((key, keyIdx) => {
                        const id = Number(key.slice(2));
                        const meta = drillMeta.catById.get(id);
                        const fill = meta
                          ? categoryShade(
                              meta.color,
                              keyIdx,
                              drillMeta.keys.length
                            )
                          : 'var(--text-tertiary)';
                        const name = meta?.name ?? key;
                        return (
                          <Bar
                            key={key}
                            dataKey={key}
                            name={name}
                            stackId="a"
                            fill={fill}
                            radius={[0, 0, 0, 0]}
                            animationDuration={400}
                            cursor="pointer"
                            onClick={() => {
                              if (data) {
                                goTransactionsCategory(
                                  id,
                                  data,
                                  drillGroupId
                                );
                              }
                            }}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="trends-chart-card__legend-below">
                  {drillMeta.keys.map((key, keyIdx) => {
                    const id = Number(key.slice(2));
                    const meta = drillMeta.catById.get(id);
                    if (!meta) return null;
                    return (
                      <span key={key} className="trends-legend-item">
                        <span
                          className="trends-legend-swatch"
                          style={{
                            background: categoryShade(
                              meta.color,
                              keyIdx,
                              drillMeta.keys.length
                            ),
                          }}
                          aria-hidden
                        />
                        {meta.name}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className={plotClass(data.months.length)}>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      maxBarSize={MAX_BAR_SIZE}
                      data={groupStackRows}
                      margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        vertical={false}
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="monthKey"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={(props) => (
                          <ClickableMonthTick
                            {...props}
                            months={data.months}
                            onMonthClick={goBudgetMonth}
                            monthNotes={monthNotes}
                          />
                        )}
                        height={36}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          formatCurrency(Math.round(Number(v)))
                        }
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        content={(props) => (
                          <StackSliceTooltip {...props} monthNotes={monthNotes} />
                        )}
                        shared={false}
                      />
                      {data.groups.map((g) => (
                        <Bar
                          key={g.id}
                          dataKey={`g_${g.id}`}
                          name={g.name}
                          stackId="a"
                          fill={g.color}
                          animationDuration={400}
                          cursor="pointer"
                          onClick={() => {
                            setDrillIncomeSourceId(null);
                            setDrillGroupId(g.id);
                          }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="trends-chart-card__legend-below">
                  {data.groups.map((g) => (
                    <span key={g.id} className="trends-legend-item">
                      <span
                        className="trends-legend-swatch"
                        style={{ background: g.color }}
                        aria-hidden
                      />
                      {g.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section
            ref={incomeSectionRef}
            id="trends-income-section"
            className="trends-chart-card trends-page__income-section"
          >
            {incomeDrillMeta ? (
              <>
                <button
                  type="button"
                  className="trends-page__back"
                  onClick={() => setDrillIncomeSourceId(null)}
                >
                  ← Back to all sources
                </button>
                <h2 className="trends-chart-card__heading">
                  {incomeDrillMeta.sourceName}
                </h2>
                <p className="trends-chart-card__desc">
                  Income by description within this source. Click a segment to
                  open those transactions for this date range.
                </p>
              </>
            ) : (
              <>
                <h2 className="trends-chart-card__heading">Income</h2>
                <p className="trends-chart-card__desc">
                  Monthly income, broken down by source
                </p>
              </>
            )}
            {loading || !data ? (
              <div className="trends-chart-card__skeleton" aria-hidden />
            ) : incomeDrillMeta ? (
              incomeDrillMeta.lineLabels.length === 0 ? (
                <p className="trends-chart-card__desc trends-chart-card__desc--only">
                  No description buckets for this source in this range. If you
                  just updated the app, fully quit and reopen so the Trends data
                  includes income lines.
                </p>
              ) : (
                <>
                  <div className={plotClass(data.months.length)}>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        maxBarSize={MAX_BAR_SIZE}
                        data={incomeDrillMeta.rows}
                        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          dataKey="monthKey"
                          tickLine={false}
                          axisLine={{ stroke: 'var(--border)' }}
                          tick={(props) => (
                            <ClickableMonthTick
                              {...props}
                              months={data.months}
                              onMonthClick={goBudgetMonth}
                              monthNotes={monthNotes}
                            />
                          )}
                          height={36}
                        />
                        <YAxis
                          tickFormatter={(v) =>
                            formatCurrency(Math.round(Number(v)))
                          }
                          tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                        />
                        <Tooltip
                          content={(props) => (
                            <StackSliceTooltip {...props} monthNotes={monthNotes} />
                          )}
                          shared={false}
                        />
                        {incomeDrillMeta.lineLabels.map((label, i) => (
                          <Bar
                            key={`il_${i}_${label}`}
                            dataKey={`il_${i}`}
                            name={label}
                            stackId="incDrill"
                            fill={INCOME_FILL[i % INCOME_FILL.length]}
                            radius={[0, 0, 0, 0]}
                            animationDuration={400}
                            cursor="pointer"
                            onClick={() => {
                              if (data && drillIncomeSourceId != null) {
                                goTransactionsIncome(
                                  data,
                                  drillIncomeSourceId,
                                  label,
                                  drillIncomeSourceId
                                );
                              }
                            }}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="trends-chart-card__legend-below">
                    {incomeDrillMeta.lineLabels.map((label, i) => (
                      <span
                        key={`leg_${i}_${label}`}
                        className="trends-legend-item"
                      >
                        <span
                          className="trends-legend-swatch"
                          style={{
                            background: INCOME_FILL[i % INCOME_FILL.length],
                          }}
                          aria-hidden
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )
            ) : (
              <>
                <div className={plotClass(data.months.length)}>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      maxBarSize={MAX_BAR_SIZE}
                      data={incomeStackRows}
                      margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        vertical={false}
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="monthKey"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={(props) => (
                          <ClickableMonthTick
                            {...props}
                            months={data.months}
                            onMonthClick={goBudgetMonth}
                            monthNotes={monthNotes}
                          />
                        )}
                        height={36}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          formatCurrency(Math.round(Number(v)))
                        }
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        content={(props) => (
                          <StackSliceTooltip {...props} monthNotes={monthNotes} />
                        )}
                        shared={false}
                      />
                      {data.incomeSources.map((s) => (
                        <Bar
                          key={s.id}
                          dataKey={`i_${s.id}`}
                          name={s.name}
                          stackId="inc"
                          fill={incomeFill(s.id, data.incomeSources)}
                          radius={[0, 0, 0, 0]}
                          animationDuration={400}
                          cursor="pointer"
                          onClick={() => {
                            setDrillGroupId(null);
                            setDrillIncomeSourceId(s.id);
                          }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="trends-chart-card__legend-below">
                  {data.incomeSources.map((s) => (
                    <span key={s.id} className="trends-legend-item">
                      <span
                        className="trends-legend-swatch"
                        style={{
                          background: incomeFill(s.id, data.incomeSources),
                        }}
                        aria-hidden
                      />
                      {s.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="trends-chart-card">
            <h2 className="trends-chart-card__heading">Where your money went</h2>
            <p className="trends-chart-card__desc">
              Top categories by spending across the selected time range
            </p>
            {loading || !data ? (
              <div className="trends-chart-card__skeleton" aria-hidden />
            ) : data.topCategories.length === 0 ? (
              <p className="trends-chart-card__desc trends-chart-card__desc--only">
                No category spending in this range.
              </p>
            ) : (
              <div className="trends-top5">
                {data.topCategories.map((t) => (
                  <button
                    key={t.categoryId}
                    type="button"
                    className="trends-top5__row"
                    onClick={() =>
                      goTransactionsCategory(t.categoryId, data, null)
                    }
                  >
                    <span className="trends-top5__name">{t.name}</span>
                    <span className="trends-top5__bar-wrap">
                      <span
                        className="trends-top5__bar"
                        style={{
                          width: `${(t.totalCents / topBarMax) * 100}%`,
                          background: t.color,
                        }}
                      />
                    </span>
                    <span className="trends-top5__amt">
                      {formatCurrency(t.totalCents)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="trends-chart-card">
            <h2 className="trends-chart-card__heading">Net per month</h2>
            <p className="trends-chart-card__desc">
              Income minus expenses — positive months build savings, negative
              months draw from them
            </p>
            {loading || !data ? (
              <div className="trends-chart-card__skeleton" aria-hidden />
            ) : (
              <div className={plotClass(data.months.length)}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    maxBarSize={MAX_BAR_SIZE}
                    data={netRows}
                    margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      vertical={false}
                      strokeDasharray="3 3"
                    />
                    <ReferenceLine
                      y={0}
                      stroke="var(--text-secondary)"
                      strokeWidth={1.5}
                    />
                    <XAxis
                      dataKey="monthKey"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      tick={(props) => (
                        <ClickableMonthTick
                          {...props}
                          months={data.months}
                          onMonthClick={goBudgetMonth}
                          monthNotes={monthNotes}
                        />
                      )}
                      height={36}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        formatCurrency(Math.round(Number(v)))
                      }
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      content={(props) => (
                        <NetTooltip
                          {...props}
                          months={data.months}
                          monthNotes={monthNotes}
                        />
                      )}
                    />
                    <Bar
                      dataKey="netCents"
                      name="Net"
                      radius={[4, 4, 0, 0]}
                      animationDuration={400}
                    >
                      {netRows.map((e) => (
                        <Cell
                          key={e.monthKey}
                          fill={
                            e.netCents >= 0 ? 'var(--accent)' : 'var(--danger)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
