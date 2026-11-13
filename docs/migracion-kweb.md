# Separacion de KW Premier y KWEB

- KW Premier institucional: https://www.kwpremieroficial.com
- Sistema KWEB: https://kweb.com.mx
- Misma base de datos, cuentas, archivos, funciones y receptor de propiedades.
- La URL y clave del receptor entregadas a KW Mexico se conservan.

## Publicacion

El repositorio conserva una sola fuente. GitHub Pages publica KW Premier con su CNAME existente. Cloudflare Workers publica KWEB desde este mismo repositorio, con build `node herramientas/build-kweb.mjs` y deploy `npx wrangler deploy`.

El build de KWEB copia exclusivamente el frontend a `.kweb-dist`: no incluye archivos de entorno, SQL, funciones ni herramientas. Wrangler utiliza `deployment/kweb-worker.mjs` y los assets generados. No crear una segunda copia manual del sistema.

La raiz de KWEB dirige al portal; la pagina institucional se conserva en Premier. Los documentos siguen usando sus datos y logotipos legales originales. Solo la navegacion y el acceso del sistema utilizan la marca KWEB.

## Activacion por etapas

1. Publicar infraestructura con `KWEB_ACTIVO = false` en kw-security.js.
2. Habilitar el dominio y comprobar HTTPS, assets, entrada y funciones desde KWEB.
3. Agregar los dos origenes KWEB a las funciones existentes, conservando JWT, MFA y RLS.
4. Configurar Auth con Site URL https://kweb.com.mx y los callbacks exactos completar-registro.html y restablecer-password.html. Conservar tambien los callbacks antiguos durante la transicion.
5. Activar `KWEB_ACTIVO = true`, actualizar enlaces nuevos y versiones de scripts.
6. Verificar landing antigua, acceso nuevo y enlaces antiguos con parametros y fragmentos intactos.

Los callbacks antiguos de invitacion y recuperacion pueden permanecer operativos como compatibilidad: el navegador conserva el fragmento al trasladar la pagina a KWEB. No transferir sesiones mediante URLs. Al cambiar de origen, los usuarios inician sesion en KWEB con su cuenta existente y su verificacion habitual.

## Estado de produccion al 12 de noviembre de 2026

- Cloudflare Worker `kweb`, conectado al repositorio y a la rama main.
- Dominios kweb.com.mx y www.kweb.com.mx conectados; www redirige al dominio principal.
- HTTPS, formulario de acceso con marca KWEB y assets comprobados en el dominio nuevo.
- KWEB_ACTIVO habilitado; enlaces antiguos del sistema conservan ruta, consulta y fragmento.
- Enlaces nuevos de notificaciones, dictamenes y reportes de propiedades apuntan a KWEB.
- CORS admite los dos dominios de KWEB y conserva los de Premier, sin cambiar autenticacion.
- Invitaciones y recuperacion mantienen temporalmente sus callbacks exactos en Premier, que trasladan a KWEB. La configuracion local de Auth ya incluye KWEB; falta confirmar el cambio equivalente en el panel alojado antes de cambiar esos dos emisores.
- Remitentes de correo conservan el dominio verificado kwpremieroficial.com.
- La documentacion de propiedades permanece accesible en ambos dominios. Receptor, clave y formato sin cambios.

## Reversion

Desactivar KWEB_ACTIVO y devolver el enlace del portal a la ruta original. Conservar ambos origenes admitidos y el receptor de propiedades. No restaurar ni copiar datos: no se migran tablas ni archivos.
