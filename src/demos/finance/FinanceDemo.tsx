import { useReducer, useRef, useState, type FormEvent } from 'react'
import { financeText } from '../../content/demos/finance'
import { demoText } from '../../content/demos/shell'
import { ChoiceGroup, FIRST_INVALID, SelectField, TextField } from '../../components/form/fields'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { formatCents, formatShortDay } from '../format'
import { useDemoText } from '../useDemoText'
import ui from '../ui/demoUi.module.scss'
import styles from './FinanceDemo.module.scss'
import {
  BUDGETS,
  CATEGORY_IDS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PERIOD,
  budgetRows,
  initialState,
  reduce,
  spendingByCategory,
  summarise,
  validateTransaction,
  visibleRows,
  type CategoryId,
  type SortKey,
  type TransactionField,
  type TransactionInput,
  type TransactionType,
} from './model'

const CURRENCY = 'EUR'
const EMPTY_FORM: TransactionInput = { type: 'expense', category: '', date: '', amount: '', description: '' }
const SORT_KEYS: readonly SortKey[] = ['date', 'category', 'amount']

/**
 * The finance demo: Spendly's transactions and monthly budgets on invented sample data. All of its state is this component's own (a reducer over plain
 * data, see model.ts); it reads nothing and writes nothing outside the page, and a restart simply mounts it again with the sample as it was.
 */
