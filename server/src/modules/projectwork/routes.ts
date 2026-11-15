import type { AppContext } from '../../context.ts'
import { validationFailed } from '../../http/errors.ts'
import type { RouteDef } from '../../http/router.ts'
import { empty, json } from '../../http/reply.ts'
import { Fields } from '../../lib/validate.ts'
import { clientOf } from '../customers/sessions.ts'
import { respondToAction } from './actions.ts'
import {
  addCategory,
  addTask,
  addTaskDependency,
  addTaskNote,
  allTasks,
  editCategory,
  editTask,
  giveAction,
  readCategories,
  readWorkSettings,
  removeCategory,
  removeTask,
  removeTaskDependency,
  reorder,
  reviewAction,
  rewordAction,
  setTaskStatus,
  setTasksStatus,
  suggestedCategories,
  taskDetail,
  workDeliveries,
  workspace,
  writeWorkSettings,
} from './admin.ts'
import { LIMITS } from './model.ts'
import { portalTask, portalWork } from './portal.ts'

/**
 * The project work's addresses. The customer's (`/api/portal/projects/:reference/tasks…`) are the portal's: same-origin only, `no-store`, behind the customer's own
 * session and CSRF token, and every one starts from the project the SESSION'S customer owns; none takes a customer id. The administration's
 * (`/api/admin/client-projects/:id/tasks…`, `/api/admin/task-categories`, `/api/admin/work-settings`) are behind an administrator's session and CSRF token, with the
 * permission checked by the business function.
 */

export function workRoutes(_app: AppContext): RouteDef[] {
  const signedIn = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'portal', limit: 'portal', customerAuth: true, handler })
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  const base = '/api/admin/client-projects/:id'

  return [
    // ---- the customer ----
    signedIn('GET', '/api/portal/projects/:reference/tasks', (ctx) => json(portalWork(ctx.app, clientOf(ctx).customerId, ctx.params.reference))),
    signedIn('GET', '/api/portal/projects/:reference/tasks/:task', (ctx) => json(portalTask(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.task))),
    signedIn('POST', '/api/portal/projects/:reference/tasks/:task/respond', async (ctx) => {
      const body = await ctx.json()
      if (Object.keys(body).some((key) => key !== 'response')) throw validationFailed({ body: 'invalid' })
      const fields = new Fields(body)
      const response = fields.text('response', { max: LIMITS.response, min: 2, multiline: true, required: true })
      fields.done()
      const result = respondToAction(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.task, response!)
      return json({ ...result, task: portalTask(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.task) }, { status: 201 })
    }),

    // ---- the administration: the workspace and the tasks ----
    admin('GET', `${base}/work`, (ctx) => json(workspace(ctx.app, ctx.session, ctx.params.id, ctx.query))),
    admin('GET', '/api/admin/work/tasks', (ctx) => json(allTasks(ctx.app, ctx.session, ctx.query))),
    admin('POST', `${base}/tasks`, async (ctx) => json(addTask(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('POST', `${base}/tasks/bulk-status`, async (ctx) => json(setTasksStatus(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('POST', `${base}/tasks/reorder`, async (ctx) => json(reorder(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('GET', `${base}/tasks/:taskId`, (ctx) => json(taskDetail(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId))),
    admin('PATCH', `${base}/tasks/:taskId`, async (ctx) => json(editTask(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, await ctx.json()))),
    admin('DELETE', `${base}/tasks/:taskId`, (ctx) => {
      removeTask(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId)
      return empty(204)
    }),
    admin('POST', `${base}/tasks/:taskId/status`, async (ctx) => json(setTaskStatus(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, await ctx.json()))),
    admin('POST', `${base}/tasks/:taskId/dependencies`, async (ctx) => json(addTaskDependency(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, await ctx.json()), { status: 201 })),
    admin('DELETE', `${base}/tasks/:taskId/dependencies/:dependsOnId`, (ctx) => json(removeTaskDependency(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, ctx.params.dependsOnId))),
    admin('POST', `${base}/tasks/:taskId/notes`, async (ctx) => json(addTaskNote(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, await ctx.json()), { status: 201 })),

    // ---- the administration: customer actions ----
    admin('POST', `${base}/tasks/:taskId/action`, async (ctx) => json(giveAction(ctx.app, ctx.session, ctx.params.id, ctx.params.taskId, await ctx.json()), { status: 201 })),
    admin('PATCH', `${base}/actions/:actionId`, async (ctx) => json(rewordAction(ctx.app, ctx.session, ctx.params.id, ctx.params.actionId, await ctx.json()))),
    admin('POST', `${base}/actions/:actionId/review`, async (ctx) => json(reviewAction(ctx.app, ctx.session, ctx.params.id, ctx.params.actionId, 'review', await ctx.json()))),
    admin('POST', `${base}/actions/:actionId/accept`, async (ctx) => json(reviewAction(ctx.app, ctx.session, ctx.params.id, ctx.params.actionId, 'accept', await ctx.json()))),
    admin('POST', `${base}/actions/:actionId/changes`, async (ctx) => json(reviewAction(ctx.app, ctx.session, ctx.params.id, ctx.params.actionId, 'changes', await ctx.json()))),
    admin('POST', `${base}/actions/:actionId/cancel`, async (ctx) => json(reviewAction(ctx.app, ctx.session, ctx.params.id, ctx.params.actionId, 'cancel', await ctx.json()))),

    // ---- the administration: what was e-mailed, the categories, the choices ----
    admin('GET', `${base}/work-notifications`, (ctx) => json(workDeliveries(ctx.app, ctx.session, ctx.params.id))),
    admin('GET', '/api/admin/task-categories', (ctx) => json(readCategories(ctx.app, ctx.session))),
    admin('POST', '/api/admin/task-categories', async (ctx) => json(addCategory(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    admin('POST', '/api/admin/task-categories/suggested', (ctx) => json(suggestedCategories(ctx.app, ctx.session))),
    admin('PATCH', '/api/admin/task-categories/:id', async (ctx) => json(editCategory(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('DELETE', '/api/admin/task-categories/:id', (ctx) => json(removeCategory(ctx.app, ctx.session, ctx.params.id))),
    admin('GET', '/api/admin/work-settings', (ctx) => json(readWorkSettings(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/work-settings', async (ctx) => json(writeWorkSettings(ctx.app, ctx.session, await ctx.json()))),
  ]
}
