create table public.hiring_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.hiring_applications(id) on delete cascade,
  merchant_reference text not null unique
    check (char_length(merchant_reference) between 1 and 25),
  provider_payment_id text unique,
  amount_minor integer not null default 299 check (amount_minor = 299),
  currency text not null default 'EUR' check (currency = 'EUR'),
  pre_auth boolean not null default true check (pre_auth = true),
  idempotency_key text not null unique,
  approval_url text,
  session_expires_at timestamptz,
  return_token_hash char(64) not null unique
    check (return_token_hash ~ '^[a-f0-9]{64}$'),
  return_token_expires_at timestamptz not null,
  state text not null default 'creating'
    check (state in ('creating', 'pending', 'processing', 'completed', 'failed')),
  provider_state text,
  cancellation_state text not null default 'not_requested'
    check (
      cancellation_state in (
        'not_requested',
        'processing',
        'retry_scheduled',
        'cancelled',
        'failed'
      )
    ),
  cancellation_attempt_count integer not null default 0
    check (cancellation_attempt_count between 0 and 5),
  next_retry_at timestamptz,
  callback_received_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (return_token_expires_at > created_at),
  check (approval_url is null or approval_url ~ '^https://'),
  check ((state = 'completed') = (completed_at is not null)),
  check ((state = 'failed') = (failed_at is not null))
);

create index hiring_payment_verifications_provider_idx
  on public.hiring_payment_verifications (provider_payment_id)
  where provider_payment_id is not null;
create index hiring_payment_verifications_retry_idx
  on public.hiring_payment_verifications (next_retry_at)
  where state = 'processing'
    and cancellation_state = 'retry_scheduled'
    and cancellation_attempt_count < 5;
create index hiring_payment_verifications_return_idx
  on public.hiring_payment_verifications (
    return_token_hash,
    return_token_expires_at
  );

create trigger hiring_payment_verifications_set_updated_at
before update on public.hiring_payment_verifications
for each row execute function public.hiring_set_updated_at();

create or replace function public.hiring_verification_payload(
  p_verification_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', verification.id,
    'merchant_reference', verification.merchant_reference,
    'provider_payment_id', verification.provider_payment_id,
    'amount_minor', verification.amount_minor,
    'currency', verification.currency,
    'pre_auth', verification.pre_auth,
    'idempotency_key', verification.idempotency_key,
    'approval_url', verification.approval_url,
    'session_expires_at', verification.session_expires_at,
    'return_token_hash', verification.return_token_hash::text,
    'return_token_expires_at', verification.return_token_expires_at,
    'state', verification.state,
    'provider_state', verification.provider_state,
    'cancellation_state', verification.cancellation_state,
    'cancellation_attempt_count', verification.cancellation_attempt_count,
    'next_retry_at', verification.next_retry_at,
    'callback_received_at', verification.callback_received_at,
    'completed_at', verification.completed_at,
    'failed_at', verification.failed_at,
    'error_category', verification.error_category,
    'application', jsonb_build_object(
      'id', application.id,
      'reference', application.reference,
      'full_name', application.full_name,
      'email', application.email::text,
      'lifecycle_state', application.lifecycle_state,
      'cv_object_key', application.cv_object_key,
      'role', jsonb_build_object(
        'id', role.id,
        'slug', role.slug,
        'title', role.title
      )
    )
  )
  from public.hiring_payment_verifications as verification
  join public.hiring_applications as application
    on application.id = verification.application_id
  join public.hiring_roles as role
    on role.id = application.role_id
  where verification.id = p_verification_id;
$$;

create or replace function public.get_hiring_application_for_verification(
  p_token_hash text,
  p_now timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', application.id,
    'reference', application.reference,
    'full_name', application.full_name,
    'email', application.email::text,
    'lifecycle_state', application.lifecycle_state,
    'cv_object_key', application.cv_object_key,
    'role', jsonb_build_object(
      'id', role.id,
      'slug', role.slug,
      'title', role.title
    )
  )
  from public.hiring_access_tokens as access_token
  join public.hiring_applications as application
    on application.id = access_token.application_id
  join public.hiring_roles as role on role.id = application.role_id
  where access_token.token_hash = p_token_hash::char(64)
    and access_token.scope = 'verification'
    and access_token.expires_at > p_now
    and access_token.revoked_at is null
    and application.lifecycle_state <> 'deleted'
  limit 1;
$$;

