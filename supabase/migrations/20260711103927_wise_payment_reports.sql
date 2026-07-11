create table public.hiring_wise_payment_reports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.hiring_applications(id) on delete cascade,
  payer_name text not null
    check (char_length(payer_name) between 2 and 120)
    check (payer_name = btrim(payer_name))
    check (payer_name !~ '[[:cntrl:]]'),
  amount_minor integer not null default 299 check (amount_minor = 299),
  currency text not null default 'EUR' check (currency = 'EUR'),
  reported_at timestamptz not null,
  notification_sent_at timestamptz,
  notification_claimed_at timestamptz,
  notification_failed_at timestamptz,
  notification_attempt_count integer not null default 0
    check (notification_attempt_count between 0 and 100),
  last_notification_error text
    check (
      last_notification_error is null
      or last_notification_error in (
        'NOTIFICATION_IN_PROGRESS',
        'EMAIL_DELIVERY_FAILED'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger hiring_wise_payment_reports_set_updated_at
before update on public.hiring_wise_payment_reports
for each row execute function public.hiring_set_updated_at();

create or replace function public.hiring_wise_payment_report_payload(
  p_report_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', report.id,
    'application_id', report.application_id,
    'payer_name', report.payer_name,
    'amount_minor', report.amount_minor,
    'currency', report.currency,
    'reported_at', report.reported_at,
    'notification_sent_at', report.notification_sent_at,
    'notification_claimed_at', report.notification_claimed_at,
    'notification_failed_at', report.notification_failed_at,
    'notification_attempt_count', report.notification_attempt_count,
    'last_notification_error', report.last_notification_error,
    'created_at', report.created_at,
    'updated_at', report.updated_at
  )
  from public.hiring_wise_payment_reports as report
  where report.id = p_report_id;
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
  v_application_id uuid;
  v_verification_id uuid;
  v_report_id uuid;
  v_payload jsonb;
begin
  select access_token.application_id into v_application_id
  from public.hiring_access_tokens as access_token
  where access_token.token_hash = p_token_hash::char(64)
    and access_token.scope = 'verification'
    and access_token.expires_at > p_now
    and access_token.revoked_at is null
  limit 1;

  if v_application_id is null then
    select verification.application_id, verification.id
    into v_application_id, v_verification_id
    from public.hiring_payment_verifications as verification
    where verification.return_token_hash = p_token_hash::char(64)
      and verification.return_token_expires_at > p_now
    limit 1;
  else
    select verification.id into v_verification_id
    from public.hiring_payment_verifications as verification
    where verification.application_id = v_application_id;
  end if;

  if v_application_id is null then
    return null;
  end if;

  select report.id into v_report_id
  from public.hiring_wise_payment_reports as report
  where report.application_id = v_application_id;

  if v_verification_id is not null then
    v_payload := public.hiring_verification_payload(v_verification_id);
  else
    v_payload := (
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
        'verification', null,
        'payment_report', null
      )
      from public.hiring_applications as application
      join public.hiring_roles as role on role.id = application.role_id
      where application.id = v_application_id
        and application.lifecycle_state <> 'deleted'
    );
  end if;

  if v_payload is null then
    return null;
  end if;

  return v_payload || jsonb_build_object('payment_report',
    public.hiring_wise_payment_report_payload(v_report_id));
end;
$$;

create or replace function public.create_hiring_wise_payment_report(
  p_token_hash text,
  p_payer_name text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_report_id uuid;
  v_notification_claimed boolean := false;
begin
  select access_token.application_id into v_application_id
  from public.hiring_access_tokens as access_token
  join public.hiring_applications as application
    on application.id = access_token.application_id
  where access_token.token_hash = p_token_hash::char(64)
    and access_token.scope = 'verification'
    and access_token.expires_at > p_now
    and access_token.revoked_at is null
    and application.lifecycle_state = 'assessment_submitted'
  for update of application;

  if v_application_id is null then
    return null;
  end if;

  insert into public.hiring_wise_payment_reports (
    application_id,
    payer_name,
    reported_at,
    notification_claimed_at,
    notification_attempt_count,
    last_notification_error,
    created_at,
    updated_at
  ) values (
    v_application_id,
    p_payer_name,
    p_now,
    p_now,
    1,
    'NOTIFICATION_IN_PROGRESS',
    p_now,
    p_now
  )
  on conflict (application_id) do nothing
  returning id into v_report_id;

  if v_report_id is not null then
    v_notification_claimed := true;
  else
    select report.id into v_report_id
    from public.hiring_wise_payment_reports as report
    where report.application_id = v_application_id
    for update;

    update public.hiring_wise_payment_reports as report
    set
      notification_claimed_at = p_now,
      notification_failed_at = null,
      notification_attempt_count = report.notification_attempt_count + 1,
      last_notification_error = 'NOTIFICATION_IN_PROGRESS',
      updated_at = p_now
    where report.id = v_report_id
      and report.notification_sent_at is null
      and report.notification_attempt_count < 100
      and (
        report.last_notification_error = 'EMAIL_DELIVERY_FAILED'
        or (
          report.last_notification_error = 'NOTIFICATION_IN_PROGRESS'
          and report.notification_claimed_at <= p_now - interval '5 minutes'
        )
      );
    v_notification_claimed := found;
  end if;

  return (
    select jsonb_build_object(
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
      ),
      'payment_report', public.hiring_wise_payment_report_payload(v_report_id),
      'notification_claimed', v_notification_claimed
    )
    from public.hiring_applications as application
    join public.hiring_roles as role on role.id = application.role_id
    where application.id = v_application_id
  );
end;
$$;

create or replace function public.claim_hiring_wise_payment_report_notification(
  p_report_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_notification_claimed boolean := false;
begin
  select report.application_id into v_application_id
  from public.hiring_wise_payment_reports as report
  where report.id = p_report_id
  for update;

  if v_application_id is null then
    return null;
  end if;

  update public.hiring_wise_payment_reports as report
  set
    notification_claimed_at = p_now,
    notification_failed_at = null,
    notification_attempt_count = report.notification_attempt_count + 1,
    last_notification_error = 'NOTIFICATION_IN_PROGRESS',
    updated_at = p_now
  where report.id = p_report_id
    and report.notification_sent_at is null
    and report.notification_attempt_count < 100
    and (
      report.last_notification_error = 'EMAIL_DELIVERY_FAILED'
      or (
        report.last_notification_error = 'NOTIFICATION_IN_PROGRESS'
        and report.notification_claimed_at <= p_now - interval '5 minutes'
      )
    );
  v_notification_claimed := found;

  return (
    select jsonb_build_object(
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
      ),
      'payment_report', public.hiring_wise_payment_report_payload(p_report_id),
      'notification_claimed', v_notification_claimed
    )
    from public.hiring_applications as application
    join public.hiring_roles as role on role.id = application.role_id
    where application.id = v_application_id
  );
end;
$$;

create or replace function public.mark_hiring_wise_payment_report_sent(
  p_report_id uuid,
  p_attempt_number integer,
  p_sent_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hiring_wise_payment_reports as report
  set
    notification_sent_at = p_sent_at,
    notification_claimed_at = null,
    notification_failed_at = null,
    last_notification_error = null,
    updated_at = p_sent_at
  where report.id = p_report_id
    and report.notification_sent_at is null
    and report.notification_attempt_count = p_attempt_number
    and report.last_notification_error = 'NOTIFICATION_IN_PROGRESS';

  if not found then
    return null;
  end if;
  return public.hiring_wise_payment_report_payload(p_report_id);
end;
$$;

create or replace function public.mark_hiring_wise_payment_report_failed(
  p_report_id uuid,
  p_attempt_number integer,
  p_error_category text,
  p_failed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hiring_wise_payment_reports as report
  set
    notification_claimed_at = null,
    notification_failed_at = p_failed_at,
    last_notification_error = p_error_category,
    updated_at = p_failed_at
  where report.id = p_report_id
    and report.notification_sent_at is null
    and report.notification_attempt_count = p_attempt_number
    and report.last_notification_error = 'NOTIFICATION_IN_PROGRESS'
    and p_error_category = 'EMAIL_DELIVERY_FAILED';

  if not found then
    return null;
  end if;
  return public.hiring_wise_payment_report_payload(p_report_id);
end;
$$;

alter table public.hiring_wise_payment_reports enable row level security;

revoke all on table public.hiring_wise_payment_reports from public;
revoke all on table public.hiring_wise_payment_reports from anon, authenticated;
revoke all on all sequences in schema public from public;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update on table public.hiring_wise_payment_reports
  to service_role;

revoke all on function public.hiring_wise_payment_report_payload(uuid)
  from public, anon, authenticated;
revoke all on function public.get_hiring_verification_by_token(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.create_hiring_wise_payment_report(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_hiring_wise_payment_report_notification(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_hiring_wise_payment_report_sent(uuid, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_hiring_wise_payment_report_failed(uuid, integer, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.hiring_wise_payment_report_payload(uuid)
  to service_role;
grant execute on function public.get_hiring_verification_by_token(text, timestamptz)
  to service_role;
grant execute on function public.create_hiring_wise_payment_report(text, text, timestamptz)
  to service_role;
grant execute on function public.claim_hiring_wise_payment_report_notification(uuid, timestamptz)
  to service_role;
grant execute on function public.mark_hiring_wise_payment_report_sent(uuid, integer, timestamptz)
  to service_role;
grant execute on function public.mark_hiring_wise_payment_report_failed(uuid, integer, text, timestamptz)
  to service_role;
