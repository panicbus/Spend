/** Preset CSV import format profiles (shared by main process and renderer). */

export type AmountMode =
  | { type: 'single'; column: string; expenseSign: 'negative' | 'positive' }
  | { type: 'split'; debitColumn: string; creditColumn: string };

export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'M/D/YYYY';

export interface CSVProfile {
  id: string;
  name: string;
  description: string;
  dateColumn: string;
  dateFormat: DateFormat;
  merchantColumn: string;
  amountMode: AmountMode;
  categoryColumn?: string;
  /** Parent grouping for `categoryColumn`, when the export carries one (YNAB). */
  categoryGroupColumn?: string;
  notesColumn?: string;
  accountColumn?: string;
  /** Description / statement column used for import hash dedup when present. */
  statementColumn?: string;
  skipColumns?: string[];
  headerRowIndex?: number;
  encoding?: string;
}

/** User-defined column mapping for the generic / Other profile. */
export interface GenericColumnMapping {
  dateColumn: string;
  dateFormat: DateFormat;
  merchantColumn: string;
  amountMode: AmountMode;
  categoryColumn?: string;
  categoryGroupColumn?: string;
  notesColumn?: string;
  accountColumn?: string;
  statementColumn?: string;
  headerRowIndex?: number;
}

export const GENERIC_PROFILE_ID = 'generic';

export const CSV_PROFILES: CSVProfile[] = [
  {
    id: 'monarch',
    name: 'Monarch Money',
    description: 'Exported from Monarch Money',
    dateColumn: 'Date',
    dateFormat: 'YYYY-MM-DD',
    merchantColumn: 'Merchant',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    notesColumn: 'Notes',
    accountColumn: 'Account',
    statementColumn: 'Original Statement',
  },
  {
    id: 'chase_checking',
    name: 'Chase (Checking/Savings)',
    description: 'Chase checking or savings CSV export',
    dateColumn: 'Posting Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
  },
  {
    id: 'chase_credit',
    name: 'Chase (Credit Card)',
    description: 'Chase credit card CSV export',
    dateColumn: 'Transaction Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
  },
  {
    id: 'bofa',
    name: 'Bank of America',
    description: 'Bank of America account CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
  },
  {
    id: 'wells_fargo',
    name: 'Wells Fargo',
    description: 'Wells Fargo account CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
  },
  {
    id: 'capital_one',
    name: 'Capital One',
    description: 'Capital One card CSV export',
    dateColumn: 'Transaction Date',
    dateFormat: 'YYYY-MM-DD',
    merchantColumn: 'Description',
    amountMode: { type: 'split', debitColumn: 'Debit', creditColumn: 'Credit' },
    categoryColumn: 'Category',
  },
  {
    id: 'apple_card',
    name: 'Apple Card',
    description: 'Apple Card CSV export',
    dateColumn: 'Transaction Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Merchant',
    amountMode: {
      type: 'single',
      column: 'Amount (Purchase/Payment)',
      expenseSign: 'positive',
    },
    categoryColumn: 'Category',
  },
  {
    id: 'ynab',
    name: 'YNAB (You Need A Budget)',
    description: 'YNAB transaction export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Payee',
    amountMode: { type: 'split', debitColumn: 'Outflow', creditColumn: 'Inflow' },
    categoryColumn: 'Category',
    categoryGroupColumn: 'Category Group',
    notesColumn: 'Memo',
    accountColumn: 'Account',
  },
  {
    id: 'rocket_money',
    name: 'Rocket Money',
    description: 'Exported from Rocket Money',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Merchant/Payee',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    notesColumn: 'Note',
    accountColumn: 'Account',
  },
  {
    id: 'quicken',
    name: 'Quicken (Desktop)',
    description: 'Quicken desktop CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Payee',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    accountColumn: 'Account',
    notesColumn: 'Memo',
    skipColumns: ['FI Payee', 'Debit/Credit'],
  },
  {
    id: 'quicken_simplifi',
    name: 'Quicken Simplifi',
    description: 'Quicken Simplifi CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Payee',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    notesColumn: 'Notes',
  },
  {
    id: 'copilot',
    name: 'Copilot Money',
    description: 'Exported from Copilot Money',
    dateColumn: 'Date',
    dateFormat: 'YYYY-MM-DD',
    merchantColumn: 'Name',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    accountColumn: 'Account',
    notesColumn: 'Note',
  },
  {
    id: 'mint',
    name: 'Mint (legacy export)',
    description: 'Legacy Mint CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'negative' },
    categoryColumn: 'Category',
    accountColumn: 'Account Name',
    notesColumn: 'Notes',
  },
  {
    id: 'citi',
    name: 'Citi (Credit Card)',
    description: 'Citi credit card CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'split', debitColumn: 'Debit', creditColumn: 'Credit' },
  },
  {
    id: 'discover',
    name: 'Discover',
    description: 'Discover card CSV export',
    dateColumn: 'Trans. Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'positive' },
    categoryColumn: 'Category',
  },
  {
    id: 'amex',
    name: 'American Express',
    description: 'American Express CSV export',
    dateColumn: 'Date',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: 'Description',
    amountMode: { type: 'single', column: 'Amount', expenseSign: 'positive' },
    categoryColumn: 'Category',
    skipColumns: [
      'Extended Details',
      'Appears On Your Statement As',
      'Address',
      'City/State',
      'Zip Code',
      'Country',
      'Reference',
    ],
  },
  {
    id: GENERIC_PROFILE_ID,
    name: 'Other / Generic CSV',
    description: 'Map columns manually for any bank CSV',
    dateColumn: '',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: '',
    amountMode: { type: 'single', column: '', expenseSign: 'negative' },
  },
];

