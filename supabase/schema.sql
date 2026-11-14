-- Our Little Universe: storage for shared game rooms.
-- Paste this whole file into the Supabase SQL Editor and press Run. Safe to run more than once.
--
-- The table is closed to direct access. The site can only go through the three functions
-- below, and each needs the room code, a long random string that only the invite link carries.

create table if not exists public.olu_docs (
  room text not null,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room, name)
);
alter table public.olu_docs enable row level security;
revoke all on public.olu_docs from anon, authenticated;

-- Deep merge: objects merge key by key, anything else (arrays included) is replaced.
create or replace function public.olu_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k,
        case when a ? k and b ? k then public.olu_merge(a -> k, b -> k)
             when b ? k then b -> k else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b end
$$;

create or replace function public.olu_ok(p_room text, p_name text) returns boolean
language sql immutable as $$
  select p_room ~ '^[A-Za-z0-9_-]{12,64}$' and p_name ~ '^[a-z]{1,24}$'
$$;

create or replace function public.olu_load(p_room text)
returns table (name text, data jsonb)
language sql security definer set search_path = public as $$
  select d.name, d.data from public.olu_docs d
  where d.room = p_room and public.olu_ok(p_room, 'x')
$$;

create or replace function public.olu_save(p_room text, p_name text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.olu_ok(p_room, p_name) or pg_column_size(p_data) > 300000 then
    raise exception 'invalid room, name or size';
  end if;
  insert into public.olu_docs (room, name, data) values (p_room, p_name, p_data)
  on conflict (room, name) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.olu_patch(p_room text, p_name text, p_part jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.olu_ok(p_room, p_name) or pg_column_size(p_part) > 300000 then
    raise exception 'invalid room, name or size';
  end if;
  insert into public.olu_docs (room, name, data) values (p_room, p_name, p_part)
  on conflict (room, name) do update
    set data = public.olu_merge(public.olu_docs.data, excluded.data), updated_at = now();
end $$;

grant execute on function public.olu_load(text) to anon, authenticated;
grant execute on function public.olu_save(text, text, jsonb) to anon, authenticated;
grant execute on function public.olu_patch(text, text, jsonb) to anon, authenticated;
