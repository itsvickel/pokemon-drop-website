-- Alert kinds (Phase 6)
-- A fixed price threshold was the only alert available, which forces people to
-- guess a number and re-guess it whenever the market moves. These columns add
-- percent-drop, restock, and lowest-price alerts.
--
-- All are nullable with defaults, so every existing row keeps behaving exactly
-- as it did: a null `kind` is read as "price".
--
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

alter table user_alerts
  add column if not exists kind text not null default 'price'
    check (kind in ('price', 'percent', 'restock', 'any_low'));

-- Percent drop that should fire a 'percent' alert, e.g. 15 for 15%.
alter table user_alerts
  add column if not exists percent numeric(5,2)
    check (percent is null or (percent > 0 and percent < 100));

-- The price when the alert was created — the baseline a percent drop measures
-- from. Without it a percent alert cannot fire, which is deliberate: inventing
-- a baseline would trigger on the first run for everything.
alter table user_alerts
  add column if not exists baseline_price numeric(10,2)
    check (baseline_price is null or baseline_price >= 0);

-- Whether the product was in stock when last evaluated. A restock alert fires
-- on the transition false -> true, so that it does not email every run for
-- anything permanently available.
alter table user_alerts
  add column if not exists was_in_stock boolean;

create index if not exists user_alerts_active_kind
  on user_alerts (active, kind);
