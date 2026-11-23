# Permisos de dictamenes

Actualizacion: 23 de noviembre de 2026.

- Asociados: lectura de los dictamenes asignados a su asesor en el catalogo, incluidos su detalle e historial. La vinculacion usa el correo verificado de auth.users, no el nombre ni el correo editable del perfil. El identificador del catalogo no se compara con el identificador de la cuenta.
- Liderazgo (master, admin y staff): visualizacion de todos los dictamenes y sus permisos de gestion existentes.
- Gabriela Landa: visualizacion y gestion completa de dictamenes. La autorizacion se guarda por identificador de cuenta en una tabla privada del modulo. Conserva el rol asociado; no recibe permisos generales de liderazgo.

Las tablas y vistas aplican RLS, incluyendo los registros relacionados. Las dos vistas del modulo usan security_invoker. El widget de Inicio utiliza la misma autorizacion de la base y no agrega un filtro incorrecto entre identificadores diferentes. MFA sigue siendo obligatorio segun la politica vigente.

Prueba SQL: tests/dictamen-visualizacion.sql. Comprueba dos asesores con expedientes, una cuenta sin expedientes, Gabriela y los tres roles de liderazgo. Comprueba aislamiento de tablas y vistas, detalle e historial, MFA y creacion, edicion y borrado para Gabriela. Todo se revierte; no persisten datos de prueba ni se envian notificaciones.

Resultado verificado: 36 dictamenes visibles para Gabriela y liderazgo; cada asesor probado ve solamente el suyo; la cuenta sin dictamenes ve cero. Las once regresiones de Inicio, carga de detalle y autoguardado pasaron.
