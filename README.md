# CarePoint — Patient Appointment & Zoom/Tidio Integration System

CarePoint is a full-stack clinic appointment platform for patients and administrators. Patients can browse clinics, book in-person or online visits, manage appointments, join automatically generated Zoom meetings, maintain a care profile, and contact support through an integrated Tidio chat widget. Administrators can manage clinics, doctors, appointments, users, and contact messages from a dashboard with charts and moderation tools.

## Features

- Patient signup and login with email verification codes
- Clinic and doctor directory with images and specialties
- In-person and online appointment booking
- Automatic Zoom meeting creation for online visits
- Zoom meeting cleanup when an appointment is cancelled
- Dedicated Meetings page with join links, passcodes, and status badges
- Patient profile and onboarding (age, conditions, medications)
- Contact form with admin replies by email
- Admin dashboard with appointment charts and moderation tools
- Tidio AI chatbot integration with a local rule-based fallback assistant
- Dependency-free SVG charts and a responsive vanilla JavaScript frontend
- Optional Cloudflare Tunnel support for exposing a local instance

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 22.x (tested), Node.js 18+ minimum |
| Web framework | Express 5 |
| Database | PostgreSQL 14+ |
| Database client | `pg` |
| Authentication | HMAC-signed session cookie, bcrypt password hashing |
| Email | Nodemailer (SMTP) or console transport for development |
| Online meetings | Zoom Server-to-Server OAuth API |
| Chatbot | Tidio widget, optional OpenAI-compatible endpoint, local fallback |
| Frontend | HTML, CSS, vanilla JavaScript, SVG charts |
| Configuration | `dotenv` with a local `.env` file |

## Project Structure

```text
.
├── db.js                 # PostgreSQL connection pool
├── server.js             # Express application entry point
├── setup.js              # Idempotent database schema and admin bootstrap
├── seed-clinics.js       # Optional clinic seed data
├── lib/
│   ├── auth.js           # Session/auth helpers and page guards
│   ├── mailer.js         # SMTP and console email delivery
│   ├── session.js        # Signed session cookie helpers
│   └── zoom.js           # Zoom OAuth client and meeting operations
├── routes/
│   ├── admin.js          # Admin API
│   ├── appointments.js   # Appointment booking and cancellation
│   ├── chatbot.js        # Chatbot provider configuration and messages
│   ├── clinics.js        # Clinic directory API
│   ├── contact.js        # Contact form API
│   ├── login.js          # Login and email code verification
│   ├── meetings.js       # Online meeting listing and Zoom health
│   ├── onboarding.js     # Patient care profile API
│   ├── profile.js        # Patient profile API
│   └── signup.js         # Signup and email code verification
├── private/              # Authenticated pages (patient, profile, admin, meetings)
└── public/               # Public pages, assets, styles, and client scripts
```

## Prerequisites

- Node.js 22.x recommended (Node.js 18+ required for the global `fetch` API)
- npm 10+
- PostgreSQL 14+
- A Zoom account with permission to create a Server-to-Server OAuth app (only needed for online appointments)
- A Tidio account (optional; only needed for the hosted AI chat widget)
- An SMTP provider (optional; email codes are printed to the console in development)

## Local Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Aetherman-1st/Carepoint-Project.git
cd Carepoint-Project
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create a `.env` file in the project root. This file is intentionally ignored by Git and must never be committed.

```dotenv
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=loginpage
DB_PASSWORD=change-me
DB_NAME=loginpage

# Sessions and administration
SESSION_SECRET=replace-with-a-long-random-hex-string
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-123

# Email and two-factor codes
EMAIL_TRANSPORT=console
MAIL_FROM=CarePoint <no-reply@example.com>
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
TWO_FACTOR_CODE_MINUTES=10

# Server
PORT=3000

# Zoom Server-to-Server OAuth app
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_USER_ID=me
ZOOM_MEETING_DURATION=30
APP_TIMEZONE=Asia/Amman

# Optional OpenAI-compatible chatbot endpoint
CHATBOT_API_URL=
CHATBOT_API_KEY=
CHATBOT_MODEL=

# Tidio chat widget
TIDIO_PUBLIC_KEY=
TIDIO_CLIENT_ID=
TIDIO_CLIENT_SECRET=

# Optional Luna AI embed script
LUNA_EMBED_URL=
```

