create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create table public.hiring_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  rate_min integer not null check (rate_min > 0),
  rate_max integer not null check (rate_max >= rate_min),
  currency text not null default 'EUR' check (currency = 'EUR'),
  engagement text not null default 'Independent contractor'
    check (engagement = 'Independent contractor'),
  location text not null default 'Remote worldwide'
    check (location = 'Remote worldwide'),
  portfolio_required boolean not null default false,
  assessment_version integer not null default 1 check (assessment_version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hiring_campaigns (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.hiring_roles(id) on delete restrict,
  label text not null,
  token_hash char(64) not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  active_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > active_at)
);

create table public.hiring_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  campaign_id uuid not null references public.hiring_campaigns(id) on delete restrict,
  role_id uuid not null references public.hiring_roles(id) on delete restrict,
  idempotency_key text not null unique,
  full_name text not null,
  email extensions.citext not null,
  country text not null,
  time_zone text not null,
  profile_url text,
  availability text not null,
  cv_object_key text not null unique,
  cv_mime_type text not null check (cv_mime_type = 'application/pdf'),
  cv_size integer not null check (cv_size > 0 and cv_size <= 5242880),
  lifecycle_state text not null default 'application_submitted'
    check (
      lifecycle_state in (
        'application_started',
        'application_submitted',
        'assessment_invited',
        'assessment_started',
        'assessment_submitted',
        'assessment_expired',
        'verification_pending',
        'verification_processing',
        'verification_failed',
        'completed',
        'withdrawn',
        'deleted'
      )
    ),
  privacy_accepted_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  deletion_due_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hiring_email_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.hiring_applications(id) on delete cascade,
  message_type text not null,
  recipient extensions.citext not null,
  provider_message_id text,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_category text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hiring_access_tokens (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.hiring_applications(id) on delete cascade,
  token_hash char(64) not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  scope text not null
    check (
      scope in (
        'assessment',
        'recruiter_cv',
        'verification',
        'verification_return',
        'privacy_deletion'
      )
    ),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hiring_campaigns_role_idx
  on public.hiring_campaigns (role_id);
create index hiring_campaigns_availability_idx
  on public.hiring_campaigns (expires_at, revoked_at);
create index hiring_applications_lifecycle_idx
  on public.hiring_applications (lifecycle_state);
create index hiring_applications_deletion_idx
  on public.hiring_applications (deletion_due_at);
create index hiring_applications_campaign_idx
  on public.hiring_applications (campaign_id);
create index hiring_applications_role_idx
  on public.hiring_applications (role_id);
create index hiring_applications_email_idx
  on public.hiring_applications (email);
create index hiring_applications_duplicate_idx
  on public.hiring_applications (campaign_id, role_id, email, created_at desc);
create index hiring_email_events_application_idx
  on public.hiring_email_events (application_id, status);
create index hiring_access_tokens_lookup_idx
  on public.hiring_access_tokens (token_hash, scope, expires_at);

create or replace function public.hiring_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.get_active_hiring_campaign(
  p_role_slug text default null,
  p_token_hash text default null,
  p_campaign_id uuid default null,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  label text,
  expires_at timestamptz,
  role_id uuid,
  role_slug text,
  role_title text,
  rate_min integer,
  rate_max integer,
  currency text,
  engagement text,
  location text,
  portfolio_required boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    campaign.id,
    campaign.label,
    campaign.expires_at,
    role.id,
    role.slug,
    role.title,
    role.rate_min,
    role.rate_max,
    role.currency,
    role.engagement,
    role.location,
    role.portfolio_required
  from public.hiring_campaigns as campaign
  join public.hiring_roles as role on role.id = campaign.role_id
  where campaign.revoked_at is null
    and campaign.active_at <= p_now
    and campaign.expires_at > p_now
    and role.active = true
    and (p_campaign_id is null or campaign.id = p_campaign_id)
    and (p_role_slug is null or role.slug = p_role_slug)
    and (p_token_hash is null or campaign.token_hash = p_token_hash::char(64))
  limit 1;
$$;

create or replace function public.find_hiring_application_by_idempotency(
  p_idempotency_key text
)
returns setof public.hiring_applications
language sql
stable
security invoker
set search_path = ''
as $$
  select application.*
  from public.hiring_applications as application
  where application.idempotency_key = p_idempotency_key
  limit 1;
$$;

create or replace function public.find_recent_hiring_application(
  p_campaign_id uuid,
  p_role_id uuid,
  p_email text,
  p_since timestamptz
)
returns setof public.hiring_applications
language sql
stable
security invoker
set search_path = ''
as $$
  select application.*
  from public.hiring_applications as application
  where application.campaign_id = p_campaign_id
    and application.role_id = p_role_id
    and application.email = p_email::extensions.citext
    and application.created_at >= p_since
    and application.lifecycle_state <> 'deleted'
  order by application.created_at desc
  limit 1;
$$;

create or replace function public.create_hiring_application(
  p_campaign_id uuid,
  p_role_id uuid,
  p_idempotency_key text,
  p_reference text,
  p_full_name text,
  p_email text,
  p_country text,
  p_time_zone text,
  p_profile_url text,
  p_availability text,
  p_cv_object_key text,
  p_cv_mime_type text,
  p_cv_size integer,
  p_assessment_token_hash text,
  p_assessment_expires_at timestamptz,
  p_recruiter_token_hash text,
  p_recruiter_expires_at timestamptz,
  p_now timestamptz
)
returns setof public.hiring_applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_application public.hiring_applications;
begin
  insert into public.hiring_applications (
    reference,
    campaign_id,
    role_id,
    idempotency_key,
    full_name,
    email,
    country,
    time_zone,
    profile_url,
    availability,
    cv_object_key,
    cv_mime_type,
    cv_size,
    lifecycle_state,
    privacy_accepted_at,
    last_activity_at,
    deletion_due_at,
    created_at,
    updated_at
  )
  values (
    p_reference,
    p_campaign_id,
    p_role_id,
    p_idempotency_key,
    p_full_name,
    p_email,
    p_country,
    p_time_zone,
    nullif(p_profile_url, ''),
    p_availability,
    p_cv_object_key,
    p_cv_mime_type,
    p_cv_size,
    'assessment_invited',
    p_now,
    p_now,
    p_now + interval '180 days',
    p_now,
    p_now
  )
  on conflict (idempotency_key) do nothing
  returning * into created_application;

  if created_application.id is null then
    return query
      select application.*
      from public.hiring_applications as application
      where application.idempotency_key = p_idempotency_key
      limit 1;
    return;
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
  values
    (
      created_application.id,
      p_assessment_token_hash,
      'assessment',
      p_assessment_expires_at,
      1,
      p_now,
      p_now
    ),
    (
      created_application.id,
      p_recruiter_token_hash,
      'recruiter_cv',
      p_recruiter_expires_at,
      1,
      p_now,
      p_now
    );

  return next created_application;
end;
$$;

create or replace function public.consume_hiring_access_token(
  p_token_hash text,
  p_scope text,
  p_now timestamptz
)
returns setof public.hiring_applications
language sql
volatile
security invoker
set search_path = ''
as $$
  with consumed as (
    update public.hiring_access_tokens as access_token
    set
      use_count = access_token.use_count + 1,
      last_used_at = p_now,
      updated_at = p_now
    where access_token.token_hash = p_token_hash::char(64)
      and access_token.scope = p_scope
      and access_token.revoked_at is null
      and access_token.expires_at > p_now
      and access_token.use_count < access_token.max_uses
    returning access_token.application_id
  )
  select application.*
  from public.hiring_applications as application
  join consumed on consumed.application_id = application.id
  limit 1;
$$;

create trigger hiring_roles_set_updated_at
before update on public.hiring_roles
for each row execute function public.hiring_set_updated_at();

create trigger hiring_campaigns_set_updated_at
before update on public.hiring_campaigns
for each row execute function public.hiring_set_updated_at();

create trigger hiring_applications_set_updated_at
before update on public.hiring_applications
for each row execute function public.hiring_set_updated_at();

create trigger hiring_email_events_set_updated_at
before update on public.hiring_email_events
for each row execute function public.hiring_set_updated_at();

create trigger hiring_access_tokens_set_updated_at
before update on public.hiring_access_tokens
for each row execute function public.hiring_set_updated_at();

alter table public.hiring_roles enable row level security;
alter table public.hiring_campaigns enable row level security;
alter table public.hiring_applications enable row level security;
alter table public.hiring_email_events enable row level security;
alter table public.hiring_access_tokens enable row level security;

revoke all on table public.hiring_roles from anon, authenticated;
revoke all on table public.hiring_campaigns from anon, authenticated;
revoke all on table public.hiring_applications from anon, authenticated;
revoke all on table public.hiring_email_events from anon, authenticated;
revoke all on table public.hiring_access_tokens from anon, authenticated;
revoke execute on function public.hiring_set_updated_at() from public, anon, authenticated;
revoke all on function public.get_active_hiring_campaign(text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.find_hiring_application_by_idempotency(text) from public, anon, authenticated;
revoke all on function public.find_recent_hiring_application(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.create_hiring_application(uuid, uuid, text, text, text, text, text, text, text, text, text, text, integer, text, timestamptz, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_hiring_access_token(text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.get_active_hiring_campaign(text, text, uuid, timestamptz) to service_role;
grant execute on function public.find_hiring_application_by_idempotency(text) to service_role;
grant execute on function public.find_recent_hiring_application(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.create_hiring_application(uuid, uuid, text, text, text, text, text, text, text, text, text, text, integer, text, timestamptz, text, timestamptz, timestamptz) to service_role;
grant execute on function public.consume_hiring_access_token(text, text, timestamptz) to service_role;

insert into public.hiring_roles (
  slug,
  title,
  rate_min,
  rate_max,
  portfolio_required
)
values
  ('senior-ai-product-engineer', 'Senior AI Product Engineer', 85, 120, false),
  ('senior-creative-frontend-developer', 'Senior Creative Frontend Developer', 65, 95, true),
  ('senior-full-stack-product-engineer', 'Senior Full-Stack Product Engineer', 70, 105, false),
  ('senior-product-designer', 'Senior Product Designer', 60, 90, true),
  ('senior-brand-visual-systems-designer', 'Senior Brand and Visual Systems Designer', 55, 85, true),
  ('senior-product-strategy-delivery-lead', 'Senior Product Strategy and Delivery Lead', 80, 115, false)
on conflict (slug) do update
set
  title = excluded.title,
  rate_min = excluded.rate_min,
  rate_max = excluded.rate_max,
  portfolio_required = excluded.portfolio_required,
  updated_at = now();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'hiring-cvs',
  'hiring-cvs',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
