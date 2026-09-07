-- Collection tracker (Phase 5)
-- wishlist records what you want; nothing recorded what you OWN. This adds
-- quantity, what you paid, and when — which is what turns a price list into a
-- portfolio you come back to check.
--
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

create table if not exists user_collection (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  group_key     text not null,
  product_name  text not null default '',
  tcg           text not null default 'pokemon',

  quantity      integer not null default 1 check (quantity > 0),

  -- What you actually paid, per unit, in CAD. Nullable on purpose: plenty of
  -- people want to track what they own without recording a cost basis, and a
  -- zero would quietly read as "free" in every P/L calculation.
  unit_cost     numeric(10,2) check (unit_cost is null or unit_cost >= 0),
  purchased_at  date,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per product per user; quantity carries the count. Keeps upserts
-- simple and stops a collection filling with duplicates of the same item.
create unique index if not exists user_collection_user_product
  on user_collection (user_id, group_key);

create index if not exists user_collection_user
  on user_collection (user_id);

alter table user_collection enable row level security;

create policy "collection: read own"
  on user_collection for select using (auth.uid() = user_id);
create policy "collection: insert own"
  on user_collection for insert with check (auth.uid() = user_id);
create policy "collection: update own"
  on user_collection for update using (auth.uid() = user_id);
create policy "collection: delete own"
  on user_collection for delete using (auth.uid() = user_id);

-- Keep updated_at honest without relying on the client to send it.
create or replace function touch_user_collection()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_collection_touch on user_collection;
create trigger user_collection_touch
  before update on user_collection
  for each row execute function touch_user_collection();