Notes:

- `ADMIN_PASSWORD` is used only by `setup.js` to create the initial admin account. It must be at least 8 characters.
- Set `EMAIL_TRANSPORT=console` for local development. Verification codes are printed to the server console.
- Set `EMAIL_TRANSPORT=smtp` and provide the SMTP values to send real email.

### 4. Initialize the database

```bash
npm run setup
```

### 5. Seed clinic data (optional)

```bash
node seed-clinics.js
```

### 6. Start the application

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Database Setup (PostgreSQL)

### Create the database and user

Run the following as a PostgreSQL superuser:

```sql
CREATE USER loginpage WITH PASSWORD 'change-me';
CREATE DATABASE loginpage OWNER loginpage;
GRANT ALL PRIVILEGES ON DATABASE loginpage TO loginpage;
```

On PostgreSQL 15+, if you connect as a different role, also grant schema privileges:

```sql
\c loginpage
GRANT ALL ON SCHEMA public TO loginpage;
```

Using `psql` directly:

```bash
sudo -u postgres psql
```

Then paste the SQL above and exit with `\q`.

If you already have a database and user, skip this step and update `.env` to match your existing credentials.

### Environment variable mapping

This project uses discrete PostgreSQL variables rather than `DATABASE_URL`.

| Variable | Description | Example |
| --- | --- | --- |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | Database user | `loginpage` |
| `DB_PASSWORD` | Database password | `change-me` |
| `DB_NAME` | Database name | `loginpage` |

`db.js` creates a connection pool from these values.

### Schema initialization and migrations

Run:

```bash
npm run setup
```

`setup.js` is idempotent and safe to run multiple times. It creates or updates the following tables:

- `users` — accounts, roles, profile fields, verification and ban timestamps
- `clinics` — clinic directory entries and images
- `doctors` — doctors linked to clinics
- `appointments` — bookings, status, visit type, and Zoom meeting fields
- `contact_messages` — contact form submissions
- `contact_replies` — admin replies to contact messages
- `login_codes` — email login verification challenges
- `signup_codes` — email signup verification challenges
- `onboarding_profiles` — patient age, conditions, and medications

The setup script also adds indexes and the Zoom-related appointment columns:

- `visit_type`
- `zoom_meeting_id`
- `zoom_join_url`
- `zoom_start_url`
- `zoom_password`
- `zoom_status`

If `ADMIN_EMAIL` is set, the script reserves admin access for that email. If the account does not exist and `ADMIN_PASSWORD` is at least 8 characters, it creates the admin account. If the account already exists, it promotes it to the `admin` role.

Verify the schema:

```bash
psql -h localhost -U loginpage -d loginpage -c "\dt"
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default `5432`) |
| `DB_USER` | Yes | PostgreSQL user |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_NAME` | Yes | PostgreSQL database name |
| `SESSION_SECRET` | Yes in production | Secret used to sign session cookies. Use a long random value. |
| `ADMIN_EMAIL` | Recommended | Email address that receives the `admin` role |
| `ADMIN_PASSWORD` | Setup only | Initial admin password (minimum 8 characters) |
| `EMAIL_TRANSPORT` | No | `console` (default) or `smtp` |
| `MAIL_FROM` | No | Sender address for outgoing email |
| `SMTP_HOST` | SMTP only | SMTP server host |
| `SMTP_PORT` | SMTP only | SMTP server port (default `587`) |
| `SMTP_SECURE` | SMTP only | `true` for implicit TLS, usually port `465` |
| `SMTP_USER` | SMTP only | SMTP username |
| `SMTP_PASS` | SMTP only | SMTP password or API key |
| `TWO_FACTOR_CODE_MINUTES` | No | Verification code lifetime in minutes (default `10`) |
| `PORT` | No | HTTP port (default `3000`) |
| `ZOOM_ACCOUNT_ID` | Online visits | Zoom Server-to-Server OAuth account ID |
| `ZOOM_CLIENT_ID` | Online visits | Zoom OAuth client ID |
| `ZOOM_CLIENT_SECRET` | Online visits | Zoom OAuth client secret |
| `ZOOM_USER_ID` | No | Zoom user that owns meetings (default `me`) |
| `ZOOM_MEETING_DURATION` | No | Default meeting duration in minutes (default `30`) |
| `APP_TIMEZONE` | No | Timezone for Zoom meetings (default `UTC`) |
| `CHATBOT_API_URL` | No | OpenAI-compatible chat completion endpoint |
| `CHATBOT_API_KEY` | No | API key for the external chatbot endpoint |
| `CHATBOT_MODEL` | No | Model name for the external chatbot endpoint |
| `TIDIO_PUBLIC_KEY` | No | Tidio widget public key |
| `TIDIO_CLIENT_ID` | No | Tidio OpenAPI client ID (optional server-side sync) |
| `TIDIO_CLIENT_SECRET` | No | Tidio OpenAPI client secret (optional server-side sync) |
| `LUNA_EMBED_URL` | No | Luna AI embed script URL (optional) |

