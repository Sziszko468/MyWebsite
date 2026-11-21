import { describe, expect, it } from 'vitest'
import {
  BUDGETS,
  CATEGORY_IDS,
  DEFAULT_SORT,
  DESCRIPTION_MAX,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MAX_CENTS,
  NO_FILTERS,
  PAGE_SIZE,
  PERIOD,
  SAMPLE_TRANSACTIONS,
  applyFilters,
  budgetRows,
  budgetState,
  initialState,
  pageCount,
  parseAmount,
  reduce,
  sortTransactions,
  spendingByCategory,
  summarise,
  validateTransaction,
  visibleRows,
  type State,
  type TransactionInput,
} from './model'

const fresh = (): State => initialState((key) => `sample ${key}`)
const valid: TransactionInput = { type: 'expense', category: 'food', date: '2026-10-15', amount: '12.50', description: 'Lunch' }

describe('Finance demo: the sample', () => {
  it('is two invented months with an income, expenses in several categories, and a known sum', () => {
    expect(SAMPLE_TRANSACTIONS.length).toBe(26)
    expect(new Set(SAMPLE_TRANSACTIONS.map((tx) => tx.id)).size).toBe(26)
    for (const tx of SAMPLE_TRANSACTIONS) {
      expect(tx.date >= PERIOD.from && tx.date <= PERIOD.to, tx.date).toBe(true)
      expect(Number.isInteger(tx.cents) && tx.cents > 0, String(tx.cents)).toBe(true)
      expect(CATEGORY_IDS).toContain(tx.category)
      expect((tx.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(tx.category), `${tx.id} ${tx.type} ${tx.category}`).toBe(true)
    }
    const state = fresh()
    expect(summarise(state.transactions, '2026-10')).toEqual({ income: 240_000, expense: 133_460, balance: 106_540 })
    expect(summarise(state.transactions, '2026-09').income).toBe(240_000)
  })

  it('shows every budget state at the start: on track, warning and over', () => {
    const rows = budgetRows(fresh().transactions, PERIOD.budgetMonth, BUDGETS)
    const byCategory = Object.fromEntries(rows.map((row) => [row.category, row.state]))
    expect(byCategory).toEqual({ housing: 'warning', food: 'ok', transport: 'ok', shopping: 'over', entertainment: 'warning' })
    const shopping = rows.find((row) => row.category === 'shopping')!
    expect(shopping.spent).toBe(15_250)
    expect(shopping.remaining).toBe(-250)
    expect(shopping.percent).toBe(102)
  })
})

describe('Finance demo: what a visitor types', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0.01', 1],
    ['  7  ', 700],
    ['12.', 1200],
    ['1000000', MAX_CENTS],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseAmount(text)).toEqual({ ok: true, cents })
  })

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['abc', 'invalid'],
    ['1e3', 'invalid'],
    ['1 000', 'invalid'],
    ['1,000.50', 'invalid'],
    ['€12', 'invalid'],
    ['12 EUR', 'invalid'],
    ['+5', 'invalid'],
    ['-5', 'notPositive'],
    ['0', 'notPositive'],
    ['0.00', 'notPositive'],
    ['12.345', 'tooManyDecimals'],
    ['1000000.01', 'tooLarge'],
    ['99999999999', 'tooLarge'],
    ['١٢', 'invalid'],
    ['12.5.5', 'invalid'],
    ['.5', 'invalid'],
  ])('refuses %j (%s)', (text, error) => {
    expect(parseAmount(text)).toEqual({ ok: false, error })
  })

  it('accepts a good transaction and returns it cleaned', () => {
    const result = validateTransaction({ ...valid, description: '  Lunch   with   Sam ' })
    expect(result).toEqual({ ok: true, value: { date: '2026-10-15', type: 'expense', category: 'food', description: 'Lunch with Sam', cents: 1250 } })
  })

  it('reports every wrong field at once, each with its reason', () => {
    const result = validateTransaction({ type: '', category: '', date: '', amount: '', description: '' })
    expect(result).toEqual({ ok: false, errors: { type: 'required', category: 'required', date: 'required', amount: 'required', description: 'required' } })
  })

  it('refuses the wrong things for each field', () => {
    const errors = (patch: Partial<TransactionInput>) => (validateTransaction({ ...valid, ...patch }) as { errors: Record<string, string> }).errors
    expect(errors({ type: 'transfer' })).toEqual({ type: 'invalid' })
    expect(errors({ category: 'nope' })).toEqual({ category: 'invalid' })
    expect(errors({ category: 'salary' })).toEqual({ category: 'mismatch' })
    expect(errors({ type: 'income', category: 'food' })).toEqual({ category: 'mismatch' })
    expect(errors({ date: '2026-10-32' })).toEqual({ date: 'invalid' })
    expect(errors({ date: '2026-02-30' })).toEqual({ date: 'invalid' })
    expect(errors({ date: '15/10/2026' })).toEqual({ date: 'invalid' })
    expect(errors({ date: '2026-08-31' })).toEqual({ date: 'outOfRange' })
    expect(errors({ date: '2026-11-01' })).toEqual({ date: 'outOfRange' })
    expect(errors({ description: 'x'.repeat(DESCRIPTION_MAX + 1) })).toEqual({ description: 'tooLong' })
    expect(errors({ amount: '0' })).toEqual({ amount: 'notPositive' })
  })

  it('takes the first and the last day of the sample, and a description of exactly the longest length', () => {
    expect(validateTransaction({ ...valid, date: PERIOD.from }).ok).toBe(true)
    expect(validateTransaction({ ...valid, date: PERIOD.to }).ok).toBe(true)
    expect(validateTransaction({ ...valid, description: 'x'.repeat(DESCRIPTION_MAX) }).ok).toBe(true)
  })

  it('treats markup as text: it is kept as typed (the screen draws text), and never executed here', () => {
    const result = validateTransaction({ ...valid, description: '<img src=x onerror=alert(1)>' })
    expect(result.ok && result.value.description).toBe('<img src=x onerror=alert(1)>')
  })

  it('counts characters, not code units (an emoji is one)', () => {
    expect(validateTransaction({ ...valid, description: '😀'.repeat(DESCRIPTION_MAX) }).ok).toBe(true)
    expect(validateTransaction({ ...valid, description: '😀'.repeat(DESCRIPTION_MAX + 1) }).ok).toBe(false)
  })
})

