# Message visibility

Every message has one `visibility`: **`customer`** (both sides see it) or **`internal`** (only the owner). Only the owner can write an internal message, and only as a *private note*.

## Who sees what

| | The customer | The owner |
| --- | --- | --- |
| Their own words, the owner's customer-visible words, announcements | yes | yes |
| System events (the platform's facts) | yes | yes |
| **Private notes** | **never** | yes, in a visibly different look (dashed border, *Private note* label, the owner's e-mail address) |
| A removed message | a line saying that a message was removed; **never its words** | the line, and the words are not shown either (a removed message is a tombstone for both) |
| Another customer's conversations | **never** (a lookup by someone else's reference is the same 404 as a missing one) | yes |
| Who the owner is (the administrator's e-mail address or id) | **never**: only *"the studio"* | yes |
| That the other side read a message | never | no read receipt exists |

## What keeps a private note private

The rule is applied **in the query**, not in the screen:

1. **The customer's reads fix `visibility = 'customer'` in SQL** (`views.ts`): the timeline, the last-message preview of the inbox, the unread counts, the visible maximum a read marker may reach, and the search. The customer's read model has **no field** that could carry a note; the administrator's e-mail address is not selected for them.
2. **A private note changes nothing a customer can observe**: no status, no unread, no `last_message_at` (only `last_activity_at`, which the owner's pages use), no e-mail, no event.
3. **The database refuses** a private note that is not the owner's plain, non-important text, and refuses to change the visibility of a message afterwards (`conversation_messages_immutable`): a note can never be *turned into* something a customer sees by an update, and a customer-visible message can never be hidden-then-shown again.
4. **The search** of the customer looks only into customer-visible, non-removed words; the owner's search is the only one that reads the notes, and it labels a hit that is only in a note.
5. **E-mails never carry any message text** (NOTIFICATIONS.md), so a note cannot leak by e-mail. **Logs never carry it** either (SECURITY.md).
6. **Errors say nothing about it**: refusing a customer a thread that contains only a private note says the same as a thread that does not exist (`ownConversation`).

## What the tests prove

* `communicationsSecurity.test.ts` ("the owner's private notes, and the words of a removed message, are in no answer a customer can ask for") writes a private note and a removed message with unique words and then, **as the customer**, calls the inbox, the summary, the conversation, the search (for the note's words, for the removed words and for a word that appears only in the note), the contexts, the preferences, the portal overview, the read call and a refused send, and fails if those words, an `"internal"` visibility or the owner's address appear in any answer. The same test checks that the removed message is reported as `removed`.
* `communicationsNotifications.test.ts` ("carries no word of what was written…") checks that neither the text, nor the subject, nor a private note is in the e-mail, in the outbox or in a log line.
* `communicationsReadSearch.test.ts` checks that the customer's search never finds a note and the owner's search finds it and says it was a note.

## Removed messages

Removing is a **tombstone**, not an erasure: both the customer's and the owner's screens show *"A message was removed"* and never the words (`body` is `null` and `removed` is `true` in every read model), and no search finds them. **The words stay in the database** (the record of what was said is the owner's, and a trigger refuses to change a removed message). If a message must really be erased (for example because it holds something it never should have), that is a deliberate operation on the database with a backup, or the erasure of the customer's account; there is no screen for it. See LAUNCH_CHECKLIST.md.
