-- Run in the Supabase SQL Editor to configure member approval and dashboard data.
-- Re-run the complete script to install the administrator, repayment, notification,
-- audit, statement-supporting, M-Pesa reconciliation, savings withdrawal requests,
-- member suspension and privacy controls.
-- Deploy the M-Pesa Edge Functions and configure Daraja secrets as described in supabase/SETUP.md.
-- Bootstrap a trusted admin below.
-- Allow the site's origin in Supabase Auth URL Configuration for password-reset links.
create table if not exists public.member_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.member_profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists role text not null default 'member'
    check (role in ('member', 'admin'));

alter table public.member_profiles
  drop constraint if exists member_profiles_status_check;
alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

create table if not exists public.group_settings (
  id boolean primary key default true check (id),
  group_name text not null default 'Vyro Self Help Group',
  currency text not null default 'KES',
  next_meeting_at timestamptz,
  meeting_location text,
  updated_at timestamptz not null default now()
);

alter table public.group_settings
  add column if not exists next_meeting_at timestamptz,
  add column if not exists meeting_location text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.group_settings (id, group_name, currency)
values (true, 'Vyro Self Help Group', 'KES')
on conflict (id) do nothing;

create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  entry_type text not null check (entry_type in ('contribution', 'withdrawal')),
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.savings_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 2 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  savings_transaction_id uuid references public.savings_transactions (id) on delete set null,
  reviewed_by uuid references public.member_profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists one_pending_savings_withdrawal_per_member_idx
  on public.savings_withdrawal_requests (member_id)
  where status = 'pending';
create index if not exists savings_withdrawal_requests_status_date_idx
  on public.savings_withdrawal_requests (status, created_at);

alter table public.savings_transactions
  add column if not exists withdrawal_request_id uuid
    references public.savings_withdrawal_requests (id) on delete set null;
create unique index if not exists savings_transactions_withdrawal_request_unique_idx
  on public.savings_transactions (withdrawal_request_id)
  where withdrawal_request_id is not null;

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  principal numeric(12, 2) not null check (principal > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'active', 'paid', 'rejected')),
  purpose text,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now()
);

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz not null default now()
);

create table if not exists public.member_loan_settings (
  member_id uuid primary key references public.member_profiles (id) on delete cascade,
  loan_limit numeric(12, 2) not null check (loan_limit >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null
);

create table if not exists public.meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.group_meetings (id) on delete cascade,
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  attended boolean not null default false,
  unique (meeting_id, member_id)
);

create table if not exists public.loan_repayment_schedule (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_amount numeric(12, 2) not null default 0
    check (paid_amount >= 0 and paid_amount <= amount),
  paid_at timestamptz,
  unique (loan_id, installment_number)
);

create table if not exists public.mpesa_payment_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  payment_type text not null check (payment_type in ('savings', 'loan_repayment')),
  loan_id uuid references public.loans (id),
  source text not null check (source in ('stk_push', 'manual')),
  amount numeric(12, 2) not null check (amount > 0),
  phone_number text not null,
  account_reference text,
  checkout_request_id text,
  merchant_request_id text,
  manual_reference text,
  mpesa_receipt_number text,
  callback_received_amount numeric(12, 2),
  callback_received_phone text,
  callback_received_receipt text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'needs_review', 'rejected')),
  result_description text,
  review_note text,
  reviewed_by uuid references public.member_profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mpesa_payment_loan_type_check
    check ((payment_type = 'savings' and loan_id is null)
      or (payment_type = 'loan_repayment' and loan_id is not null)),
  constraint mpesa_payment_source_reference_check
    check ((source = 'stk_push' and manual_reference is null)
      or (source = 'manual' and manual_reference is not null))
);

alter table public.mpesa_payment_records
  add column if not exists callback_received_amount numeric(12, 2),
  add column if not exists callback_received_phone text,
  add column if not exists callback_received_receipt text;

alter table public.savings_transactions
  add column if not exists mpesa_payment_id uuid
    references public.mpesa_payment_records (id) on delete set null;
alter table public.loan_repayments
  add column if not exists mpesa_payment_id uuid
    references public.mpesa_payment_records (id) on delete set null;

create unique index if not exists savings_transactions_mpesa_payment_unique_idx
  on public.savings_transactions (mpesa_payment_id)
  where mpesa_payment_id is not null;
create unique index if not exists loan_repayments_mpesa_payment_unique_idx
  on public.loan_repayments (mpesa_payment_id)
  where mpesa_payment_id is not null;
create unique index if not exists mpesa_payment_account_reference_unique_idx
  on public.mpesa_payment_records (account_reference)
  where account_reference is not null;
create unique index if not exists mpesa_payment_checkout_request_unique_idx
  on public.mpesa_payment_records (checkout_request_id)
  where checkout_request_id is not null;
create unique index if not exists mpesa_payment_transaction_reference_unique_idx
  on public.mpesa_payment_records (
    lower(coalesce(manual_reference, mpesa_receipt_number))
  )
  where coalesce(manual_reference, mpesa_receipt_number) is not null;
create index if not exists mpesa_payment_member_date_idx
  on public.mpesa_payment_records (member_id, created_at desc);
create index if not exists mpesa_payment_status_date_idx
  on public.mpesa_payment_records (status, created_at desc);

create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  reference_id uuid,
  notification_type text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.member_notifications
  add column if not exists reference_id uuid;

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.member_profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete cascade,
  requested_amount numeric(12, 2) not null check (requested_amount > 0),
  purpose text not null check (length(trim(purpose)) > 0 and length(purpose) <= 500),
  status text not null default 'awaiting_guarantors'
    check (status in ('awaiting_guarantors', 'pending', 'approved', 'rejected', 'withdrawn')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.loan_requests
  drop constraint if exists loan_requests_status_check;
alter table public.loan_requests
  add constraint loan_requests_status_check
  check (status in ('awaiting_guarantors', 'pending', 'approved', 'rejected', 'withdrawn'));
alter table public.loan_requests
  alter column status set default 'awaiting_guarantors';

alter table public.loans
  add column if not exists request_id uuid references public.loan_requests (id);

create unique index if not exists loans_request_id_unique_idx
  on public.loans (request_id)
  where request_id is not null;

create table if not exists public.loan_request_guarantors (
  request_id uuid not null references public.loan_requests (id) on delete cascade,
  guarantor_id uuid not null references public.member_profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (request_id, guarantor_id)
);

alter table public.member_profiles replica identity full;
alter table public.loan_requests replica identity full;
alter table public.loan_request_guarantors replica identity full;
alter table public.mpesa_payment_records replica identity full;
alter table public.savings_withdrawal_requests replica identity full;

alter table public.loan_request_guarantors enable row level security;

revoke all on public.loan_request_guarantors from anon, authenticated;
grant select on public.loan_request_guarantors to authenticated;

create or replace function public.can_view_loan_guarantee(
  p_request_id uuid,
  p_guarantor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
      from public.member_profiles as current_member
      where current_member.id = (select auth.uid())
        and current_member.status = 'approved'
    )
    and (
      p_guarantor_id = (select auth.uid())
      or exists (
      select 1
      from public.loan_requests as request
      where request.id = p_request_id
        and request.member_id = (select auth.uid())
      )
    );
$$;

create or replace function public.is_loan_request_guarantor(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_profiles as current_member
    where current_member.id = (select auth.uid())
      and current_member.status = 'approved'
      and exists (
        select 1
        from public.loan_request_guarantors as guarantee
        where guarantee.request_id = p_request_id
          and guarantee.guarantor_id = current_member.id
      )
  );
$$;

revoke all on function public.can_view_loan_guarantee(uuid, uuid) from public, anon;
revoke all on function public.is_loan_request_guarantor(uuid) from public, anon;
grant execute on function public.can_view_loan_guarantee(uuid, uuid) to authenticated;
grant execute on function public.is_loan_request_guarantor(uuid) to authenticated;

drop policy if exists "Applicants and nominees can view guarantor selections"
  on public.loan_request_guarantors;
create policy "Applicants and nominees can view guarantor selections"
  on public.loan_request_guarantors for select to authenticated
  using (public.can_view_loan_guarantee(request_id, guarantor_id));

drop policy if exists "Selected guarantors can view the loan request"
  on public.loan_requests;
create policy "Selected guarantors can view the loan request"
  on public.loan_requests for select to authenticated
  using (public.is_loan_request_guarantor(id));

drop index if exists public.loan_requests_one_pending_per_member_idx;
create unique index if not exists loan_requests_one_pending_per_member_idx
  on public.loan_requests (member_id)
  where status in ('pending', 'awaiting_guarantors');
create index if not exists meeting_attendance_member_meeting_idx
  on public.meeting_attendance (member_id, meeting_id);
create index if not exists group_meetings_starts_at_idx
  on public.group_meetings (starts_at);
create index if not exists loan_requests_member_date_idx
  on public.loan_requests (member_id, created_at desc);

create index if not exists savings_transactions_member_date_idx
  on public.savings_transactions (member_id, occurred_at desc);
create index if not exists loans_member_date_idx
  on public.loans (member_id, created_at desc);
create index if not exists loan_repayments_loan_date_idx
  on public.loan_repayments (loan_id, paid_at desc);
create index if not exists group_announcements_date_idx
  on public.group_announcements (published_at desc);

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_profiles as member
    where member.id = (select auth.uid())
      and member.status = 'approved'
  );
$$;

revoke all on function public.is_approved_member() from public, anon;
grant execute on function public.is_approved_member() to authenticated;

alter table public.member_profiles enable row level security;
alter table public.group_settings enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.group_announcements enable row level security;
alter table public.member_loan_settings enable row level security;
alter table public.group_meetings enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.loan_requests enable row level security;
alter table public.mpesa_payment_records enable row level security;

