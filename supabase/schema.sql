/* ═══════════════════════════════════════════════════════════════════════════
   منصة الاختبار اللحظي — Supabase schema
   Realtime live-quiz engine (teacher console + student clients)

   SECURITY MODEL
   ──────────────
   • The browser only ever holds the *publishable* (anon) key.
   • Students have NO direct write access to anything. Every write goes through
     a SECURITY DEFINER RPC that re-validates identity, timing and payloads.
   • The correct answer index is NEVER stored in any table a student can read.
     It lives only inside public.questions (no public SELECT policy) and is
     disclosed exclusively by settle_question() — which refuses to run before
     the question timer has expired (teachers may force it).
   • Points / correctness are written to public.results, which has no public
     SELECT policy. Students receive them only through the reveal payload.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Nothing in this schema depends on pgcrypto; install it only if you want it. */
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'quiz_live: pgcrypto غير متاح — لا بأس، المخطّط لا يعتمد عليه';
end $$;

/* ─────────────────────────────  enums  ─────────────────────────────────── */
do $$
begin
  create type public.session_status as enum
    ('lobby', 'question', 'reveal', 'between', 'finished');
exception when duplicate_object then null;
end $$;

/* ─────────────────────────────  tables  ────────────────────────────────── */

create table if not exists public.teachers (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  full_name  text not null default 'المعلّم',
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  lesson        smallint not null default 0 check (lesson between 0 and 5),
  position      int not null default 0,
  body          text not null,
  figure        jsonb,
  options       jsonb not null check (jsonb_typeof(options) = 'array'
                                     and jsonb_array_length(options) between 2 and 6),
  correct_index smallint not null check (correct_index between 0 and 5),
  explanation   text not null default '',
  number_line   jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null default 'اختبار الاقترانات',
  status             public.session_status not null default 'lobby',
  is_open            boolean not null default true,
  question_seconds   smallint not null default 20 check (question_seconds between 5 and 300),
  question_ids       uuid[] not null default '{}',
  question_index     int not null default -1,
  question_started_at timestamptz,
  question_ends_at   timestamptz,
  revealed_at        timestamptz,
  teacher_id         uuid references public.teachers (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz
);

create table if not exists public.session_codes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_count  int not null default 0,
  revoked     boolean not null default false
);

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  client_key text not null check (char_length(client_key) between 8 and 80),
  name       text not null check (char_length(name) between 1 and 24),
  avatar     text not null default '🙂',
  banner     text not null default 'b0',
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  unique (session_id, client_key)
);

create table if not exists public.answers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  slot       int not null check (slot >= 0),
  chosen     smallint check (chosen between 0 and 5),
  ms_taken   int check (ms_taken between 0 and 600000),
  created_at timestamptz not null default now(),
  unique (session_id, player_id, slot)
);

create table if not exists public.results (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  slot        int not null check (slot >= 0),
  correct     boolean not null default false,
  points      int not null default 0,
  answered    boolean not null default false,
  ms_taken    int,
  revealed_at timestamptz not null default now(),
  unique (session_id, player_id, slot)
);

