# Auditoría de KW Premier: 16 de octubre de 2026

## Alcance y método

Se revisaron las 58 páginas HTML, los 12 formularios de contratos y acuerdos, los recursos locales enlazados y los componentes compartidos. Se capturaron 210 combinaciones de ruta y tamaño en Chrome, a 1440, 768 y 320 px. Las correcciones móviles se confirmaron además en una pasada dirigida de 30 capturas.

El diseño existente, Página Universal y el formulario de Renta fueron la referencia visual. Se preservaron marca, distribución y contenido contractual. Refero e Impeccable guiaron la revisión de accesibilidad, estados y composición, sin rediseñar la página.

Los módulos privados se probaron con una cuenta y respuestas simuladas. Las pruebas de flujo incluyen registros, guardado y reapertura, errores, permisos, PDF, búsquedas, filtros, revisiones, firmas y miles de pines del mapa. Las mediciones públicas y las comprobaciones del gateway fueron de lectura. No se enviaron formularios comerciales ni se borraron datos reales durante la auditoría.

## Cambios implementados

1. **[P1] Seguridad de generación PDF.** jsPDF pasó de 2.5.1 a 4.2.1, fijado en el lockfile y servido desde el propio sitio, con licencia. Una prueba compara el hash del bundle público con la dependencia instalada. Se verificaron texto, páginas, logos y descargas de contratos.
2. **[P1] Lectura segura de PDF.** Se desactivó `isEvalSupported` en las dos entradas del visor, siguiendo la mitigación de Mozilla para documentos maliciosos. La regresión impide volver a omitir esa opción.
3. **[P1] GPS móvil.** Guardar, Imprimir/PDF y Empezar de nuevo ya no desaparecen en pantallas pequeñas. Los campos caben a 320 px y el desplazamiento horizontal se limita a la tabla. Si el navegador bloquea la ventana de impresión, se muestra un aviso en lugar de un error JavaScript.
4. **[P1] Selectores bloqueados.** Los controles personalizados respetan el estado deshabilitado del campo nativo, cierran un menú abierto al bloquearse e impiden cambios mediante ratón y teclado. Incluyen nombre accesible y conservan actualización de opciones.
5. **[P2] Comercial a 320 px.** Se corrigió el ancho mínimo de etiquetas y selectores dentro del formulario de dos columnas. Se añadió este ancho a la prueba completa de captura, guardado y PDF.
6. **[P2] Recuperación ante fallos de red.** Las bibliotecas PDF vuelven a intentar su descarga después de un fallo; Firmas retira la etiqueta de un script fallido para que no aparente estar cargado.
7. **[P2] Rendimiento del ícono.** El favicon público pasó de 386,398 a 2,199 bytes, una reducción de 99.4 %. El original se conserva y las páginas utilizan la versión compacta de 64 x 64.
8. **[P2] Carga del perfil.** El logo reutiliza el usuario ya verificado durante el arranque, eliminando una consulta duplicada. Las modificaciones del logo siguen verificando la cuenta antes de guardar.
9. **[P2] Reclutamiento.** Los errores de envío son visibles, se anuncian como alerta y conservan lo capturado para reintentar.
10. **[P2] Aviso de privacidad.** La dirección de la oficina ya no elimina el enlace legal del pie de página.
11. **[P2] Accesibilidad.** Se asociaron etiquetas de acceso, recuperación, registro, ABC y formularios documentales; se nombraron búsquedas, campos numéricos del comprador y celdas del GPS. Los campos dinámicos de clientes mantienen su identificación accesible. Se corrigió la jerarquía de encabezados de la portada, sin cambiar su aspecto.
12. **[P2] Firmas.** Se eliminó el identificador duplicado de la cuota en la selección de archivos.
13. **[P2] Mapa táctil.** Perder la captura del puntero cancela el dibujo y restaura arrastre y zoom. La prueba usa eventos táctiles sintetizados por Chrome y confirma que se puede volver a dibujar.
14. **Prevención de regresiones.** Se añadieron pruebas de los fallos corregidos, verificación de recursos, mediciones públicas reproducibles y un límite de tiempo para evitar pruebas bloqueadas indefinidamente.
15. **Sincronización.** Se añadió una regresión del permiso privado que bloqueaba el inventario, verificando ejecución con `service_role`, repetibilidad del permiso y ausencia de acceso anónimo al esquema.

