-- R3-A/B: 게임방 (방, 참가자, 인물 배정, 진행 상태 전환 RPC)
--
-- 보안 원칙
--  * rooms / room_players / room_assignments 는 클라이언트가 직접 쓸 수 없다. 모든 변경은 RPC 를 거친다.
--  * 조회는 같은 방의 참가자(와 GM)만 가능하다. 누가 어떤 인물인지(room_assignments)는 본인과 GM 만 본다.
--  * 발행본 원본(범인·진실)은 참가자가 직접 읽을 수 없다. get_room_overview 가 공개 가능한 부분만 돌려준다.
--  * 모든 RPC 는 호출자·방 소속·GM 여부·방 단계를 검사한다.
--  * 익명 로그인 사용자(role 은 authenticated)도 join_room 으로 입장할 수 있지만 방을 만들 수는 없다.

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 헷갈리는 글자(I, O, 0, 1)를 뺀 6자리
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  gm_id uuid not null references auth.users (id) on delete cascade,
  scenario_version_id uuid not null references public.scenario_versions (id) on delete cascade,
  max_players integer not null check (max_players between 1 and 30),
  -- lobby(대기실) → intro(인물 확인) → round ⇄ break → voting → ended
  status text not null default 'lobby'
    check (status in ('lobby', 'intro', 'round', 'break', 'voting', 'ended')),
  -- 시나리오 rounds 배열의 인덱스. 아직 시작 전이면 -1
  current_round_index integer not null default -1 check (current_round_index >= -1),
  round_started_at timestamptz,
  -- 실행 중인 타이머의 종료 시각. 클라이언트는 이 값과 서버 시각의 차이로 남은 시간을 계산한다.
  timer_ends_at timestamptz,
  -- 일시정지 중이면 남은 초 (이때 timer_ends_at 은 null)
  timer_paused_remaining integer check (timer_paused_remaining is null or timer_paused_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (timer_ends_at is null or timer_paused_remaining is null)
);

create index rooms_gm_id_idx on public.rooms (gm_id, created_at desc);
create index rooms_scenario_version_id_idx on public.rooms (scenario_version_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- room_players: 참가자 (GM 은 포함되지 않는다)
-- ---------------------------------------------------------------------------
create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),

  primary key (room_id, user_id)
);

create unique index room_players_nickname_idx on public.room_players (room_id, lower(nickname));
create index room_players_user_id_idx on public.room_players (user_id);

-- ---------------------------------------------------------------------------
-- room_assignments: 누가 어떤 인물인지 (본인과 GM 만 조회)
-- ---------------------------------------------------------------------------
create table public.room_assignments (
  room_id uuid not null,
  user_id uuid not null,
  -- 발행본 snapshot.characters[].id
  character_id uuid not null,

  primary key (room_id, user_id),
  unique (room_id, character_id),
  foreign key (room_id, user_id) references public.room_players (room_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- join_attempts: 초대 코드 시도 기록 (무차별 대입 방지). 직접 접근 불가.
-- ---------------------------------------------------------------------------
create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- 정책에서 쓰는 소속 확인 함수 (security definer 로 RLS 순환 참조를 피한다)
-- ---------------------------------------------------------------------------
create or replace function public.is_room_gm(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms r
     where r.id = p_room and r.gm_id = (select auth.uid())
  );
$$;

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players p
     where p.room_id = p_room and p.user_id = (select auth.uid())
  );
$$;

create or replace function public.room_started(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms r where r.id = p_room and r.status <> 'lobby'
  );
$$;

revoke all on function public.is_room_gm(uuid), public.is_room_member(uuid), public.room_started(uuid)
  from public, anon;
grant execute on function public.is_room_gm(uuid), public.is_room_member(uuid), public.room_started(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: 조회만 허용한다. INSERT/UPDATE/DELETE 정책이 없고 권한도 회수한다.
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_assignments enable row level security;
alter table public.join_attempts enable row level security;

create policy rooms_select_member on public.rooms
  for select to authenticated
  using (gm_id = (select auth.uid()) or public.is_room_member(id));

create policy room_players_select_member on public.room_players
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_room_gm(room_id));

create policy room_assignments_select_self_or_gm on public.room_assignments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.room_started(room_id))
    or public.is_room_gm(room_id)
  );

