/**
 * The finance demo's model: plain functions over plain data, with no React and no storage, so the rules can be tested alone and the demo cannot touch
 * anything outside itself. The behaviour reproduced is the one Spendly's own documentation describes: transactions with a type, a category and a date;
 * search, filter by type, category and date, sort and paginate; monthly budgets with a warning from 80 % of the limit and an over-budget state.
 * Everything is invented sample data in one currency; money is whole cents, never a float.
 */

export const CATEGORY_IDS = ['housing', 'food', 'transport', 'shopping', 'entertainment', 'health', 'bills', 'travel', 'salary', 'other'] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]
export type TransactionType = 'income' | 'expense'

/** The only income category of the ten defaults is Salary; the others are expense categories. */
export const INCOME_CATEGORIES: readonly CategoryId[] = ['salary']
export const EXPENSE_CATEGORIES: readonly CategoryId[] = CATEGORY_IDS.filter((id) => !INCOME_CATEGORIES.includes(id))

/** The two invented months the sample covers, and the month the budgets are for. */
export const PERIOD = { from: '2026-09-01', to: '2026-10-31', budgetMonth: '2026-10' } as const

export const MAX_CENTS = 100_000_000
export const DESCRIPTION_MAX = 60
export const PAGE_SIZE = 8

/** The keys of the sample descriptions (content/demos/finance.ts `samples`): the model holds the key, the page's language gives the words. */
export type SampleKey =
  | 'salary' | 'rent' | 'groceries' | 'transit' | 'electricity' | 'cinema' | 'bakery' | 'pharmacy' | 'shoes' | 'rail' | 'internet'
  | 'concert' | 'fish' | 'books' | 'taxi' | 'boardGames' | 'jacket' | 'dentist' | 'gift'

export interface Transaction {
  id: number
  /** `YYYY-MM-DD`. */
  date: string
  type: TransactionType
  category: CategoryId
  description: string
  cents: number
}

/** Fixed sample limits for the budget month, in cents. A category without a limit has no budget row. */
export const BUDGETS: Readonly<Partial<Record<CategoryId, number>>> = {
  housing: 72_000,
  food: 36_000,
  transport: 12_000,
  shopping: 15_000,
  entertainment: 8_000,
}

/** A transaction of the sample before its description has been put into words. */
export interface SampleTransaction extends Omit<Transaction, 'description'> {
  sample: SampleKey
}

const sample = (id: number, date: string, type: TransactionType, category: CategoryId, key: SampleKey, euros: number): SampleTransaction => ({
  id,
  date,
  type,
  category,
  sample: key,
  cents: Math.round(euros * 100),
})

/** Invented merchants and amounts. Nothing here is a real person, shop or figure. */
export const SAMPLE_TRANSACTIONS: readonly SampleTransaction[] = [
  sample(1, '2026-09-01', 'income', 'salary', 'salary', 2400),
  sample(2, '2026-09-02', 'expense', 'housing', 'rent', 700),
  sample(3, '2026-09-04', 'expense', 'food', 'groceries', 64.8),
  sample(4, '2026-09-06', 'expense', 'transport', 'transit', 45),
  sample(5, '2026-09-09', 'expense', 'bills', 'electricity', 52.4),
  sample(6, '2026-09-12', 'expense', 'entertainment', 'cinema', 18),
  sample(7, '2026-09-15', 'expense', 'food', 'bakery', 12.6),
  sample(8, '2026-09-18', 'expense', 'health', 'pharmacy', 23.9),
  sample(9, '2026-09-21', 'expense', 'shopping', 'shoes', 89),
  sample(10, '2026-09-25', 'expense', 'food', 'groceries', 71.2),
  sample(11, '2026-09-28', 'expense', 'travel', 'rail', 96),
  sample(12, '2026-10-01', 'income', 'salary', 'salary', 2400),
  sample(13, '2026-10-02', 'expense', 'housing', 'rent', 700),
  sample(14, '2026-10-03', 'expense', 'food', 'groceries', 82.3),
  sample(15, '2026-10-05', 'expense', 'transport', 'transit', 45),
  sample(16, '2026-10-07', 'expense', 'bills', 'internet', 38.5),
  sample(17, '2026-10-08', 'expense', 'entertainment', 'concert', 42),
  sample(18, '2026-10-10', 'expense', 'food', 'fish', 27.4),
  sample(19, '2026-10-12', 'expense', 'shopping', 'books', 34.5),
  sample(20, '2026-10-14', 'expense', 'food', 'bakery', 9.8),
  sample(21, '2026-10-16', 'expense', 'transport', 'taxi', 21.5),
  sample(22, '2026-10-19', 'expense', 'entertainment', 'boardGames', 27.5),
  sample(23, '2026-10-21', 'expense', 'food', 'groceries', 93.1),
  sample(24, '2026-10-24', 'expense', 'shopping', 'jacket', 118),
  sample(25, '2026-10-27', 'expense', 'health', 'dentist', 60),
  sample(26, '2026-10-29', 'expense', 'other', 'gift', 35),
]