revoke all on public.member_profiles from anon, authenticated;
grant select (id, full_name, status, created_at, approved_at)
  on public.member_profiles to authenticated;

drop policy if exists "Members can read their own profile"
  on public.member_profiles;
create policy "Members can read their own profile"
  on public.member_profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Approved members can view the member directory"
  on public.member_profiles;
create policy "Approved members can view the member directory"
  on public.member_profiles for select to authenticated
  using ((select public.is_approved_member()));

revoke all on public.group_settings from anon, authenticated;
grant select on public.group_settings to authenticated;
drop policy if exists "Approved members can read group settings"
  on public.group_settings;
create policy "Approved members can read group settings"
  on public.group_settings for select to authenticated
  using ((select public.is_approved_member()));

revoke all on public.savings_transactions from anon, authenticated;
grant select on public.savings_transactions to authenticated;
drop policy if exists "Members can read their own savings"
  on public.savings_transactions;
create policy "Members can read their own savings"
  on public.savings_transactions for select to authenticated
  using (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
  );

revoke all on public.loans from anon, authenticated;
grant select on public.loans to authenticated;
drop policy if exists "Members can read their own loans"
  on public.loans;
create policy "Members can read their own loans"
  on public.loans for select to authenticated
  using (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
  );

revoke all on public.loan_repayments from anon, authenticated;
grant select on public.loan_repayments to authenticated;
drop policy if exists "Members can read repayments for their own loans"
  on public.loan_repayments;
create policy "Members can read repayments for their own loans"
  on public.loan_repayments for select to authenticated
  using (
    (select public.is_approved_member())
    and exists (
      select 1
      from public.loans as member_loan
      where member_loan.id = loan_id
        and member_loan.member_id = (select auth.uid())
    )
  );

revoke all on public.group_announcements from anon, authenticated;
grant select on public.group_announcements to authenticated;
drop policy if exists "Approved members can read group announcements"
  on public.group_announcements;
create policy "Approved members can read group announcements"
  on public.group_announcements for select to authenticated
  using ((select public.is_approved_member()));

revoke all on public.member_loan_settings from anon, authenticated;
grant select on public.member_loan_settings to authenticated;
drop policy if exists "Members can read their own loan limit"
  on public.member_loan_settings;
create policy "Members can read their own loan limit"
  on public.member_loan_settings for select to authenticated
  using (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
  );

revoke all on public.group_meetings, public.meeting_attendance
  from anon, authenticated;

revoke all on public.loan_requests from anon, authenticated;
revoke all on public.mpesa_payment_records from anon, authenticated;
revoke all on public.savings_withdrawal_requests from anon, authenticated;
grant select on public.mpesa_payment_records to authenticated;
grant select on public.savings_withdrawal_requests to authenticated;
drop policy if exists "Members and administrators can read savings withdrawal requests"
  on public.savings_withdrawal_requests;
create policy "Members and administrators can read savings withdrawal requests"
  on public.savings_withdrawal_requests for select to authenticated
  using (
    (member_id = (select auth.uid()) and (select public.is_approved_member()))
    or (select public.is_group_admin())
  );
drop policy if exists "Members and administrators can read M-Pesa records"
  on public.mpesa_payment_records;
create policy "Members and administrators can read M-Pesa records"
  on public.mpesa_payment_records for select to authenticated
  using (
    (member_id = (select auth.uid()) and (select public.is_approved_member()))
    or (select public.is_group_admin())
  );
grant select on public.loan_requests to authenticated;
grant insert (member_id, requested_amount, purpose)
  on public.loan_requests to authenticated;
drop policy if exists "Members can read their own loan requests"
  on public.loan_requests;
create policy "Members can read their own loan requests"
  on public.loan_requests for select to authenticated
  using (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
  );
drop policy if exists "Approved members can submit their own loan requests"
  on public.loan_requests;
create policy "Approved members can submit their own loan requests"
  on public.loan_requests for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
  );

drop policy if exists "Approved members can read their own loan requests"
  on public.loan_requests;

