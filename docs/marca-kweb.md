# Logo de KWEB

El logo aprobado el 19 de noviembre de 2026 se publica en `assets/img/kweb-logo-flecha.png`. PNG con transparencia real, 1991 × 789 px. Conserva la k roja, la cápsula negra, las letras claras y la flecha curva de la referencia proporcionada.

`kw-security.js` aplica esta marca únicamente en KWEB a navegación, acceso, verificación y cargas dinámicas. `auth-guard.js` y la carga del login la eligen desde el primer montaje. La página institucional de Premier y los logotipos legales de documentos conservan su marca correspondiente. Las versiones de ambos scripts se renuevan en las páginas del sistema.

Preparación: herramienta integrada image_gen, modo edición con fondo transparente. Instrucción utilizada:

> Edit target: the attached existing KWEB logo. Remove ONLY the outer white/silver rounded rectangular plate and the surrounding outer black canvas so the area outside the logo itself is truly transparent alpha. Preserve the existing logo exactly: lowercase red k on the left, a black rounded rectangular capsule on the right containing the lowercase white/light-gray word 'web', and the EXACT SINGLE SIMPLE CURVED ARROW CUTOUT sweeping from the e toward the upper-left inner opening of the b. Keep that tiny curved arrow as in this reference: do not substitute a mouse cursor, airplane, paper plane, pointer icon, or add any extra symbol. Keep the existing letterforms, geometry, proportions, spacing, capsule, and colors. No redesign, no invented lettering, no extra text, no drop shadow or external border. Output a clean tightly framed high-resolution PNG cutout with modest transparent margin around just the red k plus black capsule, suitable as a website wordmark on white or dark backgrounds.

Verificación: `node --test tests/kweb-logo-browser.test.mjs`. Comprueba transparencia, carga inicial y dinámica, navegación, móvil y escritorio, salida de la carga tras autorizar la sesión y preservación de los logos de documentos.

El favicon `assets/img/kweb-favicon.png` usa el globo blanco con trazo rojo proporcionado por el usuario, reducido a PNG de 64 × 64 para las pestañas. En KWEB los títulos muestran únicamente el nombre de la página; el portal se identifica como KWEB. No se añaden sufijos de marca. Los cambios dinámicos del título conservan esa regla. Verificación: `node --test tests/kweb-pestanas-browser.test.mjs`.
