-- GH Manager: funciones para "Eliminar usuario" y "Nueva contraseña" (Ajustes → Usuarios).
-- Pégalo completo en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- Solo un admin activo las puede usar; no deja borrarte a ti mismo ni al último admin.

create or replace function public.admin_eliminar_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede eliminar usuarios.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propio usuario.'; end if;
  if exists (select 1 from public.perfiles where id = p_id and lower(trim(rol)) = 'admin' and activo)
     and (select count(*) from public.perfiles where lower(trim(rol)) = 'admin' and activo) <= 1 then
    raise exception 'No se puede eliminar al último administrador.'; end if;
  delete from public.datos_app where clave in ('__cuenta::' || p_id::text, '__visor_cuentas::' || p_id::text);
  delete from public.perfiles where id = p_id;
  delete from auth.users where id = p_id;
end; $$;

create or replace function public.admin_poner_clave(p_id uuid, p_clave text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede cambiar contraseñas.'; end if;
  if p_clave is null or length(p_clave) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'Ese usuario no existe.'; end if;
end; $$;

revoke all on function public.admin_eliminar_usuario(uuid) from public, anon;
revoke all on function public.admin_poner_clave(uuid, text) from public, anon;
grant execute on function public.admin_eliminar_usuario(uuid) to authenticated;
grant execute on function public.admin_poner_clave(uuid, text) to authenticated;
