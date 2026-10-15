# Deployment and service setup

No live infrastructure has been created. These steps configure the local source for your own accounts.

## MongoDB Atlas

1. Create an Atlas project and replica-set cluster. Create a database user with read/write permissions limited to the `inseetcrm` database. Do not use an Atlas organization administrator as an application credential.
2. Add your development IP and Render's documented outbound IPs to the cluster network access list. Prefer an explicit allowlist over unrestricted access.
3. Copy the Node.js connection string from Connect → Drivers. URL-encode the password, select the `inseetcrm` database in the URI, and put it only in backend `MONGODB_URI`.
4. Confirm the backend starts and `/api/health` reports `database: connected`. The server initializes model indexes before accepting requests. On large existing datasets, move index creation into a reviewed migration before rollout.
5. Enable the backup/snapshot/point-in-time features available for your selected Atlas tier. Set a retention policy, restrict backup access, and test a restore into a separate cluster. A backup plan is not complete until restore has been tested.

Official reference: [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## Render backend

Use the included `render.yaml` blueprint or create a Node web service from this repository. Keep the repository root as the service root.

- Build command: `npm ci --omit=dev --workspace backend`
- Start command: `npm start --workspace backend`
- Health check path: `/api/health`
- Node version: 24.14 or newer compatible Node 24 release.
- Set `NODE_ENV=production`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `SETUP_KEY`, and exact `FRONTEND_URL` without a trailing slash.
- Add SMTP and S3 environment variables if those services will be enabled.
- Render supplies `PORT`. Never expose Atlas credentials as frontend environment variables.

Official references: [Express on Render](https://render.com/docs/deploy-node-express-app), [health checks](https://render.com/docs/health-checks).

## Vercel frontend

Import the repository, choose Vite, and set the project root to `frontend`. Use the root workspace lockfile by enabling access to files outside the selected root if Vercel requires it for the monorepo.

- Install command from the `frontend` directory: `cd .. && npm ci --workspace frontend --include-workspace-root`
- Build command: `npm run build`
- Output directory: `dist`
- Public environment variable: `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`

`frontend/vercel.json` supplies SPA route rewrites. Set Render's `FRONTEND_URL` to the exact deployed frontend origin, then redeploy the backend. Rebuild the frontend after changing `VITE_API_URL` because Vite embeds it at build time.

For reliable production refresh cookies, use frontend/backend subdomains of one domain such as `app.example.com` and `api.example.com`. The app uses Secure, HTTP-only, SameSite=None cookies in production; unrelated vercel.app/onrender.com domains may be affected by browser third-party cookie restrictions. CORS allows only the configured frontend origin. WebSocket CORS uses that same origin.

Official references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [build configuration](https://vercel.com/docs/builds/configure-a-build).

## Email

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and a verified `MAIL_FROM`. Configure the sending domain's SPF/DKIM/DMARC with your provider. Test invitations, reset links, and consented candidate email using test recipients before enabling real use. Tokens are hashed in MongoDB and expire; reset and invitation links are not printed to logs.

## Private files

Create a private S3 bucket. Enable Block Public Access and encryption. Create a least-privilege service identity limited to `GetObject`, `PutObject`, `DeleteObject` for this bucket's `private/` prefix. Configure `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; set optional `S3_ENDPOINT` only for a trusted S3-compatible provider that supports the specified encryption parameters.

The backend uploads using Multer memory storage and server-side S3 credentials. Clients receive signed attachment downloads only after authorization, valid for 60 seconds. A signed link is a temporary bearer credential: do not share it publicly. Production malware scanning, quarantining and lifecycle retention are pending; add them before accepting untrusted uploads at scale.

## Release verification

After configuring real services, run the automated suite and production build, then verify first-admin setup, login/refresh/logout, client/job/candidate CRUD, application stages, portal isolation, invoice payments, SMTP delivery, document upload/download/delete and mobile keyboard use. Test both light and dark themes. No supported browser automation tool was available during source creation, so visual/browser QA is still required. Deployment success and live integrations are not asserted by a passing local build.

## Local startup troubleshooting

From the `backend` directory, both `node server.js` and `npm.cmd start` start the backend. From the repository root, use `npm.cmd start --workspace backend` or `node backend/server.js`. The compatibility entry point imports `src/server.js`; environment configuration loads `backend/.env` using its absolute module-relative path.

If Atlas SRV resolution fails with `querySrv ECONNREFUSED`, the optional backend-only `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` setting can select working DNS resolvers for Node. It does not modify Windows DNS settings. Leave this blank where system DNS already works or use DNS servers approved for your network.