describe('Finance demo: the list', () => {
  const all = fresh().transactions

  it('filters by type, category, period and a search word, and the filters combine', () => {
    expect(applyFilters(all, { ...NO_FILTERS, type: 'income' })).toHaveLength(2)
    expect(applyFilters(all, { ...NO_FILTERS, category: 'food' }).every((tx) => tx.category === 'food')).toBe(true)
    expect(applyFilters(all, { ...NO_FILTERS, from: '2026-10-01', to: '2026-10-31' }).every((tx) => tx.date.startsWith('2026-10'))).toBe(true)
    expect(applyFilters(all, { ...NO_FILTERS, from: '2026-10-05', to: '2026-10-05' })).toHaveLength(1)
    expect(applyFilters(all, { ...NO_FILTERS, search: 'SAMPLE GROCERIES' }).length).toBe(4)
    expect(applyFilters(all, { ...NO_FILTERS, category: 'food', type: 'income' })).toEqual([])
    expect(applyFilters(all, { ...NO_FILTERS, search: 'zzz' })).toEqual([])
  })

  it('sorts by date, category and amount in both directions, the same way for the same data, without touching the original', () => {
    const before = all.map((tx) => tx.id)
    const byAmount = sortTransactions(all, { key: 'amount', direction: 'desc' })
    expect(byAmount[0].cents).toBe(240_000)
    expect(byAmount.map((tx) => tx.cents)).toEqual([...byAmount.map((tx) => tx.cents)].sort((a, b) => b - a))
    const asc = sortTransactions(all, { key: 'amount', direction: 'asc' })
    expect(asc[0].cents).toBeLessThanOrEqual(asc.at(-1)!.cents)
    const byDate = sortTransactions(all, DEFAULT_SORT)
    expect(byDate[0].date >= byDate.at(-1)!.date).toBe(true)
    expect(sortTransactions(all, { key: 'category', direction: 'asc' }).map((tx) => tx.id)).toEqual(sortTransactions([...all].reverse(), { key: 'category', direction: 'asc' }).map((tx) => tx.id))
    expect(all.map((tx) => tx.id)).toEqual(before)
  })

  it('pages the list: PAGE_SIZE rows a page, a page that is too far is brought back, an empty list still has one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
    const state = fresh()
    const first = visibleRows(state)
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.pages).toBe(Math.ceil(26 / PAGE_SIZE))
    expect(visibleRows({ ...state, page: 99 }).page).toBe(first.pages)
    expect(visibleRows({ ...state, page: -3 }).page).toBe(1)
    expect(visibleRows({ ...state, filters: { ...NO_FILTERS, search: 'zzz' } })).toMatchObject({ rows: [], total: 0, page: 1, pages: 1 })
  })
})

