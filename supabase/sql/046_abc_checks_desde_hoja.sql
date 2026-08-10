-- Fase 46: los checks del ABC, tal cual la hoja "ABC de la Tecnología".
--
-- Esta migración es distinta a las anteriores a propósito. La 043 y la
-- 045 solo AGREGABAN (`do nothing`): nunca despalomeaban nada, porque
-- en ese momento la hoja era un respaldo viejo y lo del sitio era más
-- reciente. Aquí es al revés: la hoja se acaba de revisar y se toma
-- como el punto de partida bueno, así que manda ella.
--
-- Por eso usa `do update`: escribe los 25 temas de cada asesor con el
-- valor exacto de la hoja, y eso incluye poner en FALSE lo que en el
-- sitio estuviera palomeado de más. Si alguien palomeó algo desde el
-- sitio DESPUÉS de que se sacó esta hoja, esto se lo va a borrar. De
-- ahí en adelante el sitio vuelve a ser la fuente y esto ya no se
-- vuelve a correr.
--
-- Se puede volver a correr sin daño: deja siempre el mismo resultado.
--
-- Cómo se verificó la transcripción: cada asesor trae en la hoja su
-- propio porcentaje, y cada uno de los 25 temas trae el suyo en el
-- encabezado. Los 96 renglones cuadran con su porcentaje y las 25
-- columnas cuadran con el del encabezado. El único que baila es "Carga
-- de Propiedades" (60 de 96 = 62.5%, que Sheets redondea a 63): es
-- redondeo, no un dato mal leído.
--
-- Ejecutar después de 045_abc_checks_faltantes.sql.