## Zoom Integration Setup

1. Sign in to the [Zoom App Marketplace](https://marketplace.zoom.us/).
2. Go to **Develop → Build App → Server-to-Server OAuth**.
3. Add the required scopes:
   - `meeting:write:meeting`
   - `meeting:read:meeting`
   - `meeting:delete:meeting`
   - `user:read:user`
   - Use the `:admin` variants if your account requires admin-level scopes.
4. Activate the app. A disabled app returns `The app has been disabled by the developer`.
5. Copy the **Account ID**, **Client ID**, and **Client Secret** into `.env`.
6. Set `APP_TIMEZONE` to the clinic timezone, for example `Asia/Amman`.
7. Restart the server.

How it works:

- Booking an appointment with `visit_type=online` creates a Zoom meeting automatically.
- The meeting ID, join URL, start URL, passcode, and status are stored with the appointment.
- Cancelling an online appointment deletes the Zoom meeting and marks the meeting as cancelled.
- `/meetings` lists online appointments for the signed-in patient; admins see all online appointments.
- `/api/meetings` returns `zoomConfigured`, `zoomReady`, and `zoomError` so the UI can show connection status.
- The Zoom client retries transient network failures, uses bounded request timeouts, and prefers IPv4 for reliability.

Never expose `ZOOM_CLIENT_SECRET` in client-side code or commit it to Git.

## Tidio Chatbot Setup

1. In Tidio, open **Settings → Live Chat → Installation**.
2. Choose **Manual install** and copy the public key from the widget script.
3. Set `TIDIO_PUBLIC_KEY` in `.env`.
4. Optional: open **Settings → Developer → OpenAPI** and generate a Client ID and Client Secret for server-side contact or ticket sync.
5. Restart the server.

The chatbot provider is resolved by `GET /api/chatbot/config` in this order:

1. Tidio, when `TIDIO_PUBLIC_KEY` is set
2. Luna AI, when `LUNA_EMBED_URL` is set
3. External OpenAI-compatible API, when `CHATBOT_API_URL` is set
4. Local rule-based assistant

The Tidio widget loads on the public pages, profile page, patient portal, and meetings page. When a patient is signed in, their name and email are passed to Tidio through `document.tidioIdentify`.

Enable Lyro AI in the Tidio dashboard if you want AI-generated replies. Without a configured provider, the built-in local assistant remains available as a fallback.

## Running the Application

### Development

```bash
npm start
```

The application starts on `http://localhost:3000` by default. Set `PORT` to change it.

### Production

There is no frontend build step; the application serves static assets directly from `public/`.

Recommended production setup:

1. Set a strong `SESSION_SECRET`.
2. Configure real SMTP credentials.
3. Add the Zoom and Tidio credentials.
4. Run the Node process under a process manager.
5. Terminate TLS and reverse proxy through Nginx, Caddy, or a platform load balancer.

Example with PM2:

```bash
npm install -g pm2
pm2 start server.js --name carepoint
pm2 save
pm2 startup
```

Example Nginx reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name carepoint.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For a temporary public URL during local development, Cloudflare Tunnel can be used:

```bash
cloudflared tunnel --url http://localhost:3000
```

## API Overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Current signed-in user |
| `POST` | `/logout` | Clear the session |
| `POST` | `/login` | Start or complete login |
| `POST` | `/signup` | Start or complete signup |
| `GET` | `/api/clinics` | Clinic and doctor directory |
| `GET` | `/api/appointments` | List the current user's appointments |
| `POST` | `/api/appointments` | Book an appointment |
| `PATCH` | `/api/appointments/:id` | Update or cancel an appointment |
| `GET` | `/api/meetings` | List online meetings and Zoom health |
| `GET` | `/api/chatbot/config` | Active chatbot provider configuration |
| `POST` | `/api/chatbot/message` | Send a message to the local or external assistant |
| `POST` | `/api/contact` | Submit a contact message |
| `GET` | `/api/profile` | Read the patient profile |
| `PUT` | `/api/profile` | Update the patient profile |
| `POST` | `/api/onboarding` | Save onboarding care details |
| `GET` | `/api/admin/*` | Admin dashboard and moderation endpoints |

## Security Notes

- `.env` is ignored by Git. Never commit real credentials.
- Use a long random `SESSION_SECRET` in production.
- Serve the application over HTTPS.
- Rotate any credential that has been shared in logs, chat, or screenshots.
- Keep Zoom OAuth scopes minimal and activate the app before use.
- The Tidio public key is safe to expose; the Tidio client secret is not.
- Review `ADMIN_EMAIL` and remove `ADMIN_PASSWORD` from production `.env` after the initial admin account is created.
- Consider adding rate limiting, security headers, and CSRF protection before exposing the application to the public internet.

## Troubleshooting

### PostgreSQL connection refused

- Confirm PostgreSQL is running.
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- Verify `pg_hba.conf` allows the connection method you are using.

### Password authentication failed

- Re-check the database user and password in `.env`.
- If needed, reset the password:

```sql
ALTER USER loginpage WITH PASSWORD 'new-password';
```

### Zoom authentication failed

- Confirm the app is activated in the Zoom Marketplace.
- Verify the Account ID, Client ID, and Client Secret.
- Confirm the required meeting scopes are granted.
- If Zoom reports `The app has been disabled by the developer`, activate the app.
- If requests time out, check outbound HTTPS access to `zoom.us` and `api.zoom.us`. The client retries and prefers IPv4, but firewall or DNS issues can still block it.

### Tidio widget does not appear

- Confirm `TIDIO_PUBLIC_KEY` is set in `.env`.
- Restart the server and check `GET /api/chatbot/config` returns `"provider":"tidio"`.
- Ensure the domain is allowed in the Tidio dashboard if domain restrictions are enabled.

### Email verification codes are not received

- For local development, set `EMAIL_TRANSPORT=console` and check the server console.
- For real email, set `EMAIL_TRANSPORT=smtp` and provide `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and a verified `MAIL_FROM`.

### Admin account is missing

- Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 8 characters in `.env`.
- Run `npm run setup` again.

## Deployment

### Quick start with Cloudflare Tunnel

1. Make sure your local server is running on the port defined in `.env` (default `PORT=3000`).
2. Install `cloudflared` if not already present (download from https://developers.cloudflare.com/cloudflared/).
3. Run the tunnel: `cloudflared tunnel --url http://localhost:3000`.
4. The terminal will output a URL like `https://abc123.cloudflared.net`. Share this URL; it routes traffic to your local CarePoint instance.

### Production considerations

- Set `EMAIL_TRANSPORT=smtp` and verify a domain at Resend (`MAIL_FROM` must match a verified sender).
- Set `SESSION_SECRET` to a strong random string.
- Ensure `ADMIN_EMAIL` is set to the protected admin address.
- Run `npm audit` before deploying.
- Keep `.env` out of version control (already git‑ignored).
## License

ISC
