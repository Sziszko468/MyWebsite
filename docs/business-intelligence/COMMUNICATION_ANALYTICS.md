# Communication analytics

Source: `conversations`, `conversation_messages`, `customers`. Permission: `clients:read`. Filter: customer language.

## What is counted

**Only customer-visible text messages** (`visibility = 'customer'`, `message_type = 'text'`, not deleted, sent by a customer or an administrator; threads only). **Private notes are never read** (`private_notes_never_read`), nor are message bodies: only who sent a message and when.

| id | kind | type | meaning |
| --- | --- | --- | --- |
| `openConversations` | A | state | open, waiting for you or waiting for the customer, now |
| `customerWaitingForAdministrator` | A | state | the last customer-visible message is from the customer — **the customer waits for you** |
| `administratorWaitingForCustomer` | A | state | the last customer-visible message is from you — **you wait for the customer** |
| `conversationsResolved` | A | flow | marked resolved in the period |
| `messagesFromCustomers`, `messagesFromAdministrators` | A | flow | messages in the period (stacked over time: `messagesFromCustomersSeries`, `messagesFromAdministratorsSeries`) |
| `averageResponseHours` | D | — | the average time to a first reply (below) |
| `responsesMeasured` | A | — | how many first replies the average is based on |

Breakdowns: `messagesByLanguage` (the customer's preferred language), `conversationsByStatus`.

## Time to a first reply

Within each conversation, consecutive messages from the same side form a *run*. A reply is a run from an administrator that follows a run from a customer; its time is *first message of the customer's run → first message of the administrator's run*. The metric is the average of those times for **replies made in the period** (the customer message may be up to 60 days older than the period). It uses SQLite window functions (`LAG`, `SUM … OVER`) over the messages themselves; nothing is estimated. When no administrator replied in the period the figure is `unavailable` (`no_replies_in_period`), not 0 hours.

The time is wall-clock time. It does not exclude nights, weekends or the customer's own waiting time, and the screen does not pretend it does.

## What it cannot tell you

Whether a message was *read*, how good a reply was, or sentiment. None of those is stored for analytics; none is inferred.
