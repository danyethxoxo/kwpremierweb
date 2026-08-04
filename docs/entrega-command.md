# Conexión de Command con el sitio de KW Premier

Guía de entrega para el DT que va a hacer la conexión. Tiene dos partes:
lo que se prepara **antes** de contactarlo (interno) y lo que se le
**manda** a él.

---

## Parte 1 — Antes de escribirle (interno)

Nada de esto lo puede hacer el DT: son requisitos de nuestro lado. Si se
le escribe sin esto listo, va a intentar conectarse y le va a fallar.

### 1. Las tablas existen en Supabase

En **Supabase → SQL Editor**, correr (si no se han corrido ya):

- `supabase/sql/023_propiedades.sql` — el catálogo de propiedades
- `supabase/sql/024_api_llaves.sql` — llaves de API y bitácora

Para verificar: en **Table Editor** deben aparecer `propiedades`,
`api_llaves` y `api_bitacora`.

### 2. Las Edge Functions están publicadas

En **Supabase → Edge Functions** deben existir y estar desplegadas:

| Función | Para qué |
|---|---|
| `api-propiedades` | Vía B (API REST) |
| `sincronizar-propiedades` | Vía A (feed XML/JSON) |

> **Ojo con el nombre técnico.** En el Dashboard, el nombre que se ve en
> la lista y el que va en la URL pueden ser distintos si la función se
> recreó. Entra a cada una y confirma que la URL diga
> `.../functions/v1/api-propiedades` y `.../functions/v1/sincronizar-propiedades`.
> Si dicen otra cosa, hay que corregir la URL en `api.html` antes de
> mandársela al DT.

### 3. Generar la llave de API para el DT

Todavía no hay botón en el panel para esto, así que se hace desde el
navegador:

1. Entrar al panel con una cuenta **Master o Admin**.
2. Abrir la consola del navegador (F12 → pestaña *Console*).
3. Pegar esto y dar Enter:

```js
const { data } = await window.kwSupabase.auth.getSession();
const r = await fetch('https://iloetojomzqtadkithtv.supabase.co/functions/v1/api-propiedades/llaves', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.session.access_token,
  },
  body: JSON.stringify({ nombre: 'Command — KW México (DT)' }),
});
console.log(await r.json());
```

La respuesta trae la llave completa (`kwp_live_…`). **Se muestra una sola
vez**: de la base solo se guarda su hash, así que ni nosotros podemos
recuperarla después. Cópiala antes de cerrar la consola.

Si se pierde o se filtra, se revoca y se genera otra — no afecta lo ya
publicado.

### 4. Mandarle la llave por un canal aparte

La llave **no** va en el mismo mensaje que la documentación. Mándale el
correo con las instrucciones, y la llave por WhatsApp o por otro medio.

---

## Parte 2 — Lo que se le manda al DT

### Documentación

Ya está publicada y escrita para él, no hace falta preparar nada más:

- **Documentación completa:** https://danyethxoxo.github.io/kwpremierweb/api.html
- **Colección de Postman:** `docs/kwpremier-api.postman_collection.json`
  (adjuntar el archivo; le sirve para probar sin escribir código)

### Las dos vías, y cuál conviene proponerle primero

**Vía A — Feed (recomendada: cero desarrollo de su parte).**
Command ya publica un feed de inventario hacia los portales
(Inmuebles24, Lamudi, etc.). Si puede agregar nuestro sitio como un
destino más, no tiene que programar nada: nosotros leemos ese feed igual
que lo hace cualquier portal. Solo necesitamos que nos pase **la URL del
feed** (y usuario/contraseña si está protegido). Acepta XML o JSON.

**Vía B — API REST (si Command no deja agregar destinos).**
Manda las propiedades con un `POST /properties` en JSON, con la llave en
el header `x-api-key`. Todo está documentado en el enlace de arriba.

Conviene plantearle la Vía A primero y dejar la B como alternativa: para
él es la diferencia entre configurar un destino y escribir una
integración.

### Lo que hay que pedirle

- Cuál de las dos vías va a usar.
- Si es **Vía A**: la URL del feed, y si lleva usuario/contraseña.
- Si es **Vía B**: nada más que confirme cuando mande el primer lote de
  prueba.
- Cada cuánto se va a actualizar el inventario (cada hora, diario, o al
  vuelo cuando cambie algo).

---

## Mensaje listo para enviarle

> Hola Ricky, ¿qué tal?
>
> Ya tenemos lista de nuestro lado la conexión para publicar el
> inventario de Command en el sitio de KW Premier. Te paso todo para que
> lo revises.
>
> Documentación: https://danyethxoxo.github.io/kwpremierweb/api.html
> (te adjunto también una colección de Postman por si quieres probar sin
> escribir código)
>
> Hay dos formas de hacerlo y quiero proponerte la que menos trabajo te
> dé:
>
> **1) Por feed (la más simple).** Command ya manda un feed de inventario
> a los portales tipo Inmuebles24 o Lamudi. Si puedes agregar nuestro
> sitio como un destino más, no tendrías que programar nada: nosotros lo
> leemos igual que ellos. Solo necesitaría que me pases la URL del feed
> (y el usuario y contraseña si está protegido). Aceptamos XML o JSON,
> tal cual lo tengas armado.
>
> **2) Por API.** Si Command no permite agregar destinos, tenemos una API
> REST: nos mandas las propiedades con un POST en JSON y una llave en el
> header. Está todo en el enlace de arriba. La llave te la mando por
> WhatsApp, aparte de este correo.
>
> Solo son obligatorios dos campos, `id` y `titulo`; todo lo demás es
> opcional y guardamos lo que llegue. Reenviar una propiedad que ya
> existe la actualiza en lugar de duplicarla, así que puedes mandar el
> inventario completo las veces que quieras sin problema.
>
> ¿Cuál de las dos te acomoda más? Y si me dices cada cuánto se
> actualizaría el inventario, lo dejamos configurado de este lado.
>
> Quedo al pendiente, gracias.

---

## Cuando ya esté conectado

- **Ver qué llegó:** tabla `api_bitacora` en Supabase — guarda cada
  petición, cuántas propiedades traía y qué se rechazó. Es lo primero que
  hay que revisar si el DT dice "ya lo mandé" y no aparece nada.
- **Ver el inventario:** tabla `propiedades`. La columna `datos_origen`
  guarda el registro original completo tal como llegó, así que si algún
  campo no se mapeó bien, ahí está el dato sin perderse.
- **Solo se publican en el sitio** las propiedades con
  `estatus: publicada`. Para probar sin publicar, que mande las primeras
  con `no_publicada`.
- **Ligar propiedades a un asesor:** si el feed trae `asesor_email` y ese
  correo coincide con el de un perfil de KW Premier, la propiedad sale
  automáticamente en el micrositio de ese asesor.
