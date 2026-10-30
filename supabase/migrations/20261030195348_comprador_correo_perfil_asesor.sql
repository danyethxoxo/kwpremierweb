create or replace function private.comprador_registrar_correo() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_contenido jsonb;
begin
  if new.tipo='comprador_matches' then
    select jsonb_build_object('clientes',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,'propiedades',s.propiedades) order by s.nombre,s.id),'[]'::jsonb)) into v_contenido
    from (
      select c.id,c.nombre,jsonb_agg(jsonb_build_object(
        'id',p.id,'titulo',p.titulo,'precio',p.precio,'moneda',p.moneda,'tipo',p.tipo,'operacion',p.operacion,
        'colonia',p.colonia,'municipio',p.municipio,'estado',p.estado,'recamaras',p.recamaras,'banos',p.banos,
        'estacionamientos',p.estacionamientos,'m2_construccion',p.m2_construccion,'m2_terreno',p.m2_terreno,
        'imagen',coalesce(nullif(i.miniatura_url,''),p.imagenes->>0),'enlace_kw',i.enlace_kw,
        'fuente',p.fuente,'fuente_id',p.fuente_id,'market_center',p.market_center,'asesor_nombre',p.asesor_nombre,'asesor_kw_id',i.asesor_kw_id
      ) order by p.created_at desc,p.id) as propiedades
      from public.comprador_resultados r
      join public.comprador_estados e on e.perfil_id=r.perfil_id and not e.pendiente
      join public.perfiles_comprador c on c.id=r.perfil_id and c.asesor_id=new.user_id and c.activo and c.avisos_correo
      join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
      left join public.propiedades_inventario i on i.id=p.id
      where r.asesor_id=new.user_id and r.vigente and r.notificado_at is null
        and r.categoria='fuertes' and r.porcentaje>=greatest(80,c.umbral_match)
        and public.comprador_requisitos_duros(c,p)
      group by c.id,c.nombre
    ) s;
    insert into public.comprador_correo_envios(notificacion_id,contenido) values(new.id,v_contenido) on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.comprador_registrar_correo() from public,anon,authenticated;