-- ─────────────────────────────────────────────────────────────
-- 1) Red de seguridad: los checks cuelgan del KW ID por llave
--    foránea, así que si algún asesor de la hoja no estuviera en el
--    padrón, el paso 2 tronaría entero y no se guardaría nada. Hoy los
--    96 ya están (esto no inserta nada), pero así el archivo se
--    sostiene solo. `do nothing` = a quien ya existe no se le toca ni
--    el nombre, ni el DT, ni si está activo.
-- ─────────────────────────────────────────────────────────────
insert into public.abc_asesores (kwid, nombre, fecha_ingreso, dt_asignado, activo) values
  ('2000122032', 'MIRIAM GABRIELA LANDA PIÑA'       ,         null, null, true),
  ('556492'    , 'Adriana Garcia Rodriguez'         , '2018-01-11', 'Jessica Alvarez', true),
  ('557233'    , 'ELIZABETH ROBLES BONILLA'         , '2025-02-20', 'Jessica Alvarez', true),
  ('562589'    , 'AECB Consultor Inmobiliario'      ,         null, 'Jessica Alvarez', true),
  ('602054'    , 'Ana Lucia Martinez Ruibal'        , '2020-06-01', 'Jessica Alvarez', true),
  ('610899'    , 'ALEJANDRA RIZO'                   , '2018-10-24', 'Jessica Alvarez', true),
  ('612523'    , 'Sergio Bautista - Kaín'           , '2018-11-01', 'Jessica Alvarez', true),
  ('633748'    , 'Guillermo Angeles Cornejo'        , '2020-06-30', 'Jessica Alvarez', true),
  ('515113'    , 'Victor Manuel Moya Torres'        , '2020-06-01', 'Jessica Alvarez', true),
  ('659472'    , 'Rodrigo Alzua Wuotto'             ,         null, 'Jessica Alvarez', true),
  ('665187'    , 'Martha Bañuelas Hernandez'        , '2019-08-26', 'Jessica Alvarez', true),
  ('671530'    , 'Alfonso Hernández'                , '2019-09-26', 'Jessica Alvarez', true),
  ('694509'    , 'EDUARDO RAMOS TREJO'              , '2020-06-01', 'Jessica Alvarez', true),
  ('704695'    , 'Ana Sanchez'                      ,         null, 'Jessica Alvarez', true),
  ('706587'    , 'Humberto Espinosa Mondragon'      , '2020-05-25', 'Jessica Alvarez', true),
  ('752131'    , 'MARISOL REVELES MARTINEZ'         , '2021-01-26', 'Jessica Alvarez', true),
  ('764032'    , 'Stephanie Ibarra'                 , '2021-03-22', 'Jessica Alvarez', true),
  ('766157'    , 'Minerva Iñiguez Sanchez'          , '2021-03-31', 'Jessica Alvarez', true),
  ('791029'    , 'ALMENDRA NUÑEZ MORENO'            , '2021-08-10', 'Jessica Alvarez', true),
  ('813031'    , 'Angelica Lucia Gomez Perez'       , '2021-12-08', 'Jessica Alvarez', true),
  ('819421'    , 'Felipe Alvarez Icaza L.'          , '2022-01-19', 'Jessica Alvarez', true),
  ('836021'    , 'LESLY RODRIGUEZ SANCHEZ'          , '2022-04-12', 'Jessica Alvarez', true),
  ('855609'    , 'LETICIA GUEVARA'                  , '2023-02-01', 'Jessica Alvarez', true),
  ('873285'    , 'Tania Chavarria Gil'              , '2023-04-03', 'Jessica Alvarez', true),
  ('873536'    , 'RAFAEL RODRIGUEZ'                 , '2022-11-07', 'Jessica Alvarez', true),
  ('885100'    , 'FERNANDO ROURA'                   , '2023-01-25', 'Jessica Alvarez', true),
  ('2000020247', 'Ilse Rodriguez Gutierrez'         , '2023-09-01', 'Jessica Alvarez', true),
  ('2000056028', 'Priscilla Barrantes Herrera'      , '2024-03-04', 'Jessica Alvarez', true),
  ('2000056212', 'JOSE LEOPOLDO MORANCHEL POCATERRA', '2024-03-25', 'Jessica Alvarez', true),
  ('2000059418', 'Jaime Luciano'                    , '2024-04-23', 'Jessica Alvarez', true),
  ('2000060532', 'Lorena Fabiola Castro Rodriguez'  , '2024-04-24', 'Jessica Alvarez', true),
  ('2000067985', 'Emilio Martinez Torres'           , '2024-06-26', 'Jessica Alvarez', true),
  ('2000071128', 'Juan Francisco Marquez Ortiz'     , '2024-07-03', 'Jessica Alvarez', true),
  ('2000079646', 'ANTONIO CASTELLANOS RIVERA'       , '2024-08-09', 'Jessica Alvarez', true),
  ('2000088779', 'HUGO CORRIPIO ARRIAGA'            , '2024-10-29', 'Jessica Alvarez', true),
  ('2000088600', 'Montserrat Solis Zuniga'          , '2024-11-01', 'Jessica Alvarez', true),
  ('2000089349', 'Loraine Gimenez'                  , '2024-10-29', 'Jessica Alvarez', true),
  ('2000091307', 'Diana Contreras'                  , '2024-11-27', 'Jessica Alvarez', true),
  ('2000092010', 'Jorge Aceves'                     , '2024-12-02', 'Jessica Alvarez', true),
  ('2000091309', 'Marce Calderón Serralde'          , '2024-11-18', 'Jessica Alvarez', true),
  ('2000097846', 'ARTURO CORDOBA LAVANQUI'          , '2025-01-23', 'Jessica Alvarez', true),
  ('2000099927', 'Teodora del Valle Salvatierra'    , '2025-01-16', 'Jessica Alvarez', true),
  ('2000102839', 'Alberto Resendiz'                 , '2025-02-28', 'Jessica Alvarez', true),
  ('2000103290', 'Rodrigo Solorzano Flores'         , '2025-02-07', 'Jessica Alvarez', true),
  ('2000104191', 'Bernabe Antonio Ruiz Ruiz'        , '2025-03-11', 'Jessica Alvarez', true),
  ('2000107425', 'Ursula Virrueta Benitez'          , '2025-03-20', 'Jessica Alvarez', true),
  ('2000112889', 'CLAU MORALES'                     , '2025-05-05', 'Jessica Alvarez', true),
  ('2000115087', 'Karen Salazar'                    , '2025-05-13', 'Jessica Alvarez', true),
  ('2000115126', 'Renata Villamil'                  , '2025-05-04', 'Jessica Alvarez', true),
  ('2000116276', 'IRAÍS MOYA'                       , '2025-06-14', 'Jessica Alvarez', true),
  ('2000116923', 'Elizabeth Terreros Morales'       , '2025-06-13', 'Jessica Alvarez', true),
  ('2000116947', 'Daniela Ivett Leyva Solís'        , '2025-06-14', 'Jessica Alvarez', true),
  ('2000118118', 'Julieta Trejo'                    , '2025-06-23', 'Jessica Alvarez', true),
  ('2000122793', 'MACANFU AXEL FERNANDEZ'           , '2025-08-12', 'Jessica Alvarez', true),
  ('2000126771', 'LUIS FELIPE RENDON SUAREZ'        , '2025-09-12', 'Jessica Alvarez', true),
  ('2000128964', 'MARINA ESQUIVEL'                  , '2025-10-01', 'Jessica Alvarez', true),
  ('2000129330', 'CARLOS VARGAS'                    , '2025-10-03', 'Jessica Alvarez', true),
  ('2000129528', 'GABRIELA RODRIGUEZ'               , '2025-10-06', 'Jessica Alvarez', true),
  ('2000133038', 'JAIME VAZQUEZ'                    , '2025-11-04', 'Daniel Barush', true),
  ('2000133182', 'GUADALUPE PARTIDA'                , '2025-11-06', 'Jessica Alvarez', true),
  ('2000133199', 'SERGIO PICA'                      , '2025-11-05', 'Daniel Barush', true),
  ('2000104459', 'Jorge Arturo Crisantos Arizmendiz', '2025-02-06', 'Jessica Alvarez', true),
  ('2000136766', 'MAURICIO DE LA MACORRA LOPEZ'     , '2025-12-09', 'Daniel Barush', true),
  ('2000139077', 'VERO LANZ'                        , '2026-01-05', 'Daniel Barush', true),
  ('2000139975', 'MAGDALENA LOBATON BARRAGAN'       , '2026-01-12', 'Daniel Barush', true),
  ('2000142607', 'JORGE HERNANDEZ'                  , '2026-02-03', 'Daniel Barush', true),
  ('2000142662', 'OSCAR SANCHEZ'                    , '2026-02-03', 'Daniel Barush', true),
  ('2000143697', 'ELSA SANDOVAL'                    , '2026-02-11', 'Daniel Barush', true),
  ('2000107587', 'VALERIA ZARAGOZA'                 , '2025-02-28', null, true),
  ('2000145952', 'FERNANDO ELOSEGUI'                , '2026-03-03', 'Jessica Alvarez', true),
  ('2000146193', 'YANNEL DIAZ'                      , '2026-03-04', 'Jessica Alvarez', true),
  ('2000146387', 'MARTIN RODRIGUEZ PASCUAL'         , '2026-03-05', 'Jessica Alvarez', true),
  ('2000146929', 'ARTURO GARCIA'                    , '2026-03-10', 'Daniel Barush', true),
  ('2000147243', 'MARTIN RODRIGUEZ VILLARREAL'      , '2026-03-12', 'Jessica Alvarez', true),
  ('595575'    , 'CAROL SILVA DRITRIT'              , '2026-01-06', null, true),
  ('2000150371', 'Rosa Callan'                      , '2026-04-07', 'Jessica Alvarez', true),
  ('2000150355', 'Socorro Badillo'                  , '2026-04-07', 'Daniel Barush', true),
  ('2000150419', 'Juana Chavez Chavez'              , '2026-04-07', 'Daniel Barush', true),
  ('2000150564', 'Juana Salazar Heredia'            , '2026-04-07', 'Jessica Alvarez', true),
  ('2000154354', 'OMAR HERNÁNDEZ MORA'              , '2026-05-05', 'Daniel Barush', true),
  ('2000155362', 'NINA DIAZ-ROURA RODRIGUEZ'        , '2026-05-12', 'Jessica Alvarez', true),
  ('2000155384', 'LAURA ALICIA CONTRERAS OCTAVIANO' , '2026-05-12', 'Daniel Barush', true),
  ('2000155593', 'ANA LILIA TREJO LAGOS'            , '2026-05-13', 'Jessica Alvarez', true),
  ('2000156643', 'NADIA KARINA CERVANTES MONDRAGÓN' , '2026-05-21', 'Daniel Barush', true),
  ('2000156415', 'IVONNE VAZQUEZ GUIJARRO'          , '2026-05-20', 'Jessica Alvarez', true),
  ('2000156217', 'ISABEL MALDONADO CASTILLO'        , '2026-05-19', 'Daniel Barush', true),
  ('2000157954', 'LAURA GÓMEZ RÍOS'                 ,         null, 'Jessica Alvarez', true),
  ('2000159540', 'ARACELI ELÍAS GARCÉS'             ,         null, 'Jessica Alvarez', true),
  ('900346'    , 'ESMERALDA RUIZ MORALES'           ,         null, 'Daniel Barush', true),
  ('2000159940', 'LUIS ALEJANDRO ROJAS APONTE'      ,         null, 'Daniel Barush', true),
  ('2000139610', 'ANAI TREJO LÓPEZ'                 ,         null, 'Daniel Barush', true),
  ('2000160081', 'DIANA LAURA CALDERÓN CORTÉS'      ,         null, 'Daniel Barush', true),
  ('2000161956', 'DAYLEN VARGAS ARIAS'              , '2026-07-06', 'Daniel Barush', true),
  ('2000162149', 'SAMANTA NATENSON SUBATOVSKY'      , '2026-07-07', 'Daniel Barush', true),
  ('2000162474', 'RAFAEL MARTINEZ ISLAS'            , '2026-07-15', null, true),
  ('2000162988', 'DOLORES VELAZQUILLO NAVA'         , '2026-07-15', 'Daniel Barush', true)
