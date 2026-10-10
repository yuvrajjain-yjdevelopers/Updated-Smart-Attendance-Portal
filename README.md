# Smart Attendance Portal

Attendance follow-up and parent messaging for department and class-teacher accounts. This app uses Next.js, Prisma and PostgreSQL (Supabase is the recommended hosted database; Vercel hosts the Next.js app).

## Server and Client Components

Never pass component references or functions as props from a Server Component to a Client Component. Pass rendered React elements for visual content, and define interactive event handlers inside Client Components.

## Setup

Requirements: Node.js 20+ and npm for local development. Local development continues to use SQLite via `prisma/schema.sqlite.prisma` and the ignored local `prisma/dev.db`. Vercel uses the PostgreSQL schema in `prisma/schema.prisma`. For hosting, create a Supabase project and use its Transaction pooler URL (port `6543`) for `DATABASE_URL` and its Session pooler URL (port `5432`) for `DIRECT_URL`. Supabase direct connections may require IPv6, so the Session pooler is the safer Vercel migration connection.

```powershell
Copy-Item .env.example .env
# For local SQLite, set DATABASE_URL="file:./dev.db" in .env.
npm install
npm run db:push:local
npm run seed
npm run dev
```

Open http://localhost:3000. The seed command creates demo accounts and fake students; only run it against a development database. Do not seed demo records into the production database. On a fresh hosted database, first create an ignored `.env.production.local` file and use `npm run admin:create:production`; it creates only the initial HOD account and refuses to overwrite an existing account.

## Deploy to Vercel with Supabase

1. Create a Supabase PostgreSQL project. In **Connect**, copy the Transaction pooler URL (port `6543`) for `DATABASE_URL` and the Session pooler URL (port `5432`) for `DIRECT_URL`. URL-encode special characters in the database password. Vercel serverless requests use transaction pooling; Prisma migrations use the session pooler.
2. Push this repository to a private GitHub repository and import it into Vercel as a Next.js project.
3. In Vercel **Project → Settings → Environment Variables**, add `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, and `APP_SECRET` for Production. Use unique, random values for the two app secrets. Never use a `NEXT_PUBLIC_` prefix for these values.
4. Preview deployments should use a separate Supabase project. Add its `DATABASE_URL` and `DIRECT_URL` under Preview and set `APPLY_PRISMA_MIGRATIONS=true` for Preview only. The preview build skips migrations by default; never point a preview deployment at the production database.
5. Deploy. `vercel.json` selects `npm run vercel-build`. Production runs `prisma migrate deploy` before `next build`; preview runs migrations only when `APPLY_PRISMA_MIGRATIONS=true`. Confirm the tables appear under the `public` schema.
6. Before first login, create a local `.env.production.local` file containing the production Supabase `DATABASE_URL` (use the session pooler URL), `HOD_USERNAME`, `HOD_NAME`, and a strong `HOD_PASSWORD`. Then run `npm run admin:create:production` once. That command generates the PostgreSQL Prisma client and creates only the HOD account. The file is ignored by Git; do not paste its contents into chat or commit them. Do not run the demo seed on production.
7. Open the deployed URL, verify login and student/section pages, keep messaging in test mode, and test a message only to the configured test number before enabling real parent delivery.

The initial migration creates an empty schema; it does not copy records from the previous local SQLite database. Import real student data using the Students page after deployment. Do not run the demo seed against production.

## Run on other devices on the same WiFi

Start the server with `npm run dev -- -H 0.0.0.0` (or `npm run build` then `npm run start -- -H 0.0.0.0`). Find the laptop's WiFi IP with `ipconfig`, then open `http://<laptop-ip>:3000` on the phone. Allow Node.js / port 3000 through Windows Defender Firewall on Private networks. Keep the phone and laptop on the same WiFi.

## Optional Android SMS Gateway setup (Advanced)

