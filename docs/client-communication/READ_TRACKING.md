# Read tracking

Who has read what is kept **on the server, per reader**. It is never a flag in the browser, and nothing is cached in a column: every count is computed from the messages and the reader's marker, so it cannot drift and a message cannot be counted twice.

## The marker

`conversation_reads` holds **one row per reader per conversation**: the highest message `seq` that reader has been shown. A customer is read as themselves; an administrator as **that one administrator** (two administrators have two markers and neither clears the other's unread).

## What counts as unread

| Reader | Unread is |
| --- | --- |
| The customer | the owner's customer-visible **texts and announcements** that are not removed, after their marker |
| An administrator | the customer's **texts** that are not removed, after that administrator's marker |

**Never unread**: your own messages; the owner's private notes (for the customer, they do not exist); **system events** (context, not a question); removed messages; an activity feed.

## Rules at the edges

* **Opening a conversation marks nothing.** The detail call returns the messages; the screen then calls `POST …/read` with `upTo` = the newest `seq` **it has drawn**. So a message that arrives between the two stays unread, and a failed or slow load is never marked read.
* **Only while the page is in front of the reader.** The screens mark on load and again on `visibilitychange`, and only when `document.visibilityState === 'visible'`. A tab left open in the background does not read anything. A message that arrives by the gentle 45-second refresh is marked once it has been drawn and the page is visible.
* **A marker never claims more than exists or more than the reader can see**: `upTo` is clamped to the highest `seq` of the conversation that is visible to that reader (a customer's marker can never cover a private note's `seq`), and a number above it is accepted as the highest.
* **A marker never moves back** (the database trigger and `MAX(…)` in the upsert): marking an old `seq` after a newer one changes nothing, and the time of reading changes only when the marker moves.
* **Someone else's marker cannot be moved or tested**: the conversation is looked up through the customer first, so a stranger's call is the same 404 as a missing conversation.
* **The unread total of a customer** is the sum over their threads only (a feed is never unread); it feeds the menu's badge (*"3 unread messages"* in words as well) and the inbox's *Unread* filter. **The owner's** is the number of threads (and messages) with a customer message after *their own* marker, shown in the Communication center and its menu item.
* **The customer is never told that the owner has read something**, and the owner is never shown whether the customer has opened a conversation. There is no read receipt in either direction.
* **Writing marks nothing.** Sending a message does not move anybody's marker; only the screen's `read` call does.

## Where it is

`server/src/modules/communications/reads.ts` (`markRead`, `unreadIn`, `customerUnreadTotal`, `adminUnreadTotals` and the SQL fragments), the `read` endpoints in ARCHITECTURE.md, `src/portal/unread.tsx` (the badge), `MessagesViews.tsx` and `CommunicationPage.tsx` (the marking effects). Tests: `communicationsReadSearch.test.ts` (six tests on markers) and the journey (*"the navigation says how many messages wait, in words as well; the inbox lists the conversation as unread"* and *"opening it shows the owner's words, and the conversation is read only after they have been shown: the badge goes, the server agrees"*).