revoke all on public.rooms, public.room_players, public.room_assignments, public.join_attempts
  from anon, authenticated;
grant select on public.rooms, public.room_players, public.room_assignments to authenticated;

-- 실시간 변경 알림 (Supabase 에서만 존재하는 publication). 알림에도 RLS 가 적용된다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rooms, public.room_players;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 내부 함수 (다른 RPC 안에서만 호출. 클라이언트에는 실행 권한을 주지 않는다)
-- ---------------------------------------------------------------------------

-- 호출자가 GM 인 방을 잠그고 돌려준다.
create or replace function public._lock_room_for_gm(p_room uuid)
returns public.rooms
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
  select * into r from public.rooms where id = p_room for update;
  if not found or r.gm_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return r;
end;
$$;

-- 인물이 없는 참가자에게 아직 쓰지 않은 인물을 무작위로 배정한다.
-- 인물 수가 모자라면 범인을 먼저 포함해 고른다 (범인이 빠진 판이 되지 않도록).
create or replace function public._assign_unassigned(p_room uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing integer;
  v_free integer;
begin
  select count(*) into v_missing
    from public.room_players p
   where p.room_id = p_room
     and not exists (select 1 from public.room_assignments a
                      where a.room_id = p_room and a.user_id = p.user_id);
  if v_missing = 0 then
    return;
  end if;

  select count(*) into v_free
    from jsonb_array_elements(p_snapshot -> 'characters') c
   where not exists (select 1 from public.room_assignments a
                      where a.room_id = p_room and a.character_id = (c ->> 'id')::uuid);
  if v_free < v_missing then
    raise exception 'not_enough_characters' using errcode = 'P0001';
  end if;

  insert into public.room_assignments (room_id, user_id, character_id)
  with players as (
    select p.user_id, row_number() over (order by random()) as rn
      from public.room_players p
     where p.room_id = p_room
       and not exists (select 1 from public.room_assignments a
                        where a.room_id = p_room and a.user_id = p.user_id)
  ),
  free_chars as (
    select (c ->> 'id')::uuid as id,
           row_number() over (order by (c ->> 'roleType' = 'culprit') desc, random()) as pick
      from jsonb_array_elements(p_snapshot -> 'characters') c
     where not exists (select 1 from public.room_assignments a
                        where a.room_id = p_room and a.character_id = (c ->> 'id')::uuid)
  ),
  picked as (
    select id, row_number() over (order by random()) as rn
      from free_chars
     where pick <= v_missing
  )
  select p_room, players.user_id, picked.id
    from players
    join picked on picked.rn = players.rn;
end;
$$;

revoke all on function public._lock_room_for_gm(uuid), public._assign_unassigned(uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: 방 만들기 (정식 계정의 제작자만, 본인이 발행한 버전으로)
-- ---------------------------------------------------------------------------
create or replace function public.create_room(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_snapshot jsonb;
  v_max integer;
  v_active integer;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  v_id uuid;
  i integer;
  attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_permanent_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot
    from public.scenario_versions v
   where v.id = p_version_id and v.owner_id = v_uid;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;

  v_max := jsonb_array_length(v_snapshot -> 'characters');
  if v_max < 1 or jsonb_array_length(v_snapshot -> 'rounds') < 1 then
    raise exception 'scenario is not playable' using errcode = '22023';
  end if;
  v_max := least(v_max, 30);

  select count(*) into v_active from public.rooms r where r.gm_id = v_uid and r.status <> 'ended';
  if v_active >= 10 then
    raise exception 'too_many_rooms' using errcode = 'P0001';
  end if;

  loop
    attempt := attempt + 1;
    -- 암호학적 난수(gen_random_uuid)에서 6글자를 뽑는다.
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.rooms (code, gm_id, scenario_version_id, max_players)
      values (v_code, v_uid, p_version_id, v_max)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if attempt >= 10 then
        raise exception 'code generation failed' using errcode = 'P0001';
      end if;
    end;
  end loop;

  return jsonb_build_object('roomId', v_id, 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 입장 (초대 코드 + 닉네임). 실패는 예외가 아니라 error 값으로 돌려준다
--       (예외로 끝내면 시도 기록도 함께 롤백되어 횟수 제한이 무력해진다).
-- ---------------------------------------------------------------------------
create or replace function public.join_room(p_code text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_fails integer;
  r public.rooms;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.join_attempts
   where user_id = v_uid and attempted_at < now() - interval '1 day';

  select count(*) into v_fails
    from public.join_attempts
   where user_id = v_uid and not succeeded and attempted_at > now() - interval '10 minutes';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if char_length(v_nick) not between 1 and 20 or v_nick ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_nickname');
  end if;

  select * into r from public.rooms where code = v_code for update;
  if not found then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 이미 참가 중이면 (재접속) 그대로 들어간다.
  if exists (select 1 from public.room_players p where p.room_id = r.id and p.user_id = v_uid) then
    return jsonb_build_object('ok', true, 'roomId', r.id);
  end if;

  if r.gm_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'is_gm', 'roomId', r.id);
  end if;
  if r.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'already_started');
  end if;

  select count(*) into v_count from public.room_players p where p.room_id = r.id;
  if v_count >= r.max_players then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  begin
    insert into public.room_players (room_id, user_id, nickname) values (r.id, v_uid, v_nick);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'nickname_taken');
  end;

  insert into public.join_attempts (user_id, succeeded) values (v_uid, true);
  return jsonb_build_object('ok', true, 'roomId', r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 대기실 (준비, 나가기, 내보내기)
-- ---------------------------------------------------------------------------
create or replace function public.set_ready(p_room uuid, p_ready boolean)
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
  select * into r from public.rooms where id = p_room for update;
  if not found or not exists (select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.room_players set ready = coalesce(p_ready, false)
   where room_id = p_room and user_id = v_uid;
end;
$$;

create or replace function public.leave_room(p_room uuid)
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
  select * into r from public.rooms where id = p_room for update;
  if not found or not exists (select 1 from public.room_players p where p.room_id = p_room and p.user_id = v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  delete from public.room_players where room_id = p_room and user_id = v_uid;
end;
$$;

create or replace function public.kick_player(p_room uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  delete from public.room_players where room_id = p_room and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 인물 배정 (GM)
-- ---------------------------------------------------------------------------

-- 모든 참가자의 배정을 지우고 무작위로 다시 배정한다.
create or replace function public.assign_characters(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
begin
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  delete from public.room_assignments where room_id = p_room;
  perform public._assign_unassigned(p_room, v_snapshot);
end;
$$;

-- 한 참가자에게 인물을 직접 지정한다 (p_character 가 null 이면 배정 해제).
create or replace function public.set_player_character(p_room uuid, p_user uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_snapshot jsonb;
begin
  if r.status <> 'lobby' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.room_players p where p.room_id = p_room and p.user_id = p_user) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  if p_character is null then
    delete from public.room_assignments where room_id = p_room and user_id = p_user;
    return;
  end if;

  select v.snapshot into v_snapshot from public.scenario_versions v where v.id = r.scenario_version_id;
  if not exists (
    select 1 from jsonb_array_elements(v_snapshot -> 'characters') c
     where (c ->> 'id')::uuid = p_character
  ) then
    raise exception 'character not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.room_assignments a
     where a.room_id = p_room and a.character_id = p_character and a.user_id <> p_user
  ) then
    raise exception 'character_taken' using errcode = 'P0001';
  end if;

  insert into public.room_assignments (room_id, user_id, character_id)
  values (p_room, p_user, p_character)
  on conflict (room_id, user_id) do update set character_id = excluded.character_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 진행 상태 전환 (GM)
-- ---------------------------------------------------------------------------

-- 대기실 → 인물 확인. 일반 시작은 2명 이상·전원 준비·전원 배정이 필요하고,
-- p_force 가 true 이면 준비 상태와 인원 조건을 무시하고 남은 사람을 무작위 배정한다.
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
end;
$$;

-- 인물 확인/휴식 → 다음 라운드. 라운드에 투표가 허용되면 voting 단계가 된다.
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

  update public.rooms
     set status = case when v_round -> 'allowedActions' @> '"vote"'::jsonb then 'voting' else 'round' end,
         current_round_index = v_next,
         round_started_at = now(),
         timer_ends_at = case when coalesce(v_limit, 0) > 0 then now() + make_interval(secs => v_limit) end,
         timer_paused_remaining = null
   where id = p_room;
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
end;
$$;

-- 라운드와 상관없이 투표 단계로 들어간다 (투표 라운드가 없는 시나리오용).
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
end;
$$;

create or replace function public.finish_game(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
begin
  if r.status not in ('break', 'voting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.rooms
     set status = 'ended', timer_ends_at = null, timer_paused_remaining = null
   where id = p_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 타이머 (GM)
-- ---------------------------------------------------------------------------
create or replace function public.set_timer_paused(p_room uuid, p_paused boolean)
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

  if coalesce(p_paused, false) then
    if r.timer_paused_remaining is not null then
      return; -- 이미 일시정지
    end if;
    if r.timer_ends_at is null then
      raise exception 'no_timer' using errcode = 'P0001';
    end if;
    update public.rooms
       set timer_paused_remaining = greatest(0, ceil(extract(epoch from (r.timer_ends_at - now())))::integer),
           timer_ends_at = null
     where id = p_room;
  else
    if r.timer_paused_remaining is null then
      return; -- 이미 실행 중이거나 타이머 없음
    end if;
    update public.rooms
       set timer_ends_at = now() + make_interval(secs => r.timer_paused_remaining),
           timer_paused_remaining = null
     where id = p_room;
  end if;
end;
$$;

create or replace function public.extend_timer(p_room uuid, p_seconds integer)
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
  if p_seconds is null or p_seconds = 0 or abs(p_seconds) > 3600 then
    raise exception 'invalid seconds' using errcode = '22023';
  end if;

  if r.timer_ends_at is not null then
    update public.rooms
       set timer_ends_at = greatest(now(), r.timer_ends_at + make_interval(secs => p_seconds))
     where id = p_room;
  elsif r.timer_paused_remaining is not null then
    update public.rooms
       set timer_paused_remaining = greatest(0, r.timer_paused_remaining + p_seconds)
     where id = p_room;
  elsif p_seconds > 0 then
    -- 시간 제한이 없던 라운드에 타이머를 새로 건다.
    update public.rooms set timer_ends_at = now() + make_interval(secs => p_seconds) where id = p_room;
  else
    raise exception 'no_timer' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 방 화면에 필요한 정보 (참가자와 GM)
--  * 범인·진실·타임라인·힌트·결말·인물의 비밀 정보는 포함하지 않는다.
--  * 세계관(피해자·사건 개요·오프닝)은 게임이 시작된 뒤에만 준다.
--  * 인물별 배정은 본인 것(myCharacterId)과, GM 에게만 전체(assignments)를 준다.
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
      'timerPausedRemaining', r.timer_paused_remaining
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
               'timeLimitSeconds', x -> 'timeLimitSeconds', 'allowedActions', x -> 'allowedActions'
             ) order by o)
        from jsonb_array_elements(v_snapshot -> 'rounds') with ordinality as t(x, o)
    ), '[]'::jsonb)
  );

  if v_is_gm then
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
-- 실행 권한: 로그인한 사용자(익명 포함)만. 각 함수가 내부에서 권한을 다시 검사한다.
-- ---------------------------------------------------------------------------
revoke all on function
  public.create_room(uuid),
  public.join_room(text, text),
  public.set_ready(uuid, boolean),
  public.leave_room(uuid),
  public.kick_player(uuid, uuid),
  public.assign_characters(uuid),
  public.set_player_character(uuid, uuid, uuid),
  public.start_game(uuid, boolean),
  public.start_round(uuid),
  public.end_round(uuid),
  public.start_vote(uuid),
  public.finish_game(uuid),
  public.set_timer_paused(uuid, boolean),
  public.extend_timer(uuid, integer),
  public.get_room_overview(uuid)
from public, anon;

grant execute on function
  public.create_room(uuid),
  public.join_room(text, text),
  public.set_ready(uuid, boolean),
  public.leave_room(uuid),
  public.kick_player(uuid, uuid),
  public.assign_characters(uuid),
  public.set_player_character(uuid, uuid, uuid),
  public.start_game(uuid, boolean),
  public.start_round(uuid),
  public.end_round(uuid),
  public.start_vote(uuid),
  public.finish_game(uuid),
  public.set_timer_paused(uuid, boolean),
  public.extend_timer(uuid, integer),
  public.get_room_overview(uuid)
to authenticated;
