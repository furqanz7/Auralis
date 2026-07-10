alter table public.hiring_applications
  add column deletion_claimed_at timestamptz,
  add column deletion_attempt_count integer not null default 0
    check (deletion_attempt_count >= 0),
  add column deletion_next_attempt_at timestamptz,
  add column deletion_last_error_category text;

create index hiring_applications_deletion_claim_idx
  on public.hiring_applications (
    deletion_due_at,
    deletion_next_attempt_at,
    deletion_claimed_at
  );

create table public.hiring_anonymous_application_counts (
  role_slug text not null,
  submitted_month date not null,
  deletion_reason text not null
    check (deletion_reason in ('retention', 'candidate_request')),
  application_count bigint not null default 0 check (application_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (role_slug, submitted_month, deletion_reason)
);

create or replace function public.claim_hiring_applications_for_deletion(
  p_now timestamptz,
  p_limit integer default 25
)
returns setof jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select application.id
    from public.hiring_applications as application
    where application.deletion_due_at <= p_now
      and (
        application.deletion_next_attempt_at is null
        or application.deletion_next_attempt_at <= p_now
      )
      and (
        application.deletion_claimed_at is null
        or application.deletion_claimed_at <= p_now - interval '15 minutes'
      )
    order by application.deletion_due_at, application.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.hiring_applications as application
    set
      deletion_claimed_at = p_now,
      deletion_attempt_count = application.deletion_attempt_count + 1,
      updated_at = p_now
    from candidates
    where application.id = candidates.id
    returning application.*
  )
  select jsonb_build_object(
    'id', claimed.id,
    'reference', claimed.reference,
    'full_name', claimed.full_name,
    'email', claimed.email,
    'cv_object_key', claimed.cv_object_key,
    'deletion_due_at', claimed.deletion_due_at,
    'deletion_attempt_count', claimed.deletion_attempt_count,
    'role', jsonb_build_object('slug', role.slug, 'title', role.title)
  )
  from claimed
  join public.hiring_roles as role on role.id = claimed.role_id;
$$;

create or replace function public.create_hiring_deletion_request(
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns setof jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target public.hiring_applications%rowtype;
  role_record public.hiring_roles%rowtype;
begin
  select application.*
  into target
  from public.hiring_applications as application
  where application.email = trim(p_email)::extensions.citext
    and application.lifecycle_state <> 'deleted'
  order by application.created_at desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.hiring_access_tokens as access_token
    where access_token.application_id = target.id
      and access_token.scope = 'privacy_deletion'
      and access_token.revoked_at is null
      and access_token.expires_at > p_now
      and access_token.created_at > p_now - interval '15 minutes'
  ) then
    return;
  end if;

  update public.hiring_access_tokens as access_token
  set revoked_at = p_now, updated_at = p_now
  where access_token.application_id = target.id
    and access_token.scope = 'privacy_deletion'
    and access_token.revoked_at is null;

  insert into public.hiring_access_tokens (
    application_id,
    token_hash,
    scope,
    expires_at,
    max_uses,
    created_at,
    updated_at
  ) values (
    target.id,
    p_token_hash::char(64),
    'privacy_deletion',
    p_expires_at,
    1,
    p_now,
    p_now
  );

  select role.* into role_record
  from public.hiring_roles as role
  where role.id = target.role_id;

  return next jsonb_build_object(
    'id', target.id,
    'reference', target.reference,
    'full_name', target.full_name,
    'email', target.email,
    'cv_object_key', target.cv_object_key,
    'deletion_due_at', target.deletion_due_at,
    'deletion_attempt_count', target.deletion_attempt_count,
    'role', jsonb_build_object(
      'slug', role_record.slug,
      'title', role_record.title
    )
  );
end;
$$;

create or replace function public.claim_hiring_deletion_by_token(
  p_token_hash text,
  p_now timestamptz
)
returns setof jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target public.hiring_applications%rowtype;
  role_record public.hiring_roles%rowtype;