create or replace function public.reserve_hiring_payment_verification(
  p_application_id uuid,
  p_merchant_reference text,
  p_idempotency_key text,
  p_return_token_hash text,
  p_return_token_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_pre_auth boolean,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  verification_id uuid;
  newly_created boolean := false;
begin
  select verification.id into verification_id
  from public.hiring_payment_verifications as verification
  where verification.application_id = p_application_id;

  if verification_id is null then
    if not exists (
      select 1
      from public.hiring_applications as application
      where application.id = p_application_id
        and application.lifecycle_state = 'assessment_submitted'
    ) then
      return null;
    end if;

    insert into public.hiring_payment_verifications (
      application_id,
      merchant_reference,
      idempotency_key,
      return_token_hash,
      return_token_expires_at,
      amount_minor,
      currency,
      pre_auth,
      created_at,
      updated_at
    )
    values (
      p_application_id,
      p_merchant_reference,
      p_idempotency_key,
      p_return_token_hash,
      p_return_token_expires_at,
      p_amount_minor,
      p_currency,
      p_pre_auth,
      p_now,
      p_now
    )
    returning id into verification_id;
    newly_created := true;

    update public.hiring_applications as application
    set
      lifecycle_state = 'verification_pending',
      last_activity_at = p_now,
      deletion_due_at = p_now + interval '180 days',
      updated_at = p_now
    where application.id = p_application_id;
  end if;

  return public.hiring_verification_payload(verification_id)
    || jsonb_build_object('newly_created', newly_created);
end;
$$;

create or replace function public.activate_hiring_payment_verification(
  p_verification_id uuid,
  p_provider_payment_id text,
  p_approval_url text,
  p_session_expires_at timestamptz,
  p_activated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hiring_payment_verifications as verification
  set
    provider_payment_id = p_provider_payment_id,
    approval_url = p_approval_url,
    session_expires_at = p_session_expires_at,
    state = 'pending',
    updated_at = p_activated_at
  where verification.id = p_verification_id
    and verification.state = 'creating'
    and verification.provider_payment_id is null;

  return public.hiring_verification_payload(p_verification_id);
end;
$$;

create or replace function public.get_hiring_verification_by_provider_payment(
  p_provider_payment_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.hiring_verification_payload(verification.id)
  from public.hiring_payment_verifications as verification
  where verification.provider_payment_id = p_provider_payment_id
  limit 1;
$$;

create or replace function public.get_hiring_verification_by_id(
  p_verification_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.hiring_verification_payload(p_verification_id);
$$;

create or replace function public.begin_hiring_verification_cancellation(
  p_verification_id uuid,
  p_provider_state text,
  p_callback_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hiring_payment_verifications as verification
  set
    state = 'processing',
    provider_state = p_provider_state,
    cancellation_state = 'processing',
    callback_received_at = coalesce(verification.callback_received_at, p_callback_at),
    updated_at = p_callback_at
  where verification.id = p_verification_id
    and verification.state = 'pending'
    and verification.cancellation_state = 'not_requested';

  if found then
    update public.hiring_applications as application
    set
      lifecycle_state = 'verification_processing',
      last_activity_at = p_callback_at,
      updated_at = p_callback_at
    where application.id = (
      select verification.application_id
      from public.hiring_payment_verifications as verification
      where verification.id = p_verification_id
    );
  end if;
  return found;
end;
$$;

create or replace function public.complete_hiring_verification_cancellation(
  p_verification_id uuid,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  completed_application_id uuid;
begin
  update public.hiring_payment_verifications as verification
  set
    state = 'completed',
    cancellation_state = 'cancelled',
    next_retry_at = null,
    error_category = null,
    completed_at = p_completed_at,
    failed_at = null,
    updated_at = p_completed_at
  where verification.id = p_verification_id
    and verification.state in ('pending', 'processing')
  returning application_id into completed_application_id;

  if completed_application_id is null then
    return false;
  end if;

  update public.hiring_applications as application
  set
    lifecycle_state = 'completed',
    last_activity_at = p_completed_at,
    deletion_due_at = p_completed_at + interval '180 days',
    updated_at = p_completed_at
  where application.id = completed_application_id;
  return true;
end;
$$;

create or replace function public.fail_hiring_payment_verification(
  p_verification_id uuid,
  p_provider_state text,
  p_error_category text,
  p_failed_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  failed_application_id uuid;
begin
  update public.hiring_payment_verifications as verification
  set
    state = 'failed',
    provider_state = p_provider_state,
    cancellation_state = 'failed',
    next_retry_at = null,
    error_category = p_error_category,
    failed_at = p_failed_at,
    completed_at = null,
    updated_at = p_failed_at
  where verification.id = p_verification_id
    and verification.state not in ('completed', 'failed')
  returning application_id into failed_application_id;

  if failed_application_id is null then
    return false;
  end if;

  update public.hiring_applications as application
  set
    lifecycle_state = 'verification_failed',
    last_activity_at = p_failed_at,
    updated_at = p_failed_at
  where application.id = failed_application_id;
  return true;
end;
$$;

create or replace function public.schedule_hiring_verification_retry(
  p_verification_id uuid,
  p_attempt_number integer,
  p_next_retry_at timestamptz,
  p_error_category text,
  p_attempted_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hiring_payment_verifications as verification
  set
    state = 'processing',
    cancellation_state = 'retry_scheduled',
    cancellation_attempt_count = p_attempt_number,
    next_retry_at = p_next_retry_at,
    error_category = p_error_category,
    updated_at = p_attempted_at
  where verification.id = p_verification_id
    and verification.state = 'processing'
    and p_attempt_number between 1 and 5
    and p_attempt_number >= verification.cancellation_attempt_count;
  return found;
end;
$$;

create or replace function public.get_hiring_verification_by_token(
  p_token_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  application_id uuid;
  verification_id uuid;
begin
  select access_token.application_id into application_id
  from public.hiring_access_tokens as access_token
  where access_token.token_hash = p_token_hash::char(64)
    and access_token.scope = 'verification'
    and access_token.expires_at > p_now
    and access_token.revoked_at is null
  limit 1;

  if application_id is null then
    select verification.application_id, verification.id
    into application_id, verification_id
    from public.hiring_payment_verifications as verification
    where verification.return_token_hash = p_token_hash::char(64)
      and verification.return_token_expires_at > p_now
    limit 1;
  else
    select verification.id into verification_id
    from public.hiring_payment_verifications as verification
    where verification.application_id = application_id;
  end if;

  if application_id is null then
    return null;
  end if;
  if verification_id is not null then
    return public.hiring_verification_payload(verification_id);
  end if;

  return (
    select jsonb_build_object(
      'application', jsonb_build_object(
        'id', application.id,
        'reference', application.reference,
        'full_name', application.full_name,
        'email', application.email::text,
        'lifecycle_state', application.lifecycle_state,
        'role', jsonb_build_object(
          'id', role.id,
          'slug', role.slug,
          'title', role.title
        )
      ),
      'verification', null
    )
    from public.hiring_applications as application
    join public.hiring_roles as role on role.id = application.role_id
    where application.id = application_id
      and application.lifecycle_state <> 'deleted'
  );
end;
$$;

create or replace function public.claim_hiring_verification_retries(
  p_now timestamptz,
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with due as (
    select verification.id
    from public.hiring_payment_verifications as verification
    where verification.state = 'processing'
      and verification.cancellation_state = 'retry_scheduled'
      and verification.next_retry_at <= p_now
      and verification.cancellation_attempt_count < 5
    order by verification.next_retry_at, verification.id
    for update skip locked
    limit least(greatest(p_limit, 1), 20)
  ), claimed as (
    update public.hiring_payment_verifications as verification
    set
      cancellation_attempt_count = verification.cancellation_attempt_count + 1,
      cancellation_state = 'processing',
      next_retry_at = p_now + interval '15 minutes',
      updated_at = p_now
    from due
    where verification.id = due.id
    returning verification.id
  )
  select public.hiring_verification_payload(claimed.id)
  from claimed;
end;
$$;

alter table public.hiring_payment_verifications enable row level security;
revoke all on table public.hiring_payment_verifications from anon, authenticated;

revoke all on function public.hiring_verification_payload(uuid)
  from public, anon, authenticated;
revoke all on function public.get_hiring_application_for_verification(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reserve_hiring_payment_verification(uuid, text, text, text, timestamptz, integer, text, boolean, timestamptz)
  from public, anon, authenticated;
revoke all on function public.activate_hiring_payment_verification(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_hiring_verification_by_provider_payment(text)
  from public, anon, authenticated;
revoke all on function public.get_hiring_verification_by_id(uuid)
  from public, anon, authenticated;
revoke all on function public.begin_hiring_verification_cancellation(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_hiring_verification_cancellation(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_hiring_payment_verification(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.schedule_hiring_verification_retry(uuid, integer, timestamptz, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_hiring_verification_by_token(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_hiring_verification_retries(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.hiring_verification_payload(uuid) to service_role;
grant execute on function public.get_hiring_application_for_verification(text, timestamptz) to service_role;
grant execute on function public.reserve_hiring_payment_verification(uuid, text, text, text, timestamptz, integer, text, boolean, timestamptz) to service_role;
grant execute on function public.activate_hiring_payment_verification(uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.get_hiring_verification_by_provider_payment(text) to service_role;
grant execute on function public.get_hiring_verification_by_id(uuid) to service_role;
grant execute on function public.begin_hiring_verification_cancellation(uuid, text, timestamptz) to service_role;
grant execute on function public.complete_hiring_verification_cancellation(uuid, timestamptz) to service_role;
grant execute on function public.fail_hiring_payment_verification(uuid, text, text, timestamptz) to service_role;
grant execute on function public.schedule_hiring_verification_retry(uuid, integer, timestamptz, text, timestamptz) to service_role;
grant execute on function public.get_hiring_verification_by_token(text, timestamptz) to service_role;
grant execute on function public.claim_hiring_verification_retries(timestamptz, integer) to service_role;