on conflict (kwid) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2) Los checks.
--
-- Cada asesor trae una cadena de 25 letras, una por tema, en el orden
-- del temario (T = palomeado, F = no). Se guarda así en vez de 2,400
-- renglones sueltos porque de un vistazo se ve el avance completo de
-- una persona, y comparar contra la hoja es leer un renglón en vez de
-- rastrear 25.
--
--   posición  1    5    10   15   20   25
--             |    |    |    |    |    |
-- ─────────────────────────────────────────────────────────────
with hoja (kwid, temas) as (values
  ('2000122032', 'TFFFFFFFFFFFFFFFFFFFFFFFF'),  -- MIRIAM GABRIELA LANDA PIÑA
  ('556492'    , 'TTTTTTTTTTFTTTTTTTTFFFFFF'),  -- Adriana Garcia Rodriguez
  ('557233'    , 'TTTTTTTTTTTTTFTTTTTTTTTTF'),  -- ELIZABETH ROBLES BONILLA
  ('562589'    , 'FFFFFFFFFFFFFFFFFFFFFFFFF'),  -- AECB Consultor Inmobiliario
  ('602054'    , 'FFFTFFFFFFFFFFFFFFFFFFFFF'),  -- Ana Lucia Martinez Ruibal
  ('610899'    , 'TTTTTTTTTFTTTTTTTTTTTTTTT'),  -- ALEJANDRA RIZO
  ('612523'    , 'TTTTTTTTFFFFFTTTTTTFFFFFF'),  -- Sergio Bautista - Kaín
  ('633748'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Guillermo Angeles Cornejo
  ('515113'    , 'FFFFFFFFFFFFFFFFFFFFFFFFF'),  -- Victor Manuel Moya Torres
  ('659472'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Rodrigo Alzua Wuotto
  ('665187'    , 'TTTTTFTTTTTTTTTTTTTTTTTTT'),  -- Martha Bañuelas Hernandez
  ('671530'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Alfonso Hernández
  ('694509'    , 'TTTFTTTTTTTTTTTTTTTTTTTTT'),  -- EDUARDO RAMOS TREJO
  ('704695'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Ana Sanchez
  ('706587'    , 'TTTTTTTTTFFFFTTFFFFFFFFFF'),  -- Humberto Espinosa Mondragon
  ('752131'    , 'TTTTTTTTTTTTTTTTTFTTTTTTT'),  -- MARISOL REVELES MARTINEZ
  ('764032'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Stephanie Ibarra
  ('766157'    , 'TTTTTTTTTTTTTFFFFFFFFFTFF'),  -- Minerva Iñiguez Sanchez
  ('791029'    , 'TTTTTTTTTFTTTTTTTTTTTTTTT'),  -- ALMENDRA NUÑEZ MORENO
  ('813031'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Angelica Lucia Gomez Perez
  ('819421'    , 'TTTTTTFFFFFFFFFFFFFFFFFFF'),  -- Felipe Alvarez Icaza L.
  ('836021'    , 'FFFFFFFFFFFFFFFFFFFFFFFFF'),  -- LESLY RODRIGUEZ SANCHEZ
  ('855609'    , 'TTTTTTTTTFFFFTTTTTTFFFFFF'),  -- LETICIA GUEVARA
  ('873285'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Tania Chavarria Gil
  ('873536'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- RAFAEL RODRIGUEZ
  ('885100'    , 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- FERNANDO ROURA
  ('2000020247', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Ilse Rodriguez Gutierrez
  ('2000056028', 'TTTTTTTTTTTTTTFTTTFFFFFFF'),  -- Priscilla Barrantes Herrera
  ('2000056212', 'TTTTTTTTTTTTTTTFFFTTTTTTT'),  -- JOSE LEOPOLDO MORANCHEL POCATERRA
  ('2000059418', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Jaime Luciano
  ('2000060532', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Lorena Fabiola Castro Rodriguez
  ('2000067985', 'TTTTTTTTTTTTTTTTTTTTTTTFF'),  -- Emilio Martinez Torres
  ('2000071128', 'TTTTTTFFFFFFFFFFFFFFFFFFT'),  -- Juan Francisco Marquez Ortiz
  ('2000079646', 'TTTTTTTTTTTTTFTTTTTTTTTFT'),  -- ANTONIO CASTELLANOS RIVERA
  ('2000088779', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- HUGO CORRIPIO ARRIAGA
  ('2000088600', 'TTTTTFTTTTTTTTTTTTTTTTFFF'),  -- Montserrat Solis Zuniga
  ('2000089349', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Loraine Gimenez
  ('2000091307', 'TTTTTTTTTTFFFFFTFFFTFFFFF'),  -- Diana Contreras
  ('2000092010', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Jorge Aceves
  ('2000091309', 'FTFTTFFFFFFTFFFFFFFFFFFFF'),  -- Marce Calderón Serralde
  ('2000097846', 'TTTTTTTTTTTTTTTTTTTTTFFFF'),  -- ARTURO CORDOBA LAVANQUI
  ('2000099927', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Teodora del Valle Salvatierra
  ('2000102839', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Alberto Resendiz
  ('2000103290', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Rodrigo Solorzano Flores
  ('2000104191', 'TTTTTTTTTTTTTTTTTTTTTTTFF'),  -- Bernabe Antonio Ruiz Ruiz
  ('2000107425', 'TTTTTFFTTTTTTTTTTTTTTTTTT'),  -- Ursula Virrueta Benitez
  ('2000112889', 'TTTTTTTTTTTTTTTTTTTFFFFFF'),  -- CLAU MORALES
  ('2000115087', 'TTTTTTTTTTTTTTTTTTTTTTTFF'),  -- Karen Salazar
  ('2000115126', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Renata Villamil
  ('2000116276', 'TTTTTTTTTTTTTTTTTTTFFFTTT'),  -- IRAÍS MOYA
  ('2000116923', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Elizabeth Terreros Morales
  ('2000116947', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Daniela Ivett Leyva Solís
  ('2000118118', 'TTTTTFFTTFTTTFFFFFFFFFFFF'),  -- Julieta Trejo
  ('2000122793', 'TTTTTTFTTTTTTTTTTTTTFFFFF'),  -- MACANFU AXEL FERNANDEZ
  ('2000126771', 'TTTTTTFTTTTTTTTTTTTTFTTTT'),  -- LUIS FELIPE RENDON SUAREZ
  ('2000128964', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- MARINA ESQUIVEL
  ('2000129330', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- CARLOS VARGAS
  ('2000129528', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- GABRIELA RODRIGUEZ
  ('2000133038', 'TTTTTFFTTTTTTFTTTFFTFFTFT'),  -- JAIME VAZQUEZ
  ('2000133182', 'TTTFFFFFTTTFFFFFFFFFFFTFF'),  -- GUADALUPE PARTIDA
  ('2000133199', 'TTTTTFFTTFTTTFFFFFFFFFFFF'),  -- SERGIO PICA
  ('2000104459', 'TTTTTTTTTFTTTFFFFFFFFFFFF'),  -- Jorge Arturo Crisantos Arizmendiz
  ('2000136766', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- MAURICIO DE LA MACORRA LOPEZ
  ('2000139077', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- VERO LANZ
  ('2000139975', 'TTTTTTTTTTTTFTTTTTFFTTTTF'),  -- MAGDALENA LOBATON BARRAGAN
  ('2000142607', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- JORGE HERNANDEZ
  ('2000142662', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- OSCAR SANCHEZ
  ('2000143697', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- ELSA SANDOVAL
  ('2000107587', 'FFFTFFFFFFFFFFFFFFFFFFFFF'),  -- VALERIA ZARAGOZA
  ('2000145952', 'TTTTTTTTTFFFFFFFFFFFFFFFF'),  -- FERNANDO ELOSEGUI
  ('2000146193', 'TTTTTTTTFFFFFFFFFFFFFFFFF'),  -- YANNEL DIAZ
  ('2000146387', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- MARTIN RODRIGUEZ PASCUAL
  ('2000146929', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- ARTURO GARCIA
  ('2000147243', 'TTTTTFFFTTTTFFFFFFFFFTTTF'),  -- MARTIN RODRIGUEZ VILLARREAL
  ('595575'    , 'TFFFFFFFFFFFFFFFFFFFFFFFF'),  -- CAROL SILVA DRITRIT
  ('2000150371', 'TTTTFFFFFFFFFFFFFFFFFFFFF'),  -- Rosa Callan
  ('2000150355', 'TTTTTTTTTTTTTTFTTTTFTTFTF'),  -- Socorro Badillo
  ('2000150419', 'TTTTTTTTTTTTTTFTTFTTFFFTF'),  -- Juana Chavez Chavez
  ('2000150564', 'TTTTTTTTTTTTTTTTTTTTTTTTT'),  -- Juana Salazar Heredia
  ('2000154354', 'TTTTTTTTTTTTTTTTTTTFTTTTT'),  -- OMAR HERNÁNDEZ MORA
  ('2000155362', 'TTTTTTTTTTTTTTTTTTTTTTTTF'),  -- NINA DIAZ-ROURA RODRIGUEZ
  ('2000155384', 'TTTTTTTTTTTTTTFTTTTFTTTFT'),  -- LAURA ALICIA CONTRERAS OCTAVIANO
  ('2000155593', 'TTTTTTTTTTTFFFFFFFFFFFFTF'),  -- ANA LILIA TREJO LAGOS
  ('2000156643', 'TTTTTTTTTTTTTTFTTFTTFFTFF'),  -- NADIA KARINA CERVANTES MONDRAGÓN
  ('2000156415', 'TTTTTTTTTTTFTFFFFFFFFFFTF'),  -- IVONNE VAZQUEZ GUIJARRO
  ('2000156217', 'TTTTTTTTTTTFTTFTFFFFTFFFF'),  -- ISABEL MALDONADO CASTILLO
  ('2000157954', 'TTTTTTFFTTTFFFFFFFFFFFFFF'),  -- LAURA GÓMEZ RÍOS
  ('2000159540', 'TTTTTFFFTTTFFFFTFFFFFFFFF'),  -- ARACELI ELÍAS GARCÉS
  ('900346'    , 'TTTTTTTTFFFFTFFFFFTTFFFTF'),  -- ESMERALDA RUIZ MORALES
  ('2000159940', 'TTTTTTTTFFFFFFFFFFFFFFFFF'),  -- LUIS ALEJANDRO ROJAS APONTE
  ('2000139610', 'TTTTTTTTTTTTTTFFFFFFFTTFF'),  -- ANAI TREJO LÓPEZ
  ('2000160081', 'TTTTTTTTTTTTFTFTTFFFTFTTF'),  -- DIANA LAURA CALDERÓN CORTÉS
  ('2000161956', 'TTTTTFFTTFFFFFFFFFFFFFFFF'),  -- DAYLEN VARGAS ARIAS
  ('2000162149', 'TTTTTTFTTTFFTFFFTFFFTFFFF'),  -- SAMANTA NATENSON SUBATOVSKY
  ('2000162474', 'TTTFFFFFFFFFFFFFFFFFFFFFF'),  -- RAFAEL MARTINEZ ISLAS
  ('2000162988', 'TTTTTTTTFFFFFFFFFFFFFFFFF')   -- DOLORES VELAZQUILLO NAVA
)
insert into public.abc_avance (kwid, tema_id, completado)
select h.kwid, t.id, substr(h.temas, t.id::int, 1) = 'T'
from hoja h
cross join public.abc_temas t
where t.id between 1 and 25
on conflict (kwid, tema_id) do update
  set completado = excluded.completado,
      marcado_en = now();

-- ─────────────────────────────────────────────────────────────
-- 3) Comprobación.
--
-- De la hoja salen 1,708 palomeados, 96 asesores y 32 al 100%. El
-- total puede salir un poco arriba de 1,708 y eso está bien: es gente
-- que traía avance de las migraciones viejas y que ya no viene en esta
-- hoja. A esos no se les toca nada (la hoja no dice nada de ellos, así
-- que ponerlos en cero sería inventar un dato). Quiénes son se ve en
-- la consulta 5.
-- ─────────────────────────────────────────────────────────────
select 'palomeados en total'  as dato, count(*)::text as valor
  from public.abc_avance where completado
union all
select 'asesores con avance', count(distinct kwid)::text
  from public.abc_avance where completado
union all
select 'asesores al 100%', count(*)::text from (
  select kwid from public.abc_avance where completado
  group by kwid having count(*) = 25
) t
union all
select 'adopcion entre activos', round(avg(pct))::text || '%' from (
  select a.kwid, count(*) filter (where v.completado) * 100.0 / 25 as pct
  from public.abc_asesores a
  left join public.abc_avance v on v.kwid = a.kwid
  where a.activo
  group by a.kwid
) x;

-- ─────────────────────────────────────────────────────────────
-- 4) Los sospechosos: gente que trae avance en el ABC pero que el
--    padrón tiene como baja, así que no cuenta en las estadísticas y
--    vive en la pestaña Inactivos. Se dan de baja solos cuando no
--    aparecen en el Máster de Asesores. Si aquí sale alguien que sí
--    sigue en el MC, lo que hay que corregir es el Máster (y volver a
--    darle Sincronizar), no esto.
-- ─────────────────────────────────────────────────────────────
select a.kwid, a.nombre,
       count(*) filter (where v.completado) as palomeados,
       round(count(*) filter (where v.completado) * 100.0 / 25) as porcentaje
from public.abc_asesores a
join public.abc_avance v on v.kwid = a.kwid
where not a.activo
group by a.kwid, a.nombre
having count(*) filter (where v.completado) > 0
order by palomeados desc;


-- ─────────────────────────────────────────────────────────────
-- 5) Los que traen avance pero YA NO vienen en esta hoja del ABC.
--    A estos la migración no les tocó nada. Si alguno ya no debe
--    seguir, se da de baja desde el sitio; si sí debe seguir, hay que
--    volverlo a meter a la hoja del ABC.
-- ─────────────────────────────────────────────────────────────
with en_la_hoja (kwid) as (values
  ('2000122032'),
  ('556492'),
  ('557233'),
  ('562589'),
  ('602054'),
  ('610899'),
  ('612523'),
  ('633748'),
  ('515113'),
  ('659472'),
  ('665187'),
  ('671530'),
  ('694509'),
  ('704695'),
  ('706587'),
  ('752131'),
  ('764032'),
  ('766157'),
  ('791029'),
  ('813031'),
  ('819421'),
  ('836021'),
  ('855609'),
  ('873285'),
  ('873536'),
  ('885100'),
  ('2000020247'),
  ('2000056028'),
  ('2000056212'),
  ('2000059418'),
  ('2000060532'),
  ('2000067985'),
  ('2000071128'),
  ('2000079646'),
  ('2000088779'),
  ('2000088600'),
  ('2000089349'),
  ('2000091307'),
  ('2000092010'),
  ('2000091309'),
  ('2000097846'),
  ('2000099927'),
  ('2000102839'),
  ('2000103290'),
  ('2000104191'),
  ('2000107425'),
  ('2000112889'),
  ('2000115087'),
  ('2000115126'),
  ('2000116276'),
  ('2000116923'),
  ('2000116947'),
  ('2000118118'),
  ('2000122793'),
  ('2000126771'),
  ('2000128964'),
  ('2000129330'),
  ('2000129528'),
  ('2000133038'),
  ('2000133182'),
  ('2000133199'),
  ('2000104459'),
  ('2000136766'),
  ('2000139077'),
  ('2000139975'),
  ('2000142607'),
  ('2000142662'),
  ('2000143697'),
  ('2000107587'),
  ('2000145952'),
  ('2000146193'),
  ('2000146387'),
  ('2000146929'),
  ('2000147243'),
  ('595575'),
  ('2000150371'),
  ('2000150355'),
  ('2000150419'),
  ('2000150564'),
  ('2000154354'),
  ('2000155362'),
  ('2000155384'),
  ('2000155593'),
  ('2000156643'),
  ('2000156415'),
  ('2000156217'),
  ('2000157954'),
  ('2000159540'),
  ('900346'),
  ('2000159940'),
  ('2000139610'),
  ('2000160081'),
  ('2000161956'),
  ('2000162149'),
  ('2000162474'),
  ('2000162988')
)
select a.kwid, a.nombre, a.activo,
       count(*) filter (where v.completado) as palomeados
from public.abc_asesores a
join public.abc_avance v on v.kwid = a.kwid
where a.kwid not in (select kwid from en_la_hoja)
group by a.kwid, a.nombre, a.activo
having count(*) filter (where v.completado) > 0
order by palomeados desc;
