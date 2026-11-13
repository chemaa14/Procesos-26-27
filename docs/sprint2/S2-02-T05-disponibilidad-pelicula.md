# S2-02-T05 — Consultar disponibilidad de películas

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **PBI:** S2-02
- **Tarea:** T05 — Consultar disponibilidad de películas
- **Fecha:** 13 de noviembre de 2026
- **Base:** T01–T04 y los cambios locales de T04, sin commit.

## Contrato HTTP

`GET /api/peliculas/:id/disponibilidad` requiere una sesión de cuenta
confirmada y no eliminada. La cuenta se obtiene de la cookie HttpOnly y sus
preferencias se leen para esa misma cuenta; no se acepta un identificador de
usuario en la petición. La respuesta lleva `Cache-Control: no-store`.

La ruta es independiente de `GET /api/peliculas/:id`: un fallo de disponibilidad
no impide consultar la ficha. Solo admite `GET`; cualquier otro método responde
405 con `Allow: GET`. No admite parámetros de consulta. El identificador debe
ser un entero positivo canónico de int32, con la misma validación que la ficha.

```json
{
  "id": 550,
  "region": "ES",
  "consultadoEn": "2026-11-13T10:00:00.000Z",
  "sinDatos": false,
  "incluidas": [{ "id": 10, "nombre": "Netflix", "logo": null }],
  "suscripcion": [{ "id": 10, "nombre": "Netflix", "logo": null }],
  "alquiler": [],
  "compra": [],
  "gratis": [],
  "anuncios": [],
  "enlace": "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
  "mensaje": null
}
```

`consultadoEn` es la fecha de la consulta de CineMatch obtenida de un reloj
inyectable. No representa la fecha de actualización de JustWatch. `suscripcion`
corresponde a `flatrate`; `alquiler` a `rent`; `compra` a `buy`; `gratis` a
`free`; y `anuncios` a `ads`. `incluidas` contiene únicamente los proveedores de
`suscripcion` cuyo `provider_id` coincide exactamente con una plataforma
seleccionada. No se agrupan marcas, canales ni nombres parecidos.

## Reglas de datos

- Se consulta `/movie/{id}/watch/providers` mediante el adaptador TMDB existente.
- Solo se usa `results.ES`. La ausencia de España es una respuesta válida con
  `sinDatos: true`, arrays vacíos y sin enlace; nunca se usa otro país.
- Las categorías ausentes quedan como arrays vacíos. Una categoría `null`, que
  no sea un array o con proveedores malformados invalida la respuesta completa.
- Cada proveedor exige `provider_id` entero positivo int32, nombre útil y
  `logo_path` seguro o nulo. Los IDs duplicados exactos se colapsan; no se
  agrupan plataformas distintas por nombre.
- Si las preferencias están vacías, `incluidas` queda vacío y el mensaje pide
  seleccionar plataformas. Una selección vacía no significa «todas».
- Si no hay coincidencias o no hay datos, se informa de que no consta
  disponibilidad en las suscripciones en España, sin afirmar que la película no
  se pueda ver.
- El `id` de la respuesta, si aparece, debe coincidir con el solicitado.

## Enlace a TMDB

El enlace solo se conserva si es HTTPS, usa exactamente `www.themoviedb.org` o
`themoviedb.org`, no lleva credenciales, puerto ni fragmento, apunta a
`/movie/{id}/watch` con un slug opcional después del ID, y solo incluye
parámetros de región con valor `ES`. En cualquier otro caso el campo `enlace` se
devuelve como `null`. No se inventan enlaces de proveedores ni se presentan como
reproducción directa.

## Errores

| Estado | Significado |
|---|---|
| 400 | Identificador o parámetros de consulta inválidos |
| 401 | Sesión ausente, inválida o cuenta no activa |
| 404 | TMDB no encuentra la película |
| 405 | Método no permitido; incluye `Allow: GET` |
| 502 | Fallo de red/HTTP de TMDB o respuesta de disponibilidad inválida |
| 503 | Límite temporal de TMDB o catálogo no configurado |
| 504 | Tiempo de espera de TMDB agotado |
| 500 | Error interno genérico, sin detalles de SQL ni credenciales |

Los fallos de TMDB distinguen 404, 502, 503 y 504 y nunca se transforman en
`sinDatos`. Los registros usan la plantilla
`/api/peliculas/:id/disponibilidad` y no incluyen el ID concreto ni secretos.

## Interfaz

La ficha muestra una sección «Disponibilidad en España» que se carga después de
la ficha y de forma independiente. Presenta las plataformas incluidas, las demás
categorías, el mensaje correspondiente, la atribución a JustWatch, la fecha de
consulta de CineMatch y el enlace seguro a TMDB cuando existe. Si TMDB falla,
la ficha sigue visible, se muestra el error con opción de reintentar y no se
declara ausencia de disponibilidad. Al guardar las preferencias de plataformas,
incluida una selección vacía, la ficha abierta vuelve a consultar la
disponibilidad para no mostrar una selección anterior ya obsoleta.

## Archivos principales

- `Servidor/disponibilidad-pelicula.js`: consulta, validación, normalización,
  cruce con preferencias y enlace seguro.
- `Servidor/api.js`: ruta, sesión, errores y publicación del módulo de cliente.
- `Servidor/inicio-postgres.js`: composición con el adaptador TMDB y las
  preferencias PostgreSQL.
- `Servidor/actividad.js`: plantilla de ruta y códigos de registro.
- `Cliente/disponibilidad.js`: validación de la respuesta, estado de solicitudes
  y utilidades de presentación.
- `Cliente/gui.js`, `Cliente/index.html`, `Cliente/rest.js` y
  `Cliente/selector-plataformas.js`: integración en la ficha, recarga tras
  guardar preferencias y estilos mínimos de la sección.
- `test/disponibilidad-pelicula.test.js`, `test/api-disponibilidad.test.js`,
  `test/disponibilidad-cliente.test.js` y
  `test/selector-plataformas.test.js`: pruebas de T05.

## Validación

- Pruebas nuevas del servicio: normalización, cruce solo con `flatrate`, IDs
  exactos, selección vacía, ausencia de España, estructuras inválidas, enlace
  seguro con slug, fallos TMDB y reloj inyectable.
- Pruebas nuevas de API: sesión propia, métodos, consulta prohibida, ID canónico,
  aislamiento entre cuentas, 404/502/503/504, respuestas inválidas, servicio no
  configurado, ausencia de secretos y plantilla de ruta en los registros.
- Pruebas nuevas de cliente: respuesta válida, respuestas malformadas, enlace
  seguro, secciones, fecha y descarte de respuestas antiguas.
- Prueba de regresión del selector: el guardado confirmado de una selección vacía
  avisa para que la ficha abierta recargue la disponibilidad.
- Regresión general ejecutada con
  `npm.cmd test -- --test-concurrency=2 --test-reporter=dot`.

No se añaden variables de entorno, secretos, dependencias, migraciones, caché ni
cambios de CSS generales. T06 y el commit quedan pendientes.