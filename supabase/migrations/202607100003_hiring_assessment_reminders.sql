alter table public.hiring_assessment_sessions
  add column reminder_attempt_count integer not null default 0,
  add column reminder_last_attempt_at timestamptz,
  add column reminder_next_attempt_at timestamptz,
  add column reminder_provider_message_id text,
  add column reminder_last_error_code text,
  add constraint hiring_assessment_reminder_attempt_count_check
    check (reminder_attempt_count >= 0 and reminder_attempt_count <= 5);

create index hiring_assessment_sessions_reminder_retry_idx
  on public.hiring_assessment_sessions (
    reminder_next_attempt_at,
    invitation_issued_at,
    invitation_expires_at
  )
  where
    reminder_sent_at is null
    and started_at is null
    and submitted_at is null
    and reminder_attempt_count < 5;

create or replace function public.claim_hiring_assessment_reminders(
  p_now timestamptz,
  p_limit integer default 50
)
returns table (
  id uuid,
  token_hash text,
  invitation_issued_at timestamptz,
  invitation_expires_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  locked boolean,
  reminder_sent_at timestamptz,
  reminder_attempt_count integer,
  application_id uuid,
  application_reference text,
  application_idempotency_key text,
  full_name text,
  email text,
  role_id uuid,
  role_slug text,
  role_title text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with due as (
    select session.id
    from public.hiring_assessment_sessions as session
    where session.invitation_issued_at <= p_now - interval '24 hours'
      and session.invitation_expires_at > p_now
      and session.started_at is null
      and session.submitted_at is null
      and session.locked = false
      and session.reminder_sent_at is null
      and session.reminder_attempt_count < 5
      and coalesce(
        session.reminder_next_attempt_at,
        session.invitation_issued_at + interval '24 hours'
      ) <= p_now
    order by session.invitation_issued_at, session.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.hiring_assessment_sessions as session
    set
      reminder_attempt_count = session.reminder_attempt_count + 1,
      reminder_last_attempt_at = p_now,
      reminder_next_attempt_at = p_now + interval '15 minutes',
      updated_at = p_now
    from due
    where session.id = due.id
    returning session.*
  )
  select
    claimed.id,
    claimed.token_hash::text,
    claimed.invitation_issued_at,
    claimed.invitation_expires_at,
    claimed.started_at,
    claimed.submitted_at,
    claimed.locked,
    claimed.reminder_sent_at,
    claimed.reminder_attempt_count,
    application.id,
    application.reference,
    application.idempotency_key,
    application.full_name,
    application.email::text,
    role.id,
    role.slug,
    role.title
  from claimed
  join public.hiring_applications as application
    on application.id = claimed.application_id
  join public.hiring_roles as role
    on role.id = application.role_id;
end;
$$;

create or replace function public.record_hiring_assessment_reminder(
  p_session_id uuid,
  p_attempt_number integer,
  p_status text,
  p_provider_message_id text,
  p_error_code text,
  p_attempted_at timestamptz,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Invalid reminder status';
  end if;

  update public.hiring_assessment_sessions as session
  set
    reminder_sent_at = case
      when p_status = 'sent' then p_attempted_at
      else session.reminder_sent_at
    end,
    reminder_next_attempt_at = case
      when p_status = 'failed' then p_next_attempt_at
      else null
    end,
    reminder_provider_message_id = case
      when p_status = 'sent' then p_provider_message_id
      else session.reminder_provider_message_id
    end,
    reminder_last_error_code = case
      when p_status = 'failed' then p_error_code
      else null
    end,
    updated_at = p_attempted_at
  where session.id = p_session_id
    and session.reminder_attempt_count = p_attempt_number
    and session.reminder_last_attempt_at = p_attempted_at
    and session.reminder_sent_at is null;

  return found;
end;
$$;

revoke all on function public.claim_hiring_assessment_reminders(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.record_hiring_assessment_reminder(
  uuid,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_hiring_assessment_reminders(timestamptz, integer)
  to service_role;
grant execute on function public.record_hiring_assessment_reminder(
  uuid,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;
