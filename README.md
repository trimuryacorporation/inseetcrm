# INSEET Enterprise Recruitment Workspace

JavaScript monorepo using React + Vite, Tailwind CSS, React Router, Zustand, Axios, React Hook Form, Zod, Lucide, Recharts, Express, Mongoose, MongoDB, bcrypt, JWT and Socket.IO. No Next.js, TypeScript, Firebase, Supabase, or SQL database is used.

## Run locally

Requires Node.js 24.14+ and a MongoDB replica set (Atlas is recommended). Transactions require a replica set; a standalone local MongoDB process is insufficient.

From the repository root:

```powershell
npm.cmd ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Edit `backend/.env` locally. Set `MONGODB_URI`, a random `JWT_ACCESS_SECRET` of at least 32 characters, and a separate random `SETUP_KEY` of at least 24 characters. Do not commit this file or put secrets in any `VITE_` variable. Generate secrets locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

```powershell
npm.cmd run dev
```

Open http://localhost:5173/setup. Enter your setup key, administrator name/email, and a password of 12–72 characters containing an uppercase letter and a number. The bootstrap transaction creates exactly one first Super Admin and its audit record. A configured database is required; there is no mock database, demo login, or embedded credential.

Windows users should use `npm.cmd` if PowerShell blocks `npm.ps1`. Other shells can use `npm`.

```powershell
npm.cmd test
npm.cmd run build
```

Tests start an isolated temporary MongoDB replica set and never use the Atlas URI. The first test run may download a MongoDB test binary. Set `MONGOMS_SYSTEM_BINARY` to a compatible installed `mongod` executable to avoid downloading it. Frontend output is `frontend/dist`.

## What is implemented

- Responsive navy-sidebar application shell, mobile navigation, light/dark themes, profile menu, job search, breadcrumbs, dialogs, loading and error states, and toast notifications.
- Initial admin setup, login, protected routes, bcrypt, 15-minute in-memory JWT access tokens, hashed rotating refresh tokens in HTTP-only cookies, logout, password changes and revocation, SMTP password recovery, and expiring email invitations.
- Backend role checks and record ownership scopes. Vendor and client portal routes use explicit job assignment and company linkage. Access is checked in database queries.
- Database-backed dashboard with clients, jobs, vacancies, candidates, interviews today, joined placements, monthly job charts, and recent audit activity.
- Client/job CRUD, status/search filters, pagination, soft deletion, client relationship checks, job assignment, and CSV/XLSX exports.
- Candidate CRUD, normalized-phone/email duplicate detection, consent capture, bounded CSV/XLSX imports with row results, and exports.
- Candidate-job applications, all 16 recruitment stages, drag-and-drop and keyboard-accessible stage selection, transaction-backed history, and optimistic concurrency control.
- Interview scheduling, rescheduling/status updates, and attributed feedback.
- Teams, tasks, sales leads/deals, vendors, placement/offer tracking, leave requests/approval, branches, expenses, incentives, and email templates use shared validated CRUD APIs. These are core record workflows, not the complete specialized workflows in the original enterprise specification.
- Attendance check-in/check-out with one record per person per India workday and calculated working time.
- Invoice and payment ledger: integer paise, integer GST basis points, exact tax rounding, duplicate payment-reference protection, transactional invoice balances, and overpayment prevention. Invoice and report printing supports browser Save as PDF.
- Date-filtered activity reports, with financial summary restricted to finance roles.
- Private S3-compatible document upload, content signature checks, 10 MB limit, authorized 60-second signed downloads, and storage deletion.
- Consented candidate email using an approved template, SMTP delivery results and communication history.
- Authenticated Socket.IO notifications for client/job creation and application stage changes; per-user rooms and token-expiry disconnection.
- All requested model names are present. Additional session, bootstrap, membership, template and expense models support the implemented flows.

See [API](docs/API.md), [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), and [delivery status](docs/STATUS.md).

## Configuration boundaries

Atlas, SMTP, private object storage, Vercel, and Render must be configured in your accounts. They have not been provisioned or tested against live credentials. Missing email/storage configuration returns a clear 503 response. No email, WhatsApp, production upload, backup, or deployment is claimed to have happened.

This is a working core implementation, not a claim that the entire requested enterprise product is production-ready. Read the outstanding requirements in `docs/STATUS.md` before rollout.
## Privileged account seed

Run `npm.cmd run seed --workspace backend` from the repository root. The seed creates the approved `superadmin@inseet.in` and `admin@inseet.in` accounts and system role metadata in the configured database. It completes the initial bootstrap marker and records account creation in the audit log. It does not create sample recruitment or finance data.

Unique random passwords are stored only in the local ignored `backend/.env.seed` file and are bcrypt-hashed in MongoDB. Open that file locally to read the login credentials. Do not commit or share it. If rerunning on a different environment, securely provision the same file there or explicitly configure the intended credentials before running. Existing accounts are retained without resetting passwords; conflicting roles or inactive accounts cause a transaction rollback. Removing the credentials file does not reset existing database passwords.

System role documents are metadata; backend role middleware remains the authority for access checks.
"# inseetcrm" 
# inseetcrm