export const DEFAULT_IMPORT_PROFILE_ID = 'monarch';

/** Budget / finance app exports (alphabetical by name). */
const IMPORT_APP_PROFILE_IDS = [
  'copilot',
  'mint',
  'monarch',
  'quicken',
  'quicken_simplifi',
  'rocket_money',
  'ynab',
] as const;

/** Bank and card exports (alphabetical by name). */
const IMPORT_BANK_PROFILE_IDS = [
  'amex',
  'apple_card',
  'bofa',
  'capital_one',
  'chase_checking',
  'chase_credit',
  'citi',
  'discover',
  'wells_fargo',
] as const;

/** Profiles for the import format dropdown: apps, banks, then generic last. */
export function importFormatSelectOptions(): CSVProfile[] {
  const groups = importFormatSelectGroups();
  const generic = getCSVProfile(GENERIC_PROFILE_ID);
  return [...groups.flatMap((g) => g.profiles), ...(generic ? [generic] : [])];
}

export function importFormatSelectGroups(): {
  label: string;
  profiles: CSVProfile[];
}[] {
  const byId = new Map(CSV_PROFILES.map((p) => [p.id, p]));
  const pick = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is CSVProfile => p != null);
  return [
    { label: 'Budget & finance apps', profiles: pick(IMPORT_APP_PROFILE_IDS) },
    { label: 'Banks & cards', profiles: pick(IMPORT_BANK_PROFILE_IDS) },
  ];
}

export function getCSVProfile(id: string): CSVProfile | undefined {
  return CSV_PROFILES.find((p) => p.id === id);
}

export function profileToGenericMapping(profile: CSVProfile): GenericColumnMapping {
  return {
    dateColumn: profile.dateColumn,
    dateFormat: profile.dateFormat,
    merchantColumn: profile.merchantColumn,
    amountMode: profile.amountMode,
    categoryColumn: profile.categoryColumn,
    categoryGroupColumn: profile.categoryGroupColumn,
    notesColumn: profile.notesColumn,
    accountColumn: profile.accountColumn,
    statementColumn: profile.statementColumn,
    headerRowIndex: profile.headerRowIndex,
  };
}

/** Resolve preset or generic user mapping into a parse config. */
export function resolveImportMapping(
  profileId: string,
  genericMapping?: GenericColumnMapping | null
): GenericColumnMapping | null {
  if (profileId === GENERIC_PROFILE_ID) {
    return genericMapping ?? null;
  }
  const profile = getCSVProfile(profileId);
  if (!profile) return null;
  return profileToGenericMapping(profile);
}
