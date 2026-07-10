create table public.hiring_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.hiring_applications(id) on delete cascade,
  token_hash char(64) not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  role_slug text not null,
  assessment_version integer not null check (assessment_version > 0),
  question_snapshot jsonb,
  invitation_issued_at timestamptz not null,
  invitation_expires_at timestamptz not null,
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  raw_score integer check (raw_score between 0 and 18),
  dimension_scores jsonb,
  response_version integer not null default 0 check (response_version >= 0),
  locked boolean not null default false,
  completion_reason text check (completion_reason in ('submitted', 'expired')),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id),
  check (invitation_expires_at > invitation_issued_at),
  check (question_snapshot is null or jsonb_typeof(question_snapshot) = 'array'),
  check ((started_at is null and deadline_at is null) or deadline_at > started_at),
  check ((submitted_at is null and completion_reason is null) or locked = true)
);

create table public.hiring_assessment_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hiring_assessment_sessions(id) on delete cascade,
  question_id text not null,
  selected_option_id text not null,
  response_version integer not null check (response_version > 0),
  saved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create index hiring_assessment_sessions_token_idx
  on public.hiring_assessment_sessions (token_hash, invitation_expires_at);
create index hiring_assessment_sessions_reminder_idx
  on public.hiring_assessment_sessions (invitation_issued_at, reminder_sent_at)
  where started_at is null and submitted_at is null;
create index hiring_assessment_responses_session_idx
  on public.hiring_assessment_responses (session_id, response_version);

create trigger hiring_assessment_sessions_set_updated_at
before update on public.hiring_assessment_sessions
for each row execute function public.hiring_set_updated_at();

create trigger hiring_assessment_responses_set_updated_at
before update on public.hiring_assessment_responses
for each row execute function public.hiring_set_updated_at();

create or replace function public.create_hiring_assessment_session_from_token()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.scope <> 'assessment' then
    return new;
  end if;

  insert into public.hiring_assessment_sessions (
    application_id,
    token_hash,
    role_slug,
    assessment_version,
    invitation_issued_at,
    invitation_expires_at,
    created_at,
    updated_at
  )
  select
    application.id,
    new.token_hash,
    role.slug,
    role.assessment_version,
    new.created_at,
    new.expires_at,
    new.created_at,
    new.updated_at
  from public.hiring_applications as application
  join public.hiring_roles as role on role.id = application.role_id
  where application.id = new.application_id
  on conflict (application_id) do nothing;

  return new;
end;
$$;

create trigger create_hiring_assessment_session_after_token
after insert on public.hiring_access_tokens
for each row
when (new.scope = 'assessment')
execute function public.create_hiring_assessment_session_from_token();

insert into public.hiring_assessment_sessions (
  application_id,
  token_hash,
  role_slug,
  assessment_version,
  invitation_issued_at,
  invitation_expires_at,
  created_at,
  updated_at
)
select
  application.id,
  access_token.token_hash,
  role.slug,
  role.assessment_version,
  access_token.created_at,
  access_token.expires_at,
  access_token.created_at,
  access_token.updated_at
from public.hiring_access_tokens as access_token
join public.hiring_applications as application
  on application.id = access_token.application_id
join public.hiring_roles as role on role.id = application.role_id
where access_token.scope = 'assessment'
on conflict (application_id) do nothing;

create or replace function public.get_hiring_assessment_session(
  p_token_hash text default null,
  p_session_id uuid default null
)
returns table (
  id uuid,
  application_id uuid,
  token_hash text,
  assessment_version integer,
  question_snapshot jsonb,
  invitation_expires_at timestamptz,
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  raw_score integer,
  dimension_scores jsonb,
  response_version integer,
  locked boolean,
  completion_reason text,
  application_reference text,
  full_name text,
  email text,
  cv_object_key text,
  role_id uuid,
  role_slug text,
  role_title text,
  responses jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    session.id,
    session.application_id,
    session.token_hash::text,
    session.assessment_version,
    session.question_snapshot,
    session.invitation_expires_at,
    session.started_at,
    session.deadline_at,
    session.submitted_at,
    session.raw_score,
    session.dimension_scores,
    session.response_version,
    session.locked,
    session.completion_reason,
    application.reference,
    application.full_name,
    application.email::text,
    application.cv_object_key,
    role.id,
    role.slug,
    role.title,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'questionId', response.question_id,
          'optionId', response.selected_option_id,
          'savedAt', response.saved_at
        ) order by response.response_version
      ) filter (where response.id is not null),
      '[]'::jsonb
    )
  from public.hiring_assessment_sessions as session
  join public.hiring_applications as application
    on application.id = session.application_id
  join public.hiring_roles as role on role.id = application.role_id
  left join public.hiring_assessment_responses as response
    on response.session_id = session.id
  where (p_token_hash is null or session.token_hash = p_token_hash::char(64))
    and (p_session_id is null or session.id = p_session_id)
  group by session.id, application.id, role.id
  limit 1;
$$;

