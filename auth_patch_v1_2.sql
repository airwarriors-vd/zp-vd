-- ЗП-VD v1.2: Supabase Auth + профілі користувачів

alter table public.users add column if not exists auth_id uuid unique;
alter table public.users add column if not exists callsign text unique;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists birth_date date;
alter table public.users add column if not exists status text default 'active';
alter table public.users add column if not exists leader_direction text;

-- Ролі: user / admin / leader
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('user','admin','leader'));

-- Статус: active / dismissed
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check check (status in ('active','dismissed'));

-- Напрямок старшого групи
alter table public.users drop constraint if exists users_leader_direction_check;
alter table public.users add constraint users_leader_direction_check check (
  leader_direction is null or leader_direction in ('Софт','FPV','Класика','БЗВП','Online')
);

-- Для work_days: directions як масив напрямків
alter table public.work_days add column if not exists directions text[] default '{}';
alter table public.work_days add column if not exists updated_at timestamp default now();

-- Якщо стара колонка direction існує, переносимо її в directions
update public.work_days
set directions = array[direction]
where directions = '{}' and direction is not null;

-- Функція оновлення updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_work_days_updated_at on public.work_days;
create trigger trg_work_days_updated_at
before update on public.work_days
for each row execute function public.set_updated_at();
