import type { TrendRange } from '../../ipc-contract';

export const TRENDS_RETURN_STORAGE_KEY = 'spend-app:return-to-trends';

const VALID_RANGE = new Set<TrendRange>(['3m', '6m', '12m', 'ytd', 'all']);

/** Serialized when opening Transactions from Trends so we can restore range + drill and show “Back to Trends”. */
export interface TrendsReturnContext {
  range: TrendRange;
  drillGroupId: number | null;
  drillIncomeSourceId: number | null;
  drillIncomeLineLabel: string | null;
}

export function setTrendsReturnContext(ctx: TrendsReturnContext): void {
  try {
    sessionStorage.setItem(TRENDS_RETURN_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* private mode */
  }
}

export function readTrendsReturnContext(): TrendsReturnContext | null {
  try {
    const raw = sessionStorage.getItem(TRENDS_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TrendsReturnContext>;
    if (!v || typeof v.range !== 'string' || !VALID_RANGE.has(v.range as TrendRange)) {
      return null;
    }
    const drillGroupId =
      v.drillGroupId == null
        ? null
        : typeof v.drillGroupId === 'number' && Number.isFinite(v.drillGroupId)
          ? v.drillGroupId
          : null;
    const drillIncomeSourceId =
      v.drillIncomeSourceId == null
        ? null
        : typeof v.drillIncomeSourceId === 'number' &&
            Number.isFinite(v.drillIncomeSourceId)
          ? v.drillIncomeSourceId
          : null;
    const drillIncomeLineLabel =
      v.drillIncomeLineLabel == null
        ? null
        : typeof v.drillIncomeLineLabel === 'string'
          ? v.drillIncomeLineLabel
          : null;
    return {
      range: v.range as TrendRange,
      drillGroupId,
      drillIncomeSourceId,
      drillIncomeLineLabel,
    };
  } catch {
    return null;
  }
}

export function clearTrendsReturnContext(): void {
  try {
    sessionStorage.removeItem(TRENDS_RETURN_STORAGE_KEY);
  } catch {
    /* */
  }
}