create or replace function public.create_pending_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'privacy_notice_version' is distinct from '2026-11-17' then
    raise exception 'Read and acknowledge the current privacy notice before requesting member access.';
  end if;

  insert into public.member_profiles (
    id, full_name, phone, status, privacy_notice_version, privacy_consent_at
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'pending',
    '2026-11-17',
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_pending_member_profile on auth.users;
create trigger create_pending_member_profile
  after insert on auth.users
  for each row execute procedure public.create_pending_member_profile();

update public.member_profiles
set approved_at = created_at
where status = 'approved' and approved_at is null;

create or replace function public.set_member_approved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_member_approved_at_before_update
  on public.member_profiles;
create trigger set_member_approved_at_before_update
  before update of status on public.member_profiles
  for each row execute procedure public.set_member_approved_at();

create or replace function public.get_member_group_summary()
returns table (
  group_name text,
  currency text,
  next_meeting_at timestamptz,
  meeting_location text,
  member_count bigint,
  savings_balance numeric,
  active_loan_count bigint,
  active_loan_balance numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    settings.group_name,
    settings.currency,
    settings.next_meeting_at,
    settings.meeting_location,
    (select count(*) from public.member_profiles as member
      where member.status = 'approved'),
    coalesce((
      select sum(
        case when saving.entry_type = 'contribution'
          then saving.amount else -saving.amount end
      )
      from public.savings_transactions as saving
    ), 0),
    (select count(*) from public.loans as loan
      where loan.status in ('approved', 'active')),
    coalesce((
      select sum(greatest(
        loan.principal - coalesce((
          select sum(repayment.amount)
          from public.loan_repayments as repayment
          where repayment.loan_id = loan.id
        ), 0),
        0
      ))
      from public.loans as loan
      where loan.status in ('approved', 'active')
    ), 0)
  from public.group_settings as settings
  where settings.id = true
    and (select public.is_approved_member());
$$;

revoke all on function public.get_member_group_summary() from public, anon;
grant execute on function public.get_member_group_summary() to authenticated;

create or replace function public.get_member_loan_eligibility()
returns table (
  eligible boolean,
  reason text,
  loan_limit numeric,
  savings_balance numeric,
  max_request_amount numeric,
  attended_meetings bigint,
  total_meetings bigint,
  member_since timestamptz,
  has_active_loan boolean,
  has_pending_request boolean,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_member as (
    select member.id, coalesce(member.approved_at, member.created_at) as active_since
    from public.member_profiles as member
    where member.id = (select auth.uid())
      and member.status = 'approved'
  ),
  member_savings as (
    select coalesce(sum(
      case when saving.entry_type = 'contribution'
        then saving.amount else -saving.amount end
    ), 0) as balance
    from public.savings_transactions as saving
    where saving.member_id = (select current_member.id from current_member)
  ),
  meeting_totals as (
    select
      count(meeting.id)::bigint as total_count,
      count(attendance.id) filter (where attendance.attended) as attended_count
    from current_member
    left join public.group_meetings as meeting
      on meeting.starts_at >= current_member.active_since
      and meeting.starts_at <= now()
    left join public.meeting_attendance as attendance
      on attendance.meeting_id = meeting.id
      and attendance.member_id = current_member.id
  ),
  member_state as (
    select
      exists (
        select 1 from public.loans as loan
        where loan.member_id = current_member.id
          and loan.status in ('approved', 'active')
      ) as has_active,
      exists (
        select 1 from public.loan_requests as request
        where request.member_id = current_member.id
          and request.status in ('pending', 'awaiting_guarantors')
      ) as has_pending
    from current_member
  ),
  eligibility_data as (
    select
      current_member.active_since,
      loan_settings.loan_limit,
      member_savings.balance,
      meeting_totals.attended_count,
      meeting_totals.total_count,
      member_state.has_active,
      member_state.has_pending,
      coalesce(group_settings.currency, 'KES') as currency,
      case
        when loan_settings.loan_limit is null then 0::numeric
        else least(loan_settings.loan_limit, greatest(member_savings.balance, 0) * 3)
      end as effective_limit
    from current_member
    cross join member_savings
    cross join meeting_totals
    cross join member_state
    left join public.member_loan_settings as loan_settings
      on loan_settings.member_id = current_member.id
    left join public.group_settings as group_settings
      on group_settings.id = true
  )
  select
    coalesce((
      eligibility_data.loan_limit > 0
      and eligibility_data.active_since <= now() - interval '3 months'
      and eligibility_data.total_count > 0
      and case
        when eligibility_data.total_count > 0
          then eligibility_data.attended_count::numeric / eligibility_data.total_count >= 0.75
        else false
      end
      and not eligibility_data.has_active
      and not eligibility_data.has_pending
      and eligibility_data.balance > 0
      and eligibility_data.effective_limit > 0
    ), false) as eligible,
    case
      when eligibility_data.loan_limit is null or eligibility_data.loan_limit <= 0
        then 'The group administrator has not set your loan limit yet.'
      when eligibility_data.active_since > now() - interval '3 months'
        then 'You must be an active member for at least 3 months before requesting a loan.'
      when eligibility_data.total_count = 0
        then 'Group meeting attendance has not been recorded yet.'
      when eligibility_data.attended_count::numeric / eligibility_data.total_count < 0.75
        then 'You must attend at least 75% of recorded group meetings to request a loan.'
      when eligibility_data.has_active
        then 'Repay your current loan before requesting another loan.'
      when eligibility_data.has_pending
        then 'You already have a loan request in progress. Complete guarantor confirmation and wait for group review before applying again.'
      when eligibility_data.balance <= 0
        then 'You need recorded savings before requesting a loan.'
      when eligibility_data.effective_limit <= 0
        then 'Your current savings do not support a loan request.'
      else 'You meet the current loan request requirements.'
    end as reason,
    eligibility_data.loan_limit,
    eligibility_data.balance as savings_balance,
    eligibility_data.effective_limit as max_request_amount,
    eligibility_data.attended_count,
    eligibility_data.total_count,
    eligibility_data.active_since as member_since,
    eligibility_data.has_active,
    eligibility_data.has_pending,
    eligibility_data.currency
  from eligibility_data;
$$;

revoke all on function public.get_member_loan_eligibility() from public, anon;
grant execute on function public.get_member_loan_eligibility() to authenticated;

create or replace function public.select_loan_request_guarantors(
  p_request_id uuid,
  p_first_guarantor_id uuid,
  p_second_guarantor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_owner uuid;
  request_status text;
  selected_count integer;
begin
  if p_first_guarantor_id is null
    or p_second_guarantor_id is null
    or p_first_guarantor_id = p_second_guarantor_id then
    raise exception 'Choose two different group members as guarantors.';
  end if;

  select request.member_id, request.status
  into request_owner, request_status
  from public.loan_requests as request
  where request.id = p_request_id
  for update;

  if not found or request_owner is distinct from (select auth.uid()) then
    raise exception 'Loan request was not found for your account.';
  end if;
  if request_status <> 'awaiting_guarantors' then
    raise exception 'This request is not waiting for guarantors.';
  end if;
  if not exists (
    select 1
    from public.member_profiles as member
    where member.id = (select auth.uid())
      and member.status = 'approved'
  ) then
    raise exception 'An approved member account is required to select guarantors.';
  end if;

  select count(*)
  into selected_count
  from public.member_profiles as member
  where member.id in (p_first_guarantor_id, p_second_guarantor_id)
    and member.id <> request_owner
    and member.status = 'approved';

  if selected_count <> 2 then
    raise exception 'Both guarantors must be different, approved group members and cannot be you.';
  end if;

  if exists (
    select 1
    from public.loan_request_guarantors as guarantee
    where guarantee.request_id = p_request_id
      and guarantee.status = 'declined'
  ) then
    delete from public.loan_request_guarantors
    where request_id = p_request_id;
  elsif exists (
    select 1
    from public.loan_request_guarantors as guarantee
    where guarantee.request_id = p_request_id
  ) then
    raise exception 'Guarantor requests have already been sent and are awaiting responses.';
  end if;

  insert into public.loan_request_guarantors (request_id, guarantor_id)
  values
    (p_request_id, p_first_guarantor_id),
    (p_request_id, p_second_guarantor_id);
end;
$$;

revoke all on function public.select_loan_request_guarantors(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.select_loan_request_guarantors(uuid, uuid, uuid)
  to authenticated;

create or replace function public.respond_to_loan_guarantee(
  p_request_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_status text;
  changed_count integer;
  accepted_count integer;
begin
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the guarantor request.';
  end if;

  select request.status
  into request_status
  from public.loan_requests as request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Loan request was not found.';
  end if;
  if request_status <> 'awaiting_guarantors' then
    raise exception 'This loan request is no longer waiting for guarantors.';
  end if;
  if not exists (
    select 1
    from public.member_profiles as member
    where member.id = (select auth.uid())
      and member.status = 'approved'
  ) then
    raise exception 'An approved group member account is required.';
  end if;

  update public.loan_request_guarantors
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where request_id = p_request_id
    and guarantor_id = (select auth.uid())
    and status = 'pending';

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'There is no pending guarantor request for you to respond to.';
  end if;

  if p_accept then
    select count(*)
    into accepted_count
    from public.loan_request_guarantors as guarantee
    where guarantee.request_id = p_request_id
      and guarantee.status = 'accepted';

    if accepted_count = 2 then
      update public.loan_requests
      set status = 'pending'
      where id = p_request_id;
      return 'pending';
    end if;
  end if;

  return 'awaiting_guarantors';
end;
$$;

revoke all on function public.respond_to_loan_guarantee(uuid, boolean)
  from public, anon;
grant execute on function public.respond_to_loan_guarantee(uuid, boolean)
  to authenticated;

create or replace function public.validate_loan_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  eligibility record;
begin
  if new.member_id is distinct from (select auth.uid()) then
    raise exception 'You can only submit a loan request for your own account.';
  end if;

  perform 1
  from public.member_profiles as member
  where member.id = new.member_id
  for update;

  select *
  into eligibility
  from public.get_member_loan_eligibility();

  if not found then
    raise exception 'An approved member account is required to request a loan.';
  end if;
  if eligibility.eligible is not true then
    raise exception '%', eligibility.reason;
  end if;
  if new.requested_amount > eligibility.max_request_amount then
    raise exception 'The requested amount exceeds your current maximum of % %.',
      eligibility.currency, eligibility.max_request_amount;
  end if;

  new.status := 'awaiting_guarantors';
  new.admin_note := null;
  new.reviewed_at := null;
  return new;
end;
$$;

revoke all on function public.validate_loan_request() from public, anon, authenticated;

drop trigger if exists validate_loan_request_before_insert on public.loan_requests;
create trigger validate_loan_request_before_insert
  before insert on public.loan_requests
  for each row execute procedure public.validate_loan_request();

-- Update the group name/currency in group_settings as needed.
-- To approve a member after verifying their identity:
-- update public.member_profiles
-- set status = 'approved'
-- where id = 'AUTH_USER_UUID';
--
-- Add savings/loan/repayment/announcement records from a trusted admin workflow
-- or the administrator dashboard. Member withdrawals require administrator review.
--
-- Set or update the administrator-approved member loan limit:
-- insert into public.member_loan_settings (member_id, loan_limit)
-- values ('AUTH_USER_UUID', 50000)
-- on conflict (member_id) do update
-- set loan_limit = excluded.loan_limit, updated_at = now();
--
-- Record each group meeting and attendance for every member, including absences:
-- insert into public.group_meetings (title, starts_at)
-- values ('Monthly group meeting', '2026-11-17T10:00:00Z')
-- returning id;
-- insert into public.meeting_attendance (meeting_id, member_id, attended)
-- values ('MEETING_UUID', 'AUTH_USER_UUID', true);
-- Add one attendance row for each group member; use false for absences.
--
-- Review pending applications:
-- select id, member_id, requested_amount, purpose, created_at
-- from public.loan_requests where status = 'pending'
-- order by created_at;
-- A new request remains awaiting_guarantors until both selected members accept;
-- only then does it move to pending for administrator review.
-- Loan approvals, repayment schedules, notifications and audit entries are
-- created transactionally by the administrator dashboard RPCs below.

alter table public.loan_repayment_schedule enable row level security;
alter table public.member_notifications enable row level security;
alter table public.admin_action_log enable row level security;
alter table public.savings_withdrawal_requests enable row level security;
revoke all on public.loan_repayment_schedule, public.member_notifications, public.admin_action_log
  from anon, authenticated;
grant select on public.loan_repayment_schedule, public.member_notifications
  to authenticated;
grant update (read_at) on public.member_notifications to authenticated;
grant select on public.admin_action_log to authenticated;

drop policy if exists "Members can read their own repayment schedule"
  on public.loan_repayment_schedule;
create policy "Members can read their own repayment schedule"
  on public.loan_repayment_schedule for select to authenticated
  using (
    (select public.is_approved_member())
    and exists (
      select 1 from public.loans as member_loan
      where member_loan.id = loan_id
        and member_loan.member_id = (select auth.uid())
    )
  );

drop policy if exists "Members can read their own notifications"
  on public.member_notifications;
create policy "Members can read their own notifications"
  on public.member_notifications for select to authenticated
  using (member_id = (select auth.uid()) and (select public.is_approved_member()));
drop policy if exists "Members can mark their own notifications read"
  on public.member_notifications;
create policy "Members can mark their own notifications read"
  on public.member_notifications for update to authenticated
  using (member_id = (select auth.uid()) and (select public.is_approved_member()))
  with check (member_id = (select auth.uid()) and read_at is not null);

create or replace function public.is_group_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_profiles as member
    where member.id = (select auth.uid())
      and member.status = 'approved'
      and member.role = 'admin'
  );
$$;

revoke all on function public.is_group_admin() from public, anon;
grant execute on function public.is_group_admin() to authenticated;

drop policy if exists "Administrators can read the action log"
  on public.admin_action_log;
create policy "Administrators can read the action log"
  on public.admin_action_log for select to authenticated
  using ((select public.is_group_admin()));

create or replace function public.audit_admin_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  action_name text;
  target_type text := tg_table_name;
  target_id text;
  details jsonb := '{}'::jsonb;
begin
  if not (select public.is_group_admin())
    and coalesce(auth.role(), '') <> 'service_role' then
    return new;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_id := coalesce(row_data ->> 'id', row_data ->> 'member_id',
    row_data ->> 'request_id', row_data ->> 'loan_id');
  action_name := lower(tg_op) || '_' || target_type;

  if target_type = 'member_profiles' then
    if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
      return new;
    end if;
    action_name := 'member_' || new.status;
    target_id := new.id::text;
    details := jsonb_build_object('full_name', new.full_name);
  elsif target_type = 'member_loan_settings' then
    details := jsonb_build_object('loan_limit', row_data -> 'loan_limit');
  elsif target_type = 'savings_transactions' then
    details := jsonb_build_object(
      'member_id', row_data -> 'member_id',
      'amount', row_data -> 'amount',
      'entry_type', row_data -> 'entry_type'
    );
  elsif target_type = 'loans' then
    details := jsonb_build_object(
      'member_id', row_data -> 'member_id',
      'principal', row_data -> 'principal',
      'status', row_data -> 'status'
    );
  elsif target_type = 'loan_repayments' then
    details := jsonb_build_object(
      'loan_id', row_data -> 'loan_id',
      'amount', row_data -> 'amount'
    );
  elsif target_type = 'group_announcements' then
    details := jsonb_build_object('title', row_data -> 'title');
  elsif target_type = 'group_meetings' then
    details := jsonb_build_object('title', row_data -> 'title', 'starts_at', row_data -> 'starts_at');
  elsif target_type = 'meeting_attendance' then
    details := jsonb_build_object(
      'meeting_id', row_data -> 'meeting_id',
      'member_id', row_data -> 'member_id',
      'attended', row_data -> 'attended'
    );
  elsif target_type = 'loan_requests' then
    if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
      return new;
    end if;
    action_name := 'loan_request_' || new.status;
    details := jsonb_build_object(
      'member_id', new.member_id,
      'requested_amount', new.requested_amount,
      'admin_note', new.admin_note
    );
  elsif target_type = 'mpesa_payment_records' then
    details := jsonb_build_object(
      'member_id', row_data -> 'member_id',
      'payment_type', row_data -> 'payment_type',
      'source', row_data -> 'source',
      'amount', row_data -> 'amount',
      'status', row_data -> 'status',
      'reference', coalesce(
        nullif(row_data ->> 'manual_reference', ''),
        nullif(row_data ->> 'mpesa_receipt_number', '')
      )
    );
  elsif target_type = 'savings_withdrawal_requests' then
    if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
      return new;
    end if;
    action_name := 'savings_withdrawal_request_' || new.status;
    details := jsonb_build_object(
      'member_id', new.member_id,
      'amount', new.amount,
      'reason', new.reason,
      'admin_note', new.admin_note
    );
  end if;

  insert into public.admin_action_log (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), action_name, target_type, target_id, details);
  return new;
end;
$$;

drop trigger if exists audit_admin_member_changes on public.member_profiles;
create trigger audit_admin_member_changes after update on public.member_profiles
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_loan_limits on public.member_loan_settings;
create trigger audit_admin_loan_limits after insert or update on public.member_loan_settings
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_savings on public.savings_transactions;
create trigger audit_admin_savings after insert on public.savings_transactions
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_loans on public.loans;
create trigger audit_admin_loans after insert or update on public.loans
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_repayments on public.loan_repayments;
create trigger audit_admin_repayments after insert on public.loan_repayments
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_announcements on public.group_announcements;
create trigger audit_admin_announcements after insert on public.group_announcements
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_meetings on public.group_meetings;
create trigger audit_admin_meetings after insert or update on public.group_meetings
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_attendance on public.meeting_attendance;
create trigger audit_admin_attendance after insert or update on public.meeting_attendance
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_loan_requests on public.loan_requests;
create trigger audit_admin_loan_requests after update on public.loan_requests
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_admin_mpesa_payments on public.mpesa_payment_records;
create trigger audit_admin_mpesa_payments after insert or update on public.mpesa_payment_records
  for each row execute procedure public.audit_admin_action();
drop trigger if exists audit_savings_withdrawal_request_review on public.savings_withdrawal_requests;
create trigger audit_savings_withdrawal_request_review after update on public.savings_withdrawal_requests
  for each row execute procedure public.audit_admin_action();

create or replace function public.get_my_portal_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.member_profiles as member
  where member.id = (select auth.uid())
    and member.status = 'approved';
$$;

revoke all on function public.get_my_portal_role() from public, anon;
grant execute on function public.get_my_portal_role() to authenticated;

create or replace function public.get_my_member_profile()
returns table (
  status text,
  full_name text,
  phone text,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select member.status, member.full_name, member.phone,
    member.created_at, member.approved_at
  from public.member_profiles as member
  where member.id = (select auth.uid());
$$;

revoke all on function public.get_my_member_profile() from public, anon;
grant execute on function public.get_my_member_profile() to authenticated;

create or replace function public.get_group_transparency()
returns table (available_lending_funds numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((
      select sum(case when saving.entry_type = 'contribution'
        then saving.amount else -saving.amount end)
      from public.savings_transactions as saving
    ), 0) - coalesce((
      select sum(greatest(
        loan.principal - coalesce((
          select sum(repayment.amount)
          from public.loan_repayments as repayment
          where repayment.loan_id = loan.id
        ), 0),
        0
      ))
      from public.loans as loan
      where loan.status in ('approved', 'active')
    ), 0),
    0
  )
  where (select public.is_approved_member());
$$;

revoke all on function public.get_group_transparency() from public, anon;
grant execute on function public.get_group_transparency() to authenticated;

create or replace function public.update_my_member_profile(
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_full_name, ''))) < 2 or length(p_full_name) > 120 then
    raise exception 'Enter a name between 2 and 120 characters.';
  end if;
  if length(trim(coalesce(p_phone, ''))) < 7 or length(p_phone) > 32 then
    raise exception 'Enter a valid phone number.';
  end if;

  update public.member_profiles
  set full_name = trim(p_full_name),
      phone = trim(p_phone)
  where id = (select auth.uid())
    and status = 'approved';

  if not found then
    raise exception 'An approved member account is required to update your profile.';
  end if;
end;
$$;

revoke all on function public.update_my_member_profile(text, text) from public, anon;
grant execute on function public.update_my_member_profile(text, text) to authenticated;

create or replace function public.admin_get_dashboard_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;

  return jsonb_build_object(
    'member_metrics_version', 2,
    'members', coalesce((
      select jsonb_agg(to_jsonb(member_row) order by member_row.full_name)
      from (
        select member.id, member.full_name, member.phone, member.status,
          member.created_at, member.approved_at,
          member.role,
          coalesce(settings.loan_limit, 0) as loan_limit,
          savings.balance as savings_balance,
          meeting_stats.attended_count as attended_meetings,
          meeting_stats.total_count as total_meetings,
          case when meeting_stats.total_count > 0
            then round(100.0 * meeting_stats.attended_count / meeting_stats.total_count, 1)
            else 0 end as attendance_percent,
          loans.outstanding_balance,
          loans.overdue_arrears,
          loans.has_active_loan,
          requests.has_pending_request,
          round(100.0 * (
            (case when coalesce(member.approved_at, member.created_at) <= now() - interval '3 months'
              then 1 else 0 end)
            + (case when meeting_stats.total_count > 0
                and meeting_stats.attended_count::numeric / meeting_stats.total_count >= 0.75
              then 1 else 0 end)
            + (case when savings.balance > 0 then 1 else 0 end)
            + (case when coalesce(settings.loan_limit, 0) > 0 then 1 else 0 end)
            + (case when not loans.has_active_loan then 1 else 0 end)
            + (case when not requests.has_pending_request then 1 else 0 end)
          ) / 6, 0)::integer as loan_qualification_percent
        from public.member_profiles as member
        left join public.member_loan_settings as settings
          on settings.member_id = member.id
        left join lateral (
          select coalesce(sum(
            case when saving.entry_type = 'contribution'
              then saving.amount else -saving.amount end
          ), 0) as balance
          from public.savings_transactions as saving
          where saving.member_id = member.id
        ) as savings on true
        left join lateral (
          select
            (count(attendance.id) filter (where attendance.attended))::bigint as attended_count,
            count(meeting.id)::bigint as total_count
          from public.group_meetings as meeting
          left join public.meeting_attendance as attendance
            on attendance.meeting_id = meeting.id
            and attendance.member_id = member.id
          where meeting.starts_at >= coalesce(member.approved_at, member.created_at)
            and meeting.starts_at <= now()
        ) as meeting_stats on true
        left join lateral (
          select
            coalesce(sum(coalesce(
              (
                select sum(greatest(schedule.amount - schedule.paid_amount, 0))
                from public.loan_repayment_schedule as schedule
                where schedule.loan_id = loan.id
              ),
              greatest(loan.principal - coalesce((
                select sum(repayment.amount)
                from public.loan_repayments as repayment
                where repayment.loan_id = loan.id
              ), 0), 0)
            )), 0) as outstanding_balance,
            coalesce(sum(case
              when exists (
                select 1 from public.loan_repayment_schedule as schedule
                where schedule.loan_id = loan.id
              ) then (
                select coalesce(sum(greatest(schedule.amount - schedule.paid_amount, 0)), 0)
                from public.loan_repayment_schedule as schedule
                where schedule.loan_id = loan.id
                  and schedule.due_date < current_date
              )
              when loan.due_date < current_date then greatest(loan.principal - coalesce((
                select sum(repayment.amount)
                from public.loan_repayments as repayment
                where repayment.loan_id = loan.id
              ), 0), 0)
              else 0
            end), 0) as overdue_arrears,
            coalesce(bool_or(true), false) as has_active_loan
          from public.loans as loan
          where loan.member_id = member.id
            and loan.status in ('approved', 'active')
        ) as loans on true
        left join lateral (
          select exists (
            select 1
            from public.loan_requests as request
            where request.member_id = member.id
              and request.status in ('pending', 'awaiting_guarantors')
          ) as has_pending_request
        ) as requests on true
      ) as member_row
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(to_jsonb(request_row) order by request_row.created_at)
      from (
        select request.id, request.member_id, member.full_name,
          request.requested_amount, request.purpose, request.status,
          request.created_at, request.admin_note,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'full_name', guarantor.full_name,
              'status', selected.status
            ) order by guarantor.full_name)
            from public.loan_request_guarantors as selected
            join public.member_profiles as guarantor on guarantor.id = selected.guarantor_id
            where selected.request_id = request.id
          ), '[]'::jsonb) as guarantors
        from public.loan_requests as request
        join public.member_profiles as member on member.id = request.member_id
        where request.status in ('pending', 'awaiting_guarantors')
      ) as request_row
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(to_jsonb(loan_row) order by loan_row.due_date)
      from (
        select loan.id, loan.member_id, member.full_name,
          loan.principal, loan.status, loan.purpose, loan.due_date,
          coalesce((
            select sum(schedule.amount - schedule.paid_amount)
            from public.loan_repayment_schedule as schedule
            where schedule.loan_id = loan.id
          ), greatest(loan.principal - coalesce((
            select sum(repayment.amount)
            from public.loan_repayments as repayment
            where repayment.loan_id = loan.id
          ), 0), 0)) as balance
        from public.loans as loan
        join public.member_profiles as member on member.id = loan.member_id
        where loan.status in ('approved', 'active')
      ) as loan_row
    ), '[]'::jsonb),
    'meetings', coalesce((
      select jsonb_agg(to_jsonb(meeting_row) order by meeting_row.starts_at desc)
      from (
        select meeting.id, meeting.title, meeting.starts_at,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'member_id', attendance.member_id,
              'attended', attendance.attended
            ) order by profile.full_name)
            from public.meeting_attendance as attendance
            join public.member_profiles as profile on profile.id = attendance.member_id
            where attendance.meeting_id = meeting.id
          ), '[]'::jsonb) as attendance
        from public.group_meetings as meeting
        order by meeting.starts_at desc
      ) as meeting_row
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(announcement_row) order by announcement_row.published_at desc)
      from (
        select id, title, body, published_at
        from public.group_announcements order by published_at desc
      ) as announcement_row
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(audit_row) order by audit_row.created_at desc)
      from (
        select log.id, log.action, log.target_type, log.target_id,
          log.details, log.created_at, actor.full_name as actor_name
        from public.admin_action_log as log
        left join public.member_profiles as actor on actor.id = log.actor_id
        order by log.created_at desc
      ) as audit_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_dashboard_data() from public, anon;