Each sender configures their own phone in Settings. Install SMS Gateway for Android, enable either Local Server or Cloud Server, then enter that mode's username and password. Local mode uses the phone's IP and port 8080. Cloud mode uses the fixed cloud API endpoint in the adapter. Save settings and send a test SMS to your own number before messaging parents. Passwords are stored with AES-256-GCM using `APP_SECRET`; they are not returned by the settings API. The gateway is an optional legacy integration; the Send Center does not require it and never sends SMS through it.

The gateway adapter keeps endpoint and payload constants in `src/lib/sms/androidGateway.ts`. **Verify the endpoint paths and payload shapes against the current app docs and your installed app version before use:** https://github.com/capcom6/android-sms-gateway. The cloud endpoint and `textMessage` payload can change between releases.

Local mode may require the phone and app server to share a WiFi network. College WiFi client isolation can prevent access between devices. Disable battery optimization for the gateway app and keep the phone online. Cloud mode requires the app to be connected to its cloud server.

## Five-minute demo

1. Sign in as `hod` and open the dashboard.
2. Open Settings and confirm Test mode is on. Use the Demo checklist buttons to try the SMS and WhatsApp links.
3. Open Sections to see sample sections, add/rename sections, and upload a detention CSV for a section. Open Students to import the CSV master list and select detained students for SMS or WhatsApp. Test mode is enabled by default and routes messages to the configured test number.
4. Open Teachers to see each teacher's phone status without exposing credentials.
5. Sign out, sign in as `teacherA`, and confirm only Section A appears in My Class and Messages.

## Quality checks

```powershell
npm run build
npm run lint
npm test
```

`/api/health` checks database connectivity. Keep `.env` private; change both secrets to independent random values before deployment. WhatsApp uses a normal browser link and requires the sender's own WhatsApp Web session.

## Current scope

Student master import accepts CSV and XLSX with column aliasing, manual mapping, and grouped validation reports. Section pages include student management and paste preview. Detention lists accept CSV or text-based PDF and show a preview before applying; unmatched PDF rows can be added with blank parent/student mobile values. PDF parsing has synthetic fixtures for the documented layout quirks, but has not been checked against the actual college PDF because that file was not present in the workspace.

Teacher accounts can be generated from the Teachers page or while creating a section. Temporary passwords are shown once, with copy, print and CSV options. Teacher access, section assignment, sending permission, and password resets are managed from Teachers. Users can change their own password from Settings.

Messages are prepared per sender and can be previewed or edited before sending. The Send Center supports SMS links, Google Messages copy/paste, WhatsApp Web and phone links. Test mode starts enabled. Delivery cannot be detected; `OPENED` and `SENT_BY_USER` describe user-confirmed actions.
## Live demo script (5 minutes)

1. Sign in as the HOD and open **Settings**. Keep Test mode on and enter a reachable test phone number. If saving fails, check that the test number is a valid Indian mobile number and save again.
2. In **Settings → Demo checklist**, use **Test WhatsApp Web link** and **Test my computer's SMS link**. Confirm whether each app opened; if it did not, use WhatsApp on a phone or Google Messages for web in copy/paste mode.
3. Open a section, upload and apply a detention list, then review **Send SMS** or **Send WhatsApp**. If there is no prepared queue, check that at least one student's AVG is below the configured threshold and that their parent number is valid.
4. Confirm the dialog says `TEST MODE: everything goes to <test number>`. Open one message, send it from your own device/account, return to the portal, and click **Mark as sent**. If the device link is unsupported, use Google Messages for web and copy the number and message into the page.
5. Open **Messages** and confirm the sender, channel, test mode, recipient, mode and user-confirmed status are recorded. If the history is empty, refresh after marking the message as sent.
6. Sign in as a teacher and confirm that only their assigned section is available. If send is disabled, the HOD must enable `canSend` on the Teachers page.

The portal cannot detect SMS or WhatsApp delivery. `OPENED` means a link was opened; `SENT_BY_USER` means the sender confirmed sending.
