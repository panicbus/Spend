import React, { useEffect, useState } from 'react';
import type { MerchantInsights } from '../../../ipc-contract';
import { api } from '../../services/api';
import { DATA_CHANGED_EVENT } from '../../utils/dataChanged';
import { formatCurrency } from '../../services/formatters';
import { formatMonthLabel } from '../../utils/dates';
import './MerchantInsightsCard.css';

function formatFrequencyLabel(insights: MerchantInsights): string {
  if (insights.transactionCount <= 1) {
    return '1 visit';
  }
  const f = insights.frequencyPerMonth;
  const rounded = Math.abs(f - Math.round(f)) < 0.05 ? Math.round(f) : Number(f.toFixed(1));
  return `~${rounded} times per month`;
}

export function MerchantInsightsCard({ merchantName }: { merchantName: string }) {
  const [insights, setInsights] = useState<MerchantInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener(DATA_CHANGED_EVENT, bump);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setInsights(null);
    void (async () => {
      try {
        const data = await api.getMerchantInsights(merchantName);
        if (!cancelled) setInsights(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantName, refreshKey]);

  if (error) {
    return (
      <div className="merchant-insights merchant-insights--error" role="status">
        <p className="merchant-insights__err">{error}</p>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="merchant-insights merchant-insights--loading" aria-busy="true">
        <p className="merchant-insights__loading">Loading merchant summary…</p>
      </div>
    );
  }

  const maxBar =
    insights.monthlySpending.length > 0
      ? Math.max(...insights.monthlySpending.map((m) => m.totalCents), 1)
      : 1;

  return (
    <section className="merchant-insights" aria-label={`Insights for ${merchantName}`}>
      <h2 className="merchant-insights__title">{merchantName}</h2>
      <div className="merchant-insights__body">
        <div className="merchant-insights__stats">
          <div className="merchant-insights__stat">
            <span className="merchant-insights__stat-label">Total spent</span>
            <span className="merchant-insights__stat-value">
              {formatCurrency(insights.totalCents)}
            </span>
            <span className="merchant-insights__stat-meta">all time</span>
          </div>
          <div className="merchant-insights__stat">
            <span className="merchant-insights__stat-label">Visits</span>
            <span className="merchant-insights__stat-value">
              {insights.transactionCount}
            </span>
          </div>
          <div className="merchant-insights__stat">
            <span className="merchant-insights__stat-label">Avg / visit</span>
            <span className="merchant-insights__stat-value">
              {formatCurrency(insights.averageCents)}
            </span>
          </div>
          <div className="merchant-insights__stat">
            <span className="merchant-insights__stat-label">Frequency</span>
            <span className="merchant-insights__stat-value merchant-insights__stat-value--sm">
              {formatFrequencyLabel(insights)}
            </span>
          </div>
          <div className="merchant-insights__stat merchant-insights__stat--cat">
            <span className="merchant-insights__stat-label">Most common</span>
            <span className="merchant-insights__cat">
              <span
                className="merchant-insights__cat-dot"
                style={{ background: insights.topCategory.groupColor }}
                aria-hidden
              />
              <span className="merchant-insights__stat-value merchant-insights__stat-value--sm">
                {insights.topCategory.name}
                {insights.topCategory.groupName
                  ? ` · ${insights.topCategory.groupName}`
                  : ''}
              </span>
            </span>
          </div>
        </div>
        <div className="merchant-insights__chart" aria-hidden={insights.monthlySpending.length === 0}>
          <div className="merchant-insights__bars">
            {insights.monthlySpending.map((m) => {
              const h =
                m.totalCents > 0 ? Math.max(8, (m.totalCents / maxBar) * 52) : 4;
              const label = formatMonthLabel(m.monthKey);
              return (
                <div key={m.monthKey} className="merchant-insights__bar-wrap">
                  <div
                    className="merchant-insights__bar"
                    style={{ height: `${h}px` }}
                    title={`${label}: ${formatCurrency(m.totalCents)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