export default function FinanceDemo() {
  const { lang } = useI18n()
  const t = useDemoText(financeText)
  const shell = useDemoText(demoText)
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState((key) => t.samples[key]))
  const [form, setForm] = useState<TransactionInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<TransactionField, string>>>({})
  const [message, setMessage] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)

  const money = (cents: number) => formatCents(cents, CURRENCY, lang)
  const month = PERIOD.budgetMonth
  const summary = summarise(state.transactions, month)
  const budgets = budgetRows(state.transactions, month, BUDGETS)
  const byCategory = spendingByCategory(state.transactions, month)
  const largest = byCategory[0]?.cents ?? 1
  const { rows, total, page, pages } = visibleRows(state)
  const categoryName = (id: CategoryId) => t.categories[id]

  const allowed = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const categoryOptions = allowed.map((id) => ({ value: id, label: categoryName(id) }))

  const change = (patch: Partial<TransactionInput>) => {
    setForm((current) => {
      const next = { ...current, ...patch }
      if (patch.type && next.category !== '' && !(patch.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(next.category as CategoryId)) next.category = ''
      return next
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = validateTransaction(form)
    if (!result.ok) {
      const next: Partial<Record<TransactionField, string>> = {}
      for (const [field, code] of Object.entries(result.errors)) next[field as TransactionField] = t.form.errors[code]
      setErrors(next)
      setMessage(t.form.fixErrors)
      // Focus goes to the first field that says it is wrong, as the site's own forms do.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus())
      return
    }
    dispatch({ type: 'add', value: result.value })
    setErrors({})
    setForm({ ...EMPTY_FORM, type: form.type })
    setMessage(fill(t.form.added, { description: result.value.description, amount: money(result.value.cents) }))
  }

  const sortLabel = (key: SortKey) => {
    const column = t.list.columns[key]
    return state.sort.key === key ? fill(t.list.sorted, { column, direction: state.sort.direction === 'asc' ? t.list.ascending : t.list.descending }) : fill(t.list.sortBy, { column })
  }

  const typeFilters: Array<{ value: 'all' | TransactionType; label: string }> = [
    { value: 'all', label: t.types.all },
    { value: 'income', label: t.types.income },
    { value: 'expense', label: t.types.expense },
  ]

  return (
    <div className={styles.layout}>
      <section className={cx(ui.panel, styles.summary)} aria-labelledby="fin-summary">
        <div className={ui.panelHead}>
          <h3 id="fin-summary" className={ui.title}>
            {t.summary.title}
          </h3>
          <span className={ui.sample}>{shell.labels.sample}</span>
        </div>
        <dl className={styles.figures}>
          <div>
            <dt>{t.summary.income}</dt>
            <dd>{money(summary.income)}</dd>
          </div>
          <div>
            <dt>{t.summary.expense}</dt>
            <dd>{money(summary.expense)}</dd>
          </div>
          <div>
            <dt>{t.summary.balance}</dt>
            <dd>{money(summary.balance)}</dd>
          </div>
        </dl>
        <p className={ui.note}>{t.summary.sampleNote}</p>
      </section>

      <section className={cx(ui.panel, styles.formPanel)} aria-labelledby="fin-form">
        <h3 id="fin-form" className={ui.title}>
          {t.form.title}
        </h3>
        <form ref={formRef} className={styles.form} onSubmit={submit} noValidate autoComplete="off">
          <ChoiceGroup<TransactionType>
            legend={t.form.type}
            value={form.type === 'income' || form.type === 'expense' ? form.type : null}
            onChange={(type) => change({ type })}
            options={[
              { value: 'expense', label: t.types.expense },
              { value: 'income', label: t.types.income },
            ]}
            error={errors.type}
          />
          <SelectField
            label={t.form.category}
            value={form.category}
            onChange={(category) => change({ category })}
            placeholder={t.form.choose}
            options={categoryOptions}
            error={errors.category}
          />
          <TextField
            label={t.form.date}
            hint={t.form.dateHelp}
            type="date"
            min={PERIOD.from}
            max={PERIOD.to}
            value={form.date}
            onChange={(event) => change({ date: event.target.value })}
            error={errors.date}
          />
          <TextField
            label={t.form.amount}
            hint={t.form.amountHelp}
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => change({ amount: event.target.value })}
            error={errors.amount}
          />
          <TextField
            label={t.form.description}
            hint={t.form.descriptionHelp}
            value={form.description}
            maxLength={120}
            onChange={(event) => change({ description: event.target.value })}
            error={errors.description}
          />
          <button type="submit" className={cx(ui.action, styles.submit)}>
            {t.form.submit}
          </button>
        </form>
        <p className={ui.live} role="status">
          {message}
        </p>
      </section>

      <section className={cx(ui.panel, styles.budgets)} aria-labelledby="fin-budgets">
        <div className={ui.panelHead}>
          <h3 id="fin-budgets" className={ui.title}>
            {t.budgets.title}
          </h3>
          <span className={ui.sample}>{shell.labels.sample}</span>
        </div>
        <p className={ui.note}>{t.budgets.note}</p>
        <ul className={cx(ui.list, styles.budgetList)}>
          {budgets.map((row) => (
            <li key={row.category} className={styles.budget} data-state={row.state}>
              <div className={styles.budgetHead}>
                <span className={styles.budgetName}>{categoryName(row.category)}</span>
                <span className={cx(ui.badge, styles.state)}>
                  <span className={cx(ui.glyph, row.state === 'over' ? ui.glyphSquare : row.state === 'warning' ? ui.glyphDiamond : ui.glyphRound)} aria-hidden="true" />
                  {t.budgets.states[row.state]}
                </span>
              </div>
              <div
                className={cx(ui.bar, row.state === 'warning' && ui.barWarning, row.state === 'over' && ui.barOver)}
                role="meter"
                aria-label={categoryName(row.category)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, row.percent)}
                aria-valuetext={`${fill(t.budgets.usage, { percent: row.percent })}. ${t.budgets.states[row.state]}`}
              >
                <span style={{ transform: `scaleX(${Math.min(100, row.percent) / 100})` }} />
              </div>
              <p className={ui.note}>
                {fill(t.budgets.spent, { spent: money(row.spent), limit: money(row.limit) })}
                {' · '}
                {row.remaining >= 0 ? fill(t.budgets.remaining, { amount: money(row.remaining) }) : fill(t.budgets.overBy, { amount: money(-row.remaining) })}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={cx(ui.panel, styles.categories)} aria-labelledby="fin-categories">
        <h3 id="fin-categories" className={ui.title}>
          {t.byCategory.title}
        </h3>
        {byCategory.length === 0 ? (
          <p className={ui.note}>{t.byCategory.empty}</p>
        ) : (
          <ul className={cx(ui.list, styles.categoryList)}>
            {byCategory.map((row) => (
              <li key={row.category}>
                <span className={styles.categoryName}>{categoryName(row.category)}</span>
                <span className={styles.categoryBar} aria-hidden="true">
                  <span style={{ width: `${Math.max(4, Math.round((row.cents / largest) * 100))}%` }} />
                </span>
                <span className={styles.categoryAmount}>{money(row.cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cx(ui.panel, styles.listPanel)} aria-labelledby="fin-list">
        <div className={ui.panelHead}>
          <h3 id="fin-list" className={ui.title}>
            {t.list.title}
          </h3>
          <p className={ui.note} role="status">
            {total === 1 ? t.list.countOne : fill(t.list.count, { count: total })}
          </p>
        </div>

        <div className={styles.filters}>
          <div className={ui.chips} role="group" aria-label={t.form.type}>
            {typeFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                className={ui.chip}
                aria-pressed={state.filters.type === option.value}
                onClick={() => dispatch({ type: 'filter', patch: { type: option.value } })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <SelectField
            label={t.form.category}
            value={state.filters.category === 'all' ? '' : state.filters.category}
            onChange={(value) => dispatch({ type: 'filter', patch: { category: value === '' ? 'all' : (value as CategoryId) } })}
            placeholder={t.types.all}
            options={CATEGORY_IDS.map((id) => ({ value: id, label: categoryName(id) }))}
          />
          <TextField label={t.list.from} type="date" min={PERIOD.from} max={PERIOD.to} value={state.filters.from} onChange={(event) => dispatch({ type: 'filter', patch: { from: event.target.value } })} />
          <TextField label={t.list.to} type="date" min={PERIOD.from} max={PERIOD.to} value={state.filters.to} onChange={(event) => dispatch({ type: 'filter', patch: { to: event.target.value } })} />
          <TextField label={t.list.search} type="search" value={state.filters.search} maxLength={60} onChange={(event) => dispatch({ type: 'filter', patch: { search: event.target.value } })} />
          <button type="button" className={ui.action} onClick={() => dispatch({ type: 'resetFilters' })}>
            {t.list.resetFilters}
          </button>
        </div>

        <div className={ui.chips} role="group" aria-label={t.list.sortGroup}>
          {SORT_KEYS.map((key) => (
            <button key={key} type="button" className={ui.chip} aria-pressed={state.sort.key === key} onClick={() => dispatch({ type: 'sort', key })}>
              {sortLabel(key)}
              {state.sort.key === key && <span aria-hidden="true">{state.sort.direction === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className={ui.note}>{t.list.empty}</p>
        ) : (
          <ul className={cx(ui.list, styles.rows)}>
            {rows.map((tx) => (
              <li key={tx.id} className={styles.row} data-type={tx.type}>
                <span className={styles.date}>{formatShortDay(tx.date, lang)}</span>
                <span className={styles.description}>{tx.description}</span>
                <span className={styles.category}>{categoryName(tx.category)}</span>
                <span className={styles.amount}>
                  <span className="visually-hidden">{t.types[tx.type]}: </span>
                  <span aria-hidden="true">{tx.type === 'income' ? '+' : '−'}</span>
                  {money(tx.cents)}
                </span>
                <button
                  type="button"
                  className={cx(ui.action, styles.remove)}
                  aria-label={fill(t.list.removeNamed, { description: tx.description })}
                  onClick={() => {
                    dispatch({ type: 'remove', id: tx.id })
                    setMessage(fill(t.list.removed, { description: tx.description }))
                  }}
                >
                  {t.list.remove}
                </button>
              </li>
            ))}
          </ul>
        )}

        <nav className={styles.pager} aria-label={t.list.title}>
          <button type="button" className={ui.action} disabled={page <= 1} onClick={() => dispatch({ type: 'page', page: page - 1 })}>
            {t.list.previous}
          </button>
          <span className={ui.note}>{fill(t.list.pageOf, { page, pages })}</span>
          <button type="button" className={ui.action} disabled={page >= pages} onClick={() => dispatch({ type: 'page', page: page + 1 })}>
            {t.list.next}
          </button>
        </nav>
      </section>
    </div>
  )
}
