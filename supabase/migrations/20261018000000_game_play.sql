-- R3-C: 플레이 (인물 카드, 힌트 카드, 채팅, 투표, 결말 공개)
--
-- 보안 원칙
--  * room_clues / room_votes 는 클라이언트가 직접 읽거나 쓸 수 없다. RPC 만 거친다.
--  * room_messages 는 같은 방 참가자와 GM 만 읽을 수 있고, 쓰기는 RPC 만 가능하다.
--  * 채팅에는 보낸 사람의 user_id 를 저장하지 않는다. 인물 ID 만 저장해
--    참가자가 "어느 닉네임이 어느 인물인지" 알아낼 수 없게 한다 (GM 은 배정표로 안다).
--  * 인물의 비밀 정보는 본인에게만, 미획득 힌트는 아무에게도, 결말은 방이 종료된 뒤
--    GM 이 공개한 단계까지만 돌려준다.

-- ---------------------------------------------------------------------------
-- rooms 확장: 결말 선택과 단계별 공개
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column ending_id uuid,
  -- 0: 아직 공개 전, 1: 투표 결과, 2: 진실, 3: 후일담
  add column ending_step integer not null default 0 check (ending_step between 0 and 3);

-- ---------------------------------------------------------------------------
-- room_messages: 채팅 + 시스템 메시지
-- ---------------------------------------------------------------------------
create table public.room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  kind text not null check (kind in ('chat', 'system', 'gm')),
  -- chat 일 때만 말한 인물 (발행본 snapshot.characters[].id)
  character_id uuid,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),

  check ((kind = 'chat' and character_id is not null) or (kind <> 'chat' and character_id is null))
);

create index room_messages_room_idx on public.room_messages (room_id, id desc);

-- ---------------------------------------------------------------------------
-- room_clues: 획득한 힌트 (방마다 한 번씩만 뽑힌다)
-- ---------------------------------------------------------------------------
create table public.room_clues (
  room_id uuid not null references public.rooms (id) on delete cascade,
  clue_id uuid not null,
  holder_id uuid not null references auth.users (id) on delete cascade,
  -- 전체 공개 힌트면 true
  is_public boolean not null,
  round_index integer not null,
  acquired_at timestamptz not null default now(),

  primary key (room_id, clue_id)
);

create index room_clues_holder_idx on public.room_clues (room_id, holder_id);

-- ---------------------------------------------------------------------------
-- room_votes: 범인 투표 (1인 1표는 기본키로 보장)
-- ---------------------------------------------------------------------------
create table public.room_votes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  target_character_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (room_id, voter_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.room_messages enable row level security;
alter table public.room_clues enable row level security;
alter table public.room_votes enable row level security;

create policy room_messages_select_member on public.room_messages
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_room_gm(room_id));

