-- ─────────────────────────────────────────────────────────────────────────────
-- TAXIT PORTAL — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── USERS TABLE ──────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          text primary key,
  username    text not null unique,
  password    text not null,
  name        text not null,
  company     text,
  phone       text
);

-- ── JOBS TABLE ────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id          text primary key,
  "userId"    text references public.users(id),
  title       text not null,
  category    text,
  description text,
  priority    text default 'medium',
  status      text default 'pending',
  payment     text default 'unpaid',
  amount      numeric(12,2) default 0,
  "amountPaid" numeric(12,2) default 0,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now(),
  "adminNote" text default ''
);

-- ── ROW LEVEL SECURITY (RLS) ─────────────────────────────────────────────────
-- For a simple client-side app with anon key, disable RLS so the app can
-- read/write freely. For production, implement proper RLS policies.

alter table public.users  disable row level security;
alter table public.jobs   disable row level security;

-- ── OPTIONAL: SEED DATA ───────────────────────────────────────────────────────
-- Uncomment and run this block ONCE to populate demo data.


insert into public.users (id, username, password, name, company, phone) values
  ('u1', 'ahmed',  'ahmed123',  'Ahmed Al-Rashid',   'Al-Rashid Trading', '+966 50 123 4567'),
  ('u2', 'sara',   'sara456',   'Sara Al-Mahmoud',   'Gulf Solutions',    '+966 55 987 6543'),
  ('u3', 'khalid', 'khalid789', 'Khalid bin Nasser', 'Nasser Holdings',   '+966 54 456 7890')
on conflict (id) do nothing;

insert into public.jobs (id, "userId", title, category, description, priority, status, payment, amount, "amountPaid", "createdAt", "updatedAt", "adminNote") values
  ('JR-001','u1','VAT Return Filing Q1','Tax Filing','Quarterly VAT return and submission to ZATCA.','high','completed','paid',1800,1800,'2025-02-10T09:00:00Z','2025-03-01T14:00:00Z','Filed. ZATCA ref #ZT-2025-001.'),
  ('JR-002','u2','Zakat Assessment 2024','Zakat','Annual Zakat calculation and compliance report.','medium','inprogress','partial',4500,2000,'2025-03-15T11:00:00Z','2025-04-10T10:00:00Z','70% complete. Final report soon.'),
  ('JR-003','u1','Transfer Pricing Study','Advisory','Transfer pricing docs for related-party transactions.','urgent','pending','unpaid',8500,0,'2025-04-18T08:30:00Z','2025-04-18T08:30:00Z',''),
  ('JR-004','u3','Corporate Tax Registration','Registration','ZATCA corporate income tax registration and setup.','low','pending','unpaid',2200,0,'2025-04-22T13:00:00Z','2025-04-22T13:00:00Z',''),
  ('JR-005','u2','VAT Audit Defense','Audit Support','Documentation and defense for ZATCA audit.','urgent','inprogress','partial',6000,3000,'2025-04-05T10:00:00Z','2025-04-20T16:00:00Z','Docs compiled. Awaiting ZATCA schedule.'),
  ('JR-006','u3','Withholding Tax Advisory','Advisory','Advisory on withholding tax for cross-border payments.','medium','completed','paid',3200,3200,'2025-03-01T09:00:00Z','2025-03-20T12:00:00Z','Report delivered and approved.')
on conflict (id) do nothing;