create or replace function public.start_hiring_assessment(
  p_session_id uuid,
  p_question_snapshot jsonb,
  p_started_at timestamptz,
  p_deadline_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed boolean;
begin
  update public.hiring_assessment_sessions as session
  set
    question_snapshot = p_question_snapshot,
    started_at = p_started_at,
    deadline_at = p_deadline_at,
    updated_at = p_started_at
  where session.id = p_session_id
    and session.started_at is null
    and session.submitted_at is null
    and session.locked = false;

  changed := found;
  if changed then
    update public.hiring_applications as application
    set
      lifecycle_state = 'assessment_started',
      last_activity_at = p_started_at,
      deletion_due_at = p_started_at + interval '180 days',
      updated_at = p_started_at
    where application.id = (
      select session.application_id
      from public.hiring_assessment_sessions as session
      where session.id = p_session_id
    );
  end if;
  return changed;
end;
$$;

create or replace function public.save_hiring_assessment_answer(
  p_session_id uuid,
  p_question_id text,
  p_option_id text,
  p_expected_version integer,
  p_saved_at timestamptz
)
returns table (conflict boolean, version integer, saved_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_version integer;
begin
  update public.hiring_assessment_sessions as session
  set
    response_version = session.response_version + 1,
    updated_at = p_saved_at
  where session.id = p_session_id
    and session.response_version = p_expected_version
    and session.started_at is not null
    and session.deadline_at > p_saved_at
    and session.submitted_at is null
    and session.locked = false
  returning response_version into next_version;

  if next_version is null then
    return query
      select true, session.response_version, p_saved_at
      from public.hiring_assessment_sessions as session
      where session.id = p_session_id;
    return;
  end if;

  insert into public.hiring_assessment_responses (
    session_id,
    question_id,
    selected_option_id,
    response_version,
    saved_at,
    created_at,
    updated_at
  )
  values (
    p_session_id,
    p_question_id,
    p_option_id,
    next_version,
    p_saved_at,
    p_saved_at,
    p_saved_at
  )
  on conflict (session_id, question_id) do update
  set
    selected_option_id = excluded.selected_option_id,
    response_version = excluded.response_version,
    saved_at = excluded.saved_at,
    updated_at = excluded.updated_at;

  return query select false, next_version, p_saved_at;
end;
$$;

create or replace function public.complete_hiring_assessment(
  p_session_id uuid,
  p_raw_score integer,
  p_dimension_scores jsonb,
  p_verification_token_hash text,
  p_recruiter_token_hash text,
  p_recruiter_expires_at timestamptz,
  p_submitted_at timestamptz,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  completed_application_id uuid;
begin
  update public.hiring_assessment_sessions as session
  set
    submitted_at = p_submitted_at,
    raw_score = p_raw_score,
    dimension_scores = p_dimension_scores,
    locked = true,
    completion_reason = p_reason,
    updated_at = p_submitted_at
  where session.id = p_session_id
    and session.submitted_at is null
    and session.locked = false
  returning application_id into completed_application_id;

  if completed_application_id is null then
    return false;
  end if;

  if p_reason = 'submitted' and p_verification_token_hash is not null then
    insert into public.hiring_access_tokens (
      application_id,
      token_hash,
      scope,
      expires_at,
      max_uses,
      created_at,
      updated_at
    )
    values (
      completed_application_id,
      p_verification_token_hash,
      'verification',
      p_submitted_at + interval '72 hours',
      1,
      p_submitted_at,
      p_submitted_at
    )
    on conflict (token_hash) do nothing;
  end if;

  insert into public.hiring_access_tokens (
    application_id,
    token_hash,
    scope,
    expires_at,
    max_uses,
    created_at,
    updated_at
  )
  values (
    completed_application_id,
    p_recruiter_token_hash,
    'recruiter_cv',
    p_recruiter_expires_at,
    1,
    p_submitted_at,
    p_submitted_at
  )
  on conflict (token_hash) do nothing;

  update public.hiring_applications as application
  set
    lifecycle_state = case
      when p_reason = 'expired' then 'assessment_expired'
      else 'assessment_submitted'
    end,
    last_activity_at = p_submitted_at,
    deletion_due_at = p_submitted_at + interval '180 days',
    updated_at = p_submitted_at
  where application.id = completed_application_id;

  return true;
end;
$$;

create or replace function public.issue_hiring_assessment_invitation(
  p_application_id uuid,
  p_token_hash text,
  p_assessment_version integer,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.hiring_assessment_sessions as session
    where session.application_id = p_application_id
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.hiring_applications as application
    join public.hiring_roles as role on role.id = application.role_id
    where application.id = p_application_id
      and role.assessment_version = p_assessment_version
  ) then
    return false;
  end if;

  insert into public.hiring_access_tokens (
    application_id,
    token_hash,
    scope,
    expires_at,
    max_uses,
    created_at,
    updated_at
  )
  values (
    p_application_id,
    p_token_hash,
    'assessment',
    p_expires_at,
    1,
    p_now,
    p_now
  );
  return true;
end;
$$;

alter table public.hiring_assessment_sessions enable row level security;
alter table public.hiring_assessment_responses enable row level security;

revoke all on table public.hiring_assessment_sessions from anon, authenticated;
revoke all on table public.hiring_assessment_responses from anon, authenticated;
revoke execute on function public.create_hiring_assessment_session_from_token() from public, anon, authenticated;
revoke all on function public.get_hiring_assessment_session(text, uuid) from public, anon, authenticated;
revoke all on function public.start_hiring_assessment(uuid, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.save_hiring_assessment_answer(uuid, text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_hiring_assessment(uuid, integer, jsonb, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.issue_hiring_assessment_invitation(uuid, text, integer, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.get_hiring_assessment_session(text, uuid) to service_role;
grant execute on function public.start_hiring_assessment(uuid, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.save_hiring_assessment_answer(uuid, text, text, integer, timestamptz) to service_role;
grant execute on function public.complete_hiring_assessment(uuid, integer, jsonb, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.issue_hiring_assessment_invitation(uuid, text, integer, timestamptz, timestamptz) to service_role;