revoke all on public.room_messages, public.room_clues, public.room_votes from anon, authenticated;
grant select on public.room_messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 내부 함수
-- ---------------------------------------------------------------------------
create or replace function public._post_message(p_room uuid, p_kind text, p_character uuid, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.room_messages (room_id, kind, character_id, body)
  values (p_room, p_kind, p_character, left(p_body, 1000));
$$;

create or replace function public._character_name(p_snapshot jsonb, p_id uuid)
returns text
language sql
stable
as $$
  select ch ->> 'name'
    from jsonb_array_elements(p_snapshot -> 'characters') ch
   where (ch ->> 'id')::uuid = p_id
   limit 1;
$$;

revoke all on function public._post_message(uuid, text, uuid, text), public._character_name(jsonb, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 진행 RPC 에 시스템 메시지 추가 (R3-B 의 함수를 같은 규칙으로 다시 정의)
-- ---------------------------------------------------------------------------
create or replace function public.start_game(p_room uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
  v_players integer;
  v_unready integer;
  v_unassigned integer;
begin
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where not p.ready)
    into v_players, v_unready
    from public.room_players p where p.room_id = p_room;

  if v_players < 1 or (not coalesce(p_force, false) and v_players < 2) then
    raise exception 'not_enough_players' using errcode = 'P0001';
  end if;
  if not coalesce(p_force, false) and v_unready > 0 then
    raise exception 'players_not_ready' using errcode = 'P0001';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;

  if coalesce(p_force, false) then
    perform public._assign_unassigned(p_room, v_snapshot);
  else
    select count(*) into v_unassigned
      from public.room_players p
     where p.room_id = p_room
       and not exists (select 1 from public.room_assignments a
                        where a.room_id = p_room and a.user_id = p.user_id);
    if v_unassigned > 0 then
      raise exception 'unassigned_players' using errcode = 'P0001';
    end if;
  end if;

  update public.rooms set status = 'intro' where id = p_room;
  perform public._post_message(p_room, 'system', null, '게임이 시작되었습니다. 각자 자신의 인물을 확인하세요.');
end;
$$;

create or replace function public.start_round(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
  v_next integer;
  v_round jsonb;
  v_limit integer;
  v_vote boolean;
begin
  if r.status not in ('intro', 'break') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  v_next := r.current_round_index + 1;
  v_round := v_snapshot -> 'rounds' -> v_next;
  if v_round is null then
    raise exception 'no_more_rounds' using errcode = 'P0001';
  end if;

  v_limit := nullif(v_round ->> 'timeLimitSeconds', '')::integer;
  v_vote := v_round -> 'allowedActions' @> '"vote"'::jsonb;

  update public.rooms
     set status = case when v_vote then 'voting' else 'round' end,
         current_round_index = v_next,
         round_started_at = now(),
         timer_ends_at = case when coalesce(v_limit, 0) > 0 then now() + make_interval(secs => v_limit) end,
         timer_paused_remaining = null
   where id = p_room;

  perform public._post_message(
    p_room, 'system', null,
    format('%s라운드 시작: %s', v_next + 1, coalesce(v_round ->> 'name', ''))
  );
  if v_vote then
    perform public._post_message(p_room, 'system', null, '투표가 시작되었습니다. 범인으로 의심되는 인물에게 투표하세요.');
  end if;
end;
$$;

create or replace function public.end_round(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status not in ('round', 'voting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.rooms
     set status = 'break', timer_ends_at = null, timer_paused_remaining = null
   where id = p_room;
  perform public._post_message(p_room, 'system', null, '라운드가 종료되었습니다.');
end;
$$;

create or replace function public.start_vote(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status not in ('round', 'break') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.rooms
     set status = 'voting', timer_ends_at = null, timer_paused_remaining = null
   where id = p_room;
  perform public._post_message(p_room, 'system', null, '투표가 시작되었습니다. 범인으로 의심되는 인물에게 투표하세요.');
end;
$$;

-- 게임 종료 + 결말 선택 (지정하지 않으면 첫 번째 결말). 결말 내용은 GM 이 단계별로 공개한다.
drop function public.finish_game(uuid);

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
    v_ending := nullif(v_snapshot -> 'endings' -> 0 ->> 'id', '')::uuid;
  elsif not exists (
    select 1 from jsonb_array_elements(v_snapshot -> 'endings') e where (e ->> 'id')::uuid = v_ending
  ) then
    raise exception 'ending not found' using errcode = 'P0002';
  end if;

  update public.rooms
     set status = 'ended', ending_id = v_ending, ending_step = 1,
         timer_ends_at = null, timer_paused_remaining = null
   where id = p_room;
  perform public._post_message(p_room, 'system', null, '게임이 종료되었습니다. 결말을 공개합니다.');
end;
$$;

-- 결말을 다음 단계(투표 결과 → 진실 → 후일담)로 공개한다.
create or replace function public.advance_ending(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status <> 'ended' or r.ending_step >= 3 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.rooms set ending_step = ending_step + 1 where id = p_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 내 인물 카드 (본인 것만)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_character(p_room uuid)
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
  v_char_id uuid;
  v_char jsonb;
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

  select a.character_id into v_char_id
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char_id is null then
    return null;
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  select c into v_char
    from jsonb_array_elements(v_snapshot -> 'characters') c
   where (c ->> 'id')::uuid = v_char_id;

  return jsonb_build_object(
    'id', v_char -> 'id',
    'name', v_char -> 'name',
    'publicInfo', v_char -> 'publicInfo',
    'secretInfo', v_char -> 'secretInfo',
    'background', v_char -> 'background',
    'personalGoal', v_char -> 'personalGoal',
    'roleType', v_char -> 'roleType',
    'liePolicy', v_char -> 'liePolicy',
    'lieNote', v_char -> 'lieNote',
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'targetName', public._character_name(v_snapshot, (rel ->> 'targetId')::uuid),
               'description', rel -> 'description'))
        from jsonb_array_elements(coalesce(v_char -> 'relations', '[]'::jsonb)) rel
    ), '[]'::jsonb),
    -- 이미 시작한 라운드의 추가 정보만
    'roundInfos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'roundName', x -> 'name', 'text', v_char -> 'roundInfos' ->> (x ->> 'id')) order by o)
        from jsonb_array_elements(v_snapshot -> 'rounds') with ordinality as t(x, o)
       where o - 1 <= r.current_round_index
         and coalesce(v_char -> 'roundInfos' ->> (x ->> 'id'), '') <> ''
    ), '[]'::jsonb)
  );
end;
$$;

-- GM 진행 자료: 진실·범인·타임라인·모든 인물의 비밀·힌트 (GM 만)
create or replace function public.get_gm_guide(p_room uuid)
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
  if not found or r.gm_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select v.snapshot from public.scenario_versions v where v.id = r.scenario_version_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 힌트 카드 뽑기 / 내 증거 보관함
-- ---------------------------------------------------------------------------
create or replace function public.draw_card(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.rooms;
  v_snapshot jsonb;
  v_round jsonb;
  v_char uuid;
  v_clue jsonb;
  v_public boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- 같은 방의 동시 뽑기를 직렬화해 같은 카드가 두 번 나가지 않게 한다.
  select * into r from public.rooms where id = p_room for update;
  if not found or not exists (
    select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'round' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  v_round := v_snapshot -> 'rounds' -> r.current_round_index;
  if not (v_round -> 'allowedActions' @> '"draw_card"'::jsonb) then
    raise exception 'action_not_allowed' using errcode = 'P0001';
  end if;

  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (select count(*) from public.room_clues rc
       where rc.room_id = p_room and rc.holder_id = v_uid and rc.round_index = r.current_round_index) >= 3 then
    raise exception 'draw_limit' using errcode = 'P0001';
  end if;

  -- 획득 라운드가 지정된 힌트는 그 라운드에서만, 지정이 없으면 아무 때나 뽑힌다.
  select c into v_clue
    from jsonb_array_elements(v_snapshot -> 'clues') c
   where not exists (select 1 from public.room_clues rc
                      where rc.room_id = p_room and rc.clue_id = (c ->> 'id')::uuid)
     and ((c ->> 'acquireRoundId') is null or (c ->> 'acquireRoundId') = (v_round ->> 'id'))
   order by random()
   limit 1;
  if v_clue is null then
    raise exception 'no_clues' using errcode = 'P0001';
  end if;

  v_public := (v_clue ->> 'visibility') = 'everyone';
  insert into public.room_clues (room_id, clue_id, holder_id, is_public, round_index)
  values (p_room, (v_clue ->> 'id')::uuid, v_uid, v_public, r.current_round_index);

  perform public._post_message(
    p_room, 'system', null,
    case when v_public
      then format('%s이(가) 공개 단서를 얻었습니다: %s', public._character_name(v_snapshot, v_char), v_clue ->> 'title')
      else format('%s이(가) 단서를 얻었습니다.', public._character_name(v_snapshot, v_char))
    end
  );

  return jsonb_build_object(
    'id', v_clue -> 'id', 'title', v_clue -> 'title', 'body', v_clue -> 'body', 'kind', v_clue -> 'kind'
  );
end;
$$;

-- 내가 볼 수 있는 획득 힌트: 내가 뽑은 것 + 전체 공개된 것. GM 은 획득된 모든 힌트(참/거짓 포함).
create or replace function public.get_my_clues(p_room uuid)
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

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', c -> 'id',
               'title', c -> 'title',
               'body', c -> 'body',
               'kind', c -> 'kind',
               'isPublic', rc.is_public,
               'mine', rc.holder_id = v_uid,
               'roundIndex', rc.round_index,
               'holderName', public._character_name(v_snapshot,
                  (select a.character_id from public.room_assignments a
                    where a.room_id = rc.room_id and a.user_id = rc.holder_id))
             ) || case when v_is_gm then jsonb_build_object('isTrue', c -> 'isTrue') else '{}'::jsonb end
             order by rc.acquired_at
           )
      from public.room_clues rc
      join lateral (
        select cc as c from jsonb_array_elements(v_snapshot -> 'clues') cc
         where (cc ->> 'id')::uuid = rc.clue_id
      ) found_clue on true
     where rc.room_id = p_room
       and (v_is_gm or rc.holder_id = v_uid or rc.is_public)
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 채팅
-- ---------------------------------------------------------------------------
create or replace function public.send_message(p_room uuid, p_body text)
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
  v_char uuid;
  v_is_gm boolean;
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
     or v_body ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  -- GM 은 언제든 공지로 말할 수 있다.
  if v_is_gm then
    perform public._post_message(p_room, 'gm', null, v_body);
    return;
  end if;

  if r.status = 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if r.status in ('round', 'voting') then
    select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
    if not ((v_snapshot -> 'rounds' -> r.current_round_index -> 'allowedActions') @> '"chat"'::jsonb) then
      raise exception 'chat_not_allowed' using errcode = 'P0001';
    end if;
  end if;

  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 도배 방지: 5초 안에 5개까지
  if (select count(*) from public.room_messages m
       where m.room_id = p_room and m.kind = 'chat' and m.character_id = v_char
         and m.created_at > now() - interval '5 seconds') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  perform public._post_message(p_room, 'chat', v_char, v_body);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 투표
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(p_room uuid, p_target uuid)
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
  v_total integer;
  v_voted integer;
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
  if r.status <> 'voting' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select a.character_id into v_char
    from public.room_assignments a where a.room_id = p_room and a.user_id = v_uid;
  if v_char is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  if p_target is null or public._character_name(v_snapshot, p_target) is null then
    raise exception 'character not found' using errcode = 'P0002';
  end if;
  if p_target = v_char then
    raise exception 'cannot_vote_self' using errcode = 'P0001';
  end if;

  begin
    insert into public.room_votes (room_id, voter_id, target_character_id)
    values (p_room, v_uid, p_target);
  exception when unique_violation then
    raise exception 'already_voted' using errcode = 'P0001';
  end;

  select count(*) into v_total from public.room_players p where p.room_id = p_room;
  select count(*) into v_voted from public.room_votes v where v.room_id = p_room;
  if v_voted >= v_total then
    perform public._post_message(p_room, 'system', null, '모든 참가자가 투표를 마쳤습니다.');
  end if;
end;
$$;

-- 투표 현황 (누가 누구에게 투표했는지는 결말 공개 전에는 나오지 않는다)
create or replace function public.get_vote_status(p_room uuid)
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

  return jsonb_build_object(
    'total', (select count(*) from public.room_players p where p.room_id = p_room),
    'voted', (select count(*) from public.room_votes v where v.room_id = p_room),
    'myVote', (select v.target_character_id from public.room_votes v
                where v.room_id = p_room and v.voter_id = v_uid),
    'pending', case when v_is_gm then coalesce((
        select jsonb_agg(p.nickname order by p.joined_at)
          from public.room_players p
         where p.room_id = p_room
           and not exists (select 1 from public.room_votes v
                            where v.room_id = p_room and v.voter_id = p.user_id)
      ), '[]'::jsonb) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 결말 (방이 종료된 뒤, GM 이 공개한 단계까지만)
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

  -- 2단계: 진실
  if r.ending_step >= 2 then
    v_result := v_result || jsonb_build_object(
      'culprits', coalesce((
        select jsonb_agg(ch -> 'name')
          from jsonb_array_elements(v_snapshot -> 'characters') ch
         where ch ->> 'roleType' = 'culprit'
      ), '[]'::jsonb),
      'ending', case when v_ending is null then null else jsonb_build_object(
        'name', v_ending -> 'name',
        'resultText', v_ending -> 'resultText',
        'truthText', v_ending -> 'truthText'
      ) end
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
-- get_room_overview: 시작한 라운드의 해금 내용과 결말 공개 단계를 추가한다.
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
      'endingStep', r.ending_step
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
  public.finish_game(uuid, uuid),
  public.advance_ending(uuid),
  public.get_my_character(uuid),
  public.get_gm_guide(uuid),
  public.draw_card(uuid),
  public.get_my_clues(uuid),
  public.send_message(uuid, text),
  public.cast_vote(uuid, uuid),
  public.get_vote_status(uuid),
  public.get_ending(uuid)
from public, anon;

grant execute on function
  public.finish_game(uuid, uuid),
  public.advance_ending(uuid),
  public.get_my_character(uuid),
  public.get_gm_guide(uuid),
  public.draw_card(uuid),
  public.get_my_clues(uuid),
  public.send_message(uuid, text),
  public.cast_vote(uuid, uuid),
  public.get_vote_status(uuid),
  public.get_ending(uuid)
to authenticated;
