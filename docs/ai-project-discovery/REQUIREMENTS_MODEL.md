# Requirements model

A requirement is one row of `ai_discovery_requirements`; the database itself checks every enumeration.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | UUID | stable identifier, unique, only meaningful inside its conversation |
| `position` | integer | order of creation |
| `title` | text, 2–100 characters | short name; unique per conversation after normalising case, accents and punctuation |
| `description` | text, up to 400 | optional detail |
| `category` | `content` `design` `accounts` `commerce` `booking` `data` `integration` `admin` `communication` `automation` `security` `performance` `localization` `other` | the area it belongs to |
| `priority` | `essential` `important` `optional` `future` | how much the project depends on it (*Essential*, *Important*, *Optional*, *Future consideration*) |
| `required` | boolean | required or optional, as its own question |
| `origin` | `visitor` `assistant` | who wrote it |
| `basis` | `stated` `suggested` | for the assistant's: did the visitor *say* it, or is it the assistant's own idea? The interface words the two differently |
| `status` | `unconfirmed` `confirmed` `rejected` | the visitor's decision |
| `complexity` | `low` `medium` `high` | how demanding this one is (feeds the project's complexity) |
| `depends_on` | JSON array of ids | up to 5 other requirements of the same conversation |

## The rules

1. **Born unconfirmed.** Whatever the assistant writes is `origin: assistant`, `status: unconfirmed`. It is never counted as confirmed, in the plan, the review or the approval, until the visitor confirms it. A requirement the visitor adds in the panel is `origin: visitor`, `status: confirmed`.
2. **Stated vs suggested.** The assistant must say, for each requirement, whether the visitor stated it (`statedByVisitor: true`) or it is the assistant's own proposal. The panel shows *"from your message, waiting for your confirmation"* or *"suggested by the assistant"*.
3. **Consistency of `required`.** An essential requirement is always required; a future consideration never is; for the others the visitor (or the assistant's proposal) decides. The form shows the checkbox disabled and set accordingly.
4. **The visitor's decisions are final for the assistant.** The assistant can add requirements and refine the description, category, priority and complexity of its *own unconfirmed* ones. It cannot touch one the visitor wrote, confirmed or rejected, and it cannot re-propose a requirement the visitor rejected (the server answers `rejected_by_visitor` / `visitor_wrote_it` / `confirmed_by_visitor`).
   **Editing is not confirming.** When the visitor edits an assistant's suggestion (a better title, another priority) it stays *unconfirmed* until they press **Confirm**; the server never confirms anything as a side effect.
5. **Rejected is not deleted.** A rejected requirement stays in the list (struck through, in its own group) so it can be restored; it is left out of the plan and of the complexity, and the plan only records *how many* were rejected. Deleting is a separate action with a confirmation.
6. **No duplicates.** A title that normalises to an existing one is refused (`duplicate`) for the assistant, and a 409 for the visitor.
7. **Limits.** 60 requirements per conversation, 8 per tool call, 5 dependencies each, titles 100, descriptions 400. A `dependsOn` that names no requirement of this conversation is refused (`unknown_dependency`); the assistant names dependencies by *title*, the server resolves them.

## Who can do what

| Action | Visitor (panel) | Assistant (tools) |
| --- | --- | --- |
| Add | yes, confirmed | yes, unconfirmed |
| Confirm / reject / restore | yes | **no** |
| Edit title | yes | no |
| Edit description, category, priority, complexity | yes | only its own unconfirmed ones |
| Mark as "later" (`future`) | yes | only its own unconfirmed ones |
| Delete | yes | no |

## Where requirements show up

The **Requirements** view groups them by priority and shows origin, status, required/optional, category and complexity on every card, with *Confirm*, *Reject*/*Restore*, *Edit*, *Move to later*, a priority selector and *Delete*. The **plan** lists them under their priority with the same status badges; the **review** lists them as confirmed core, not yet confirmed, and other confirmed; the **quote request** carries each requirement with its category, origin and status.
