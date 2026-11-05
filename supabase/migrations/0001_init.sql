-- Coba Raket: initial schema.
-- Design rules (see CLAUDE.md):
--   1. The database enforces the rules that must never break: no double booking,
--      append-only ledger / passport / audit log, passport hash-chain continuity.
--   2. All writes come from the server using the service role. Row-level security
--      (RLS) is a second layer: signed-in users can only READ what they own.
--   3. No personal data goes into passport_events. They are public by design.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  role        text not null default 'customer' check (role in ('customer', 'operator', 'admin')),
  created_at  timestamptz not null default now()
);

-- Role lookup used by RLS policies. security definer so it can read profiles
-- without recursing through the profiles policies.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('operator', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.rackets (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,                 -- printed on the QR sticker, e.g. R-004
  brand            text not null,
  model            text not null,
  head_size_sq_in  smallint not null check (head_size_sq_in between 85 and 135),
  weight_g         smallint not null check (weight_g between 200 and 380),
  balance_mm       smallint,
  grip_size        text,
  string_pattern   text,
  level_fit        text[] not null default '{}',          -- beginner | intermediate | advanced
  condition_grade  text not null default 'good' check (condition_grade in ('new', 'good', 'fair', 'retired')),
  status           text not null default 'available' check (status in ('available', 'in_trial', 'maintenance', 'sold', 'retired')),
  cost_idr         integer not null check (cost_idr >= 0),
  sale_price_idr   integer check (sale_price_idr >= 0),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.profiles (id),
  status         text not null default 'requested' check (status in (
                   'requested', 'confirmed', 'active', 'returned', 'inspected',
                   'settled', 'cancelled', 'overdue', 'disputed', 'unreturned')),
  pickup_at      timestamptz not null,
  due_at         timestamptz not null,
  fee_idr        integer not null check (fee_idr >= 0),
  deposit_idr    integer not null check (deposit_idr >= 0),
  created_at     timestamptz not null default now(),
  check (due_at > pickup_at)
);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_status_idx on public.bookings (status);

-- One row per racket in a booking (a customer can try up to 3).
-- `period` includes the one-day turnaround buffer after the due date.
-- `active` is false once the booking is cancelled or settled, which frees the racket.
create table public.booking_items (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  racket_id   uuid not null references public.rackets (id),
  period      tstzrange not null,
  active      boolean not null default true,
  unique (booking_id, racket_id),
  -- THE double-booking guarantee: two active rows for the same racket can never overlap.
  constraint no_double_booking exclude using gist (racket_id with =, period with &&) where (active)
);
create index booking_items_booking_idx on public.booking_items (booking_id);

-- Serialise concurrent bookings of the SAME racket. The exclusion constraint alone is already
-- correct, but when several overlapping inserts race, PostgreSQL resolves it through deadlock
-- detection, which takes about a second per round. Taking a per-racket advisory lock first makes
-- the loser wait briefly, then fail fast with a normal exclusion violation (SQLSTATE 23P01).
-- The lock is released when the transaction ends. When one booking inserts several rackets,
-- the server must insert them in sorted racket_id order to avoid lock-order deadlocks.
create or replace function public.lock_racket_for_booking()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.racket_id::text, 0));
  return new;
end;
$$;
create trigger booking_items_lock_racket
  before insert on public.booking_items
  for each row execute function public.lock_racket_for_booking();

-- A booking may contain at most 3 rackets.
create or replace function public.enforce_max_items()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.booking_items where booking_id = new.booking_id) >= 3 then
    raise exception 'A booking can contain at most 3 rackets' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger booking_items_max_three
  before insert on public.booking_items
  for each row execute function public.enforce_max_items();

-- ---------------------------------------------------------------------------
-- Handover and inspection
-- ---------------------------------------------------------------------------
create table public.handovers (
  id                    uuid primary key default gen_random_uuid(),
  booking_item_id       uuid not null references public.booking_items (id),
  kind                  text not null check (kind in ('pickup', 'return')),
  photo_paths           text[] not null default '{}',     -- private storage paths, never public URLs
  id_checked            boolean not null default false,
  operator_id           uuid not null references public.profiles (id),
  customer_confirmed_at timestamptz,
  created_at            timestamptz not null default now(),
  unique (booking_item_id, kind)
);

