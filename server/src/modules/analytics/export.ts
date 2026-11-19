import type { Filters, Meta, Section } from './model.ts'

/**
 * CSV export of a section (PROMPT 32). It is made from the SAME data the screen shows (so it respects the filters and the administrator's permissions: a section the role may not read
 * is never built), starts with what a reader needs to interpret it (the report, the period, the business time zone, when it was made, the filters, a statement that currencies are not
 * summed and which values are estimates), and is safe to open in a spreadsheet: a text that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with an apostrophe,
 * so it can never run as a formula. Nothing private is in it: the sections hold no private notes, no message text, no e-mail address and no secret.
 */

const DANGEROUS = /^[=+\-@\t\r]/

/** One CSV field. Numbers are written as numbers; a text is quoted when it needs to be, and defused when a spreadsheet would read it as a formula. */
export function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  // Defused BEFORE the line breaks are normalised, so a leading carriage return is seen for what it is.
  let text = DANGEROUS.test(value) ? `'${value}` : value
  text = text.replace(/\r\n|\r/g, '\n')
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const line = (values: Array<string | number | boolean | null | undefined>): string => values.map(cell).join(',')

export function sectionCsv(section: Section, meta: Meta, filters: Filters, report: string): string {
  const out: string[] = []
  // A comment line is plain text after a `#` (never a cell of the table below it); its text is made of constants and validated values.
  const note = (text: string) => out.push(`# ${text.replace(/[\r\n]+/g, ' ')}`)
  note(`Report: ${report}`)
  note(`Period: ${meta.period.from} to ${meta.period.to} (${meta.period.days} days, local calendar days)`)
  note(`Business time zone: ${meta.period.zone}; instants are UTC (${meta.period.fromUtc} to ${meta.period.toUtc}, end exclusive)`)
  if (meta.previous) note(`Previous equivalent period: ${meta.previous.from} to ${meta.previous.to}`)
  note(`Generated at: ${meta.generatedAt} (UTC)`)
  note(`Filters: ${Object.entries({ currency: filters.currency, language: filters.language, service: filters.service, package: filters.packageCode, projectStatus: filters.projectStatus, quoteStatus: filters.quoteStatus, consultationStatus: filters.consultationStatus }).filter(([, value]) => value !== null).map(([key, value]) => `${key}=${value}`).join(' ') || 'none'}`)
  const filter = section.filterSummary?.projectStatus
  if (filter) note(`Project status filter: ${filter.status} (${filter.effect === 'partial' ? 'applies to part of this report: see [filter-scope] for each figure' : 'does not apply to this report'}). A figure marked not_applied keeps its own meaning and is not the selected subset.`)
  note('Money is in whole minor units (cents for EUR, forints for HUF) and is NEVER added across currencies; an accepted quotation is accepted contract value, not cash.')
  note('Rows with kind "estimate" are estimates (for example the AI cost, in US dollars: not an invoice); "unavailable" means the system does not store the data, it is not zero.')
  out.push('')
  if (section.metrics.length > 0) {
    out.push(line(['[metrics]']), line(['id', 'kind', 'state', 'value', 'previousPeriod', 'change', 'changePercent', 'comparison', 'reason']))
    for (const metric of section.metrics) out.push(line([metric.id, metric.kind, metric.state, metric.value, metric.previous, metric.change, metric.changePercent, metric.comparison, metric.reason]))
    out.push('')
  }
  if (section.money.length > 0) {
    out.push(line(['[money]']), line(['id', 'kind', 'state', 'currency', 'minorUnits', 'previousPeriodMinorUnits', 'quotationsWithAmount', 'quotations', 'quotationsWithoutAmount', 'reason']))
    for (const metric of section.money) {
      if (metric.lines.length === 0) out.push(line([metric.id, metric.kind, metric.state, '', '', '', '', '', metric.withoutAmount, metric.reason]))
      for (const entry of metric.lines) out.push(line([metric.id, metric.kind, metric.state, entry.currency, entry.minor, entry.previousMinor, entry.priced, entry.count, metric.withoutAmount, metric.reason]))
    }
    out.push('')
  }
  if (section.series.length > 0) {
    out.push(line(['[series]']), line(['id', 'granularity', 'unit', 'currency', 'bucket', 'from', 'to', 'value']))
    for (const series of section.series) for (const point of series.points) out.push(line([series.id, series.granularity, series.unit, series.currency ?? '', point.key, point.from, point.to, point.value]))
    out.push('')
  }
  if (section.distributions.length > 0) {
    out.push(line(['[distributions]']), line(['id', 'key', 'value', 'total']))
    for (const distribution of section.distributions) for (const item of distribution.items) out.push(line([distribution.id, item.key, item.value, distribution.total]))
    out.push('')
  }
  for (const table of section.tables) {
    out.push(line([`[table:${table.id}]`]), line(table.columns))
    for (const row of table.rows) out.push(line(row))
    out.push('')
  }
  const extra = section.extra as { stages?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> } | undefined
  if (extra?.stages) {
    out.push(line(['[funnel]']), line(['stage', 'requests', 'conversionFromPreviousPercent', 'conversionFromReceivedPercent', 'daysFromPreviousStage']))
    for (const stage of extra.stages) out.push(line([stage.stage as string, stage.count as number, stage.conversionFromPrevious as number | null, stage.conversionFromReceived as number | null, stage.daysFromPrevious as number | null]))
    out.push('')
  }
  if (extra?.items) {
    out.push(line(['[alerts]']), line(['severity', 'kind', 'reason', 'reference', 'date', 'nextAction']))
    for (const item of extra.items) out.push(line([item.severity as string, item.kind as string, item.reason as string, item.reference as string, item.date as string, item.nextAction as string]))
    out.push('')
  }
  // What the selected project status does to each figure (only when one is selected): applied, not_applied (an event of the period, or not project data) or empty_by_definition.
  const scope: Array<Array<string | null>> = []
  const noted = (kind: string, id: string, item: { filterNote?: { filter: string; effect: string; reason: string | null } }) => {
    if (item.filterNote) scope.push([kind, id, item.filterNote.filter, item.filterNote.effect, item.filterNote.reason])
  }
  for (const item of section.metrics) noted('metric', item.id, item)
  for (const item of section.money) noted('money', item.id, item)
  for (const item of section.series) noted('series', item.id, item)
  for (const item of section.distributions) noted('distribution', item.id, item)
  for (const item of section.tables) noted('table', item.id, item)
  for (const kind of filter?.appliedKinds ?? []) scope.push(['alert', kind, 'projectStatus', 'applied', null])
  for (const kind of filter?.notAppliedKinds ?? []) scope.push(['alert', kind, 'projectStatus', 'not_applied', 'not_project_data'])
  if (scope.length > 0) {
    out.push(line(['[filter-scope]']), line(['kind', 'id', 'filter', 'effect', 'reason']))
    for (const row of scope) out.push(line(row))
    out.push('')
  }
  out.push(line(['[limitations]']))
  for (const code of section.limitations) out.push(line([code]))
  // A byte order mark so a spreadsheet reads the accents of Hungarian text as UTF-8.
  return `﻿${out.join('\r\n')}\r\n`
}

export const exportFileName = (report: string, meta: Meta): string => `analytics-${report}-${meta.period.from}_${meta.period.to}.csv`
