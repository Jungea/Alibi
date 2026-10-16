-- R5-B: 추리노트
--
-- 보안 원칙
--  * 노트는 작성한 참가자 본인만 읽고 쓴다. 테이블에는 정책이 없어 직접 접근이 불가능하고,
--    RPC 가 항상 호출자 본인의 행만 다룬다. GM 도 참가자의 노트를 읽을 수 없다.
--  * 내용은 클라이언트가 정한 JSON 이므로 서버는 형태(객체, 버전)와 크기만 확인한다.

create table public.room_notes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),

  primary key (room_id, user_id)
);

alter table public.room_notes enable row level security;
revoke all on public.room_notes from anon, authenticated;

-- 내 노트 (없으면 null)
create or replace function public.get_my_notes(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  if not found or not exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status = 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  return (select n.data from public.room_notes n where n.room_id = p_room and n.user_id = v_uid);
end;
$$;

-- 내 노트 저장 (통째로 덮어쓴다)
create or replace function public.save_my_notes(p_room uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  if not found or not exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status = 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data ->> 'v' is distinct from '1'
     or octet_length(p_data::text) > 30000 then
    raise exception 'invalid_notes' using errcode = '22023';
  end if;

  insert into public.room_notes (room_id, user_id, data)
  values (p_room, v_uid, p_data)
  on conflict (room_id, user_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

revoke all on function public.get_my_notes(uuid), public.save_my_notes(uuid, jsonb) from public, anon;
grant execute on function public.get_my_notes(uuid), public.save_my_notes(uuid, jsonb) to authenticated;
