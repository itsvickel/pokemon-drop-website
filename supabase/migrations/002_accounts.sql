-- Accounts & sync (Phase 4)
-- Adds Supabase-Auth-keyed wishlists, links alerts to users, and RLS.
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

-- ── user_wishlists ────────────────────────────────────────────────────────────
-- Cross-device wishlist keyed by the signed-in user. The localStorage list
-- migrates into this table on first sign-in (union merge).

create table if not exists user_wishlists (
  user_id      uuid not null references auth.users(id) on delete cascade,
  group_key    text not null,
  product_name text not null default '',
  added_at     timestamptz default now(),
  primary key (user_id, group_key)
);

alter table user_wishlists enable row level security;

create policy "wishlist: read own"
  on user_wishlists for select using (auth.uid() = user_id);
create policy "wishlist: insert own"
  on user_wishlists for insert with check (auth.uid() = user_id);
create policy "wishlist: delete own"
  on user_wishlists for delete using (auth.uid() = user_id);

-- ── user_alerts: link to auth user (optional) + RLS ──────────────────────────
-- Rows created before sign-in (email-only) keep user_id null; the service-role
-- cron reads everything regardless.

alter table user_alerts
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table user_alerts enable row level security;

create policy "alerts: read own"
  on user_alerts for select using (auth.uid() = user_id);
create policy "alerts: update own"
  on user_alerts for update using (auth.uid() = user_id);

-- ── price_history: public read ────────────────────────────────────────────────
-- Written by the scraper with the service key; readable by anyone (the data
-- is public pricing anyway).

alter table price_history enable row level security;

create policy "price history: public read"
  on price_history for select using (true);
