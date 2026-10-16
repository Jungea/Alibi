-- R2-A: 시나리오 제작 기반 (테이블 + RLS + 발행 RPC + 이미지 Storage)
--
-- 보안 원칙
--  * 시나리오 원본(범인, 진실 등)은 제작자 본인만 CRUD 할 수 있다.
--  * 모든 테이블은 같은 마이그레이션에서 RLS를 켜고 정책을 만든다.
--  * 정책 안에서는 (select auth.uid()) 형태를 사용해 행마다 재평가되지 않게 한다.
--  * 익명 로그인 사용자(R3 게임방 입장용)는 시나리오를 만들 수 없다.

-- ---------------------------------------------------------------------------
-- 공통 함수
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 익명 로그인이 아닌 정식 계정인지 (익명 사용자는 role이 authenticated 로 잡힌다)
create or replace function public.is_permanent_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- ---------------------------------------------------------------------------
-- scenarios
-- ---------------------------------------------------------------------------
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  -- 1단계: 기본 정보
  title text not null default '' check (char_length(title) <= 100),
  genre text not null default '' check (char_length(genre) <= 50),
  min_players smallint not null default 4 check (min_players between 1 and 20),
  max_players smallint not null default 6 check (max_players between 1 and 20),
  estimated_minutes smallint not null default 120 check (estimated_minutes between 5 and 1440),
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  online_supported boolean not null default true,
  offline_supported boolean not null default true,
  run_mode text not null default 'gm_required'
    check (run_mode in ('gm_required', 'auto_possible', 'both')),

  -- 2단계: 세계관과 사건 개요
  background text not null default '' check (char_length(background) <= 10000),
  victim text not null default '' check (char_length(victim) <= 500),
  incident_time text not null default '' check (char_length(incident_time) <= 100),
  incident_place text not null default '' check (char_length(incident_place) <= 200),
  opening_text text not null default '' check (char_length(opening_text) <= 10000),

  -- 4단계: 진실 타임라인 (항목 수가 적고 항상 통째로 읽고 쓰므로 jsonb)
  timeline jsonb not null default '[]'::jsonb check (jsonb_typeof(timeline) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scenarios_players_range check (min_players <= max_players)
);

create index scenarios_owner_id_idx on public.scenarios (owner_id, updated_at desc);