create table public.inspections (
  id               uuid primary key default gen_random_uuid(),
  booking_item_id  uuid not null unique references public.booking_items (id),
  grade            text not null check (grade in ('normal_wear', 'string_break', 'deep_chip', 'structural')),
  charge_idr       integer not null default 0 check (charge_idr >= 0),
  notes            text not null default '',
  operator_id      uuid not null references public.profiles (id),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ledger (append-only). Amounts are always POSITIVE whole rupiah; the direction
-- comes from `kind` (see src/modules/payments/rules.ts, which rebuilds balances).
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id),
  kind             text not null check (kind in (
                     'trial_fee', 'deposit_hold', 'deposit_release', 'late_fee',
                     'damage_charge', 'purchase_credit', 'refund')),
  amount_idr       integer not null check (amount_idr > 0),
  idempotency_key  text not null unique,                 -- retried requests cannot double-post
  created_at       timestamptz not null default now()
);
create index ledger_booking_idx on public.ledger_entries (booking_id);

-- ---------------------------------------------------------------------------
-- Racket Passport (append-only hash chain) and the outbox that anchors it
-- ---------------------------------------------------------------------------
create table public.passport_events (
  id          uuid primary key default gen_random_uuid(),
  racket_id   uuid not null references public.rackets (id),
  seq         integer not null check (seq >= 1),
  event_type  smallint not null check (event_type between 1 and 9),
  payload     jsonb not null,                            -- NO personal data: grade, dates, tension, etc.
  event_hash  text not null check (event_hash ~ '^0x[0-9a-f]{64}$'),
  prev_hash   text not null check (prev_hash ~ '^0x[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  unique (racket_id, seq)
);

-- Chain continuity: seq must be last+1, prev_hash must equal the last event_hash
-- (or 32 zero bytes for the first event). The server computes the hashes;
-- the database refuses any event that does not link correctly.
create or replace function public.enforce_passport_chain()
returns trigger
language plpgsql
as $$
declare
  last_seq  integer;
  last_hash text;
begin
  select seq, event_hash into last_seq, last_hash
  from public.passport_events
  where racket_id = new.racket_id
  order by seq desc
  limit 1
  for update;

  if last_seq is null then
    if new.seq <> 1 or new.prev_hash <> '0x' || repeat('0', 64) then
      raise exception 'First passport event must have seq 1 and a zero prev_hash';
    end if;
  else
    if new.seq <> last_seq + 1 or new.prev_hash <> last_hash then
      raise exception 'Passport chain broken for racket %', new.racket_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger passport_chain_check
  before insert on public.passport_events
  for each row execute function public.enforce_passport_chain();

create table public.passport_outbox (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null unique references public.passport_events (id),
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts         integer not null default 0,
  last_error       text,
  attestation_uid  text,                                  -- EAS attestation UID once anchored
  next_attempt_at  timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index passport_outbox_due_idx on public.passport_outbox (next_attempt_at) where status <> 'sent';

-- ---------------------------------------------------------------------------
-- Audit log (append-only): who did what, from the server's point of view
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create or replace function public.forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger ledger_no_update  before update or delete on public.ledger_entries
  for each row execute function public.forbid_change();
create trigger passport_no_update before update or delete on public.passport_events
  for each row execute function public.forbid_change();
create trigger audit_no_update   before update or delete on public.audit_log
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Row-level security: reads only. There are deliberately NO insert/update/delete
-- policies, so every write must go through the server with the service role.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.rackets          enable row level security;
alter table public.bookings         enable row level security;
alter table public.booking_items    enable row level security;
alter table public.handovers        enable row level security;
alter table public.inspections      enable row level security;
alter table public.ledger_entries   enable row level security;
alter table public.passport_events  enable row level security;
alter table public.passport_outbox  enable row level security;
alter table public.audit_log        enable row level security;

create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());

-- The catalogue and the passport are public: anyone can browse and verify.
create policy rackets_public_read on public.rackets
  for select using (true);
create policy passport_public_read on public.passport_events
  for select using (true);

create policy bookings_owner_read on public.bookings
  for select using (customer_id = auth.uid() or public.is_staff());

create policy booking_items_owner_read on public.booking_items
  for select using (
    exists (select 1 from public.bookings b
            where b.id = booking_id and (b.customer_id = auth.uid() or public.is_staff()))
  );

create policy handovers_owner_read on public.handovers
  for select using (
    exists (select 1 from public.booking_items i
            join public.bookings b on b.id = i.booking_id
            where i.id = booking_item_id and (b.customer_id = auth.uid() or public.is_staff()))
  );

create policy inspections_owner_read on public.inspections
  for select using (
    exists (select 1 from public.booking_items i
            join public.bookings b on b.id = i.booking_id
            where i.id = booking_item_id and (b.customer_id = auth.uid() or public.is_staff()))
  );

create policy ledger_owner_read on public.ledger_entries
  for select using (
    exists (select 1 from public.bookings b
            where b.id = booking_id and (b.customer_id = auth.uid() or public.is_staff()))
  );

create policy outbox_staff_read on public.passport_outbox
  for select using (public.is_staff());

create policy audit_staff_read on public.audit_log
  for select using (public.is_staff());
