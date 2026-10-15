# REST API

Base URL: `/api`. Request/response bodies are JSON except multipart uploads and binary/CSV exports. Use `Authorization: Bearer <accessToken>` on protected endpoints. Tokens are returned only by login, initial setup, invitation acceptance and refresh; refresh cookies must be included with credentials. Errors return `{ "message": "..." }`.

## Authentication

| Method | Path                      | Purpose                                                                                    |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/auth/setup`             | One-time bootstrap: `key`, `name`, `email`, `password`                                     |
| POST   | `/auth/login`             | `email`, `password`; returns safe `user` and `accessToken`                                 |
| POST   | `/auth/refresh`           | Rotates HTTP-only cookie; requires exact frontend `Origin`                                 |
| POST   | `/auth/logout`            | Revokes refresh token; requires exact frontend `Origin`                                    |
| GET    | `/auth/me`                | Current safe user                                                                          |
| PATCH  | `/auth/profile`           | Update `name` only                                                                         |
| POST   | `/auth/change-password`   | `currentPassword`, `password`; invalidates existing access tokens and all refresh sessions |
| POST   | `/auth/forgot-password`   | `email`; generic response when SMTP is configured                                          |
| POST   | `/auth/reset-password`    | `token`, `password`; one-use, 30-minute reset link                                         |
| POST   | `/auth/invitations`       | Admin: `name`, `email`, `role`; only Super Admin can invite a Super Admin                  |
| POST   | `/auth/accept-invitation` | `token`, `password`; invitation expires after 24 hours                                     |

Passwords: 12–72 characters, at least one uppercase letter and one number. Email delivery requires SMTP configuration. Frontend access tokens stay in memory; never store them in localStorage.

## Clients and jobs

`GET /clients`, `POST /clients`, `PATCH /clients/:id`, `DELETE /clients/:id`; equivalent job endpoints under `/jobs`.

Lists accept `q`, `status`, `page` (default 1), and `limit` (1–100, default 20). Response: `{items,total,page,pages}`. Lists sort newest first. Deletion is soft. Clients with active job records cannot be archived. Write payloads reject unknown fields.

Client minimum: `{ "companyName": "Example Company" }`.

Job minimum: `{ "title": "Sales Executive", "client": "<clientObjectId>", "openings": 10 }`.

`GET /dashboard` returns live scoped counts, monthly requirements, recent jobs and activity. `GET /users` is limited to Admin/Super Admin/HR Manager. `GET /audit-logs` is limited to Admin/Super Admin.

## Recruitment

- `GET/POST /candidates`; `PATCH/DELETE /candidates/:id`. Required: `fullName`, `phone`, `consent:true`. Skills are an array of strings. Contact deduplication is enforced with database indexes. Candidates with applications are retained for history.
- `GET /applications` accepts optional `job`; returns `{items,stages}` (up to 500 records).
- `POST /applications`: `{candidate,job}`. The pair is unique. Stage creation and audit history commit in one transaction.
- `PATCH /applications/:id/stage`: `{stage,version,note?}`. Use the application version returned by the list. Stale updates return 409. All 16 configured stages are available to authorized recruiting staff; stage-specific approval gates remain an extension.
- `GET /applications/:id/history`: attributed stage history.
- `GET/POST /interviews`; `PATCH /interviews/:id`. Creation requires `application`, ISO `scheduledAt`, `duration` in minutes, and `type`. Optional `location`, `interviewer`, `notes`.
- `GET/POST /interviews/:id/feedback`: `rating` (1–5), `recommendation` (`Proceed`, `Hold`, `Reject`), `notes`.

## Operational records

`GET /workspace/modules` returns only the requesting role's modules, their fields and write capability. For each resource below, `GET /<resource>`, `POST /<resource>`, `PATCH /<resource>/:id`, and `DELETE /<resource>/:id` are implemented:

`teams`, `tasks`, `leads`, `deals`, `vendors`, `placements`, `leaves`, `expenses`, `incentives`, `branches`, `offers`, `email-templates`.

Lists accept `q`, `page`, `limit`. Dates use `YYYY-MM-DD`. Financial fields ending in `Paise` must be nonnegative integers, capped at 1,000,000,000,000. Use metadata from `/workspace/modules` for the exact field definitions. All mutations reject unknown fields. Super Admin/Admin/HR Manager/Team Leader have company-wide record scopes; other roles operate on owned records, subject to module permission. Team hierarchy-based permissions are not yet implemented.

`PATCH /leaves/:id/approval`: `{status:"Approved"|"Rejected"}`. Manager role required; no self-approval. Approval decisions are transactionally audited.

## Attendance and finance

- `GET /attendance`; `POST /attendance/check-in`; `POST /attendance/check-out`. Staff see their own records; HR managers see the company view. Workday boundaries use Asia/Kolkata.
- `GET/POST /invoices`: finance only. Create `{companyName,gstin?,description,subtotalPaise,gstBasisPoints,dueAt}`. Amounts and tax are computed on the server; client-supplied totals are rejected.
- `GET/POST /payments`: finance only. Create `{invoice,amountPaise,reference,paidAt}`. References are unique, invoice balances are transactionally updated, and overpayments are rejected.
- `GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD`: activity counts; finance summary only for finance roles.

Invoice and payment lists currently return the latest 100 records. Reports are date-filtered counts, not the complete MIS/report suite.

## Partners and assignments

- `GET /portal`: Vendor gets assigned open jobs and its own submissions. Client gets jobs for `User.clientRef` and applications only from submitted and subsequent approved display stages, with a restricted candidate projection.
- `POST /portal/submissions`: Vendor only. `{job,candidateName,phone,email?,consent:true,notes?}`. Job must be assigned to the vendor. Duplicate job/phone/vendor submissions return 409.
- `GET /assignments`: managers get accessible jobs, active users, clients and teams.
- `PATCH /assignments/jobs/:id`: `{assignedRecruiters:[],assignedVendors:[]}` with authorized User IDs.
- `PATCH /assignments/clients/:id`: Admin/Super Admin links a Client user: `{client:"<clientId>"}`.
- `GET/POST /team-memberships`: managers; create `{team,user,leader?}`. `DELETE /team-memberships/:id`: HR/Admin.

## Documents, import/export, and communication

- `GET /documents`: authorized metadata (never storage keys).
- `POST /documents`: multipart `file` and `category`; private S3 storage, 10 MB max, PDF/DOCX/PNG/JPEG.
- `GET /documents/:id/download`: authorized signed URL, expires after 60 seconds.
- `DELETE /documents/:id`: permanently removes object and soft-deletes metadata.
- `POST /data/candidates/import`: multipart CSV/XLSX `file`; max 2 MB, 500 candidate rows; required headers `fullName,phone,consent`. Consent must be `true`. XLSX expanded data is bounded at 20 MB. Returns row-level results. Partial imports are intentional; errors do not roll back successfully imported rows.
- `GET /data/:resource/export?format=xlsx|csv`: permission-scoped export of clients, jobs, candidates or operational records, capped at 10,000 rows. CSV formula prefixes are neutralized. XLSX cells are written as literal values.
- `GET /communication/history`: requesting user's delivery history.
- `POST /communication/email`: `{candidate,template}`; scoped consented candidate and template required; uses configured SMTP and records Pending/Sent/Failed history.
- `GET /notifications`; `PATCH /notifications/:id/read`: only the notification's owner.

Socket.IO authenticates using `auth.token`, uses private user rooms, and emits `notification`. Clients reconnect with a fresh access token after refresh. Health: `GET /health`, returns 503 when MongoDB is disconnected.

## Permission policy

Roles are enforced in middleware and queries, not based on a role sent by a browser. Admin/Super Admin/HR Manager/Team Leader have broader company scopes; sales records require a sales role, finance requires Admin/Super Admin/Finance Manager, recruiting requires a recruiting role. Vendor and Client cannot access internal resource APIs. Dynamic custom role editing, per-branch security, full client contact CRUD and vendor payment workflows remain on the roadmap.

## Session and user access controls

`GET /auth/sessions` lists the requesting user?s active refresh sessions with created/expiry timestamps. `DELETE /auth/sessions/:id` revokes only that user?s session. Access JWTs issued by login/refresh include the session ID, which is checked on protected requests.

`PATCH /users/:id` accepts `{role,active}` for Admin/Super Admin. Self-access changes are prohibited; only a Super Admin can manage another Super Admin or grant that role. Changes increment the target?s authentication version and are transactionally audited.

## Global contact uniqueness

Contact-bearing modules enforce unique email and phone registrations both within each module and across the CRM. Archived/inactive records retain their registrations until physically deleted from MongoDB. Duplicate creates and edits return 409; candidate imports report those rows as Duplicate. Emails are normalized to lowercase and phone formats are canonicalized, with India (+91) as the default for 10-digit local numbers. See CONTACT-POLICY.md for migration and operator details.