create table if not exists public.player_stats (
  session_id   uuid not null references public.sessions (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  total_points int not null default 0,
  correct      int not null default 0,
  wrong        int not null default 0,
  skipped      int not null default 0,
  best_ms      int,
  fastest_slot int,
  rank         int,
  primary key (session_id, player_id)
);

/* ─────────────────────────────  indexes  ───────────────────────────────── */
create index if not exists players_session_idx  on public.players (session_id);
create index if not exists players_seen_idx     on public.players (session_id, last_seen desc);
create index if not exists answers_session_idx  on public.answers (session_id, slot);
create index if not exists answers_player_idx   on public.answers (player_id);
create index if not exists results_session_idx  on public.results (session_id, slot);
create index if not exists results_player_idx   on public.results (player_id);
create index if not exists stats_session_rank   on public.player_stats (session_id, total_points desc);
create index if not exists codes_session_idx    on public.session_codes (session_id, created_at desc);
create index if not exists codes_expiry_idx     on public.session_codes (expires_at);
create index if not exists questions_active_idx on public.questions (is_active, position);

/* ─────────────────────────────  triggers  ──────────────────────────────── */
create or replace function public.tg_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_questions_touch on public.questions;
create trigger trg_questions_touch before update on public.questions
  for each row execute function public.tg_touch();

drop trigger if exists trg_sessions_touch on public.sessions;
create trigger trg_sessions_touch before update on public.sessions
  for each row execute function public.tg_touch();

/* Keeps sessions.question_ends_at consistent when nothing else changed. */
create or replace function public.tg_bump_session()
returns trigger language plpgsql as $$
begin
  update public.sessions set updated_at = now() where id = new.session_id;
  return new;
end $$;

drop trigger if exists trg_answers_bump on public.answers;
create trigger trg_answers_bump after insert on public.answers
  for each row execute function public.tg_bump_session();

drop trigger if exists trg_players_bump on public.players;
create trigger trg_players_bump after insert on public.players
  for each row execute function public.tg_bump_session();

/* ────────────────────────────  helpers  ────────────────────────────────── */
/* NOTE: these must come AFTER the tables above — PostgreSQL validates the
   SQL inside a plpgsql body at CREATE time, so public.teachers and
   public.session_codes have to exist first. */

/* Generates an unambiguous 6-char code (no 0/O/1/I/L/U). Format: ABC-DEF.
   Uses only core built-ins (md5 / random / gen_random_uuid) — never pgcrypto —
   because these functions pin `search_path = public, pg_temp`, and Supabase
   installs pgcrypto into the `extensions` schema which is NOT on that path. */
create or replace function public.gen_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  raw text;
  v_code text;
begin
  loop
    raw := translate(
             substr(md5(random()::text || clock_timestamp()::text
                        || gen_random_uuid()::text), 1, 16),
             '0123456789abcdef', 'ABCDEFGHJKMNPQRSTVWXYZ');
    v_code := upper(substr(raw, 1, 3)) || '-' || upper(substr(raw, 4, 3));
    exit when not exists (
      select 1 from public.session_codes where code = v_code
    );
  end loop;
  return v_code;
end $$;

/* Is the caller (auth.uid()) a registered teacher? SECURITY DEFINER so it can
   read public.teachers despite RLS. */
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.teachers t where t.id = auth.uid());
$$;

create or replace function public.assert_teacher()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.teachers where id = v) then
    raise exception 'غير مصرّح: هذا الإجراء للمعلّم فقط' using errcode = '42501';
  end if;
  return v;
end $$;

/* ─────────────────────────────  RLS  ───────────────────────────────────── */
alter table public.teachers      enable row level security;
alter table public.questions     enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_codes enable row level security;
alter table public.players       enable row level security;
alter table public.answers       enable row level security;
alter table public.results       enable row level security;
alter table public.player_stats  enable row level security;

do $$
begin
  -- teachers: read own row only
  if not exists (select 1 from pg_policies where tablename = 'teachers') then
    create policy teachers_self_read on public.teachers
      for select to authenticated using (id = auth.uid());
  end if;

  -- questions: students read active ones, teachers manage all
  if not exists (select 1 from pg_policies where tablename = 'questions') then
    create policy questions_public_read on public.questions
      for select to anon, authenticated using (is_active);
    create policy questions_teacher_all on public.questions
      for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
  end if;

  -- sessions: everyone may read (no secrets inside), only teachers write
  if not exists (select 1 from pg_policies where tablename = 'sessions') then
    create policy sessions_public_read on public.sessions
      for select to anon, authenticated using (true);
    create policy sessions_teacher_write on public.sessions
      for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
  end if;

  -- codes: read non-revoked, teachers write
  if not exists (select 1 from pg_policies where tablename = 'session_codes') then
    create policy codes_public_read on public.session_codes
      for select to anon, authenticated using (not revoked);
    create policy codes_teacher_write on public.session_codes
      for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
  end if;

  -- players + answers: read-only for everyone; writes happen in RPCs only
  if not exists (select 1 from pg_policies where tablename = 'players') then
    create policy players_public_read on public.players
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'answers') then
    create policy answers_public_read on public.answers
      for select to anon, authenticated using (true);
  end if;

  -- results + player_stats: TEACHER READ ONLY. Students get their numbers
  -- exclusively through the reveal payload of rpc_sync_state / rpc_settle.
  if not exists (select 1 from pg_policies where tablename = 'results') then
    create policy results_teacher_read on public.results
      for select to authenticated using (public.is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'player_stats') then
    create policy stats_teacher_read on public.player_stats
      for select to authenticated using (public.is_teacher());
  end if;
end $$;

/* ───────────────────  internal read helpers  ───────────────────────────── */