// ── Parsing and validating what a visitor types ─────────────────────────────

export type FieldError = 'required' | 'invalid' | 'notPositive' | 'tooLarge' | 'tooManyDecimals' | 'tooLong' | 'outOfRange' | 'mismatch'

/**
 * An amount as typed: digits with an optional decimal part, written with a dot or a comma ("12", "12.5", "12,50"). No sign, no thousands separator, no
 * exponent, no currency sign, at most two decimals. Returns whole cents, or the reason it was refused.
 */
export function parseAmount(text: string): { ok: true; cents: number } | { ok: false; error: FieldError } {
  const typed = text.trim()
  if (typed === '') return { ok: false, error: 'required' }
  if (!/^\d+([.,]\d*)?$/.test(typed)) return { ok: false, error: typed.startsWith('-') ? 'notPositive' : 'invalid' }
  const [whole, fraction = ''] = typed.replace(',', '.').split('.')
  if (fraction.length > 2) return { ok: false, error: 'tooManyDecimals' }
  if (whole.length > 9) return { ok: false, error: 'tooLarge' }
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0) return { ok: false, error: 'notPositive' }
  if (cents > MAX_CENTS) return { ok: false, error: 'tooLarge' }
  return { ok: true, cents }
}

const isDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export interface TransactionInput {
  type: string
  category: string
  date: string
  amount: string
  description: string
}

export type TransactionField = keyof TransactionInput
export type TransactionResult =
  | { ok: true; value: Omit<Transaction, 'id'> }
  | { ok: false; errors: Partial<Record<TransactionField, FieldError>> }

/** Checks everything the form sends. Every problem is reported, so the form can mark every field at once. */
export function validateTransaction(input: TransactionInput): TransactionResult {
  const errors: Partial<Record<TransactionField, FieldError>> = {}
  const type = input.type === 'income' || input.type === 'expense' ? input.type : null
  if (!type) errors.type = input.type === '' ? 'required' : 'invalid'

  const category = (CATEGORY_IDS as readonly string[]).includes(input.category) ? (input.category as CategoryId) : null
  if (!category) errors.category = input.category === '' ? 'required' : 'invalid'
  else if (type) {
    const allowed = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    if (!allowed.includes(category)) errors.category = 'mismatch'
  }

  const date = input.date.trim()
  if (date === '') errors.date = 'required'
  else if (!isDay(date)) errors.date = 'invalid'
  else if (date < PERIOD.from || date > PERIOD.to) errors.date = 'outOfRange'

  const amount = parseAmount(input.amount)
  if (!amount.ok) errors.amount = amount.error

  const description = input.description.replace(/\s+/g, ' ').trim()
  if (description === '') errors.description = 'required'
  else if ([...description].length > DESCRIPTION_MAX) errors.description = 'tooLong'

  if (Object.keys(errors).length > 0 || !type || !category || !amount.ok) return { ok: false, errors }
  return { ok: true, value: { date, type, category, description, cents: amount.cents } }
}

// ── The list: filter, search, sort, paginate ────────────────────────────────

export interface Filters {
  type: 'all' | TransactionType
  category: 'all' | CategoryId
  from: string
  to: string
  search: string
}

export const NO_FILTERS: Filters = { type: 'all', category: 'all', from: '', to: '', search: '' }

export type SortKey = 'date' | 'category' | 'amount'
export interface Sort {
  key: SortKey
  direction: 'asc' | 'desc'
}

export const DEFAULT_SORT: Sort = { key: 'date', direction: 'desc' }

export function applyFilters(transactions: readonly Transaction[], filters: Filters): Transaction[] {
  const needle = filters.search.trim().toLowerCase()
  return transactions.filter((tx) => {
    if (filters.type !== 'all' && tx.type !== filters.type) return false
    if (filters.category !== 'all' && tx.category !== filters.category) return false
    if (filters.from !== '' && tx.date < filters.from) return false
    if (filters.to !== '' && tx.date > filters.to) return false
    if (needle !== '' && !tx.description.toLowerCase().includes(needle)) return false
    return true
  })
}

/** A new sorted copy. Ties fall back to the date and then the id, so the order is always the same for the same data. */
export function sortTransactions(transactions: readonly Transaction[], sort: Sort): Transaction[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const compare = (a: Transaction, b: Transaction): number => {
    if (sort.key === 'amount') return a.cents - b.cents
    if (sort.key === 'category') return a.category < b.category ? -1 : a.category > b.category ? 1 : 0
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  }
  return [...transactions].sort((a, b) => sign * compare(a, b) || sign * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || sign * (a.id - b.id))
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

export function pageOf<T>(items: readonly T[], page: number): T[] {
  const index = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(items.length)) - 1
  return items.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE)
}