grant execute on function public.admin_get_dashboard_data() to authenticated;

create or replace function public.admin_set_member_status(
  p_member_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.';
  end if;

  update public.member_profiles
  set status = p_status
  where id = p_member_id and status = 'pending';
  if not found then
    raise exception 'This member request is no longer pending.';
  end if;
end;
$$;

create or replace function public.admin_suspend_member(
  p_member_id uuid,
  p_suspend boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status text;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_member_id is null or p_suspend is null then
    raise exception 'Choose a member and a suspension action.';
  end if;

  target_status := case when p_suspend then 'approved' else 'suspended' end;
  update public.member_profiles
  set status = case when p_suspend then 'suspended' else 'approved' end
  where id = p_member_id
    and role = 'member'
    and status = target_status;
  if not found then
    raise exception 'Only approved or suspended member accounts can be changed.';
  end if;
end;
$$;

create or replace function public.admin_set_member_loan_limit(
  p_member_id uuid,
  p_loan_limit numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_loan_limit is null or p_loan_limit < 0 or p_loan_limit > 1000000000
    or p_loan_limit <> round(p_loan_limit, 2) then
    raise exception 'Enter a valid non-negative loan limit.';
  end if;
  if not exists (
    select 1 from public.member_profiles
    where id = p_member_id and status = 'approved'
  ) then
    raise exception 'Choose an approved member.';
  end if;

  insert into public.member_loan_settings (member_id, loan_limit, updated_at)
  values (p_member_id, p_loan_limit, now())
  on conflict (member_id) do update
  set loan_limit = excluded.loan_limit, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.admin_record_savings(
  p_member_id uuid,
  p_amount numeric,
  p_entry_type text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_id uuid;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000
    or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid amount greater than zero.';
  end if;
  if p_entry_type is null or p_entry_type not in ('contribution', 'withdrawal') then
    raise exception 'Choose a contribution or withdrawal.';
  end if;
  if length(coalesce(p_description, '')) > 300 then
    raise exception 'The transaction note must be 300 characters or fewer.';
  end if;
  perform 1 from public.member_profiles
  where id = p_member_id and status = 'approved'
  for update;
  if not found then
    raise exception 'Choose an approved member.';
  end if;
  if p_entry_type = 'withdrawal' and p_amount > coalesce((
    select sum(case when saving.entry_type = 'contribution'
      then saving.amount else -saving.amount end)
    from public.savings_transactions as saving
    where saving.member_id = p_member_id
  ), 0) then
    raise exception 'The withdrawal exceeds the member’s recorded savings balance.';
  end if;

  insert into public.savings_transactions (member_id, amount, entry_type, description)
  values (p_member_id, p_amount, p_entry_type, nullif(trim(p_description), ''))
  returning id into transaction_id;
  return transaction_id;
end;
$$;

create or replace function public.submit_savings_withdrawal_request(
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_member_id uuid := (select auth.uid());
  request_id uuid;
  savings_balance numeric(12, 2);
begin
  if not (select public.is_approved_member()) then
    raise exception 'An approved member account is required to request a savings withdrawal.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000
    or p_amount <> round(p_amount, 2)
    or length(trim(coalesce(p_reason, ''))) < 2
    or length(p_reason) > 500 then
    raise exception 'Enter a valid withdrawal amount and a reason between 2 and 500 characters.';
  end if;

  perform 1
  from public.member_profiles
  where id = requesting_member_id and status = 'approved'
  for update;
  if not found then
    raise exception 'An approved member account is required to request a savings withdrawal.';
  end if;

  select coalesce(sum(case when entry_type = 'contribution'
    then amount else -amount end), 0)
  into savings_balance
  from public.savings_transactions
  where savings_transactions.member_id = requesting_member_id;
  if p_amount > greatest(savings_balance, 0) then
    raise exception 'The request exceeds your available savings balance.';
  end if;
  if exists (
    select 1 from public.savings_withdrawal_requests
    where savings_withdrawal_requests.member_id = requesting_member_id
      and status = 'pending'
  ) then
    raise exception 'You already have a withdrawal request awaiting administrator review.';
  end if;

  insert into public.savings_withdrawal_requests (member_id, amount, reason)
  values (requesting_member_id, p_amount, trim(p_reason))
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.admin_review_savings_withdrawal(
  p_request_id uuid,
  p_approve boolean,
  p_admin_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.savings_withdrawal_requests%rowtype;
  savings_balance numeric(12, 2);
  transaction_id uuid;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_approve is null or length(coalesce(p_admin_note, '')) > 500 then
    raise exception 'Choose approve or reject and enter an optional note of 500 characters or fewer.';
  end if;

  select * into request_row
  from public.savings_withdrawal_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'This withdrawal request is no longer awaiting review.';
  end if;

  if p_approve then
    perform 1
    from public.member_profiles
    where id = request_row.member_id and status = 'approved'
    for update;
    if not found then
      raise exception 'The member is no longer approved.';
    end if;

    select coalesce(sum(case when entry_type = 'contribution'
      then amount else -amount end), 0)
    into savings_balance
    from public.savings_transactions
    where member_id = request_row.member_id;
    if request_row.amount > greatest(savings_balance, 0) then
      raise exception 'The member’s available savings no longer cover this withdrawal request.';
    end if;

    insert into public.savings_transactions (
      member_id, amount, entry_type, description, withdrawal_request_id
    )
    values (
      request_row.member_id,
      request_row.amount,
      'withdrawal',
      'Approved withdrawal request: ' || request_row.reason,
      request_row.id
    )
    returning id into transaction_id;
  end if;

  update public.savings_withdrawal_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_note = nullif(trim(p_admin_note), ''),
      savings_transaction_id = transaction_id,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = request_row.id;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.admin_publish_announcement(
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  announcement_id uuid;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 120
    or length(trim(coalesce(p_body, ''))) < 2 or length(p_body) > 2000 then
    raise exception 'Enter a title and announcement between 2 and 2,000 characters.';
  end if;
  insert into public.group_announcements (title, body)
  values (trim(p_title), trim(p_body))
  returning id into announcement_id;
  return announcement_id;
end;
$$;

create or replace function public.admin_create_meeting(
  p_title text,
  p_starts_at timestamptz,
  p_location text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_id uuid;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 120
    or p_starts_at is null
    or length(coalesce(p_location, '')) > 200 then
    raise exception 'Enter a valid meeting title, date, and location.';
  end if;
  insert into public.group_meetings (title, starts_at)
  values (trim(p_title), p_starts_at)
  returning id into meeting_id;

  insert into public.meeting_attendance (meeting_id, member_id, attended)
  select meeting_id, member.id, false
  from public.member_profiles as member
  where member.status = 'approved';

  update public.group_settings
  set next_meeting_at = case when p_starts_at > now() then p_starts_at else next_meeting_at end,
      meeting_location = case when p_starts_at > now()
        then nullif(trim(p_location), '') else meeting_location end,
      updated_at = now()
  where id = true;
  return meeting_id;
end;
$$;

create or replace function public.admin_save_meeting_attendance(
  p_meeting_id uuid,
  p_attendance jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attendance_count integer;
  distinct_count integer;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Attendance must be supplied as a list.';
  end if;
  if not exists (
    select 1 from public.group_meetings where id = p_meeting_id
  ) then
    raise exception 'Choose a valid group meeting.';
  end if;

  select count(*) into attendance_count
  from jsonb_array_elements(p_attendance);
  select count(distinct item.member_id) into distinct_count
  from jsonb_to_recordset(p_attendance) as item(member_id uuid, attended boolean);
  if attendance_count <> (
    select count(*) from public.member_profiles where status = 'approved'
  ) or distinct_count <> attendance_count
    or exists (
      select 1
      from jsonb_to_recordset(p_attendance) as item(member_id uuid, attended boolean)
      where not exists (
        select 1 from public.member_profiles as member
        where member.id = item.member_id and member.status = 'approved'
      )
    ) then
    raise exception 'Provide an attendance value for every approved member.';
  end if;

  insert into public.meeting_attendance (meeting_id, member_id, attended)
  select p_meeting_id, item.member_id, item.attended
  from jsonb_to_recordset(p_attendance) as item(member_id uuid, attended boolean)
  where exists (
    select 1 from public.member_profiles as member
    where member.id = item.member_id and member.status = 'approved'
  )
  on conflict (meeting_id, member_id) do update
  set attended = excluded.attended;

  if (select count(*) from public.meeting_attendance where meeting_id = p_meeting_id)
    <> attendance_count then
    raise exception 'Attendance list must contain each approved member exactly once.';
  end if;
end;
$$;

create or replace function public.admin_review_loan_request(
  p_request_id uuid,
  p_approve boolean,
  p_term_months integer,
  p_total_due numeric,
  p_first_due_date date,
  p_admin_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.loan_requests%rowtype;
  created_loan_id uuid;
  regular_installment numeric(12, 2);
  member_since timestamptz;
  member_savings numeric;
  member_loan_limit numeric;
  total_meetings bigint;
  attended_meetings bigint;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if length(coalesce(p_admin_note, '')) > 500 then
    raise exception 'The review note must be 500 characters or fewer.';
  end if;
  if p_approve is null then
    raise exception 'Choose approve or reject.';
  end if;

  select * into request_row
  from public.loan_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'This loan request is no longer awaiting review.';
  end if;

  if p_approve then
    perform 1
    from public.member_profiles as member
    where member.id = request_row.member_id and member.status = 'approved'
    for update;
    if not found then
      raise exception 'The applicant is no longer an approved member.';
    end if;

    select coalesce(member.approved_at, member.created_at)
    into member_since
    from public.member_profiles as member
    where member.id = request_row.member_id;
    select coalesce(sum(case when saving.entry_type = 'contribution'
      then saving.amount else -saving.amount end), 0)
    into member_savings
    from public.savings_transactions as saving
    where saving.member_id = request_row.member_id;
    select settings.loan_limit
    into member_loan_limit
    from public.member_loan_settings as settings
    where settings.member_id = request_row.member_id
    for update;
    select count(meeting.id),
      count(attendance.id) filter (where attendance.attended)
    into total_meetings, attended_meetings
    from public.group_meetings as meeting
    left join public.meeting_attendance as attendance
      on attendance.meeting_id = meeting.id
      and attendance.member_id = request_row.member_id
    where meeting.starts_at >= member_since and meeting.starts_at <= now();

    if member_since > now() - interval '3 months'
      or total_meetings = 0
      or attended_meetings::numeric / nullif(total_meetings, 0) < 0.75
      or member_loan_limit is null
      or request_row.requested_amount > least(member_loan_limit, greatest(member_savings, 0) * 3)
      or exists (
        select 1 from public.loans as loan
        where loan.member_id = request_row.member_id
          and loan.status in ('approved', 'active')
      )
      or exists (
        select 1 from public.loan_requests as other_request
        where other_request.member_id = request_row.member_id
          and other_request.id <> p_request_id
          and other_request.status in ('pending', 'awaiting_guarantors')
      ) then
      raise exception 'The applicant no longer meets the current membership, savings, attendance, loan-limit, or active-loan requirements.';
    end if;

    if (
      select count(*) from public.loan_request_guarantors as guarantee
      where guarantee.request_id = p_request_id and guarantee.status = 'accepted'
    ) <> 2 then
      raise exception 'Both guarantors must accept before a loan can be approved.';
    end if;
    if p_term_months is null or p_term_months < 1 or p_term_months > 36
      or p_total_due is null or p_total_due < request_row.requested_amount
      or p_total_due < p_term_months * 0.01
      or p_total_due > 1000000000
      or p_total_due <> round(p_total_due, 2)
      or p_first_due_date is null or p_first_due_date < current_date then
      raise exception 'Provide a valid repayment total, term (1–36 months), and first due date.';
    end if;

    insert into public.loans (request_id, member_id, principal, status, purpose, due_date)
    values (request_row.id, request_row.member_id, request_row.requested_amount, 'active',
      request_row.purpose, p_first_due_date + ((p_term_months - 1) * interval '1 month'))
    returning id into created_loan_id;

    regular_installment := round(p_total_due / p_term_months, 2);
    insert into public.loan_repayment_schedule (
      loan_id, installment_number, due_date, amount
    )
    select created_loan_id, installment_number,
      (p_first_due_date + ((installment_number - 1) * interval '1 month'))::date,
      case when installment_number = p_term_months
        then p_total_due - (regular_installment * (p_term_months - 1))
        else regular_installment end
    from generate_series(1, p_term_months) as series(installment_number);

    update public.loan_requests
    set status = 'approved', admin_note = nullif(trim(p_admin_note), ''),
        reviewed_at = now()
    where id = p_request_id;
  else
    update public.loan_requests
    set status = 'rejected', admin_note = nullif(trim(p_admin_note), ''),
        reviewed_at = now()
    where id = p_request_id;
  end if;
  return created_loan_id;
end;
$$;

create or replace function public.admin_record_repayment(
  p_loan_id uuid,
  p_amount numeric,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  outstanding numeric(12, 2);
  remaining numeric(12, 2);
  installment record;
  allocation numeric(12, 2);
  repayment_id uuid;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000
    or p_amount <> round(p_amount, 2)
    or length(coalesce(p_note, '')) > 300 then
    raise exception 'Enter a valid repayment amount and note.';
  end if;
  perform 1 from public.loans where id = p_loan_id and status in ('active', 'approved') for update;
  if not found then
    raise exception 'Choose an active loan.';
  end if;

  select sum(amount - paid_amount) into outstanding
  from public.loan_repayment_schedule
  where loan_id = p_loan_id;
  if outstanding is null then
    select greatest(loan.principal - coalesce(sum(repayment.amount), 0), 0)
    into outstanding
    from public.loans as loan
    left join public.loan_repayments as repayment on repayment.loan_id = loan.id
    where loan.id = p_loan_id
    group by loan.principal;
  end if;
  if outstanding <= 0 or p_amount > outstanding then
    raise exception 'The payment exceeds the outstanding scheduled loan balance.';
  end if;

  insert into public.loan_repayments (loan_id, amount, note)
  values (p_loan_id, p_amount, nullif(trim(p_note), ''))
  returning id into repayment_id;
  remaining := p_amount;

  for installment in
    select id, amount, paid_amount
    from public.loan_repayment_schedule
    where loan_id = p_loan_id and paid_amount < amount
    order by due_date, installment_number
    for update
  loop
    exit when remaining <= 0;
    allocation := least(remaining, installment.amount - installment.paid_amount);
    update public.loan_repayment_schedule
    set paid_amount = paid_amount + allocation,
        paid_at = case when paid_amount + allocation >= amount then now() else null end
    where id = installment.id;
    remaining := remaining - allocation;
  end loop;

  update public.member_notifications as notification
  set body = case when schedule.amount = schedule.paid_amount
      then 'The scheduled installment due ' || to_char(schedule.due_date, 'FMDD Mon YYYY') || ' is fully paid.'
      else 'Your remaining installment balance is '
        || (schedule.amount - schedule.paid_amount)::text
        || ' for the installment due ' || to_char(schedule.due_date, 'FMDD Mon YYYY') || '.' end,
      read_at = case when schedule.amount = schedule.paid_amount then now() else notification.read_at end
  from public.loan_repayment_schedule as schedule
  join public.loans as loan on loan.id = schedule.loan_id
  where schedule.loan_id = p_loan_id
    and notification.reference_id = schedule.id
    and notification.member_id = loan.member_id
    and notification.notification_type in ('repayment_due', 'repayment_overdue');

  if outstanding = p_amount then
    update public.loans set status = 'paid' where id = p_loan_id;
  end if;
  return repayment_id;
end;
$$;

create or replace function public.submit_manual_mpesa_payment(
  p_payment_type text,
  p_amount numeric,
  p_phone_number text,
  p_manual_reference text,
  p_loan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_id uuid;
  outstanding numeric(12, 2);
  loan_row public.loans%rowtype;
  normalized_reference text := upper(trim(coalesce(p_manual_reference, '')));
begin
  if not (select public.is_approved_member()) then
    raise exception 'An approved member account is required to submit a payment reference.';
  end if;
  if p_payment_type is null or p_payment_type not in ('savings', 'loan_repayment')
    or p_amount is null or p_amount <= 0 or p_amount > 250000
    or p_amount <> trunc(p_amount)
    or length(coalesce(p_phone_number, '')) > 20
    or regexp_replace(coalesce(p_phone_number, ''), '\D', '', 'g')
      !~ '^(254[17][0-9]{8}|0[17][0-9]{8})$'
    or normalized_reference !~ '^[A-Z0-9]{8,20}$'
    or (p_payment_type = 'savings' and p_loan_id is not null)
    or (p_payment_type = 'loan_repayment' and p_loan_id is null) then
    raise exception 'Enter a valid payment type, whole KES amount, phone number, reference, and loan where required.';
  end if;
  if p_payment_type = 'loan_repayment' then
    select * into loan_row
    from public.loans as loan
    where loan.id = p_loan_id
      and loan.member_id = (select auth.uid())
      and loan.status in ('active', 'approved')
    for update;
    if not found then
      raise exception 'Choose one of your active loans.';
    end if;
    select sum(schedule.amount - schedule.paid_amount)
    into outstanding
    from public.loan_repayment_schedule as schedule
    where schedule.loan_id = p_loan_id;
    if outstanding is null then
      select greatest(loan.principal - coalesce(sum(repayment.amount), 0), 0)
      into outstanding
      from public.loans as loan
      left join public.loan_repayments as repayment on repayment.loan_id = loan.id
      where loan.id = p_loan_id
      group by loan.principal;
    end if;
    if p_amount > coalesce(outstanding, 0) then
      raise exception 'The payment amount exceeds the outstanding loan balance.';
    end if;
  end if;

  insert into public.mpesa_payment_records (
    member_id, payment_type, loan_id, source, amount, phone_number,
    manual_reference, status
  )
  values (
    (select auth.uid()), p_payment_type, p_loan_id, 'manual', p_amount,
    trim(p_phone_number), normalized_reference, 'pending'
  )
  returning id into payment_id;
  return payment_id;
end;
$$;

create or replace function public.apply_mpesa_payment_ledger(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.mpesa_payment_records%rowtype;
  loan_row public.loans%rowtype;
  installment record;
  outstanding numeric(12, 2);
  remaining numeric(12, 2);
  allocation numeric(12, 2);
begin
  select * into payment_row
  from public.mpesa_payment_records
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'M-Pesa payment record was not found.';
  end if;
  if payment_row.status = 'completed' then
    return 'completed';
  end if;
  if payment_row.status not in ('pending', 'needs_review') then
    raise exception 'This M-Pesa payment is not available for posting.';
  end if;
  if payment_row.source = 'stk_push'
    and coalesce(auth.role(), '') <> 'service_role'
    and not (select public.is_group_admin()) then
    raise exception 'Only a verified M-Pesa callback can post an STK payment.';
  elsif payment_row.source = 'manual' and not (select public.is_group_admin()) then
    raise exception 'Administrator review is required to post a manual M-Pesa reference.';
  end if;
  if payment_row.source = 'stk_push' and payment_row.mpesa_receipt_number is null then
    raise exception 'The M-Pesa receipt must be verified before posting.';
  end if;

  if payment_row.payment_type = 'savings' then
    insert into public.savings_transactions (
      member_id, amount, entry_type, description, mpesa_payment_id
    )
    values (
      payment_row.member_id, payment_row.amount, 'contribution',
      'M-Pesa payment ' || coalesce(payment_row.mpesa_receipt_number, payment_row.manual_reference),
      payment_row.id
    );
  else
    select * into loan_row
    from public.loans as loan
    where loan.id = payment_row.loan_id
      and loan.member_id = payment_row.member_id
      and loan.status in ('active', 'approved')
    for update;
    if not found then
      raise exception 'The payment loan is not active for this member.';
    end if;

    select sum(schedule.amount - schedule.paid_amount)
    into outstanding
    from public.loan_repayment_schedule as schedule
    where schedule.loan_id = payment_row.loan_id;
    if outstanding is null then
      select greatest(loan.principal - coalesce(sum(repayment.amount), 0), 0)
      into outstanding
      from public.loans as loan
      left join public.loan_repayments as repayment on repayment.loan_id = loan.id
      where loan.id = payment_row.loan_id
      group by loan.principal;
    end if;
    if coalesce(outstanding, 0) <= 0 or payment_row.amount > outstanding then
      raise exception 'The payment exceeds the current outstanding loan balance.';
    end if;

    insert into public.loan_repayments (
      loan_id, amount, note, mpesa_payment_id
    )
    values (
      payment_row.loan_id, payment_row.amount,
      'M-Pesa payment ' || coalesce(payment_row.mpesa_receipt_number, payment_row.manual_reference),
      payment_row.id
    );
    remaining := payment_row.amount;
    for installment in
      select id, amount, paid_amount
      from public.loan_repayment_schedule
      where loan_id = payment_row.loan_id and paid_amount < amount
      order by due_date, installment_number
      for update
    loop
      exit when remaining <= 0;
      allocation := least(remaining, installment.amount - installment.paid_amount);
      update public.loan_repayment_schedule
      set paid_amount = paid_amount + allocation,
          paid_at = case when paid_amount + allocation >= amount then now() else null end
      where id = installment.id;
      remaining := remaining - allocation;
    end loop;
    if outstanding = payment_row.amount then
      update public.loans set status = 'paid' where id = payment_row.loan_id;
    end if;
  end if;

  update public.mpesa_payment_records
  set status = 'completed',
      reviewed_by = case
        when payment_row.source = 'manual' or (select public.is_group_admin())
          then (select auth.uid())
        else null
      end,
      reviewed_at = now(),
      updated_at = now()
  where id = payment_row.id;
  return 'completed';
end;
$$;

create or replace function public.confirm_mpesa_stk_payment(
  p_checkout_request_id text,
  p_amount numeric,
  p_phone_number text,
  p_mpesa_receipt_number text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.mpesa_payment_records%rowtype;
  received_phone text := regexp_replace(coalesce(p_phone_number, ''), '\D', '', 'g');
  expected_phone text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment callback service can confirm STK payments.';
  end if;
  select * into payment_row
  from public.mpesa_payment_records
  where checkout_request_id = p_checkout_request_id and source = 'stk_push'
  for update;
  if not found then
    raise exception 'No matching STK payment was found.';
  end if;
  if payment_row.status = 'completed' then
    return 'completed';
  end if;
  if payment_row.status not in ('pending', 'needs_review') then
    return payment_row.status;
  end if;

  expected_phone := regexp_replace(payment_row.phone_number, '\D', '', 'g');
  if length(received_phone) = 10 and left(received_phone, 1) = '0' then
    received_phone := '254' || substr(received_phone, 2);
  end if;
  if length(expected_phone) = 10 and left(expected_phone, 1) = '0' then
    expected_phone := '254' || substr(expected_phone, 2);
  end if;
  if p_amount is null or p_amount <> payment_row.amount
    or p_mpesa_receipt_number is null
    or length(trim(p_mpesa_receipt_number)) < 8
    or length(trim(p_mpesa_receipt_number)) > 32
    or received_phone <> expected_phone then
    update public.mpesa_payment_records
    set status = 'needs_review',
        callback_received_amount = p_amount,
        callback_received_phone = left(received_phone, 20),
        callback_received_receipt = left(trim(coalesce(p_mpesa_receipt_number, '')), 32),
        result_description = 'M-Pesa callback details did not match the requested payment.',
        updated_at = now()
    where id = payment_row.id;
    return 'needs_review';
  end if;

  update public.mpesa_payment_records
  set mpesa_receipt_number = upper(trim(p_mpesa_receipt_number)),
      callback_received_amount = p_amount,
      callback_received_phone = left(received_phone, 20),
      callback_received_receipt = left(trim(p_mpesa_receipt_number), 32),
      status = 'pending',
      updated_at = now()
  where id = payment_row.id;
  begin
    return public.apply_mpesa_payment_ledger(payment_row.id);
  exception when others then
    update public.mpesa_payment_records
    set status = 'needs_review',
        result_description = left('Verified payment could not be posted automatically: ' || sqlerrm, 300),
        updated_at = now()
    where id = payment_row.id;
    return 'needs_review';
  end;
end;
$$;

create or replace function public.flag_mpesa_stk_review(
  p_checkout_request_id text,
  p_result_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment callback service can update STK status.';
  end if;
  update public.mpesa_payment_records
  set status = 'needs_review',
      result_description = left(coalesce(p_result_description, 'Payment result needs review.'), 300),
      updated_at = now()
  where checkout_request_id = p_checkout_request_id
    and source = 'stk_push'
    and status = 'pending';
end;
$$;

create or replace function public.admin_review_manual_mpesa_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_review_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.mpesa_payment_records%rowtype;
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_approve is null or length(coalesce(p_review_note, '')) > 500 then
    raise exception 'Choose approve or reject and enter a note of 500 characters or fewer.';
  end if;
  select * into payment_row
  from public.mpesa_payment_records
  where id = p_payment_id and source = 'manual' and status = 'pending'
  for update;
  if not found then
    raise exception 'This manual M-Pesa reference is no longer awaiting review.';
  end if;
  if not p_approve then
    update public.mpesa_payment_records
    set status = 'rejected',
        review_note = nullif(trim(p_review_note), ''),
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where id = payment_row.id;
    return 'rejected';
  end if;
  update public.mpesa_payment_records
  set review_note = nullif(trim(p_review_note), ''),
      updated_at = now()
  where id = payment_row.id;
  return public.apply_mpesa_payment_ledger(payment_row.id);
end;
$$;

create or replace function public.admin_review_mpesa_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_review_note text,
  p_verified_receipt text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.mpesa_payment_records%rowtype;
  verified_receipt text := upper(trim(coalesce(p_verified_receipt, '')));
begin
  if not (select public.is_group_admin()) then
    raise exception 'Administrator access is required.';
  end if;
  if p_approve is null or length(coalesce(p_review_note, '')) > 500 then
    raise exception 'Choose approve or reject and enter a note of 500 characters or fewer.';
  end if;
  select * into payment_row
  from public.mpesa_payment_records
  where id = p_payment_id
    and ((source = 'manual' and status = 'pending')
      or (source = 'stk_push' and status = 'needs_review'))
  for update;
  if not found then
    raise exception 'This M-Pesa payment is no longer awaiting review.';
  end if;
  if not p_approve then
    update public.mpesa_payment_records
    set status = 'rejected',
        review_note = nullif(trim(p_review_note), ''),
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where id = payment_row.id;
    return 'rejected';
  end if;
  if payment_row.source = 'stk_push'
    and verified_receipt !~ '^[A-Z0-9]{8,32}$' then
    raise exception 'Enter the verified M-Pesa receipt code from the Paybill statement.';
  end if;
  if payment_row.source = 'stk_push'
    and payment_row.callback_received_amount is not null
    and payment_row.callback_received_amount <> payment_row.amount then
    raise exception 'The M-Pesa callback amount does not match the requested payment. Reject it and submit the verified amount as a manual reference.';
  end if;
  if payment_row.source = 'stk_push'
    and payment_row.callback_received_receipt is not null
    and upper(trim(payment_row.callback_received_receipt)) <> verified_receipt then
    raise exception 'The receipt code does not match the M-Pesa callback. Check the Paybill statement and try again.';
  end if;
  update public.mpesa_payment_records
  set review_note = nullif(trim(p_review_note), ''),
      mpesa_receipt_number = case when payment_row.source = 'stk_push'
        then verified_receipt else mpesa_receipt_number end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = payment_row.id;
  return public.apply_mpesa_payment_ledger(payment_row.id);
end;
$$;

revoke all on function public.admin_set_member_status(uuid, text) from public, anon;
revoke all on function public.admin_suspend_member(uuid, boolean) from public, anon;
revoke all on function public.admin_set_member_loan_limit(uuid, numeric) from public, anon;
revoke all on function public.admin_record_savings(uuid, numeric, text, text) from public, anon;
revoke all on function public.submit_savings_withdrawal_request(numeric, text) from public, anon;
revoke all on function public.admin_review_savings_withdrawal(uuid, boolean, text) from public, anon;
revoke all on function public.admin_publish_announcement(text, text) from public, anon;
revoke all on function public.admin_create_meeting(text, timestamptz, text) from public, anon;
revoke all on function public.admin_save_meeting_attendance(uuid, jsonb) from public, anon;
revoke all on function public.admin_review_loan_request(uuid, boolean, integer, numeric, date, text) from public, anon;
revoke all on function public.admin_record_repayment(uuid, numeric, text) from public, anon;
revoke all on function public.submit_manual_mpesa_payment(text, numeric, text, text, uuid) from public, anon;
revoke all on function public.apply_mpesa_payment_ledger(uuid) from public, anon, authenticated;
revoke all on function public.confirm_mpesa_stk_payment(text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.flag_mpesa_stk_review(text, text) from public, anon, authenticated;
revoke all on function public.admin_review_manual_mpesa_payment(uuid, boolean, text) from public, anon;
revoke all on function public.admin_review_mpesa_payment(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_set_member_status(uuid, text) to authenticated;
grant execute on function public.admin_suspend_member(uuid, boolean) to authenticated;
grant execute on function public.admin_set_member_loan_limit(uuid, numeric) to authenticated;
grant execute on function public.admin_record_savings(uuid, numeric, text, text) to authenticated;
grant execute on function public.submit_savings_withdrawal_request(numeric, text) to authenticated;
grant execute on function public.admin_review_savings_withdrawal(uuid, boolean, text) to authenticated;
grant execute on function public.admin_publish_announcement(text, text) to authenticated;
grant execute on function public.admin_create_meeting(text, timestamptz, text) to authenticated;
grant execute on function public.admin_save_meeting_attendance(uuid, jsonb) to authenticated;
grant execute on function public.admin_review_loan_request(uuid, boolean, integer, numeric, date, text) to authenticated;
grant execute on function public.admin_record_repayment(uuid, numeric, text) to authenticated;
grant execute on function public.submit_manual_mpesa_payment(text, numeric, text, text, uuid) to authenticated;
grant execute on function public.confirm_mpesa_stk_payment(text, numeric, text, text) to service_role;
grant execute on function public.flag_mpesa_stk_review(text, text) to service_role;
grant execute on function public.admin_review_manual_mpesa_payment(uuid, boolean, text) to authenticated;
grant execute on function public.admin_review_mpesa_payment(uuid, boolean, text, text) to authenticated;

create or replace function public.notify_member_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  borrower_name text;
begin
  if tg_table_name = 'loan_requests' then
    if tg_op = 'UPDATE' and old.status is distinct from new.status
      and new.status in ('approved', 'rejected') then
      insert into public.member_notifications (member_id, notification_type, title, body)
      values (
        new.member_id,
        'loan_request_' || new.status,
        case when new.status = 'approved' then 'Loan request approved' else 'Loan request update' end,
        case when new.status = 'approved'
          then 'Your loan request was approved. Review the repayment schedule in your portal.'
          else coalesce(new.admin_note, 'Your loan request was not approved. Contact the group administrator for details.') end
      );
    end if;
    return new;
  elsif tg_table_name = 'loan_request_guarantors' then
    select full_name into borrower_name
    from public.member_profiles as member
    join public.loan_requests as request on request.member_id = member.id
    where request.id = new.request_id;
    if tg_op = 'INSERT' then
      insert into public.member_notifications (member_id, notification_type, title, body)
      values (new.guarantor_id, 'guarantor_request', 'Guarantor consent requested',
        coalesce(borrower_name, 'A group member') || ' selected you as a loan guarantor. Review the request and accept or decline.');
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
      if new.status = 'declined' then
        insert into public.member_notifications (member_id, notification_type, title, body)
        select request.member_id, 'guarantor_declined', 'Guarantor declined',
          'A selected guarantor declined. Choose two replacements in your loan request.'
        from public.loan_requests as request
        where request.id = new.request_id;
      elsif new.status = 'accepted' then
        insert into public.member_notifications (member_id, notification_type, title, body)
        select request.member_id, 'guarantor_accepted', 'Guarantor accepted',
          'A selected guarantor accepted your request.'
        from public.loan_requests as request
        where request.id = new.request_id;
      end if;
    end if;
    return new;
  elsif tg_table_name = 'loan_repayments' then
    insert into public.member_notifications (member_id, notification_type, title, body)
    select loan.member_id, 'repayment_recorded', 'Loan repayment recorded',
      'A repayment of ' || new.amount::text || ' was recorded on your loan.'
    from public.loans as loan where loan.id = new.loan_id;
    return new;
  elsif tg_table_name = 'group_announcements' then
    insert into public.member_notifications (member_id, notification_type, title, body)
    select member.id, 'announcement', new.title, new.body
    from public.member_profiles as member
    where member.status = 'approved';
    return new;
  elsif tg_table_name = 'group_meetings' then
    if new.starts_at > now() then
      insert into public.member_notifications (member_id, notification_type, title, body)
      select member.id, 'group_meeting', 'Group meeting scheduled',
        new.title || ' is scheduled for ' || to_char(new.starts_at, 'FMDD Mon YYYY, HH24:MI') || '.'
      from public.member_profiles as member
      where member.status = 'approved';
    end if;
    return new;
  elsif tg_table_name = 'member_profiles' then
    if tg_op = 'UPDATE' and old.status is distinct from new.status
      and new.status in ('approved', 'rejected') then
      insert into public.member_notifications (member_id, notification_type, title, body)
      values (new.id, 'membership_' || new.status,
        case when new.status = 'approved' then 'Membership approved' else 'Membership request update' end,
        case when new.status = 'approved'
          then 'Your Vyro membership is approved. You can now use the member portal.'
          else 'Your membership request was not approved. Contact the group for more information.' end);
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_loan_request_status on public.loan_requests;
create trigger notify_loan_request_status
  after update on public.loan_requests
  for each row execute procedure public.notify_member_event();
drop trigger if exists notify_guarantor_events on public.loan_request_guarantors;
create trigger notify_guarantor_events
  after insert or update on public.loan_request_guarantors
  for each row execute procedure public.notify_member_event();
drop trigger if exists notify_repayment_events on public.loan_repayments;
create trigger notify_repayment_events
  after insert on public.loan_repayments
  for each row execute procedure public.notify_member_event();
drop trigger if exists notify_announcement_events on public.group_announcements;
create trigger notify_announcement_events
  after insert on public.group_announcements
  for each row execute procedure public.notify_member_event();
drop trigger if exists notify_meeting_events on public.group_meetings;
create trigger notify_meeting_events
  after insert on public.group_meetings
  for each row execute procedure public.notify_member_event();
drop trigger if exists notify_membership_events on public.member_profiles;
create trigger notify_membership_events
  after update on public.member_profiles
  for each row execute procedure public.notify_member_event();

create index if not exists loan_repayment_schedule_loan_due_idx
  on public.loan_repayment_schedule (loan_id, due_date);
create index if not exists member_notifications_member_date_idx
  on public.member_notifications (member_id, created_at desc);
create unique index if not exists member_notifications_reference_idx
  on public.member_notifications (member_id, notification_type, reference_id)
  where reference_id is not null;

create or replace function public.create_member_due_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_approved_member()) then
    raise exception 'An approved member account is required.';
  end if;

  insert into public.member_notifications (
    member_id, reference_id, notification_type, title, body
  )
  select loan.member_id, schedule.id,
    case when schedule.due_date < current_date then 'repayment_overdue' else 'repayment_due' end,
    case when schedule.due_date < current_date then 'Loan installment overdue' else 'Loan installment due soon' end,
    'Your installment of ' || (schedule.amount - schedule.paid_amount)::text
      || ' is due ' || to_char(schedule.due_date, 'FMDD Mon YYYY') || '. Contact the group if you need help.'
  from public.loan_repayment_schedule as schedule
  join public.loans as loan on loan.id = schedule.loan_id
  where loan.member_id = (select auth.uid())
    and loan.status in ('active', 'approved')
    and schedule.paid_amount < schedule.amount
    and schedule.due_date between current_date - 30 and current_date + 7
  on conflict (member_id, notification_type, reference_id)
    where reference_id is not null do nothing;
end;
$$;

revoke all on function public.create_member_due_notifications() from public, anon;
grant execute on function public.create_member_due_notifications() to authenticated;

revoke all on function public.audit_admin_action() from public, anon, authenticated;
revoke all on function public.notify_member_event() from public, anon, authenticated;

-- Bootstrap: after a trusted officer has signed up, verify that account's UUID
-- in auth.users, then run this once from the SQL Editor. Never promote from the browser.
-- update public.member_profiles
-- set status = 'approved', role = 'admin', approved_at = now()
-- where id = 'TRUSTED_ADMIN_AUTH_USER_UUID';