/* Ranked standings for a session (no direct table access needed). */
create or replace function public.get_leaderboard(p_session uuid)
returns table (
  player_id  uuid,
  name       text,
  avatar     text,
  banner     text,
  total_points int,
  correct    int,
  answered   int,
  skipped    int,
  best_ms    int,
  rank       int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select p.id, p.name, p.avatar, p.banner, p.joined_at,
           coalesce(st.total_points, 0) as total_points,
           coalesce(st.correct, 0)      as correct,
           coalesce(st.correct, 0) + coalesce(st.wrong, 0) as answered,
           coalesce(st.skipped, 0)      as skipped,
           st.best_ms
    from public.players p
    left join public.player_stats st
      on st.session_id = p.session_id and st.player_id = p.id
    where p.session_id = p_session
  )
  select b.id            as player_id,
         b.name           as name,
         b.avatar         as avatar,
         b.banner         as banner,
         b.total_points   as total_points,
         b.correct        as correct,
         b.answered       as answered,
         b.skipped        as skipped,
         b.best_ms        as best_ms,
         row_number() over (
           order by b.total_points desc, b.correct desc,
                    b.skipped asc, b.joined_at asc
         )::int          as rank
  from base b;
$$;

/* The full question for a slot — NEVER includes correct_index. */
create or replace function public.get_question(p_session uuid, p_slot int)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'slot',        p_slot,
    'lesson',      q.lesson,
    'body',        q.body,
    'figure',      q.figure,
    'options',     q.options,
    'numberLine',  q.number_line,
    'optionCount', jsonb_array_length(q.options)
  )
  from public.sessions s
  join public.questions q on q.id = s.question_ids[p_slot + 1]
  where s.id = p_session;
$$;

/* ═══════════════════════════  RPC: join  ══════════════════════════════════ */

/* Student joins with the daily code. Idempotent per (session, client_key):
   re-opening the link restores the same seat, avatar and name. */
create or replace function public.rpc_join(
  p_code       text,
  p_client_key text,
  p_name       text,
  p_avatar     text,
  p_banner     text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c        public.session_codes%rowtype;
  s        public.sessions%rowtype;
  pl       public.players%rowtype;
  v_name   text;
  v_avatar text;
  v_banner text;
  v_existed boolean := false;
begin
  if p_client_key is null or char_length(p_client_key) < 8 or char_length(p_client_key) > 80 then
    raise exception 'معرّف الجهاز غير صالح';
  end if;

  select * into c
    from public.session_codes
   where code = upper(btrim(p_code))
     and not revoked
     and expires_at > now()
   limit 1;

  if not found then
    raise exception 'الكود غير صحيح أو منتهي الصلاحية' using errcode = 'P0002';
  end if;

  select * into s from public.sessions where id = c.session_id;
  if not s.is_open then
    raise exception 'الباب مغلق حالياً، انتظر فتحه من المعلّم' using errcode = 'P0002';
  end if;

  v_name  := left(btrim(coalesce(p_name, '')), 24);
  v_avatar := left(coalesce(nullif(btrim(p_avatar), ''), '🙂'), 8);
  v_banner := left(regexp_replace(coalesce(p_banner, 'b0'), '[^a-z0-9]', '', 'g'), 12);
  if v_banner = '' then v_banner := 'b0'; end if;

  select * into pl
    from public.players
   where session_id = s.id and client_key = p_client_key;
  v_existed := found;

  if v_existed then
    update public.players
       set name       = case when v_name <> '' then v_name else name end,
           avatar     = case when v_name <> '' then v_avatar else avatar end,
           banner     = case when v_name <> '' then v_banner else banner end,
           last_seen  = now()
     where id = pl.id
     returning * into pl;
  else
    if v_name = '' then
      raise exception 'الاسم مطلوب';
    end if;
    insert into public.players (session_id, client_key, name, avatar, banner)
    values (s.id, p_client_key, v_name, v_avatar, v_banner)
    returning * into pl;

    update public.session_codes
       set used_count = used_count + 1
     where id = c.id;
  end if;

  return jsonb_build_object(
    'playerId',  pl.id,
    'name',      pl.name,
    'avatar',    pl.avatar,
    'banner',    pl.banner,
    'sessionId', s.id,
    'title',     s.title,
    'isRejoin',  v_existed
  );
end $$;

/* ═══════════════════════  RPC: heartbeat / sync  ══════════════════════════ */

/* One call gives the client everything: authoritative state, the clock, the
   roster, the standings, its own answer sheet and (once revealed) the answer.
   Used on join, every ~20 s, and on every session change. */
create or replace function public.rpc_sync(
  p_session     uuid,
  p_client_key  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s    public.sessions%rowtype;
  pl   public.players%rowtype;
  lb   jsonb;
  mine jsonb;
  reveal jsonb;
  qc   jsonb;
  answered_now int := 0;
  total_players int := 0;
  v_teacher boolean := public.is_teacher();
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'الجلسة غير موجودة' using errcode = 'P0002';
  end if;

  if p_client_key is not null and char_length(p_client_key) >= 8 then
    select * into pl
      from public.players
     where session_id = p_session and client_key = p_client_key;
    if found then
      update public.players set last_seen = now() where id = pl.id;
    end if;
  end if;

  select count(*) into total_players
    from public.players where session_id = p_session;

  if s.question_index >= 0 then
    select count(*) into answered_now
      from public.answers
     where session_id = p_session and slot = s.question_index and chosen is not null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.rank), '[]'::jsonb) into lb
    from public.get_leaderboard(p_session) l;

  if pl.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'slot', r.slot, 'correct', r.correct, 'points', r.points,
             'answered', r.answered, 'msTaken', r.ms_taken,
             'chosen', a.chosen) order by r.slot), '[]'::jsonb)
      into mine
      from public.results r
      left join public.answers a
        on a.session_id = r.session_id
       and a.player_id = r.player_id
       and a.slot = r.slot
     where r.session_id = p_session and r.player_id = pl.id;
  else
    mine := '[]'::jsonb;
  end if;

  /* The reveal payload is released only once the round is actually closed. */
  if s.status = 'reveal' and s.question_index >= 0 then
    select jsonb_build_object(
      'slot', s.question_index,
      'correctIndex', q.correct_index,
      'explanation',  q.explanation,
      'numberLine',   q.number_line,
      'revealedAt',   s.revealed_at
    ) into reveal
    from public.questions q
    where q.id = s.question_ids[s.question_index + 1];
  end if;

  if s.question_index >= 0 and s.status in ('question', 'reveal', 'between') then
    qc := public.get_question(p_session, s.question_index);
  end if;

  return jsonb_build_object(
    'serverNow', now(),
    'session', jsonb_build_object(
      'id',             s.id,
      'title',          s.title,
      'status',         s.status,
      'isOpen',         s.is_open,
      'questionSeconds',s.question_seconds,
      'questionIndex',  s.question_index,
      'totalQuestions', coalesce(array_length(s.question_ids, 1), 0),
      'startedAt',      s.started_at,
      'questionStartedAt', s.question_started_at,
      'questionEndsAt', s.question_ends_at,
      'revealedAt',     s.revealed_at,
      'finishedAt',     s.finished_at,
      'answeredCount',  answered_now,
      'playerCount',    total_players,
      'isTeacher',      v_teacher
    ),
    'me', case when pl.id is null then null else jsonb_build_object(
      'playerId', pl.id, 'name', pl.name, 'avatar', pl.avatar,
      'banner', pl.banner, 'joinedAt', pl.joined_at
    ) end,
    'question', qc,
    'reveal',   reveal,
    'myResults', mine,
    'leaderboard', lb
  );
