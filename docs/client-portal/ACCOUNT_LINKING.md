# Client portal: account linking

**The rule: a customer sees a quote request or a booking if and only if there is a row in `customer_links` that joins their account to it.** The address typed on a quote form or a booking form is **never** a key: nobody verified it when it was typed (`quote_requests.email`, `bookings.email`), and a stranger can type yours.

## The two ways a record is linked

| Method (`customer_links.method`) | Who | When | Recorded as |
| --- | --- | --- | --- |
| `admin` | the owner, on the customer's page in the administration (*Records → Link*) | always available; any record that belongs to no account, whatever address it carries | `record_linked` in the account's history, actor = the administrator's address, and the administration's audit log |
| `verified_email` | the **signed-in customer** (*Account → Link your earlier requests*) | **only while the owner has switched "Customers may link…" on** (off by default), and only for records that carry **the address the customer has proven** (the account's verified address at the moment of the claim) | `record_linked`, actor = the customer, detail names the method |

A record belongs to **at most one** account (two partial unique indexes); a second link is refused (`409` for the owner). Deleting the record or the account removes the link (foreign keys). The owner can **unlink** at any time; the customer stops seeing the record at once (a test).

## What the server decides, not the browser

For a claim the **server computes the candidates**: unlinked records whose address equals the account's verified address (case-insensitive), at most 100 of each kind. The browser sends a list of ids; every id that is not among the candidates is **ignored silently** (it neither links nor says why). Therefore a request that names someone else's record, a booking, a project id, a nonsense string or a record with another address links nothing (`clientPortalIsolation.test.ts`, `clientPortalLinking.test.ts`).

## What is never done

- **No automatic linking.** Not at sign-in, not at registration, not when a request or a booking is made later with the same address, not when an address is verified. (Tests: a request made before and after the account exists belongs to nobody until it is linked.)
- **No linking by an unverified address.** An `invited` account (nobody has opened a link: the address is unproven) has no candidates and cannot have a session. A new address that has been *asked for* but not confirmed is not used: only the address in `customers.email` counts, and that column changes only when the link sent to the new address is opened. A switched-off account has nothing to claim. (Tests for each.)
- **No silent conversion of an existing link.** The quote and booking links work exactly as before; the portal never turns one into a sign-in.
- **No linking by a reference typed into a form.** The booking form's "related reference" field is a note for the owner (and, when the address matches, a suggestion the booking already stores); it creates no link.

## What the owner sees when linking

On the customer's page: the records already linked (with who linked them and when), and **"Records with this address that belong to no account"**: a list for the owner to choose from. The list is a *convenience*, not a verdict: the page says the address on a request was typed by whoever sent it, and the account's address may be unverified (the page says so).

## Existing records and the migration

Migration 0012 links nothing. Every existing quote request and booking is unlinked until the owner links it or (if allowed) the customer claims it.

## From an accepted quote to a project

See [ARCHITECTURE.md](ARCHITECTURE.md) §6: accepting a quote changes nothing about accounts or projects. The owner links the request to the customer and then creates the project, which is allowed only for a request linked to **that** customer and **with an accepted quote**.

## Owner decisions

Whether to switch customer self-linking on at all (it is the only place an unverified-at-submission address becomes a link, justified because the customer has since proven the mailbox); whether to link by hand for every customer; what to do when two people share a mailbox. [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) A.
