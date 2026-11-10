// Puts the assistant of a SCRATCH backend in the state the administration leaves it in after the administrator's two steps
// (PROMPT 16.1): the connection test (which must verify the required model) and the switch. It uses the administration's own
// API, so it proves the same path the browser uses; nothing is written to the database directly.
//
//   node tools/e2e/ai-activate.cjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=<the test password>
//
// For scripts that need a working assistant but are not about the activation (tools/audit/audit-ai.cjs). The backend's model
// must be answering, e.g. the local stand-in (tools/e2e/anthropic-standin.ts). Exit code 1 when the model could not be verified.
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')

;(async () => {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`sign-in failed (${login.status})`)
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
  const csrf = (await login.json()).data.csrfToken
  const headers = { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }

  const tested = await fetch(`${BASE}/api/admin/ai/connection-test`, { method: 'POST', headers, body: '{}' })
  const result = (await tested.json()).data?.result
  if (!result || !result.ok) {
    console.log(`the required model could not be verified: ${result ? `${result.reason} (${result.message})` : `status ${tested.status}`}`)
    process.exit(1)
  }
  const switched = await fetch(`${BASE}/api/admin/ai/settings`, { method: 'PUT', headers, body: JSON.stringify({ enabled: true }) })
  if (switched.status !== 200) throw new Error(`the switch was refused (${switched.status})`)
  console.log(`verified ${result.reportedModel} and switched the assistant on`)
})().catch((error) => {
  console.error(String(error.message || error))
  process.exit(2)
})
