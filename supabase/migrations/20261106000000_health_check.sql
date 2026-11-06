-- 외부 크론이 프로젝트의 실제 DB 연결을 확인할 때 호출한다.
-- 데이터는 읽거나 변경하지 않으며, anon 역할에는 이 함수 실행 권한만 부여한다.
create or replace function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon;
