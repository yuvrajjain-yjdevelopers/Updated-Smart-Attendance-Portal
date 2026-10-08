# Smart Attendance Portal

Attendance follow-up and parent messaging for department and class-teacher accounts. This app uses Next.js, Prisma and PostgreSQL (Supabase is the recommended hosted database; Vercel hosts the Next.js app).

## Setup

Requirements: Node.js 20+, npm, and a PostgreSQL database. For hosted setup, create a Supabase project and use its Transaction pooler URL (port `6543`) for `DATABASE_URL` and its Session pooler URL (port `5432`) for `DIRECT_URL`. The app uses `DIRECT_URL` for schema migrations and `DATABASE_URL` for requests. Supabase direct connections may require IPv6, so the Session pooler is the safer Vercel migration connection.

```powershell
Copy-Item .env.example .env
# Edit .env and replace both Supabase URLs and both application secrets first.
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

Open http://localhost:3000. The seed command creates demo accounts and fake students; only run it against a development database. Do not seed demo records into the production database. On a fresh hosted database, first use `npm run admin:create` from your local machine with the production Supabase `DATABASE_URL` and a strong `HOD_PASSWORD` in `.env`; it creates only the initial HOD account and refuses to overwrite an existing account.

## Deploy to Vercel with Supabase

1. Create a Supabase PostgreSQL project. In **Connect**, copy the Transaction pooler URL (port `6543`) for `DATABASE_URL` and the Session pooler URL (port `5432`) for `DIRECT_URL`. URL-encode special characters in the database password. Vercel serverless requests use transaction pooling; Prisma migrations use the session pooler.
2. Push this repository to a private GitHub repository and import it into Vercel as a Next.js project.
3. In Vercel **Project → Settings → Environment Variables**, add `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, and `APP_SECRET` for Production. Use unique, random values for the two app secrets. Never use a `NEXT_PUBLIC_` prefix for these values.
4. Add the same variables for Preview only if Preview has its own isolated Supabase database. Do not point preview deployments at the production database.
5. Deploy. The `vercel-build` script runs `prisma migrate deploy` before `next build`, creating tables in the selected Supabase database. Confirm the tables appear under the `public` schema.
6. Before first login, create the initial HOD account from your local computer with `npm run admin:create` after setting the Production Supabase `DATABASE_URL`, `HOD_USERNAME`, `HOD_NAME`, and a strong `HOD_PASSWORD` in `.env`. This creates only the HOD account; do not run the demo seed on production.
7. Open the deployed URL, verify login and student/section pages, keep messaging in test mode, and test a message only to the configured test number before enabling real parent delivery.

The initial migration creates an empty schema; it does not copy records from the previous local SQLite database. Import real student data using the Students page after deployment. Do not run the demo seed against production.

## Run on other devices on the same WiFi

Start the server with `npm run dev -- -H 0.0.0.0` (or `npm run build` then `npm run start -- -H 0.0.0.0`). Find the laptop's WiFi IP with `ipconfig`, then open `http://<laptop-ip>:3000` on the phone. Allow Node.js / port 3000 through Windows Defender Firewall on Private networks. Keep the phone and laptop on the same WiFi.

## Android SMS Gateway setup

Each sender configures their own phone in Settings. Install SMS Gateway for Android, enable either Local Server or Cloud Server, then enter that mode's username and password. Local mode uses the phone's IP and port 8080. Cloud mode uses the fixed cloud API endpoint in the adapter. Save settings and send a test SMS to your own number before messaging parents. Passwords are stored with AES-256-GCM using `APP_SECRET`; they are not returned by the settings API. A sender without their own configured gateway is blocked from sending SMS.

The gateway adapter keeps endpoint and payload constants in `src/lib/sms/androidGateway.ts`. **Verify the endpoint paths and payload shapes against the current app docs and your installed app version before use:** https://github.com/capcom6/android-sms-gateway. The cloud endpoint and `textMessage` payload can change between releases.

Local mode may require the phone and app server to share a WiFi network. College WiFi client isolation can prevent access between devices. Disable battery optimization for the gateway app and keep the phone online. Cloud mode requires the app to be connected to its cloud server.

## Five-minute demo

1. Sign in as `hod` and open the dashboard.
2. Open Settings and configure an Android gateway for the HOD phone; test it to your own number.
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

Messages support direct Android SMS gateway delivery, guided SMS links, and guided WhatsApp links. Test mode starts enabled. Each message log includes sender, channel, recipient and status; test mode is recorded on its batch. The server enforces a teacher's section and `canSend` permission. Background jobs/retries are not implemented; WhatsApp delivery is completed by the sender in their own browser session.