begin
  select application.*
  into target
  from public.hiring_access_tokens as access_token
  join public.hiring_applications as application
    on application.id = access_token.application_id
  where access_token.token_hash = p_token_hash::char(64)
    and access_token.scope = 'privacy_deletion'
    and access_token.revoked_at is null
    and access_token.expires_at > p_now
    and access_token.use_count < access_token.max_uses
    and (
      application.deletion_claimed_at is null
      or application.deletion_claimed_at <= p_now - interval '15 minutes'
    )
  limit 1
  for update of application skip locked;

  if not found then
    return;
  end if;

  update public.hiring_applications as application
  set
    deletion_claimed_at = p_now,
    deletion_attempt_count = application.deletion_attempt_count + 1,
    deletion_due_at = least(application.deletion_due_at, p_now),
    updated_at = p_now
  where application.id = target.id
  returning application.* into target;

  select role.* into role_record
  from public.hiring_roles as role
  where role.id = target.role_id;

  return next jsonb_build_object(
    'id', target.id,
    'reference', target.reference,
    'full_name', target.full_name,
    'email', target.email,
    'cv_object_key', target.cv_object_key,
    'deletion_due_at', target.deletion_due_at,
    'deletion_attempt_count', target.deletion_attempt_count,
    'role', jsonb_build_object(
      'slug', role_record.slug,
      'title', role_record.title
    )
  );
end;
$$;

create or replace function public.record_hiring_application_deletion_failure(
  p_application_id uuid,
  p_attempt_number integer,
  p_error_category text,
  p_attempted_at timestamptz,
  p_next_attempt_at timestamptz
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.hiring_applications as application
  set
    deletion_claimed_at = null,
    deletion_attempt_count = greatest(
      application.deletion_attempt_count,
      p_attempt_number
    ),
    deletion_next_attempt_at = p_next_attempt_at,
    deletion_last_error_category = p_error_category,
    updated_at = p_attempted_at
  where application.id = p_application_id
  returning true;
$$;

create or replace function public.finalize_hiring_application_deletion(
  p_application_id uuid,
  p_reason text,
  p_deleted_at timestamptz
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  role_value text;
  month_value date;
begin
  if p_reason not in ('retention', 'candidate_request') then
    raise exception 'invalid deletion reason';
  end if;

  select role.slug, date_trunc('month', application.created_at)::date
  into role_value, month_value
  from public.hiring_applications as application
  join public.hiring_roles as role on role.id = application.role_id
  where application.id = p_application_id
  for update of application;

  if not found then
    return true;
  end if;

  insert into public.hiring_anonymous_application_counts (
    role_slug,
    submitted_month,
    deletion_reason,
    application_count,
    updated_at
  ) values (
    role_value,
    month_value,
    p_reason,
    1,
    p_deleted_at
  )
  on conflict (role_slug, submitted_month, deletion_reason)
  do update set
    application_count = public.hiring_anonymous_application_counts.application_count + 1,
    updated_at = excluded.updated_at;

  delete from public.hiring_applications
  where id = p_application_id;

  return true;
end;
$$;

alter table public.hiring_anonymous_application_counts enable row level security;
revoke all on table public.hiring_anonymous_application_counts from anon, authenticated;

revoke all on function public.claim_hiring_applications_for_deletion(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.create_hiring_deletion_request(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_hiring_deletion_by_token(text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_hiring_application_deletion_failure(uuid, integer, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_hiring_application_deletion(uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_hiring_applications_for_deletion(timestamptz, integer) to service_role;
grant execute on function public.create_hiring_deletion_request(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_hiring_deletion_by_token(text, timestamptz) to service_role;
grant execute on function public.record_hiring_application_deletion_failure(uuid, integer, text, timestamptz, timestamptz) to service_role;
grant execute on function public.finalize_hiring_application_deletion(uuid, text, timestamptz) to service_role;
