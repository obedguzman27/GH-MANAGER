-- Deja que el visor lea las hojas (completion), facturas y datos de factura para imprimir.
drop policy if exists datos_select on public.datos_app;
create policy datos_select on public.datos_app for select to authenticated using (
  (clave = '__cuentas_lista') OR
  (clave = ('__cuenta::' || (select auth.uid())::text)) OR
  (clave = ('__visor_cuentas::' || (select auth.uid())::text)) OR
  (select public.es_admin()) OR
  CASE
    WHEN left(clave, 2) = '__' THEN false
    WHEN (select public.mi_rol()) = 'visor' THEN
      CASE
        WHEN clave ~ '^c:[^:]+::(gh-checkin|gh-completion|gh-invoices|gh-factura-pub|gh-ps-layout)$'
          THEN public.puedo_leer_cuenta(substring(clave from 3 for position('::' in clave) - 3))
        WHEN clave in ('gh-checkin', 'gh-completion', 'gh-invoices', 'gh-factura-pub', 'gh-ps-layout')
          THEN public.puedo_leer_cuenta('principal')
        ELSE false
      END
    WHEN clave like 'c:%::%' THEN public.puedo_leer_cuenta(substring(clave from 3 for position('::' in clave) - 3))
    ELSE public.puedo_leer_cuenta('principal')
  END
);
