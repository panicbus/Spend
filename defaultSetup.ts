/** Default taxonomy for "Start with defaults" in first-run wizard. */
export type DefaultGroupSpec = {
  name: string;
  color: string;
  categories: string[];
};

export const DEFAULT_INCOME_SOURCES = [
  'Salary',
  'Side Income',
  'Other Income',
] as const;

export const DEFAULT_CATEGORY_GROUPS: DefaultGroupSpec[] = [
  {
    name: 'Housing',
    color: '#3A7BD5',
    categories: ['Rent / Mortgage', 'Utilities'],
  },
  {
    name: 'Food & Dining',
    color: '#2D9F75',
    categories: ['Groceries', 'Restaurants & Dining', 'Coffee'],
  },
  {
    name: 'Transportation',
    color: '#E5953E',
    categories: ['Car Payment', 'Gas', 'Transit / Rideshare', 'Auto Insurance'],
  },
  {
    name: 'Health & Wellness',
    color: '#D94F4F',
    categories: ['Medical', 'Fitness', 'Personal Care'],
  },
  {
    name: 'Bills & Subscriptions',
    color: '#6B5CE7',
    categories: ['Phone', 'Internet', 'Streaming & Subscriptions'],
  },
  {
    name: 'Shopping',
    color: '#E76BAC',
    categories: ['Clothing', 'General Shopping'],
  },
  {
    name: 'Entertainment & Lifestyle',
    color: '#9F6B2D',
    categories: ['Entertainment', 'Travel & Vacation', 'Gifts'],
  },
  {
    name: 'Savings',
    color: '#4FBCD9',
    categories: ['Emergency Fund', 'Investments'],
  },
];