end $$;

/* ═══════════════════════  RPC: submit answer  ═════════════════════════════ */

/* Timing is validated server-side; ms_taken is clamped to the real window so a
   tampered client cannot fake speed. First submission wins. */
create or replace function public.rpc_answer(
  p_session     uuid,
  p_client_key  text,
  p_slot        int,
  p_option      smallint,
  p_ms          int default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s  public.sessions%rowtype;
  pl public.players%rowtype;
  v_window_ms double precision;
  v_ms double precision;
begin
  select * into s from public.sessions where id = p_session for share;
  if not found then raise exception 'الجلسة غير موجودة' using errcode = 'P0002'; end if;
  if not s.is_open then raise exception 'الباب مغلق' using errcode = 'P0002'; end if;
  if s.status <> 'question' then raise exception 'لا توجد جولة إجابة جارية'; end if;
  if p_slot <> s.question_index then raise exception 'هذه ليست الجولة الحالية'; end if;
  if s.question_started_at is null or now() < s.question_started_at then
    raise exception 'لم يبدأ العدّ بعد';
  end if;
  if s.question_ends_at is null or now() >= s.question_ends_at then
    raise exception 'انتهى وقت هذا السؤال';
  end if;
  if p_option is null or p_option < 0 then raise exception 'خيار غير صالح'; end if;

  select * into pl
    from public.players
   where session_id = p_session and client_key = p_client_key;
  if not found then raise exception 'أنت غير مسجّل في هذه الجلسة' using errcode = 'P0002'; end if;

  /* Reaction time is measured by the DATABASE, never by the client, and capped
     by the real window — speed bonuses cannot be forged. */
  v_window_ms := least(greatest(s.question_seconds * 1000, 1), 600000);
  v_ms := least(
            greatest(extract(epoch from (now() - s.question_started_at)) * 1000, 0),
            v_window_ms);

  insert into public.answers (session_id, player_id, slot, chosen, ms_taken)
  values (p_session, pl.id, p_slot, p_option, round(v_ms)::int)
  on conflict (session_id, player_id, slot) do nothing;

  update public.players set last_seen = now() where id = pl.id;

  return jsonb_build_object('ok', true, 'answered', true, 'slot', p_slot);
end $$;

/* ═══════════════════════════  RPC: settle  ═══════════════════════════════ */

/* Closes the round: awards points, writes results, flips status → 'reveal'.
   Callable by ANY client, but refused until the timer actually expires —
   teachers may force it early to move on. Idempotent. */
create or replace function public.rpc_settle(p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.sessions%rowtype;
  q        public.questions%rowtype;
  v_now    timestamptz := now();
  v_force  boolean := public.is_teacher();
  v_ms_cap double precision;
  v_slot   int;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'الجلسة غير موجودة' using errcode = 'P0002'; end if;

  v_slot := s.question_index;
  if s.status = 'reveal' then
    return jsonb_build_object('ok', true, 'alreadyRevealed', true, 'slot', v_slot);
  end if;
  if s.status <> 'question' then
    raise exception 'لا توجد جولة قائمة';
  end if;
  if s.question_ends_at is null then
    raise exception 'لم يبدأ العدّ';
  end if;
  if not v_force and v_now < s.question_ends_at then
    raise exception 'لم ينتهِ الوقت بعد';
  end if;

  select * into q
    from public.questions where id = s.question_ids[v_slot + 1];
  if not found then raise exception 'السؤال غير موجود'; end if;

  v_ms_cap := greatest(s.question_seconds * 1000, 1);

  /* answered players → correctness + speed-scaled points */
  insert into public.results (session_id, player_id, slot, correct, points, answered, ms_taken)
  select p_session, a.player_id, v_slot,
         (a.chosen = q.correct_index),
         case when a.chosen = q.correct_index
              then round(500 + 500 * (1 - least(a.ms_taken, v_ms_cap) / v_ms_cap))::int
              else 0 end,
         true, a.ms_taken
    from public.answers a
   where a.session_id = p_session and a.slot = v_slot and a.chosen is not null
  on conflict (session_id, player_id, slot) do nothing;

  /* silent players → recorded as missed, zero points */
  insert into public.results (session_id, player_id, slot, correct, points, answered, ms_taken)
  select p_session, p.id, v_slot, false, 0, false, null
    from public.players p
   where p.session_id = p_session
     and not exists (
       select 1 from public.answers a
        where a.session_id = p_session and a.player_id = p.id and a.slot = v_slot)
  on conflict (session_id, player_id, slot) do nothing;

  /* roll up THIS round only into the per-player standings. Aggregating the
     whole session here would double-count earlier rounds on conflict. */
  with round_stats as (
    select r.player_id,
           sum(r.points)::int                                       as total_points,
           count(*) filter (where r.correct)::int                  as correct,
           count(*) filter (where not r.correct and r.answered)::int as wrong,
           count(*) filter (where not r.answered)::int              as skipped,
           min(r.ms_taken) filter (where r.answered)::int          as best_ms
      from public.results r
     where r.session_id = p_session and r.slot = v_slot
     group by r.player_id
  )
  insert into public.player_stats
    (session_id, player_id, total_points, correct, wrong, skipped, best_ms, fastest_slot)
  select p_session,
         z.player_id,
         z.total_points,
         z.correct,
         z.wrong,
         z.skipped,
         z.best_ms,
         (select f.slot
            from public.results f
           where f.session_id = p_session
             and f.player_id = z.player_id
             and f.slot = v_slot
             and f.answered
             and f.ms_taken = z.best_ms
           limit 1)
    from round_stats z
  on conflict (session_id, player_id) do update set
    total_points = public.player_stats.total_points + excluded.total_points,
    correct      = public.player_stats.correct + excluded.correct,
    wrong        = public.player_stats.wrong + excluded.wrong,
    skipped      = public.player_stats.skipped + excluded.skipped,
    best_ms      = least(public.player_stats.best_ms, excluded.best_ms),
    fastest_slot = case
                     when excluded.best_ms is not null
                      and (public.player_stats.best_ms is null
                           or excluded.best_ms < public.player_stats.best_ms)
                     then excluded.fastest_slot
                     else public.player_stats.fastest_slot
                   end;

  update public.sessions
     set status = 'reveal', revealed_at = v_now
   where id = p_session;

  return jsonb_build_object(
    'ok', true, 'slot', v_slot,
    'correctIndex', q.correct_index,
    'explanation',  q.explanation,
    'numberLine',   q.number_line
  );
end $$;

/* ═══════════════════════  RPC: roster (waiting room)  ════════════════════ */

create or replace function public.rpc_roster(p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot int;
begin
  select coalesce(question_index, -1) into v_slot
    from public.sessions where id = p_session;

  return jsonb_build_object(
    'serverNow', now(),
    'questionIndex', v_slot,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'playerId', p.id, 'name', p.name, 'avatar', p.avatar,
               'banner', p.banner, 'joinedAt', p.joined_at,
               'answeredSlot', a.slot, 'answeredChoice', a.chosen,
               'points', coalesce(st.total_points, 0))
        order by p.joined_at)
        from public.players p
        left join public.answers a
          on a.session_id = p.session_id and a.player_id = p.id and a.slot = v_slot
        left join public.player_stats st
          on st.session_id = p.session_id and st.player_id = p.id
       where p.session_id = p_session
    ), '[]'::jsonb)
  );