// ── Money in the month ──────────────────────────────────────────────────────

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export interface Summary {
  income: number
  expense: number
  balance: number
}

export function summarise(transactions: readonly Transaction[], month: string): Summary {
  let income = 0
  let expense = 0
  for (const tx of transactions) {
    if (monthOf(tx.date) !== month) continue
    if (tx.type === 'income') income += tx.cents
    else expense += tx.cents
  }
  return { income, expense, balance: income - expense }
}

/** Expense per category in the month, largest first (ties by category id), only categories with spending. */
export function spendingByCategory(transactions: readonly Transaction[], month: string): Array<{ category: CategoryId; cents: number }> {
  const totals = new Map<CategoryId, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || monthOf(tx.date) !== month) continue
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.cents)
  }
  return [...totals.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents || (a.category < b.category ? -1 : 1))
}

export type BudgetState = 'ok' | 'warning' | 'over'

export interface BudgetRow {
  category: CategoryId
  limit: number
  spent: number
  remaining: number
  /** Whole percent of the limit, not capped: 130 means 30 % over. */
  percent: number
  state: BudgetState
}

/** A warning from 80 % of the limit (inclusive), over budget past 100 %: the states Spendly's own documentation names. */
export function budgetState(spent: number, limit: number): BudgetState {
  if (limit <= 0) return 'ok'
  if (spent > limit) return 'over'
  return spent * 100 >= limit * 80 ? 'warning' : 'ok'
}

export function budgetRows(transactions: readonly Transaction[], month: string, budgets: Readonly<Partial<Record<CategoryId, number>>> = BUDGETS): BudgetRow[] {
  const spentBy = new Map(spendingByCategory(transactions, month).map((row) => [row.category, row.cents]))
  return CATEGORY_IDS.flatMap((category) => {
    const limit = budgets[category]
    if (limit === undefined) return []
    const spent = spentBy.get(category) ?? 0
    return [{ category, limit, spent, remaining: limit - spent, percent: Math.round((spent / limit) * 100), state: budgetState(spent, limit) }]
  })
}

// ── The demo's state ────────────────────────────────────────────────────────

export interface State {
  transactions: Transaction[]
  nextId: number
  filters: Filters
  sort: Sort
  page: number
}

/** The sample, with each description put into words by `describe` (the page's language). */
export const initialState = (describe: (key: SampleKey) => string): State => ({
  transactions: SAMPLE_TRANSACTIONS.map(({ sample: key, ...tx }) => ({ ...tx, description: describe(key) })),
  nextId: SAMPLE_TRANSACTIONS.length + 1,
  filters: { ...NO_FILTERS },
  sort: { ...DEFAULT_SORT },
  page: 1,
})

export type Action =
  | { type: 'add'; value: Omit<Transaction, 'id'> }
  | { type: 'remove'; id: number }
  | { type: 'filter'; patch: Partial<Filters> }
  | { type: 'resetFilters' }
  | { type: 'sort'; key: SortKey }
  | { type: 'page'; page: number }

/** The state's only way to change. Pure: the same state and action always give the same next state. */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'add':
      return { ...state, transactions: [...state.transactions, { ...action.value, id: state.nextId }], nextId: state.nextId + 1, page: 1 }
    case 'remove':
      return { ...state, transactions: state.transactions.filter((tx) => tx.id !== action.id) }
    case 'filter':
      return { ...state, filters: { ...state.filters, ...action.patch }, page: 1 }
    case 'resetFilters':
      return { ...state, filters: { ...NO_FILTERS }, sort: { ...DEFAULT_SORT }, page: 1 }
    case 'sort':
      return {
        ...state,
        sort: state.sort.key === action.key ? { key: action.key, direction: state.sort.direction === 'asc' ? 'desc' : 'asc' } : { key: action.key, direction: action.key === 'category' ? 'asc' : 'desc' },
        page: 1,
      }
    case 'page':
      return { ...state, page: Math.min(Math.max(1, Math.trunc(action.page) || 1), pageCount(applyFilters(state.transactions, state.filters).length)) }
  }
}

/** What the list shows: filtered, sorted, and the page asked for (clamped into range). */
export function visibleRows(state: State): { rows: Transaction[]; total: number; page: number; pages: number } {
  const all = sortTransactions(applyFilters(state.transactions, state.filters), state.sort)
  const pages = pageCount(all.length)
  const page = Math.min(Math.max(1, state.page), pages)
  return { rows: pageOf(all, page), total: all.length, page, pages }
}
