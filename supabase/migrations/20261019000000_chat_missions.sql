-- R4: 귓속말 · 그룹 채팅 · 미션 · 결말 판정
--
-- 보안 원칙
--  * 귓속말과 그룹 메시지는 "받는 사람 목록(room_message_audience)"에 든 사람과 GM 만 읽을 수 있다.
--    목록은 본인 행만 조회되고, 테이블에 정책이 있으므로 Realtime 알림도 같은 규칙을 따른다.
--  * 메시지에는 여전히 보낸 사람의 user_id 를 저장하지 않는다 (인물 ID 만).
--  * 그룹·그룹 멤버 테이블은 직접 접근할 수 없고 RPC 만 거친다. 비밀 그룹은 멤버와 GM 에게만 보인다.
--  * 미션 진행 상태 테이블도 직접 접근할 수 없다. 숨김 미션은 GM 과 결말 공개 때만 나온다.
--  * 모든 상태 변경은 security definer RPC 로만 한다.
--  * 게임이 끝나고 결말을 끝까지(3단계) 공개한 뒤에는 참가자도 전체 대화 로그를 열람할 수 있다.

-- ---------------------------------------------------------------------------
-- rooms / room_players 확장: GM 채팅 제어
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column chat_blocked boolean not null default false,
  -- 누군가 귓속말·그룹으로 말하면 전체에게 "누군가 귓속말 중" 알림을 보낸다.
  add column whisper_notice boolean not null default false;

alter table public.room_players
  add column muted boolean not null default false;

-- ---------------------------------------------------------------------------
-- room_messages 확장: 채널 (전체 / 귓속말 / 그룹)
-- ---------------------------------------------------------------------------
alter table public.room_messages
  add column channel text not null default 'all' check (channel in ('all', 'whisper', 'group')),
  add column target_character_id uuid,
  add column group_id uuid,
  add constraint room_messages_channel_shape check (
    (channel = 'all' and target_character_id is null and group_id is null)
    or (kind = 'chat' and channel = 'whisper' and target_character_id is not null and group_id is null)
    or (kind = 'chat' and channel = 'group' and group_id is not null and target_character_id is null)
  );

-- 받는 사람 목록 (전체 메시지는 행을 만들지 않는다)
create table public.room_message_audience (
  message_id bigint not null references public.room_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  primary key (message_id, user_id)
);

create index room_message_audience_user_idx on public.room_message_audience (user_id, message_id);

