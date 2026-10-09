# Gestión de reseñas

Objetivo: abrir las reseñas desde las notificaciones, leerlas completas y controlar su publicación.

Referencia principal: `hub/pagina-universal.html`, con Firmas Digitales como referencia aprobada según `AGENTS.md`. Referencias secundarias: el Panel Máster suministrado por el usuario para navegación, la campana existente para el punto de entrada y la guía craft-details de Refero para foco y estados.

| Decisión | Fuente | Aplicación |
| --- | --- | --- |
| Armazón, paleta, tipografía y acciones | Página Universal y Firmas | Reutilizar CSS y JS compartidos |
| Entrada desde Panel Máster | Captura del usuario | Enlace Reseñas en el lateral |
| Pendientes al abrir | Notificación y esquema existente | Filtro inicial Pendientes; también Publicadas y Todas |
| Texto completo y estrellas | Formulario y tabla resenas | Mostrar sin truncar, escapar texto y conservar saltos |
| Publicación explícita | Flujo actual de aprobación | Confirmar antes de cambiar aprobada; retirar conserva el registro |
| Errores y permisos | Guía Refero y RLS existente | Reintento visible, autorización del servidor y resultado confirmado |

Conservar una única campana, scroll horizontal dentro del marco y disposición móvil compartida. No se necesitan imágenes ni una nueva identidad visual.
