-- SupplyMesh schema for the MSE Product Suite Free-tier Supabase project.
-- Apply only to project tcstghomtslvvjvtbtmj after reviewing the target project.
create schema if not exists supplymesh;
create schema if not exists supplymesh_private;
revoke all on schema supplymesh from anon, public;
revoke all on schema supplymesh_private from anon, public, authenticated;
grant usage on schema supplymesh to authenticated;

create table if not exists supplymesh.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  region text not null default '' check (char_length(region) <= 120),
  team_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists supplymesh.organization_members (
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists supplymesh_members_user_idx on supplymesh.organization_members(user_id, organization_id);

create table if not exists supplymesh.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140),
  region text not null default '' check (char_length(region) <= 120),
  status text not null default 'active' check (status in ('active', 'watch', 'inactive')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create table if not exists supplymesh.components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  sku text not null check (char_length(sku) between 1 and 80),
  name text not null check (char_length(name) between 1 and 140),
  demand_per_week numeric(14,3) not null default 0 check (demand_per_week >= 0),
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  criticality smallint not null default 3 check (criticality between 1 and 5),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, sku)
);
create index if not exists supplymesh_components_org_idx on supplymesh.components(organization_id, criticality desc);

create table if not exists supplymesh.source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  component_id uuid not null,
  supplier_id uuid not null,
  share_pct numeric(6,2) not null check (share_pct between 0 and 100),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, component_id, supplier_id),
  foreign key (component_id, organization_id) references supplymesh.components(id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references supplymesh.suppliers(id, organization_id) on delete cascade
);

create table if not exists supplymesh.scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140),
  duration_weeks integer not null check (duration_weeks between 1 and 104),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists supplymesh.scenario_disruptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  scenario_id uuid not null,
  supplier_id uuid not null,
  availability_pct numeric(6,2) not null check (availability_pct between 0 and 100),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (scenario_id, supplier_id),
  foreign key (scenario_id, organization_id) references supplymesh.scenarios(id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references supplymesh.suppliers(id, organization_id) on delete cascade
);

create table if not exists supplymesh.substitution_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  component_id uuid not null,
  substitute_component_id uuid not null,
  conversion_ratio numeric(10,4) not null check (conversion_ratio > 0),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'qualified', 'rejected')),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, component_id, substitute_component_id),
  check (component_id <> substitute_component_id),
  foreign key (component_id, organization_id) references supplymesh.components(id, organization_id) on delete cascade,
  foreign key (substitute_component_id, organization_id) references supplymesh.components(id, organization_id) on delete cascade
);

create table if not exists supplymesh.scenario_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references supplymesh.organizations(id) on delete cascade,
  scenario_id uuid not null,
  model_version text not null check (char_length(model_version) <= 80),
  result jsonb not null,
  assumptions jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (scenario_id, organization_id) references supplymesh.scenarios(id, organization_id) on delete cascade
);
create index if not exists supplymesh_runs_org_scenario_idx on supplymesh.scenario_runs(organization_id, scenario_id, created_at desc);

create or replace function supplymesh_private.is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from supplymesh.organization_members m
    where m.organization_id = p_organization_id and m.user_id = (select auth.uid())
  );
$$;
revoke all on function supplymesh_private.is_member(uuid) from public, anon;
grant usage on schema supplymesh_private to authenticated;
grant execute on function supplymesh_private.is_member(uuid) to authenticated;