-- ---------------------------------------------------------------------------
-- 그룹
-- ---------------------------------------------------------------------------
create table public.room_groups (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  is_secret boolean not null default false,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index room_groups_room_idx on public.room_groups (room_id);

create table public.room_group_members (
  group_id uuid not null references public.room_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid not null,
  joined_at timestamptz not null default now(),

  primary key (group_id, user_id)
);

create index room_group_members_user_idx on public.room_group_members (user_id);

-- ---------------------------------------------------------------------------
-- 미션 진행 상태 (행이 없으면 아직 '진행 중')
-- ---------------------------------------------------------------------------
create table public.room_mission_status (
  room_id uuid not null references public.rooms (id) on delete cascade,
  mission_id uuid not null,
  -- 개인 미션이면 그 인물, 공통 미션이면 0 으로 채운 uuid
  character_id uuid not null,
  status text not null check (status in ('open', 'reported', 'done', 'failed')),
  updated_at timestamptz not null default now(),

  primary key (room_id, mission_id, character_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.room_message_audience enable row level security;
alter table public.room_groups enable row level security;
alter table public.room_group_members enable row level security;
alter table public.room_mission_status enable row level security;

create policy room_message_audience_select_own on public.room_message_audience
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.room_message_audience, public.room_groups,
  public.room_group_members, public.room_mission_status from anon, authenticated;
grant select on public.room_message_audience to authenticated;

-- 전체 로그를 열 수 있는 시점: 결말을 끝까지 공개한 뒤
create or replace function public._room_log_open(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms r where r.id = p_room and r.status = 'ended' and r.ending_step >= 3
  );
$$;

revoke all on function public._room_log_open(uuid) from public, anon;
grant execute on function public._room_log_open(uuid) to authenticated;

drop policy room_messages_select_member on public.room_messages;

create policy room_messages_select on public.room_messages
  for select to authenticated
  using (
    public.is_room_gm(room_id)
    or (
      public.is_room_member(room_id)
      and (
        channel = 'all'
        or public._room_log_open(room_id)
        or exists (
          select 1 from public.room_message_audience a
           where a.message_id = room_messages.id and a.user_id = (select auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 내부 함수
-- ---------------------------------------------------------------------------
create or replace function public._mission_key(m jsonb)
returns uuid
language sql
immutable
as $$
  select case
    when m ->> 'scope' = 'personal' and nullif(m ->> 'characterId', '') is not null
      then (m ->> 'characterId')::uuid
    else '00000000-0000-0000-0000-000000000000'::uuid
  end;
$$;

create or replace function public._mission_status(p_room uuid, m jsonb)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.status from public.room_mission_status s
     where s.room_id = p_room
       and s.mission_id = (m ->> 'id')::uuid
       and s.character_id = public._mission_key(m)
  ), 'open');
$$;

-- 가장 많은 표를 받은 인물이 혼자이고 범인이면 "범인을 잡았다".
create or replace function public._culprit_caught(p_room uuid, p_snapshot jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_top uuid;
  v_n1 bigint;
  v_n2 bigint;
begin
  select v.target_character_id, count(*) into v_top, v_n1
    from public.room_votes v where v.room_id = p_room
   group by v.target_character_id
   order by count(*) desc
   limit 1;
  if v_top is null then
    return false;
  end if;

  select count(*) into v_n2
    from public.room_votes v where v.room_id = p_room
   group by v.target_character_id
   order by count(*) desc
   offset 1 limit 1;
  if v_n2 is not null and v_n2 = v_n1 then
    return false; -- 동점
  end if;

  return exists (
    select 1 from jsonb_array_elements(p_snapshot -> 'characters') ch
     where (ch ->> 'id')::uuid = v_top and ch ->> 'roleType' = 'culprit'
  );
end;
$$;

-- 결말 판정: 결말 목록 순서대로 조건을 검사해 처음 맞는 결말을 고른다.
-- 맞는 것이 없으면 '기본 결말', 그것도 없으면 첫 번째 결말.
create or replace function public._resolve_ending(p_room uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.rooms;
  v_snapshot jsonb;
  v_caught boolean;
  v_count integer;
  v_default uuid;
  v_first uuid;
  e jsonb;
  m jsonb;
  v_ok boolean;
  i integer;
begin
  select * into r from public.rooms where id = p_room;
  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  v_caught := public._culprit_caught(p_room, v_snapshot);
  v_count := coalesce(jsonb_array_length(v_snapshot -> 'endings'), 0);

  for i in 0 .. v_count - 1 loop
    e := v_snapshot -> 'endings' -> i;
    v_first := coalesce(v_first, (e ->> 'id')::uuid);
    v_ok := false;

    case e ->> 'conditionKind'
      when 'default' then
        v_default := coalesce(v_default, (e ->> 'id')::uuid);
      when 'culprit_caught' then
        v_ok := v_caught;
      when 'culprit_escaped' then
        v_ok := not v_caught;
      when 'mission_done', 'mission_failed' then
        select x into m
          from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) x
         where x ->> 'id' = e ->> 'conditionMissionId'
         limit 1;
        if m is not null then
          v_ok := (public._mission_status(p_room, m) = 'done') = (e ->> 'conditionKind' = 'mission_done');
        end if;
      else
        null;
    end case;

    if v_ok then
      return (e ->> 'id')::uuid;
    end if;
  end loop;

  return coalesce(v_default, v_first);
end;
$$;

revoke all on function
  public._mission_key(jsonb),
  public._mission_status(uuid, jsonb),
  public._culprit_caught(uuid, jsonb),
  public._resolve_ending(uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: GM 채팅 제어
-- ---------------------------------------------------------------------------
create or replace function public.set_chat_blocked(p_room uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status in ('lobby', 'ended') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if r.chat_blocked = coalesce(p_blocked, false) then
    return;
  end if;
  update public.rooms set chat_blocked = coalesce(p_blocked, false) where id = p_room;
  perform public._post_message(
    p_room, 'system', null,
    case when coalesce(p_blocked, false) then 'GM이 대화를 잠시 멈췄습니다.' else 'GM이 대화를 다시 열었습니다.' end
  );
end;
$$;

create or replace function public.set_whisper_notice(p_room uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  update public.rooms set whisper_notice = coalesce(p_on, false) where id = r.id;
end;
$$;

create or replace function public.set_muted(p_room uuid, p_user uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  update public.room_players set muted = coalesce(p_muted, false)
   where room_id = r.id and user_id = p_user;
  if not found then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 채팅 (전체 / 귓속말 / 그룹)
-- ---------------------------------------------------------------------------
drop function public.send_message(uuid, text);

create or replace function public.send_message(
  p_room uuid,
  p_body text,
  p_channel text default 'all',
  p_target uuid default null,
  p_group uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_body text := btrim(coalesce(p_body, ''));
  v_channel text := coalesce(p_channel, 'all');
  v_char uuid;
  v_is_gm boolean;
  v_muted boolean;
  v_target_user uuid;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  v_is_gm := found and r.gm_id = v_uid;
  if not found or not (v_is_gm or exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(v_body) not between 1 and 500
     or v_body ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
     or v_channel not in ('all', 'whisper', 'group') then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  -- GM 은 언제든 전체 공지로 말할 수 있다.
  if v_is_gm then
    if v_channel <> 'all' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    perform public._post_message(p_room, 'gm', null, v_body);
    return;
  end if;

  if r.status = 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if r.chat_blocked then
    raise exception 'chat_blocked' using errcode = 'P0001';
  end if;
  select p.muted into v_muted from public.room_players p where p.room_id = p_room and p.user_id = v_uid;
  if v_muted then
    raise exception 'muted' using errcode = 'P0001';
  end if;

  if r.status in ('round', 'voting') then
    select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
    if not ((v_snapshot -> 'rounds' -> r.current_round_index -> 'allowedActions')
            @> (case when v_channel = 'all' then '"chat"' else '"whisper"' end)::jsonb) then
      raise exception '%', case when v_channel = 'all' then 'chat_not_allowed' else 'whisper_not_allowed' end
        using errcode = 'P0001';
    end if;
  end if;

  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 도배 방지: 5초 안에 5개까지 (채널 무관)
  if (select count(*) from public.room_messages m
       where m.room_id = p_room and m.kind = 'chat' and m.character_id = v_char
         and m.created_at > now() - interval '5 seconds') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_channel = 'all' then
    perform public._post_message(p_room, 'chat', v_char, v_body);
    return;
  end if;

  if v_channel = 'whisper' then
    select a.user_id into v_target_user
      from public.room_assignments a where a.room_id = p_room and a.character_id = p_target;
    if p_target is null or v_target_user is null or p_target = v_char then
      raise exception 'invalid_target' using errcode = 'P0002';
    end if;
    insert into public.room_messages (room_id, kind, character_id, channel, target_character_id, body)
    values (p_room, 'chat', v_char, 'whisper', p_target, v_body)
    returning id into v_id;
    insert into public.room_message_audience (message_id, user_id)
    values (v_id, v_uid), (v_id, v_target_user);
  else
    if p_group is null or not exists (
      select 1 from public.room_groups g
        join public.room_group_members m on m.group_id = g.id
       where g.id = p_group and g.room_id = p_room and m.user_id = v_uid
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    insert into public.room_messages (room_id, kind, character_id, channel, group_id, body)
    values (p_room, 'chat', v_char, 'group', p_group, v_body)
    returning id into v_id;
    insert into public.room_message_audience (message_id, user_id)
    select v_id, m.user_id from public.room_group_members m where m.group_id = p_group;
  end if;

  -- "누군가 귓속말 중" 알림: 20초에 한 번만
  if r.whisper_notice and not exists (
    select 1 from public.room_messages m
     where m.room_id = p_room and m.kind = 'system'
       and m.body = '누군가 은밀한 대화를 나누고 있습니다.'
       and m.created_at > now() - interval '20 seconds'
  ) then
    perform public._post_message(p_room, 'system', null, '누군가 은밀한 대화를 나누고 있습니다.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 그룹
-- ---------------------------------------------------------------------------
-- 호출자가 이 방의 (GM 이 아닌) 참가자이고 게임 중이면 방을 돌려준다.
create or replace function public._group_actor(p_room uuid)
returns public.rooms
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
  if r.status in ('lobby', 'ended') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  return r;
end;
$$;

revoke all on function public._group_actor(uuid) from public, anon, authenticated;

create or replace function public.create_group(
  p_room uuid,
  p_name text,
  p_secret boolean,
  p_characters uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms := public._group_actor(p_room);
  v_name text := btrim(coalesce(p_name, ''));
  v_my_char uuid;
  v_chars uuid[];
  v_id uuid;
begin
  select a.character_id into v_my_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_my_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(v_name) not between 1 and 20 or v_name ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'invalid_group' using errcode = '22023';
  end if;

  v_chars := array(
    select distinct c from unnest(coalesce(p_characters, '{}'::uuid[])) c
     where c is not null and c <> v_my_char
  );
  if cardinality(v_chars) < 1 or cardinality(v_chars) > 11
     or (select count(*) from public.room_assignments a
          where a.room_id = p_room and a.character_id = any (v_chars)) <> cardinality(v_chars) then
    raise exception 'invalid_group' using errcode = '22023';
  end if;

  if (select count(*) from public.room_groups g where g.room_id = p_room) >= 30
     or (select count(*) from public.room_groups g where g.room_id = p_room and g.owner_id = v_uid) >= 3 then
    raise exception 'too_many_groups' using errcode = 'P0001';
  end if;

  insert into public.room_groups (room_id, name, is_secret, owner_id)
  values (r.id, v_name, coalesce(p_secret, false), v_uid)
  returning id into v_id;

  insert into public.room_group_members (group_id, user_id, character_id)
  select v_id, a.user_id, a.character_id
    from public.room_assignments a
   where a.room_id = p_room and (a.character_id = v_my_char or a.character_id = any (v_chars));

  return v_id;
end;
$$;

create or replace function public.join_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.room_groups;
  v_char uuid;
begin
  select * into g from public.room_groups where id = p_group;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._group_actor(g.room_id);
  if g.is_secret then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.room_group_members m where m.group_id = p_group and m.user_id = v_uid) then
    return;
  end if;
  if (select count(*) from public.room_group_members m where m.group_id = p_group) >= 12 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  select a.character_id into v_char
    from public.room_assignments a where a.room_id = g.room_id and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.room_group_members (group_id, user_id, character_id) values (p_group, v_uid, v_char);
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.room_groups;
  v_next uuid;
begin
  select * into g from public.room_groups where id = p_group for update;
  if not found or not exists (
    select 1 from public.room_group_members m where m.group_id = p_group and m.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._group_actor(g.room_id);

  delete from public.room_group_members where group_id = p_group and user_id = v_uid;
  if g.owner_id = v_uid then
    select m.user_id into v_next from public.room_group_members m
     where m.group_id = p_group order by m.joined_at limit 1;
    if v_next is not null then
      update public.room_groups set owner_id = v_next where id = p_group;
    end if;
  end if;
end;
$$;

create or replace function public.add_group_member(p_group uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.room_groups;
  v_user uuid;
begin
  select * into g from public.room_groups where id = p_group for update;
  if not found or g.owner_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._group_actor(g.room_id);

  select a.user_id into v_user
    from public.room_assignments a where a.room_id = g.room_id and a.character_id = p_character;
  if v_user is null then
    raise exception 'invalid_target' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.room_group_members m where m.group_id = p_group and m.user_id = v_user) then
    return;
  end if;
  if (select count(*) from public.room_group_members m where m.group_id = p_group) >= 12 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  insert into public.room_group_members (group_id, user_id, character_id) values (p_group, v_user, p_character);
end;
$$;

create or replace function public.remove_group_member(p_group uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.room_groups;
begin
  select * into g from public.room_groups where id = p_group for update;
  if not found or g.owner_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._group_actor(g.room_id);

  delete from public.room_group_members m
   where m.group_id = p_group and m.character_id = p_character and m.user_id <> v_uid;
  if not found then
    raise exception 'invalid_target' using errcode = 'P0002';
  end if;
end;
$$;

-- 내가 볼 수 있는 그룹: 공개 그룹 + 내가 속한 그룹 (GM 은 전부, 로그가 열리면 참가자도 전부)
create or replace function public.get_groups(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_is_gm boolean;
  v_open boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  v_is_gm := found and r.gm_id = v_uid;
  if not found or not (v_is_gm or exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_open := public._room_log_open(p_room);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id,
             'name', g.name,
             'isSecret', g.is_secret,
             'isMember', exists (select 1 from public.room_group_members m
                                  where m.group_id = g.id and m.user_id = v_uid),
             'isOwner', g.owner_id = v_uid,
             'members', coalesce((select jsonb_agg(m.character_id order by m.joined_at)
                                    from public.room_group_members m where m.group_id = g.id), '[]'::jsonb)
           ) order by g.created_at)
      from public.room_groups g
     where g.room_id = p_room
       and (v_is_gm or v_open or not g.is_secret
            or exists (select 1 from public.room_group_members m
                        where m.group_id = g.id and m.user_id = v_uid))
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 미션
-- ---------------------------------------------------------------------------
-- 내 미션: 내 개인 미션 + 공통 미션 (숨김 미션은 제외)
create or replace function public.get_my_missions(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_char uuid;
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
  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m -> 'id',
             'title', m -> 'title',
             'description', m -> 'description',
             'scope', m -> 'scope',
             'judgeType', m -> 'judgeType',
             'status', public._mission_status(p_room, m)
           ) order by o)
      from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) with ordinality as t(m, o)
     where not coalesce((m ->> 'hidden')::boolean, false)
       and (m ->> 'scope' = 'common'
            or nullif(m ->> 'characterId', '') is null
            or (m ->> 'characterId')::uuid = v_char)
  ), '[]'::jsonb);
end;
$$;

-- 자가 보고: 내가 볼 수 있는 '자가 보고' 미션이 진행 중일 때만
create or replace function public.report_mission(p_room uuid, p_mission uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_char uuid;
  m jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room for update;
  if not found or not exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status not in ('round', 'break', 'voting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  select x into m
    from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) x
   where x ->> 'id' = p_mission::text
   limit 1;
  if m is null
     or coalesce((m ->> 'hidden')::boolean, false)
     or not (m ->> 'scope' = 'common'
             or nullif(m ->> 'characterId', '') is null
             or (m ->> 'characterId')::uuid = v_char) then
    raise exception 'mission not found' using errcode = 'P0002';
  end if;
  if m ->> 'judgeType' <> 'self_report' then
    raise exception 'mission_not_reportable' using errcode = 'P0001';
  end if;
  if public._mission_status(p_room, m) <> 'open' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into public.room_mission_status (room_id, mission_id, character_id, status)
  values (p_room, p_mission, public._mission_key(m), 'reported')
  on conflict (room_id, mission_id, character_id)
  do update set status = 'reported', updated_at = now();
end;
$$;

-- GM 이 미션 결과를 정한다 (자가 보고 승인·반려, GM 판정 미션, 숨김 미션)
create or replace function public.set_mission_status(p_room uuid, p_mission uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
  m jsonb;
begin
  if r.status in ('lobby', 'ended') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in ('open', 'done', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  select x into m
    from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) x
   where x ->> 'id' = p_mission::text
   limit 1;
  if m is null then
    raise exception 'mission not found' using errcode = 'P0002';
  end if;

  insert into public.room_mission_status (room_id, mission_id, character_id, status)
  values (p_room, p_mission, public._mission_key(m), p_status)
  on conflict (room_id, mission_id, character_id)
  do update set status = p_status, updated_at = now();
end;
$$;

-- GM 용 전체 미션 현황 (숨김 포함)
create or replace function public.get_gm_missions(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  if not found or r.gm_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m -> 'id',
             'title', m -> 'title',
             'description', m -> 'description',
             'scope', m -> 'scope',
             'judgeType', m -> 'judgeType',
             'hidden', coalesce((m ->> 'hidden')::boolean, false),
             'characterName', case when m ->> 'scope' = 'personal'
                                   then public._character_name(v_snapshot, nullif(m ->> 'characterId', '')::uuid) end,
             'status', public._mission_status(p_room, m)
           ) order by o)
      from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) with ordinality as t(m, o)
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 결말 판정 미리보기 (GM)
-- ---------------------------------------------------------------------------
create or replace function public.preview_ending(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
  v_id uuid;
begin
  if r.status not in ('break', 'voting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  v_id := public._resolve_ending(p_room);
  return jsonb_build_object(
    'endingId', v_id,
    'endingName', (select e ->> 'name' from jsonb_array_elements(v_snapshot -> 'endings') e
                    where (e ->> 'id')::uuid = v_id),
    'culpritCaught', public._culprit_caught(p_room, v_snapshot)
  );
end;
$$;

-- 게임 종료: 결말을 지정하지 않으면 투표 결과와 미션 달성 여부로 자동 판정한다.
create or replace function public.finish_game(p_room uuid, p_ending_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
  v_ending uuid := p_ending_id;
begin
  if r.status not in ('break', 'voting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  if v_ending is null then
    v_ending := public._resolve_ending(p_room);
  elsif not exists (
    select 1 from jsonb_array_elements(v_snapshot -> 'endings') e where (e ->> 'id')::uuid = v_ending
  ) then
    raise exception 'ending not found' using errcode = 'P0002';
  end if;

  update public.rooms
     set status = 'ended', ending_id = v_ending, ending_step = 1,
         chat_blocked = false,
         timer_ends_at = null, timer_paused_remaining = null
   where id = p_room;
  perform public._post_message(p_room, 'system', null, '게임이 종료되었습니다. 결말을 공개합니다.');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 결말 공개 (2단계에 미션 달성표 추가)
-- ---------------------------------------------------------------------------
create or replace function public.get_ending(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_ending jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  if not found or not (r.gm_id = v_uid or exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'ended' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  select e into v_ending
    from jsonb_array_elements(v_snapshot -> 'endings') e
   where (e ->> 'id')::uuid = r.ending_id;

  v_result := jsonb_build_object('step', r.ending_step);

  -- 1단계: 투표 결과
  if r.ending_step >= 1 then
    v_result := v_result || jsonb_build_object(
      'tally', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n) order by t.n desc, t.name)
          from (
            select public._character_name(v_snapshot, v.target_character_id) as name, count(*) as n
              from public.room_votes v where v.room_id = p_room
             group by v.target_character_id
          ) t
      ), '[]'::jsonb),
      'ballots', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'voter', public._character_name(v_snapshot, a.character_id),
                 'target', public._character_name(v_snapshot, v.target_character_id)))
          from public.room_votes v
          join public.room_assignments a on a.room_id = v.room_id and a.user_id = v.voter_id
         where v.room_id = p_room
      ), '[]'::jsonb)
    );
  end if;

  -- 2단계: 진실 + 미션 달성표
  if r.ending_step >= 2 then
    v_result := v_result || jsonb_build_object(
      'culprits', coalesce((
        select jsonb_agg(ch -> 'name')
          from jsonb_array_elements(v_snapshot -> 'characters') ch
         where ch ->> 'roleType' = 'culprit'
      ), '[]'::jsonb),
      'culpritCaught', public._culprit_caught(p_room, v_snapshot),
      'ending', case when v_ending is null then null else jsonb_build_object(
        'name', v_ending -> 'name',
        'resultText', v_ending -> 'resultText',
        'truthText', v_ending -> 'truthText'
      ) end,
      'missions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'title', m -> 'title',
                 'scope', m -> 'scope',
                 'character', case when m ->> 'scope' = 'personal'
                                   then public._character_name(v_snapshot, nullif(m ->> 'characterId', '')::uuid) end,
                 'status', public._mission_status(p_room, m)
               ) order by o)
          from jsonb_array_elements(coalesce(v_snapshot -> 'missions', '[]'::jsonb)) with ordinality as t(m, o)
      ), '[]'::jsonb)
    );
  end if;

  -- 3단계: 인물별 후일담
  if r.ending_step >= 3 then
    v_result := v_result || jsonb_build_object(
      'epilogues', coalesce((
        select jsonb_agg(jsonb_build_object('name', ch -> 'name', 'text', v_ending -> 'epilogues' ->> (ch ->> 'id')) order by o)
          from jsonb_array_elements(v_snapshot -> 'characters') with ordinality as t(ch, o)
         where v_ending is not null
           and coalesce(v_ending -> 'epilogues' ->> (ch ->> 'id'), '') <> ''
      ), '[]'::jsonb)
    );
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room_overview: 채팅 제어 상태와 (GM 에게) 승인 대기 미션 수를 추가한다.
-- ---------------------------------------------------------------------------
create or replace function public.get_room_overview(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_is_gm boolean;
  v_scenario jsonb;
  v_result jsonb;
  v_mine uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into r from public.rooms where id = p_room;
  v_is_gm := found and r.gm_id = v_uid;
  if not found or not (v_is_gm or exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;

  v_scenario := jsonb_build_object(
    'title', v_snapshot #>> '{scenario,title}',
    'genre', v_snapshot #>> '{scenario,genre}',
    'estimatedMinutes', v_snapshot #> '{scenario,estimatedMinutes}'
  );
  if v_is_gm or r.status <> 'lobby' then
    v_scenario := v_scenario || jsonb_build_object(
      'victim', v_snapshot #>> '{scenario,victim}',
      'incidentTime', v_snapshot #>> '{scenario,incidentTime}',
      'incidentPlace', v_snapshot #>> '{scenario,incidentPlace}',
      'openingText', v_snapshot #>> '{scenario,openingText}'
    );
  end if;

  v_result := jsonb_build_object(
    'serverNow', now(),
    'isGm', v_is_gm,
    'room', jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'status', r.status,
      'maxPlayers', r.max_players,
      'currentRoundIndex', r.current_round_index,
      'roundStartedAt', r.round_started_at,
      'timerEndsAt', r.timer_ends_at,
      'timerPausedRemaining', r.timer_paused_remaining,
      'endingStep', r.ending_step,
      'chatBlocked', r.chat_blocked,
      'whisperNotice', r.whisper_notice
    ),
    'scenario', v_scenario,
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c -> 'id', 'name', c -> 'name', 'publicInfo', c -> 'publicInfo'
             ) order by o)
        from jsonb_array_elements(v_snapshot -> 'characters') with ordinality as t(c, o)
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x -> 'id', 'name', x -> 'name', 'goal', x -> 'goal',
               'timeLimitSeconds', x -> 'timeLimitSeconds', 'allowedActions', x -> 'allowedActions',
               -- 이미 시작한 라운드의 해금 내용만 (GM 은 전부)
               'unlockContent', case when v_is_gm or o - 1 <= r.current_round_index
                                     then x -> 'unlockContent' end
             ) order by o)
        from jsonb_array_elements(v_snapshot -> 'rounds') with ordinality as t(x, o)
    ), '[]'::jsonb)
  );

  if v_is_gm then
    -- 종료할 때 고를 결말 목록 (이름만)
    v_result := v_result || jsonb_build_object('endings', coalesce((
      select jsonb_agg(jsonb_build_object('id', e -> 'id', 'name', e -> 'name') order by o)
        from jsonb_array_elements(v_snapshot -> 'endings') with ordinality as t(e, o)
    ), '[]'::jsonb));
    v_result := v_result || jsonb_build_object('assignments', coalesce((
      select jsonb_agg(jsonb_build_object('userId', a.user_id, 'characterId', a.character_id))
        from public.room_assignments a where a.room_id = p_room
    ), '[]'::jsonb));
    v_result := v_result || jsonb_build_object('missionReports', (
      select count(*) from public.room_mission_status s where s.room_id = p_room and s.status = 'reported'
    ));
  elsif r.status <> 'lobby' then
    select a.character_id into v_mine
      from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
    v_result := v_result || jsonb_build_object('myCharacterId', v_mine);
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------------
revoke all on function
  public.set_chat_blocked(uuid, boolean),
  public.set_whisper_notice(uuid, boolean),
  public.set_muted(uuid, uuid, boolean),
  public.send_message(uuid, text, text, uuid, uuid),
  public.create_group(uuid, text, boolean, uuid[]),
  public.join_group(uuid),
  public.leave_group(uuid),
  public.add_group_member(uuid, uuid),
  public.remove_group_member(uuid, uuid),
  public.get_groups(uuid),
  public.get_my_missions(uuid),
  public.report_mission(uuid, uuid),
  public.set_mission_status(uuid, uuid, text),
  public.get_gm_missions(uuid),
  public.preview_ending(uuid),
  public.finish_game(uuid, uuid),
  public.get_ending(uuid),
  public.get_room_overview(uuid)
from public, anon;

grant execute on function
  public.set_chat_blocked(uuid, boolean),
  public.set_whisper_notice(uuid, boolean),
  public.set_muted(uuid, uuid, boolean),
  public.send_message(uuid, text, text, uuid, uuid),
  public.create_group(uuid, text, boolean, uuid[]),
  public.join_group(uuid),
  public.leave_group(uuid),
  public.add_group_member(uuid, uuid),
  public.remove_group_member(uuid, uuid),
  public.get_groups(uuid),
  public.get_my_missions(uuid),
  public.report_mission(uuid, uuid),
  public.set_mission_status(uuid, uuid, text),
  public.get_gm_missions(uuid),
  public.preview_ending(uuid),
  public.finish_game(uuid, uuid),
  public.get_ending(uuid),
  public.get_room_overview(uuid)
to authenticated;