create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- characters (3단계)
-- ---------------------------------------------------------------------------
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  position integer not null default 0,

  name text not null default '' check (char_length(name) <= 50),
  public_info text not null default '' check (char_length(public_info) <= 5000),
  secret_info text not null default '' check (char_length(secret_info) <= 10000),
  background text not null default '' check (char_length(background) <= 10000),
  -- [{ "targetId": uuid, "description": text }]
  relations jsonb not null default '[]'::jsonb check (jsonb_typeof(relations) = 'array'),
  role_type text not null default 'suspect'
    check (role_type in ('culprit', 'accomplice', 'suspect', 'witness')),
  personal_goal text not null default '' check (char_length(personal_goal) <= 2000),
  lie_policy text not null default 'partial' check (lie_policy in ('none', 'partial', 'free')),
  lie_note text not null default '' check (char_length(lie_note) <= 2000),
  -- { "<roundId>": text } 라운드별 추가 정보
  round_infos jsonb not null default '{}'::jsonb check (jsonb_typeof(round_infos) = 'object'),
  -- Storage 경로: {user_id}/{scenario_id}/{파일}
  image_path text check (image_path is null or char_length(image_path) <= 300),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_scenario_id_idx on public.characters (scenario_id, position);

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rounds (5단계)
-- ---------------------------------------------------------------------------
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  position integer not null default 0,

  name text not null default '' check (char_length(name) <= 50),
  goal text not null default '' check (char_length(goal) <= 2000),
  -- null 이면 시간 제한 없음
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds between 0 and 86400),
  allowed_actions text[] not null default '{}',
  unlock_content text not null default '' check (char_length(unlock_content) <= 5000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rounds_scenario_id_idx on public.rounds (scenario_id, position);

create trigger rounds_set_updated_at
  before update on public.rounds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clues (6단계)
-- ---------------------------------------------------------------------------
create table public.clues (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  position integer not null default 0,

  title text not null default '' check (char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 5000),
  kind text not null default 'evidence'
    check (kind in ('evidence', 'testimony', 'document', 'other')),
  acquire_condition text not null default '' check (char_length(acquire_condition) <= 1000),
  acquire_round_id uuid references public.rounds (id) on delete set null,
  visibility text not null default 'acquirer' check (visibility in ('acquirer', 'everyone')),
  is_true boolean not null default true,
  linked_character_id uuid references public.characters (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clues_scenario_id_idx on public.clues (scenario_id, position);

create trigger clues_set_updated_at
  before update on public.clues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- missions (7단계)
-- ---------------------------------------------------------------------------
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  position integer not null default 0,

  title text not null default '' check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 2000),
  scope text not null default 'personal' check (scope in ('personal', 'common')),
  character_id uuid references public.characters (id) on delete set null,
  judge_type text not null default 'gm' check (judge_type in ('auto', 'self_report', 'gm')),
  hidden boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index missions_scenario_id_idx on public.missions (scenario_id, position);

create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- endings (8단계)
-- ---------------------------------------------------------------------------
create table public.endings (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  position integer not null default 0,

  name text not null default '' check (char_length(name) <= 100),
  condition_kind text not null default 'default'
    check (condition_kind in ('default', 'culprit_caught', 'culprit_escaped', 'mission_done', 'mission_failed')),
  condition_mission_id uuid references public.missions (id) on delete set null,
  -- 결말은 단계별로 공개: 투표 결과 → 진실 → 인물별 후일담
  result_text text not null default '' check (char_length(result_text) <= 10000),
  truth_text text not null default '' check (char_length(truth_text) <= 10000),
  -- { "<characterId>": text }
  epilogues jsonb not null default '{}'::jsonb check (jsonb_typeof(epilogues) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index endings_scenario_id_idx on public.endings (scenario_id, position);

create trigger endings_set_updated_at
  before update on public.endings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- scenario_versions: 발행본 스냅샷 (불변)
-- ---------------------------------------------------------------------------
create table public.scenario_versions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  visibility text not null check (visibility in ('private', 'public')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),

  unique (scenario_id, version_no)
);

create index scenario_versions_owner_id_idx on public.scenario_versions (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: scenarios (제작자 본인만 CRUD, 익명 계정은 생성 불가)
-- ---------------------------------------------------------------------------
alter table public.scenarios enable row level security;

create policy scenarios_select_owner on public.scenarios
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy scenarios_insert_owner on public.scenarios
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_permanent_user());

create policy scenarios_update_owner on public.scenarios
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy scenarios_delete_owner on public.scenarios
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: 하위 테이블 (부모 시나리오의 제작자만 CRUD)
-- ---------------------------------------------------------------------------
alter table public.characters enable row level security;
alter table public.rounds enable row level security;
alter table public.clues enable row level security;
alter table public.missions enable row level security;
alter table public.endings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['characters', 'rounds', 'clues', 'missions', 'endings']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.scenarios s
                        where s.id = scenario_id and s.owner_id = (select auth.uid())))',
      t || '_select_owner', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (exists (select 1 from public.scenarios s
                             where s.id = scenario_id and s.owner_id = (select auth.uid())))',
      t || '_insert_owner', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (exists (select 1 from public.scenarios s
                        where s.id = scenario_id and s.owner_id = (select auth.uid())))
         with check (exists (select 1 from public.scenarios s
                             where s.id = scenario_id and s.owner_id = (select auth.uid())))',
      t || '_update_owner', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (exists (select 1 from public.scenarios s
                        where s.id = scenario_id and s.owner_id = (select auth.uid())))',
      t || '_delete_owner', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: scenario_versions
--  * 스냅샷에는 범인/진실이 들어 있으므로 공개 발행(public)이어도 직접 조회는 제작자만 가능하다.
--    (게임방 참가자 접근과 공개 목록용 요약 뷰는 R3 이후에 별도 정책/RPC로 추가한다.)
--  * UPDATE / DELETE 정책을 만들지 않아 발행본은 수정·삭제할 수 없다.
-- ---------------------------------------------------------------------------
alter table public.scenario_versions enable row level security;

create policy scenario_versions_select_owner on public.scenario_versions
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy scenario_versions_insert_owner on public.scenario_versions
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.scenarios s
                where s.id = scenario_id and s.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- RPC: 발행 (security invoker 이므로 RLS가 그대로 적용된다)
-- ---------------------------------------------------------------------------
create or replace function public.publish_scenario(
  p_scenario_id uuid,
  p_visibility text,
  p_snapshot jsonb
)
returns table (version_id uuid, version_no integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := (select auth.uid());
  v_next integer;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_visibility not in ('private', 'public') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;

  -- RLS 때문에 본인 시나리오가 아니면 조회되지 않는다.
  perform 1 from public.scenarios s where s.id = p_scenario_id and s.owner_id = v_owner;
  if not found then
    raise exception 'scenario not found' using errcode = 'P0002';
  end if;

  -- 같은 시나리오의 동시 발행에서 버전 번호가 겹치지 않게 직렬화한다.
  perform pg_advisory_xact_lock(hashtext(p_scenario_id::text));

  select coalesce(max(v.version_no), 0) + 1
    into v_next
    from public.scenario_versions v
   where v.scenario_id = p_scenario_id;

  insert into public.scenario_versions (scenario_id, owner_id, version_no, visibility, snapshot)
  values (p_scenario_id, v_owner, v_next, p_visibility, p_snapshot)
  returning id into v_id;

  return query select v_id, v_next;
end;
$$;

revoke all on function public.publish_scenario(uuid, text, jsonb) from public, anon;
grant execute on function public.publish_scenario(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: 인물 일러스트 (비공개 버킷, 본인 폴더에만 접근)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scenario-images',
  'scenario-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy scenario_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy scenario_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_permanent_user()
  );

create policy scenario_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy scenario_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
