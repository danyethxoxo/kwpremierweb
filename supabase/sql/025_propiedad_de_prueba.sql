-- Fase 22b: una propiedad de prueba cargada a mano, solo para ver cómo
-- se comporta la interfaz antes de conectar el inventario real.
--
-- Se marca con fuente = 'manual' para distinguirla de lo que llegue de
-- Command. Cuando ya no la necesites, se borra con:
--
--   delete from public.propiedades where fuente = 'manual';
--
-- Ejecutar en Supabase Dashboard > SQL Editor.

insert into public.propiedades (
  fuente, fuente_id, titulo, descripcion,
  operacion, estatus, tipo,
  precio, moneda,
  recamaras, banos, estacionamientos,
  m2_construccion, m2_terreno,
  calle, colonia, municipio, estado, cp, pais, lat, lng,
  imagenes, caracteristicas,
  market_center, asesor_nombre
) values (
  'manual',
  'DEMO-001',
  'Casa en Polanco con jardín privado',
  'Casa de tres niveles en una de las mejores calles de Polanco. Doble altura en sala, cocina integral equipada y jardín privado con terraza. Acabados de lujo, mucha luz natural y acceso controlado en la calle.

A dos cuadras de Parque Lincoln y a cinco minutos de Av. Presidente Masaryk.',
  'venta',
  'publicada',
  'Casa',
  9500000,
  'MXN',
  3, 2.5, 2,
  240, 300,
  'Calle Emilio Castelar 135', 'Polanco', 'Miguel Hidalgo', 'Ciudad de México', '11560', 'MX',
  19.4326, -99.1932,
  '["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80"]'::jsonb,
  '["Jardín privado","Terraza","Cocina integral","Acceso controlado","Doble altura","Closets vestidor"]'::jsonb,
  'KW Premier',
  'Equipo KW Premier'
)
on conflict (fuente, fuente_id) do update set
  titulo = excluded.titulo,
  descripcion = excluded.descripcion,
  precio = excluded.precio,
  imagenes = excluded.imagenes,
  caracteristicas = excluded.caracteristicas;

-- Segunda, en renta, para ver el filtro por operación
insert into public.propiedades (
  fuente, fuente_id, titulo, descripcion,
  operacion, estatus, tipo,
  precio, moneda,
  recamaras, banos, estacionamientos,
  m2_construccion,
  colonia, municipio, estado, cp, pais,
  imagenes, caracteristicas,
  market_center, asesor_nombre
) values (
  'manual',
  'DEMO-002',
  'Departamento amueblado en Condesa',
  'Departamento de dos recámaras completamente amueblado, en edificio con elevador y roof garden compartido. Ideal para ejecutivos. Incluye mantenimiento.',
  'renta',
  'publicada',
  'Departamento',
  32000,
  'MXN',
  2, 2, 1,
  110,
  'Condesa', 'Cuauhtémoc', 'Ciudad de México', '06140', 'MX',
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80"]'::jsonb,
  '["Amueblado","Roof garden","Elevador","Mantenimiento incluido","Pet friendly"]'::jsonb,
  'KW Premier',
  'Equipo KW Premier'
)
on conflict (fuente, fuente_id) do update set
  titulo = excluded.titulo,
  precio = excluded.precio,
  imagenes = excluded.imagenes;