end $$;

/* ═══════════════════════════  RPC: teacher flow  ══════════════════════════ */

create or replace function public.rpc_teacher_action(
  p_session uuid,
  p_action  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s       public.sessions%rowtype;
  v_teacher uuid := public.assert_teacher();
  v_now   timestamptz := now();
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'الجلسة غير موجودة' using errcode = 'P0002'; end if;

  case p_action
    when 'open'  then update public.sessions set is_open = true  where id = p_session;
    when 'close' then update public.sessions set is_open = false where id = p_session;

    when 'load_questions' then
      update public.sessions
         set question_ids = coalesce(
               (select array_agg(id order by position, created_at)
                  from (select id, position, created_at
                          from public.questions
                         where is_active
                         order by position, created_at
                         limit 200) z), '{}'),
             question_index = -1, status = 'lobby',
             question_started_at = null, question_ends_at = null, revealed_at = null
       where id = p_session;

    when 'start' then
      if coalesce(array_length(s.question_ids, 1), 0) = 0 then
        raise exception 'لا توجد أسئلة — فعّل أسئلة أولاً';
      end if;
      update public.sessions
         set status = 'question', question_index = 0,
             question_started_at = v_now,
             question_ends_at = v_now + make_interval(secs => question_seconds),
             revealed_at = null,
             started_at = coalesce(started_at, v_now),
             finished_at = null
       where id = p_session;

    when 'next' then
      /* never abandon a live round: close it (and reveal it) before moving on */
      if s.status = 'question' then
        update public.sessions set question_ends_at = v_now where id = p_session;
        perform public.rpc_settle(p_session);
      end if;

      if s.question_index + 1 >= coalesce(array_length(s.question_ids, 1), 0) then
        update public.sessions set status = 'finished', finished_at = v_now,
                                 question_ends_at = null
         where id = p_session;
      else
        update public.sessions
           set status = 'question', question_index = question_index + 1,
               question_started_at = v_now,
               question_ends_at = v_now + make_interval(secs => question_seconds),
               revealed_at = null
         where id = p_session;
      end if;

    when 'skip' then
      -- close the current round immediately and reveal it
      if s.status = 'question' then
        update public.sessions set question_ends_at = v_now where id = p_session;
        perform public.rpc_settle(p_session);
      end if;

    when 'pause' then
      update public.sessions set status = 'between', question_ends_at = null
       where id = p_session;

    when 'resume' then
      update public.sessions
         set status = 'question',
             question_started_at = v_now,
             question_ends_at = v_now + make_interval(secs => question_seconds)
       where id = p_session
       and status = 'between';

    when 'extend' then
      update public.sessions
         set question_ends_at = coalesce(question_ends_at, v_now)
                              + make_interval(secs => question_seconds)
       where id = p_session and status = 'question';

    when 'finish' then
      if s.status = 'question' then
        update public.sessions set question_ends_at = v_now where id = p_session;
        perform public.rpc_settle(p_session);
      end if;
      update public.sessions
         set status = 'finished', finished_at = v_now, question_ends_at = null
       where id = p_session;

    when 'to_lobby' then
      update public.sessions
         set status = 'lobby', question_index = -1, question_ends_at = null,
             question_started_at = null, revealed_at = null
       where id = p_session;

    when 'reset' then
      delete from public.answers   where session_id = p_session;
      delete from public.results   where session_id = p_session;
      delete from public.player_stats where session_id = p_session;
      update public.sessions
         set status = 'lobby', question_index = -1, question_ends_at = null,
             question_started_at = null, revealed_at = null,
             started_at = null, finished_at = null
       where id = p_session;

    when 'kick_all' then
      delete from public.players where session_id = p_session;

    when 'prune' then
      delete from public.players
       where session_id = p_session
         and last_seen < v_now - interval '45 minutes';

    else raise exception 'إجراء غير معروف: %', p_action;
  end case;

  return public.rpc_sync(p_session, null);
end $$;

/* Teacher: change title / duration. */
create or replace function public.rpc_teacher_config(
  p_session  uuid,
  p_title    text default null,
  p_seconds  int  default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
begin
  update public.sessions
     set title = coalesce(nullif(left(btrim(p_title), 80), ''), title),
         question_seconds = case
           when p_seconds is null then question_seconds
           else least(greatest(p_seconds, 5), 300)
         end
   where id = p_session;
  return public.rpc_sync(p_session, null);
end $$;

/* Teacher: rotate the join code (default validity = 24 h). */
create or replace function public.rpc_rotate_code(
  p_session uuid,
  p_hours   int default 24
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  v_hours  int := least(greatest(coalesce(p_hours, 24), 1), 720);
  v_code   text;
  v_exp    timestamptz;
begin
  if not exists (select 1 from public.sessions where id = p_session) then
    raise exception 'الجلسة غير موجودة' using errcode = 'P0002';
  end if;

  update public.session_codes set revoked = true
   where session_id = p_session and not revoked;

  v_code := public.gen_code();
  v_exp  := now() + make_interval(hours => v_hours);

  insert into public.session_codes (session_id, code, expires_at)
  values (p_session, v_code, v_exp);

  return jsonb_build_object('code', v_code, 'expiresAt', v_exp);
end $$;

/* Teacher-only: per-option histogram + who answered the live question, with
   reaction times. Students cannot call this (assert_teacher). */
create or replace function public.rpc_live_detail(p_session uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  s public.sessions%rowtype;
  d jsonb;
begin
  select * into s from public.sessions where id = p_session;
  if not found then raise exception 'الجلسة غير موجودة' using errcode = 'P0002'; end if;

  select coalesce(jsonb_object_agg(g.k::text, g.v), '{}'::jsonb) into d
    from (select a.chosen as k, count(*) as v
            from public.answers a
           where a.session_id = p_session
             and a.slot = s.question_index
             and a.chosen is not null
           group by a.chosen) g;

  return jsonb_build_object(
    'serverNow',    now(),
    'questionIndex', s.question_index,
    'distribution', d,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'playerId', a.player_id, 'chosen', a.chosen,
               'msTaken', a.ms_taken) order by a.ms_taken)
        from public.answers a
       where a.session_id = p_session and a.slot = s.question_index), '[]'::jsonb)
  );
