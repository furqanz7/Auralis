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
  if v_verification_id is not null then
    return public.hiring_verification_payload(v_verification_id);
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
    where application.id = v_application_id
      and application.lifecycle_state <> 'deleted'
  );
end;
$$;

revoke all on function public.get_hiring_verification_by_token(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_hiring_verification_by_token(text, timestamptz)
  to service_role;

create index if not exists hiring_access_tokens_application_idx
  on public.hiring_access_tokens (application_id);

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
