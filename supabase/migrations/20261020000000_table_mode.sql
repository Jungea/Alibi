-- R5-A: 대면 모드 (진행 방식 선택, 테이블 화면)
--
-- 보안 원칙
--  * 테이블 화면은 TV 에 띄우는 공용 화면이다. get_table_view 는 GM 만 호출할 수 있고,
--    모두에게 공개된 정보(공개 힌트, 공개 인물 소개, 시작한 라운드)만 돌려준다.
--    인물 배정(누가 어느 인물인지), 비밀 정보, 개인 힌트, 귓속말, 미션, 투표자는 포함하지 않는다.
--  * 대면형 방에서는 참가자 채팅을 서버에서도 막는다 (GM 공지는 가능).

alter table public.rooms
  add column play_mode text not null default 'chat' check (play_mode in ('chat', 'face')),
  -- 외부 음성 대화 링크 (디스코드 등). http/https 만 허용한다.
  add column voice_link text check (
    voice_link is null or (char_length(voice_link) <= 300 and voice_link ~ '^https?://[^\s]+$')
  );

create or replace function public.set_room_mode(p_room uuid, p_mode text, p_voice_link text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms := public._lock_room_for_gm(p_room);
  v_link text := nullif(btrim(coalesce(p_voice_link, '')), '');
begin
  if r.status = 'ended' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_mode is null or p_mode not in ('chat', 'face') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if v_link is not null and not (char_length(v_link) <= 300 and v_link ~ '^https?://[^\s]+$') then
    raise exception 'invalid_link' using errcode = '22023';
  end if;
  update public.rooms set play_mode = p_mode, voice_link = v_link where id = r.id;
end;
$$;

-- 테이블 화면용 공개 정보 (GM 전용)
create or replace function public.get_table_view(p_room uuid)
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

  return jsonb_build_object(
    'serverNow', now(),
    'code', r.code,
    'status', r.status,
    'playMode', r.play_mode,
    'voiceLink', r.voice_link,
    'currentRoundIndex', r.current_round_index,
    'timerEndsAt', r.timer_ends_at,
    'timerPausedRemaining', r.timer_paused_remaining,
    'endingStep', r.ending_step,
    'maxPlayers', r.max_players,
    'scenario', jsonb_build_object(
      'title', v_snapshot #>> '{scenario,title}',
      'genre', v_snapshot #>> '{scenario,genre}',
      'victim', case when r.status <> 'lobby' then v_snapshot #>> '{scenario,victim}' end,
      'incidentTime', case when r.status <> 'lobby' then v_snapshot #>> '{scenario,incidentTime}' end,
      'incidentPlace', case when r.status <> 'lobby' then v_snapshot #>> '{scenario,incidentPlace}' end,
      'openingText', case when r.status <> 'lobby' then v_snapshot #>> '{scenario,openingText}' end
    ),
    -- 닉네임만 (어느 인물인지는 없다)
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'ready', p.ready) order by p.joined_at)
        from public.room_players p where p.room_id = p_room
    ), '[]'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object('name', c -> 'name', 'publicInfo', c -> 'publicInfo') order by o)
        from jsonb_array_elements(v_snapshot -> 'characters') with ordinality as t(c, o)
    ), '[]'::jsonb),
    -- 시작한 라운드의 공개 정보만
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x -> 'name', 'goal', x -> 'goal', 'unlockContent', x -> 'unlockContent'
             ) order by o)
        from jsonb_array_elements(v_snapshot -> 'rounds') with ordinality as t(x, o)
       where o - 1 <= r.current_round_index
    ), '[]'::jsonb),
    -- 전체 공개 힌트만
    'clues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', rc.clue_id,
               'title', cl ->> 'title',
               'body', cl ->> 'body',
               'kind', cl ->> 'kind',
               'roundIndex', rc.round_index
             ) order by rc.acquired_at)
        from public.room_clues rc
        join lateral (
          select c as cl from jsonb_array_elements(v_snapshot -> 'clues') c
           where (c ->> 'id')::uuid = rc.clue_id limit 1
        ) j on true
       where rc.room_id = p_room and rc.is_public
    ), '[]'::jsonb),
    -- 투표는 몇 명이 했는지만 (결과는 결말 공개 단계에서 get_ending 으로)
    'votes', jsonb_build_object(
      'total', (select count(*) from public.room_players p where p.room_id = p_room),
      'voted', (select count(*) from public.room_votes v where v.room_id = p_room)
    )
  );
end;
$$;

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
  if r.play_mode = 'face' then
    raise exception 'chat_disabled' using errcode = 'P0001';
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
      'whisperNotice', r.whisper_notice,
      'playMode', r.play_mode,
      'voiceLink', r.voice_link
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

revoke all on function
  public.set_room_mode(uuid, text, text),
  public.get_table_view(uuid),
  public.send_message(uuid, text, text, uuid, uuid),
  public.get_room_overview(uuid)
from public, anon;

grant execute on function
  public.set_room_mode(uuid, text, text),
  public.get_table_view(uuid),
  public.send_message(uuid, text, text, uuid, uuid),
  public.get_room_overview(uuid)
to authenticated;