end $$;

/* Teacher: active code (or mint one). */
create or replace function public.rpc_active_code(p_session uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  r public.session_codes%rowtype;
begin
  select * into r from public.session_codes
   where session_id = p_session and not revoked
   order by created_at desc limit 1;

  if not found or r.expires_at <= now() then
    perform public.rpc_rotate_code(p_session, 24);
    select * into r from public.session_codes
     where session_id = p_session and not revoked
     order by created_at desc limit 1;
  end if;

  return jsonb_build_object('code', r.code, 'expiresAt', r.expires_at,
                            'usedCount', r.used_count);
end $$;

/* Teacher: create a session. */
create or replace function public.rpc_create_session(
  p_title   text default 'اختبار الاقترانات',
  p_seconds int  default 20
)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  s_id uuid;
begin
  insert into public.sessions (title, question_seconds, teacher_id, question_ids)
  values (left(coalesce(nullif(btrim(p_title), ''), 'اختبار الاقترانات'), 80),
          least(greatest(coalesce(p_seconds, 20), 5), 300),
          v_teacher,
          coalesce((select array_agg(id order by position, created_at)
                      from (select id, position, created_at from public.questions
                             where is_active order by position, created_at limit 200) z),
                   '{}'))
  returning id into s_id;

  perform public.rpc_rotate_code(s_id, 24);
  return s_id;
end $$;

/* Teacher: full analytics report for a finished session. */
create or replace function public.rpc_report(p_session uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  v_sess    jsonb;
  v_code    jsonb;
  v_lb      jsonb;
  v_qs      jsonb := '[]'::jsonb;
  arr       uuid[];
  q         record;
  i         int := 0;
  cnt       int := 0;
  dist      jsonb := '{}'::jsonb;
begin
  select to_jsonb(x) into v_sess from (
    select id, title, status, is_open, question_seconds, question_index,
           created_at, started_at, finished_at,
           coalesce(array_length(question_ids, 1), 0) as total_questions
      from public.sessions
     where id = p_session) x;

  if v_sess is null then
    raise exception 'الجلسة غير موجودة' using errcode = 'P0002';
  end if;

  select jsonb_build_object('code', c.code, 'expiresAt', c.expires_at,
                            'usedCount', c.used_count)
    into v_code
    from public.session_codes c
   where c.session_id = p_session and not c.revoked
   order by c.created_at desc
   limit 1;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.rank), '[]'::jsonb)
    into v_lb
    from public.get_leaderboard(p_session) l;

  select question_ids into arr from public.sessions where id = p_session;

  if coalesce(array_length(arr, 1), 0) > 0 then
    for i in 0 .. array_length(arr, 1) - 1 loop
      select * into q from public.questions where id = arr[i + 1];

      select count(*)::int into cnt
        from public.answers a
       where a.session_id = p_session and a.slot = i and a.chosen is not null;

      select coalesce(jsonb_object_agg(g.k::text, g.v), '{}'::jsonb) into dist
        from (select a2.chosen as k, count(*)::int as v
                from public.answers a2
               where a2.session_id = p_session and a2.slot = i and a2.chosen is not null
               group by a2.chosen) g;

      v_qs := v_qs || jsonb_build_array(jsonb_build_object(
        'slot',         i,
        'lesson',       q.lesson,
        'body',         q.body,
        'correctIndex', q.correct_index,
        'options',      q.options,
        'answered',     cnt,
        'distribution', dist));
    end loop;
  end if;

  return jsonb_build_object(
    'session',     v_sess,
    'code',        v_code,
    'leaderboard', v_lb,
    'questions',   v_qs);