create or replace function supplymesh.create_organization(p_name text, p_region text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if char_length(trim(p_name)) not between 2 and 100 then raise exception 'Workspace name must be 2 to 100 characters.'; end if;
  insert into supplymesh.organizations(name, region, created_by)
  values (trim(p_name), coalesce(trim(p_region), ''), v_user_id)
  returning id into v_organization_id;
  insert into supplymesh.organization_members(organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'owner');
  return v_organization_id;
end;
$$;

create or replace function supplymesh.join_organization(p_team_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  select o.id into v_organization_id from supplymesh.organizations o
  where o.team_code = upper(trim(p_team_code));
  if v_organization_id is null then raise exception 'That team code was not found.'; end if;
  insert into supplymesh.organization_members(organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'member')
  on conflict (organization_id, user_id) do nothing;
  return v_organization_id;
end;
$$;

create or replace function supplymesh.set_source_share(
  p_organization_id uuid,
  p_component_id uuid,
  p_supplier_id uuid,
  p_share_pct numeric,
  p_lead_time_days integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if auth.uid() is null or not supplymesh_private.is_member(p_organization_id) then
    raise exception 'You do not have access to this workspace.';
  end if;
  if p_share_pct not between 0 and 100 or p_lead_time_days < 0 then
    raise exception 'Share must be 0–100 and lead time cannot be negative.';
  end if;
  perform 1 from supplymesh.components c
    where c.id = p_component_id and c.organization_id = p_organization_id for update;
  if not found then raise exception 'Component does not belong to this workspace.'; end if;
  if not exists (select 1 from supplymesh.suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id) then
    raise exception 'Supplier does not belong to this workspace.';
  end if;
  if p_share_pct = 0 then
    delete from supplymesh.source_links where organization_id = p_organization_id and component_id = p_component_id and supplier_id = p_supplier_id;
    return;
  end if;
  select coalesce(sum(l.share_pct), 0) into v_total from supplymesh.source_links l
  where l.organization_id = p_organization_id and l.component_id = p_component_id and l.supplier_id <> p_supplier_id;
  if v_total + p_share_pct > 100 then raise exception 'Combined supply shares cannot exceed 100%% (currently %%%).', v_total; end if;
  insert into supplymesh.source_links(organization_id, component_id, supplier_id, share_pct, lead_time_days)
  values (p_organization_id, p_component_id, p_supplier_id, p_share_pct, p_lead_time_days)
  on conflict (organization_id, component_id, supplier_id)
  do update set share_pct = excluded.share_pct, lead_time_days = excluded.lead_time_days;
end;
$$;

revoke all on function supplymesh.create_organization(text, text) from public, anon;
revoke all on function supplymesh.join_organization(text) from public, anon;
revoke all on function supplymesh.set_source_share(uuid, uuid, uuid, numeric, integer) from public, anon;
grant execute on function supplymesh.create_organization(text, text) to authenticated;
grant execute on function supplymesh.join_organization(text) to authenticated;
grant execute on function supplymesh.set_source_share(uuid, uuid, uuid, numeric, integer) to authenticated;

grant select on supplymesh.organizations, supplymesh.organization_members,
  supplymesh.suppliers, supplymesh.components, supplymesh.source_links,
  supplymesh.scenarios, supplymesh.scenario_disruptions,
  supplymesh.substitution_options, supplymesh.scenario_runs to authenticated;
grant insert, update, delete on supplymesh.suppliers, supplymesh.components,
  supplymesh.scenarios, supplymesh.scenario_disruptions,
  supplymesh.substitution_options, supplymesh.scenario_runs to authenticated;
revoke insert, update, delete on supplymesh.organizations, supplymesh.organization_members, supplymesh.source_links from anon, authenticated;
alter table supplymesh.organizations enable row level security;
alter table supplymesh.organization_members enable row level security;
alter table supplymesh.suppliers enable row level security;
alter table supplymesh.components enable row level security;
alter table supplymesh.source_links enable row level security;
alter table supplymesh.scenarios enable row level security;
alter table supplymesh.scenario_disruptions enable row level security;
alter table supplymesh.substitution_options enable row level security;
alter table supplymesh.scenario_runs enable row level security;

create policy "members read organizations" on supplymesh.organizations for select to authenticated
  using (supplymesh_private.is_member(id));
create policy "members read membership" on supplymesh.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or supplymesh_private.is_member(organization_id));

do $$
declare t text;
begin
  foreach t in array array['suppliers','components','source_links','scenarios','scenario_disruptions','substitution_options','scenario_runs'] loop
    execute format('create policy %I on supplymesh.%I for select to authenticated using (supplymesh_private.is_member(organization_id))', t || ' members select', t);
  end loop;
  foreach t in array array['suppliers','components','scenarios','scenario_disruptions','substitution_options','scenario_runs'] loop
    execute format('create policy %I on supplymesh.%I for insert to authenticated with check (supplymesh_private.is_member(organization_id) and created_by = (select auth.uid()))', t || ' members insert', t);
    execute format('create policy %I on supplymesh.%I for update to authenticated using (supplymesh_private.is_member(organization_id)) with check (supplymesh_private.is_member(organization_id))', t || ' members update', t);
    execute format('create policy %I on supplymesh.%I for delete to authenticated using (supplymesh_private.is_member(organization_id))', t || ' members delete', t);
  end loop;
end;
$$;
