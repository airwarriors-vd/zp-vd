-- Обережно: запускайте після резервної копії. Політики нижче закривають прямий доступ працівників до чужих записів.

alter table work_days enable row level security;
drop policy if exists "work_days_select_secure" on work_days;
drop policy if exists "work_days_insert_secure" on work_days;
drop policy if exists "work_days_update_secure" on work_days;
drop policy if exists "work_days_delete_secure" on work_days;

create policy "work_days_select_secure"
on work_days for select to authenticated
using (
  user_id in (select id from users where auth_id = auth.uid() or auth_user_id = auth.uid())
  or exists (select 1 from users me where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid()) and me.role = 'admin')
  or exists (
    select 1 from users me
    where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid())
      and me.role = 'leader'
      and me.leader_direction = any(work_days.directions)
  )
);

create policy "work_days_insert_secure"
on work_days for insert to authenticated
with check (
  user_id in (select id from users where auth_id = auth.uid() or auth_user_id = auth.uid())
  or exists (select 1 from users me where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid()) and me.role = 'admin')
);

create policy "work_days_update_secure"
on work_days for update to authenticated
using (
  user_id in (select id from users where auth_id = auth.uid() or auth_user_id = auth.uid())
  or exists (select 1 from users me where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid()) and me.role = 'admin')
)
with check (
  user_id in (select id from users where auth_id = auth.uid() or auth_user_id = auth.uid())
  or exists (select 1 from users me where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid()) and me.role = 'admin')
);

create policy "work_days_delete_secure"
on work_days for delete to authenticated
using (exists (select 1 from users me where (me.auth_id = auth.uid() or me.auth_user_id = auth.uid()) and me.role = 'admin'));

-- Storage receipts: авторизовані можуть завантажувати/читати чеки.
create policy if not exists "receipts authenticated insert" on storage.objects for insert to authenticated with check (bucket_id='receipts');
create policy if not exists "receipts authenticated select" on storage.objects for select to authenticated using (bucket_id='receipts');
create policy if not exists "receipts authenticated update" on storage.objects for update to authenticated using (bucket_id='receipts') with check (bucket_id='receipts');
create policy if not exists "receipts authenticated delete" on storage.objects for delete to authenticated using (bucket_id='receipts');

notify pgrst, 'reload schema';