end $$;

/* ─────────────────────────  Realtime publication  ──────────────────────── */
do $$
declare
  t text;
  wanted text[] := array['sessions', 'session_codes', 'players', 'answers'];
begin
  foreach t in array wanted loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

/* ────────────────────────────  housekeeping  ───────────────────────────── */

/* Sweep: expire stale codes + drop ghost players.
   Schedule from Supabase → Database → Cron, every 10 minutes:
     select cron.schedule('quiz-sweep', '0,10,20,30,40,50 * * * *',
                          $$ select public.maintenance_sweep(); $$);            */
create or replace function public.maintenance_sweep()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_codes int; v_players int;
begin
  update public.session_codes set revoked = true
   where not revoked and expires_at <= now();
  get diagnostics v_codes = row_count;

  delete from public.players p
   where p.last_seen < now() - interval '12 hours'
     and not exists (select 1 from public.answers a where a.player_id = p.id);
  get diagnostics v_players = row_count;

  return jsonb_build_object('codesExpired', v_codes, 'playersRemoved', v_players);
end $$;

/* Auto-mint the first code the moment a session exists. */
create or replace function public.tg_session_seed_code()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.session_codes where session_id = new.id) then
    insert into public.session_codes (session_id, code, expires_at)
    values (new.id, public.gen_code(), now() + interval '24 hours');
  end if;
  return new;
