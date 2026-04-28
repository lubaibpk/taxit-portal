# Taxit Portal — Deployment Guide
## Supabase + Vercel Setup (Step-by-Step)

---

## Overview

This guide walks you through taking the Taxit portal from **demo mode** (in-memory seed data) to a **live production app** backed by Supabase (database) and deployed on Vercel (hosting).

**What you'll have after this guide:**
- A real database storing all users and job requests
- A public URL your clients can access (e.g. `taxit.vercel.app`)
- Persistent data that survives page refreshes and sessions

---

## PART 1 — Set Up Supabase (Database)

### Step 1.1 — Create a Supabase account
1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Fill in:
   - **Name:** `taxit-portal`
   - **Database Password:** choose a strong password (save it!)
   - **Region:** pick the one closest to Saudi Arabia (e.g. `ap-southeast-1` Singapore)
4. Click **Create new project** and wait ~2 minutes for it to provision

### Step 1.2 — Create the database tables
1. In your Supabase dashboard, go to **SQL Editor** → **New Query**
2. Open the file `supabase/schema.sql` from this project folder
3. Copy the entire contents and paste into the SQL editor
4. Click **Run** (green button)
5. You should see `Success. No rows returned`

### Step 1.3 — (Optional) Seed demo data
If you want the demo clients and jobs pre-loaded in the database:
1. In the `supabase/schema.sql` file, find the block starting with `/* insert into public.users`
2. **Uncomment** that entire block (remove the `/*` and `*/`)
3. Run it in the SQL editor

### Step 1.4 — Get your Supabase keys
1. Go to **Project Settings** → **API** (left sidebar)
2. You'll see two values you need:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`
3. Copy both — you'll need them in Part 2 and Part 3

---

## PART 2 — Configure the App

### Step 2.1 — Create your `.env.local` file
In the project root folder, copy the example env file:

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in your values:

```
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_KEY=eyJ...your-anon-key...
REACT_APP_ADMIN_USERNAME=admin
REACT_APP_ADMIN_PASSWORD=your-strong-password-here
```

> ⚠️ **Never commit `.env.local` to Git.** It's already in `.gitignore`.
> 
> ⚠️ Change the admin password from the default `taxit2024` before going live.

### Step 2.2 — Test locally (optional)
If you have Node.js installed, you can test the app locally first:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). You should see the app connect to Supabase (brief "Connecting to database…" message) and load live data.

---

## PART 3 — Deploy to Vercel

### Step 3.1 — Push your code to GitHub
1. Create a free account at [github.com](https://github.com)
2. Create a new repository (e.g. `taxit-portal`) — set it to **Private**
3. In your project folder, run:

```bash
git init
git add .
git commit -m "initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/taxit-portal.git
git push -u origin main
```

### Step 3.2 — Create a Vercel account
1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
2. Click **Add New Project**
3. Find and select your `taxit-portal` repository
4. Click **Import**

### Step 3.3 — Configure the build settings
Vercel usually auto-detects React. Verify these settings:

| Setting | Value |
|---|---|
| Framework Preset | Create React App |
| Root Directory | `./` (leave blank) |
| Build Command | `npm run build` |
| Output Directory | `build` |
| Install Command | `npm install` |

### Step 3.4 — Add environment variables
This is the most important step — without these the app runs in demo mode.

1. On the Vercel import page, expand **Environment Variables**
2. Add each variable one by one:

| Variable Name | Value |
|---|---|
| `REACT_APP_SUPABASE_URL` | `https://your-project-id.supabase.co` |
| `REACT_APP_SUPABASE_KEY` | `eyJ...your-anon-key...` |
| `REACT_APP_ADMIN_USERNAME` | `admin` (or your chosen username) |
| `REACT_APP_ADMIN_PASSWORD` | Your secure admin password |

3. Click **Deploy**
4. Wait 1–2 minutes for the build to finish

### Step 3.5 — Access your live site
After deployment, Vercel gives you a URL like `https://taxit-portal-xyz.vercel.app`.

You can add a custom domain (e.g. `portal.taxit.com.sa`) in Vercel → **Settings → Domains**.

---

## PART 4 — Going Live Checklist

Before sharing the URL with clients, run through this checklist:

- [ ] Admin password changed from default `taxit2024`
- [ ] Supabase tables created successfully (test by checking Table Editor)
- [ ] App loads and shows "● Live" badge (not "● Demo")
- [ ] Can log in as admin and see jobs
- [ ] Can log in as a client and submit a new job
- [ ] New jobs appear in admin panel immediately
- [ ] Job updates (status, amount) save correctly

---

## PART 5 — Ongoing Management

### Adding new clients
1. Log in as admin → **Clients** tab → **Add Client**
2. Fill in name, username, and password
3. The client can then log in at your Vercel URL

### Changing a client's password
1. Log in as admin → **Clients** → click the client → **Edit**
2. Update the password field

### Supabase Database (direct access)
You can view and edit all data directly in:
- **Supabase Dashboard → Table Editor**
- This lets you see all users, jobs, edit records, run SQL queries

### Re-deploying after code changes
After updating `src/App.jsx` and pushing to GitHub:
1. Vercel automatically detects the push and re-deploys
2. No manual steps needed — it's continuous deployment

---

## Troubleshooting

### App shows "● Demo" instead of "● Live"
- Your environment variables weren't set correctly in Vercel
- Go to Vercel → Project → **Settings → Environment Variables** and verify
- After fixing, go to **Deployments → Redeploy**

### "No requests found" in admin panel after connecting Supabase
- The database tables might be empty — run the seed data SQL (Step 1.3)
- Or the RLS (Row Level Security) is blocking reads — the schema disables it, but check your Supabase → Authentication → Policies

### Jobs submitted by clients don't persist after refresh
- Supabase isn't connected (still in demo mode)
- Check that `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set in Vercel

### Admin login doesn't work
- Verify `REACT_APP_ADMIN_USERNAME` and `REACT_APP_ADMIN_PASSWORD` in Vercel match what you're typing
- Default credentials (if env vars not set): `admin` / `taxit2024`

### Build fails on Vercel
- Check the build logs in Vercel → Deployments → click the failed deploy
- Common fix: make sure all files in `src/` are committed to GitHub

---

## File Structure

```
taxit-portal/
├── public/
│   └── index.html          ← App shell HTML
├── src/
│   ├── index.js            ← React entry point
│   └── App.jsx             ← Full application (login, admin, client portal)
├── supabase/
│   └── schema.sql          ← Run this in Supabase SQL Editor
├── .env.example            ← Template for environment variables
├── .env.local              ← Your actual keys (never commit this!)
├── .gitignore              ← Excludes .env.local and node_modules
└── package.json            ← React project config
```

---

## Security Notes

- The app uses Supabase's **anon/public key** — this is safe to use client-side
- User passwords are stored **plain text** in the database — suitable for internal tooling, but for a public-facing app you should hash passwords server-side
- For higher security, consider integrating **Supabase Auth** for proper authentication with hashed passwords, email verification, etc.
- Admin credentials are stored in environment variables (not in the code)

---

*Taxit Portal V2.1 — Generated May 2025*
