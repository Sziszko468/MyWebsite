// Fills a THROW-AWAY scratch database with clearly labelled SYNTHETIC rows (reference SYN-..., name SYNTHETIC ...) so the analytics screen has figures, charts, tables and alerts to be
// checked in a real browser (PROMPT 32). It never touches the application's own database: give it the path of the scratch database a scratch server is using.
//
//   node --disable-warning=ExperimentalWarning tools/audit/seed-analytics.mjs <path-to-scratch.sqlite> [small|large]
//
// The rows come from server/test/analyticsSynthetic.ts (the same deterministic generator the performance test uses), at a size a browser can show comfortably.
import { Database } from '../../server/src/db/database.ts'
import { buildSyntheticDataset } from '../../server/test/analyticsSynthetic.ts'

const [path, size = 'small'] = process.argv.slice(2)
if (!path) {
  console.error('usage: seed-analytics.mjs <path-to-scratch.sqlite> [small|large]')
  process.exit(2)
}
if (/production|prod|live/i.test(path)) {
  console.error('Refusing: that path looks like a real database. This tool is for throw-away scratch databases only.')
  process.exit(2)
}
const SIZES = {
  small: { requests: 180, customers: 40, projects: 26, tasks: 130, milestones: 50, conversations: 20, messages: 150, bookings: 32, ai: 180 },
  large: { requests: 2500, customers: 600, projects: 400, tasks: 2500, milestones: 700, conversations: 250, messages: 3000, bookings: 400, ai: 3000 },
}
const db = new Database(path)
buildSyntheticDataset(db, SIZES[size] ?? SIZES.small)
console.log(`seeded ${path} with the ${size} synthetic dataset`)
