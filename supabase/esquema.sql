-- FNOVA Flotas · base de datos en Supabase
-- Pegar entero en Supabase → SQL Editor → Run. Se puede volver a correr
-- sin romper nada (borra y recrea la vista, las funciones y las políticas).
--
-- Tablas:
--   perfiles   un comandante por cuenta (nombre único y facción)
--   resultados cada batalla terminada por un jugador con sesión iniciada
--   ranking    vista: el mejor puntaje en victoria de cada comandante, por dificultad
--
-- Seguridad (RLS): todos pueden leer perfiles y resultados; cada uno solo
-- crea su perfil y guarda resultados propios. Además se rechazan puntajes
-- imposibles para el tamaño de la batalla y envíos seguidos.

-- ---------------------------------------------------------------------------
-- Perfiles
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  faccion text check (faccion in ('guardianes', 'inquisidores')),
  creado timestamptz not null default now(),
  constraint nombre_valido check (
    char_length(nombre) between 3 and 20
    and nombre ~ '^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9 _.-]+$'
  )
);
-- Nombre único sin importar mayúsculas.
create unique index if not exists perfiles_nombre_unico on public.perfiles (lower(nombre));

alter table public.perfiles enable row level security;
drop policy if exists "perfiles visibles para todos" on public.perfiles;
create policy "perfiles visibles para todos" on public.perfiles for select using (true);
drop policy if exists "crear mi perfil" on public.perfiles;
create policy "crear mi perfil" on public.perfiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "editar mi perfil" on public.perfiles;
create policy "editar mi perfil" on public.perfiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

grant select on public.perfiles to anon, authenticated;
grant insert (id, nombre, faccion), update (nombre, faccion) on public.perfiles to authenticated;

-- ---------------------------------------------------------------------------
-- Resultados
create table if not exists public.resultados (
  id bigint generated always as identity primary key,
  jugador uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  resultado text not null check (resultado in ('victoria', 'derrota')),
  dificultad text not null check (dificultad in ('facil', 'normal', 'dificil')),
  presupuesto int not null check (presupuesto between 1500 and 20000),
  mapa text not null check (mapa in ('abierto', 'asteroides', 'nebulosa', 'mixto')),
  faccion text not null check (faccion in ('guardianes', 'inquisidores')),
  puntaje int not null check (puntaje >= 0),
  duracion int not null check (duracion between 20 and 7200),
  naves_destruidas int not null default 0 check (naves_destruidas between 0 and 2000),
  naves_perdidas int not null default 0 check (naves_perdidas between 0 and 2000),
  creado timestamptz not null default now(),
  -- El máximo teórico es ~3,1 veces el presupuesto (todo el valor enemigo
  -- en Difícil + flota intacta + rapidez, por el multiplicador ×1,5).
  constraint puntaje_posible check (puntaje <= presupuesto * 3.1)
);
create index if not exists resultados_ranking on public.resultados (dificultad, puntaje desc) where resultado = 'victoria';
create index if not exists resultados_jugador on public.resultados (jugador, creado desc);

alter table public.resultados enable row level security;
drop policy if exists "resultados visibles para todos" on public.resultados;
create policy "resultados visibles para todos" on public.resultados for select using (true);
drop policy if exists "guardar mis resultados" on public.resultados;
create policy "guardar mis resultados" on public.resultados for insert to authenticated with check ((select auth.uid()) = jugador);

grant select on public.resultados to anon, authenticated;
-- La columna "jugador" no se puede mandar: la completa la base con quien
-- tiene la sesión iniciada.
grant insert (resultado, dificultad, presupuesto, mapa, faccion, puntaje, duracion, naves_destruidas, naves_perdidas)
  on public.resultados to authenticated;

-- Freno a los envíos seguidos: un resultado cada 20 segundos por jugador,
-- y la fecha la pone siempre el servidor.
create or replace function public.antes_de_guardar_resultado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.resultados
    where jugador = new.jugador and creado > now() - interval '20 seconds'
  ) then
    raise exception 'Demasiados resultados seguidos, esperá unos segundos.';
  end if;
  new.creado := now();
  return new;
end;
$$;
revoke execute on function public.antes_de_guardar_resultado() from public, anon, authenticated;
drop trigger if exists antes_de_guardar_resultado on public.resultados;
create trigger antes_de_guardar_resultado before insert on public.resultados
  for each row execute function public.antes_de_guardar_resultado();

-- ---------------------------------------------------------------------------
-- Ranking: mejor victoria de cada comandante por dificultad.
drop view if exists public.ranking;
create view public.ranking with (security_invoker = true) as
select distinct on (r.dificultad, r.jugador)
  r.dificultad,
  r.jugador,
  p.nombre,
  r.faccion,
  r.puntaje,
  r.presupuesto,
  r.mapa,
  r.duracion,
  r.creado,
  (select count(*) from public.resultados v
    where v.jugador = r.jugador and v.dificultad = r.dificultad and v.resultado = 'victoria') as victorias
from public.resultados r
join public.perfiles p on p.id = r.jugador
where r.resultado = 'victoria'
order by r.dificultad, r.jugador, r.puntaje desc, r.creado;

grant select on public.ranking to anon, authenticated;