## Verificación

- Suite Node: 172 pruebas, 171 aprobadas, ninguna fallida y una omitida porque este Windows no tiene Bash en la ruta prevista por la prueba de respaldos.
- Suite Edge: 11 aprobadas. Comprobación TypeScript de las funciones completada.
- Escaneo de secretos y auditoría npm: sin hallazgos en el alcance comprobado.
- Recursos HTML/CSS locales: sin rutas faltantes. Recorrido aislado: sin errores JavaScript ni identificadores duplicados pendientes; el desbordamiento de Comercial se corrigió en la confirmación móvil.
- Producción: 18 comprobaciones de HTTPS, encabezados, gateway, bloqueo de REST directo, rechazo de token falso y CORS.
- Base de datos: no se encontraron tablas de `public` sin RLS; las vistas revisadas conservan ejecución con permisos del solicitante. Las funciones privilegiadas requieren revisión contextual: ser `SECURITY DEFINER` no implica por sí solo una vulnerabilidad.

## Rendimiento y calidad

Las mediciones de laboratorio de las páginas públicas se guardan en `artifacts/auditoria-publica*/resultado.json`. Antes de los cambios, el LCP observado estuvo entre 0.21 y 1.50 s en este equipo y conexión. El ahorro verificable del favicon es 384,199 bytes por descarga sin caché. La carga protegida de Propiedades sin una sesión real conduce a Login; no se presenta esa medición como velocidad del catálogo autenticado.

Evaluación orientativa: accesibilidad 3/4, rendimiento 3/4, adaptación 3/4, consistencia de estilos 3/4 e integridad 3/4, total 15/20, buena con pendientes de validación. No es una certificación WCAG ni una medición de experiencia de todos los usuarios.

## Límites y seguimiento

- Se comprobó Chrome con tamaños emulados y gestos táctiles sintetizados. Quedan sin prueba física Safari/iPhone y Android de gama baja, lectores de pantalla y conexiones reales lentas. No se midió INP de campo.
- Las acciones de producción que envían firmas, gestionan Google o borran datos se verificaron con pruebas aisladas, no ejecutándolas sobre expedientes reales. No se afirma que se haya pulsado cada acción posible con todas las cuentas y datos.
- Supabase informa que está desactivada la protección de contraseñas filtradas. Se recomienda activarla desde la configuración administrativa de Auth; la conexión disponible no expone ese ajuste. No se alteraron usuarios ni contraseñas.
- El visor conserva la API PDF.js existente con la mitigación documentada. Migrar su versión mayor requiere una prueba específica de compatibilidad; no se confundió esa mitigación con una actualización del visor.
- El detector visual señaló estilos heredados, tablas/visores sin relleno y la miniatura del logo sin `src` antes de subir una imagen. Esta última permanece oculta hasta tener contenido; no es una imagen rota visible. No se cambiaron superficies completas por hallazgos mecánicos sin evidencia visual.

Referencias de seguridad: [jsPDF 4.2.1](https://github.com/parallax/jsPDF/releases/tag/v4.2.1), [mitigación de Mozilla](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq), [protección de contraseñas en Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Repetir las comprobaciones

```text
npm ci
npm run release:check
npm run production:check
npm run audit:ui
npm run audit:public
```

`npm run vendor:pdf` reproduce el bundle PDF fijado en el lockfile. Los artefactos locales, capturas y registros quedan fuera de Git.
