# Email and phone registration policy

Email and phone identifiers are unique both within their collection and across contact-bearing CRM modules: users, clients, candidates, leads, vendors, branches, client contacts and vendor submissions. Reusing either identifier is rejected even if the other identifier is different.

- Emails are trimmed and lowercased. Empty optional contacts are not registered.
- Indian 10-digit numbers, leading-zero variants and +91 variants normalize to the same +91 identifier. Other international numbers should include their country code.
- Existing records can save their own unchanged identifiers. An identifier conflicting with another record returns HTTP 409 without exposing that record's details.
- Soft deletion, archiving and account deactivation do not release identifiers. Records remain in MongoDB and retain their reservations.
- After physical MongoDB deletion, the next authorized registration checks that the original document no longer exists and atomically reclaims its stale reservation. An archive flag alone does not qualify.
- A failed registration or edit rolls back reservations. Simultaneous requests cannot reserve the same identifier twice.
- Creating a separate record in another module with the same contact is deliberately blocked. Future lead/client conversions should link the existing identity rather than duplicate the contact record.

The implementation uses transactional ContactIdentity reservations plus normalized collection-level unique indexes. API creates/edits/imports/invitations and the privileged seed use the shared identityCreate/identityUpdate services. Future contact write paths must use these services; direct operator inserts in Atlas bypass application transactions and should not be used for registration.

## Existing database migration

`npm.cmd run migrate:contacts --workspace backend` checks existing contacts, normalizes them and backfills reservations. Existing collisions cause the migration to stop without deleting or merging records. New full-lifetime indexes are created before obsolete candidate active-only indexes are removed. Back up the database before applying migrations in other environments.

Startup automatically performs the initial backfill when its marker is absent, then ensures indexes. Contact IDs are not deleted automatically when records are archived. Migration was applied to the configured inseetcrm database without removing any business/user records.
