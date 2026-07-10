alter table public.hiring_campaigns
  add column if not exists direct_application boolean not null default false;

create unique index if not exists hiring_campaigns_direct_application_role_idx
  on public.hiring_campaigns (role_id)
  where direct_application;

create or replace function public.get_direct_hiring_campaign(
  p_role_slug text default null,
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
  where campaign.direct_application
    and campaign.revoked_at is null
    and campaign.active_at <= p_now
    and campaign.expires_at > p_now
    and role.active
    and (p_role_slug is null or role.slug = p_role_slug)
  order by role.title;
$$;

revoke all on function public.get_direct_hiring_campaign(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_direct_hiring_campaign(text, timestamptz)
  to service_role;

insert into public.hiring_campaigns (
  role_id,
  label,
  token_hash,
  active_at,
  expires_at,
  revoked_at,
  direct_application
)
select
  role.id,
  'Direct application intake',
  encode(
    extensions.digest('auralis-direct-application:' || role.slug, 'sha256'),
    'hex'
  ),
  now(),
  '2100-01-01T00:00:00.000Z'::timestamptz,
  null,
  true
from public.hiring_roles as role
on conflict (role_id) where direct_application do update
set
  label = excluded.label,
  token_hash = excluded.token_hash,
  active_at = excluded.active_at,
  expires_at = excluded.expires_at,
  revoked_at = null,
  updated_at = now();