end $$;

drop trigger if exists trg_session_seed_code on public.sessions;
create trigger trg_session_seed_code after insert on public.sessions
  for each row execute function public.tg_session_seed_code();

/* Teacher: bulk reorder of the bank. */
create or replace function public.rpc_reorder_questions(p_ids uuid[])
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_teacher uuid := public.assert_teacher();
  qid uuid;
  i int := 0;
begin
  foreach qid in array coalesce(p_ids, '{}') loop
    update public.questions set position = i where id = qid;
    i := i + 1;
  end loop;
end $$;

/* ─────────────────────────  refresh helper (triggers)  ─────────────────── */

/* Ensure a session always has exactly one live code; rotate on expiry. */
create or replace function public.ensure_session_code(p_session uuid, p_hours int default 24)
returns public.session_codes
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r public.session_codes%rowtype;
begin
  select * into r from public.session_codes
   where session_id = p_session and not revoked
   order by created_at desc limit 1;

  if not found or r.expires_at <= now() then
    update public.session_codes set revoked = true
     where session_id = p_session and not revoked;
    insert into public.session_codes (session_id, code, expires_at)
    values (p_session, public.gen_code(),
            now() + make_interval(hours => least(greatest(coalesce(p_hours,24),1),720)))
    returning * into r;
  end if;
  return r;
end $$;

/* ────────────────────────────  sanity checks  ──────────────────────────── */

do $$
declare v int;
begin
  select count(*) into v from public.questions;
  raise notice 'quiz_live: مزامنة اكتملت — عدد الأسئلة المخزّنة = %', v;
exception when others then
  raise notice 'quiz_live: %', sqlerrm;
end $$;