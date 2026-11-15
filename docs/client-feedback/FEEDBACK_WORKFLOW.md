# Feedback workflow

## What a customer can do

Only on the **current, published** version of **their own** deliverable, while the deliverable is not archived and the project is not finished or cancelled (otherwise the page is read-only and says so).

```
write a comment ──▶ DRAFT (editable, deletable, only theirs) ──"Send the feedback"──▶ SUBMITTED (never changed)
                                                                                         │
                                         the owner replies ◀─────────────────────────────┤
                                         the owner resolves ──▶ RESOLVED ──customer reopens──▶ SUBMITTED
                                         the customer adds a FOLLOW-UP (a new comment under the thread)
```

1. **A general comment** (no position) or, if the version has a **picture**, a comment **tied to a spot** on it (see ANNOTATIONS.md). A position on a version without a picture is refused (`position: invalid`).
2. **Drafts.** Each comment is saved as a draft first. A draft can be edited or deleted by its author; it is invisible to the owner. The page says how many are waiting (*"2 unsent drafts"*) and how many sit on an earlier version.
3. **Send.** *Send the feedback* submits **all** the drafts of that version at once (one conditional `UPDATE`, so a second click finds nothing to send: `nothing_to_send`). One history line (*"Feedback sent (2 comments)"*) and **one** e-mail to the owner per sending, however many comments.
4. **What was sent is never changed.** No edit, no delete, not through the API and not through SQL (a trigger aborts). More is said as a **follow-up**, which is a new comment under the same thread.
5. **Follow-up** on a sent thread; **reopen** a resolved one (*"We resolved this comment. If you have more to say, reopen it."*). A follow-up on a resolved thread is refused until it is reopened (`thread_resolved`).

## What the owner can do

* See the feedback grouped **by version**, each thread with its marker number, its position in words (*"25% from the left, 50% from the top"*), the customer's words and every reply, in the order they were written, as **text** (markup is shown, never run).
* **Reply** (the customer reads it, and is e-mailed once), **resolve** and **reopen** a thread.
* Keep **private notes** on the deliverable, a version or a comment. They are a separate table, appear in no customer page, API answer or e-mail, and cannot be changed. The owner's *internal description* is the same: never selected for a customer.
* Nothing the customer wrote as a **draft** is ever shown to the owner.

## Limits

| What | Limit |
| --- | --- |
| A comment | 2000 characters (the database allows 5000 as a last line of defence); empty or only spaces is refused |
| Unsent drafts per deliverable and customer | 50 |
| Comments per deliverable and customer | 500 |
| An owner's reply / private note | 2000 characters |

Markup, scripts and links in any of these are stored as typed and **escaped everywhere they are shown** (pages and e-mails); no comment is ever interpreted as HTML.

## Rules in one table

| Situation | Answer |
| --- | --- |
| A customer comments on a version that is not the current one | refused; the page offers no form on it |
| …on an archived deliverable, or in a finished/cancelled project | refused (`archived`, `project_closed`); readable |
| …on someone else's deliverable, or one that is not published | **404**, the same as for one that does not exist |
| Two people send at the same moment | each draft is sent once; the second sees `nothing_to_send` |
| The owner replies on a thread of an older version | allowed (the thread is a record); the customer is e-mailed |
| A version is published while the customer has drafts | the drafts stay on their version; the page counts them |

## The status that follows

Feedback alone **does not change the review state** and **is never an approval**. Only an approval request changes it (APPROVAL_WORKFLOW.md); `last_customer_activity_at` records that the customer did something, and the owner's list shows it with the number of open threads.
