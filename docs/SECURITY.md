# Security and operating notes

## Implemented controls

- Required server-side environment validation; no browser secrets; secrets and dependency caches ignored by Git.
- Bcrypt cost 12; bounded passwords; short access tokens; SHA-256-hashed random refresh/reset/invitation tokens.
- Refresh cookies are HTTP-only, production Secure and SameSite=None. Refresh/logout require the exact trusted frontend Origin. Rotation uses an atomic revoked-at update; a token can refresh only once.
- Browser access tokens stay in Zustand memory. Sessions are restored through the cookie. Password changes/reset increment an authentication version and revoke refresh sessions. Issued access JWTs include a session ID checked by middleware, so session revocation also invalidates those access tokens.
- Server-side roles are loaded from MongoDB on each authorized request. IDs, payload fields, roles and query limits are validated. APIs do not accept browser-supplied owners, totals, or approval actors.
- Private vendor/client record scopes, restricted client candidate projection, parameterized MongoDB queries, escaped search regular expressions, and bounded pagination/imports.
- Transactions for bootstrap, application stages/history, operational mutations/audits, leave approvals and invoice/payment balances.
- Integer paise and basis-point financial inputs. BigInt intermediate tax calculation avoids binary floating-point drift. Payment reference uniqueness and balance checks are inside a transaction.
- Helmet, allowlisted CORS, JSON size limits, request/auth rate limits and redacted request logs.
- File allowlist, size and magic-byte validation, private cloud storage, attachment downloads, signed URL expiry, and authorized delete.
- CSV formula neutralization, spreadsheet row/column limits, expanded XLSX-size checks and consent enforcement.
- Socket.IO token validation, private user rooms and token-expiry disconnection.

## Required before production

This is an initial core implementation. Complete security review, restore drills, real-service testing and browser QA before deployment to real recruitment operations.

- Define organization retention, consent withdrawal, erasure/anonymization, data export and legal-hold policies. Soft deletion alone is not a complete privacy program.
- Add file quarantine, malware scanning, document/entity relationships, and storage lifecycle policies. DOCX signature checking identifies a ZIP container, not proof that all document content is safe.
- Add refresh-token families/reuse incident handling and device metadata. Monitor abnormal access and revoke compromised sessions. Socket connections disconnect on token expiry; immediate disconnection on password/session changes is still pending.
- Add a shared rate-limit store and notification adapter for multiple backend replicas. Current limiters and Socket.IO broadcasts are process-local.
- Enforce branch/team hierarchy and per-stage approval policy if organizational operations require it. Current manager roles have company-wide access; custom permission editing is not enabled.
- Add idempotency keys for retryable external email/storage actions and durable queues for delivery/reminders. Delivery can be uncertain if the provider succeeds but the response fails.
- Configure production email verification/domain policy and optional MFA/SSO.
- Finish GST supplier registration details, place of supply, tax split, invoice numbering policy, credit notes, reconciliation and finance approval rules before using output as compliant tax invoices. Current invoice output is a service invoice with computed GST, not a complete tax compliance implementation.
- Validate and pin all dependency versions through the committed lockfile; review dependency advisories. The current spreadsheet library's transitive UUID advisory is tracked in the delivery status if unresolved.
- Move index migrations out of application startup for large datasets, add query observability and load tests, and establish real restore-tested Atlas backups.

The single-company scope is intentional. This code does not implement a multi-tenant SaaS isolation boundary.