describe('Finance demo: the budgets', () => {
  it('warns from exactly 80 % of the limit and says over budget only past 100 %', () => {
    expect(budgetState(7_999, 10_000)).toBe('ok')
    expect(budgetState(8_000, 10_000)).toBe('warning')
    expect(budgetState(10_000, 10_000)).toBe('warning')
    expect(budgetState(10_001, 10_000)).toBe('over')
    expect(budgetState(0, 10_000)).toBe('ok')
    expect(budgetState(5, 0)).toBe('ok')
  })

  it('follow a new expense and a deletion, and spending by category is largest first', () => {
    let state = fresh()
    const before = budgetRows(state.transactions, '2026-10', BUDGETS).find((row) => row.category === 'transport')!
    expect(before.state).toBe('ok')
    const added = validateTransaction({ type: 'expense', category: 'transport', date: '2026-10-20', amount: '60', description: 'Train' })
    if (!added.ok) throw new Error('should be valid')
    state = reduce(state, { type: 'add', value: added.value })
    const after = budgetRows(state.transactions, '2026-10', BUDGETS).find((row) => row.category === 'transport')!
    expect(after.spent).toBe(before.spent + 6_000)
    expect(after.state).toBe('over')
    state = reduce(state, { type: 'remove', id: state.nextId - 1 })
    expect(budgetRows(state.transactions, '2026-10', BUDGETS).find((row) => row.category === 'transport')!.state).toBe('ok')
    const spending = spendingByCategory(state.transactions, '2026-10')
    expect(spending[0].category).toBe('housing')
    expect(spending.map((row) => row.cents)).toEqual([...spending.map((row) => row.cents)].sort((a, b) => b - a))
    expect(spending.some((row) => row.category === 'salary')).toBe(false)
  })
})

describe('Finance demo: its state is its own', () => {
  it('starts from the same sample every time, and a restart is exactly the start', () => {
    expect(fresh()).toEqual(fresh())
    const changed = reduce(fresh(), { type: 'remove', id: 1 })
    expect(changed.transactions).toHaveLength(25)
    expect(fresh().transactions).toHaveLength(26)
  })

  it('shares nothing between two instances, and never changes the sample or the state it was given', () => {
    const a = fresh()
    const b = fresh()
    const frozen = JSON.stringify(a)
    const next = reduce(a, { type: 'add', value: { date: '2026-10-01', type: 'expense', category: 'other', description: 'x', cents: 100 } })
    expect(JSON.stringify(a)).toBe(frozen)
    expect(b.transactions).toHaveLength(26)
    expect(next.transactions).toHaveLength(27)
    next.transactions[0].cents = 1
    expect(SAMPLE_TRANSACTIONS[0].cents).toBe(240_000)
    expect(fresh().transactions[0].cents).toBe(240_000)
  })

  it('gives each new transaction its own id and sends the list back to the first page', () => {
    let state = reduce(fresh(), { type: 'page', page: 3 })
    expect(state.page).toBe(3)
    state = reduce(state, { type: 'add', value: { date: '2026-10-01', type: 'expense', category: 'other', description: 'a', cents: 1 } })
    state = reduce(state, { type: 'add', value: { date: '2026-10-02', type: 'expense', category: 'other', description: 'b', cents: 1 } })
    expect(state.page).toBe(1)
    const ids = state.transactions.map((tx) => tx.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toggles the sort direction on the same key and picks a sensible start for a new one; resetting the filters resets the sort too', () => {
    let state = fresh()
    state = reduce(state, { type: 'sort', key: 'date' })
    expect(state.sort).toEqual({ key: 'date', direction: 'asc' })
    state = reduce(state, { type: 'sort', key: 'category' })
    expect(state.sort).toEqual({ key: 'category', direction: 'asc' })
    state = reduce(state, { type: 'sort', key: 'amount' })
    expect(state.sort).toEqual({ key: 'amount', direction: 'desc' })
    state = reduce(state, { type: 'filter', patch: { type: 'income' } })
    state = reduce(state, { type: 'resetFilters' })
    expect(state.filters).toEqual(NO_FILTERS)
    expect(state.sort).toEqual(DEFAULT_SORT)
  })

  it('keeps the page inside the list, whatever it is asked for', () => {
    const state = fresh()
    for (const page of [0, -1, 1.7, 1000, Number.NaN]) {
      const next = reduce(state, { type: 'page', page })
      expect(next.page, String(page)).toBeGreaterThanOrEqual(1)
      expect(next.page, String(page)).toBeLessThanOrEqual(pageCount(state.transactions.length))
    }
  })
})
