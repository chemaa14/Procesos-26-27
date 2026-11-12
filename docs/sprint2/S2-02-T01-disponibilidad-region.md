# S2-02-T01 — Definir disponibilidad y región

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **PBI:** S2-02 — Seleccionar plataformas de streaming
- **Tarea:** S2-02-T01
- **Fecha:** 12 de noviembre de 2026
- **Estado:** definición documental terminada. Implementación pendiente de T02–T06.
- **Origen del alcance:** backlog Sprint 2, tarea «Usar España inicialmente y definir qué significa disponible en suscripción».

## Región y fuente

La región inicial es España (`ES`), fija para este incremento. No se infiere por
IP, navegador o cuenta de Google. `es-ES` es el idioma de los metadatos y no
sustituye a la región de disponibilidad.

Se reutilizará el adaptador TMDB del servidor y el token ya configurado. El
catálogo de proveedores se consultará mediante
`GET /3/watch/providers/movie?watch_region=ES&language=es-ES`.
Para cada película se consultará `GET /3/movie/{id}/watch/providers` y se
utilizará exclusivamente la información de `results.ES`. La información de
otros países no se usará como alternativa si falta España.

Estos endpoints son la fuente prevista para las siguientes tareas. T01 no ha
hecho consultas reales autenticadas ni comprobado qué proveedores concretos
están disponibles actualmente en España.

## Significado de disponible en suscripción

Una película se considera incluida en las plataformas seleccionadas si al menos
un identificador de proveedor seleccionado coincide exactamente con un
`provider_id` de `results.ES.flatrate` en una consulta válida.

| Modalidad TMDB | Tratamiento acordado |
|---|---|
| `flatrate` | Incluida en suscripción, únicamente si coincide el ID seleccionado. |
| `rent` | Alquiler. Se muestra separado y nunca se cuenta como incluido. |
| `buy` | Compra. Se muestra separada y nunca se cuenta como incluida. |
| `free` / `ads` | Gratis o con publicidad. Se distingue de las suscripciones y no satisface por sí sola este filtro. |

La selección expresa lo que declara el usuario. CineMatch no comprueba su
contrato, plan, restricciones ni acceso real. Un canal adicional y una plataforma
principal con ID distintos se tratan como proveedores distintos, aunque sus
nombres sean parecidos. No se agrupan por texto ni por marca.

## Preferencias y selección vacía

Las preferencias pertenecerán a la cuenta autenticada y guardarán identificadores
de proveedor, con España como región del incremento. El servidor determinará la
cuenta a partir de su sesión. No se aceptará un ID de otro usuario para editarla.
Los nombres y logos se obtendrán del catálogo, sin usarlos como claves.

Decisión para el prototipo: se permitirá guardar una selección vacía para quitar
todas las plataformas. La interfaz deberá indicar «No has seleccionado ninguna
plataforma». Una selección vacía no significa todas las plataformas ni permite
marcar películas como incluidas. El guardado rechazará IDs inválidos o
proveedores ajenos al catálogo admitido para España. Los detalles SQL y HTTP se
concretarán en T02 y T03.

## Ausencia de datos y fallos

- Respuesta válida sin `results.ES`, sin `flatrate` o sin coincidencias: indicar «No consta disponibilidad en tus suscripciones en España». No afirmar que la película es imposible de ver.
- Preferencias vacías: pedir que se seleccionen plataformas antes de comprobar coincidencias personales.
- Timeout, error de red, límite, credenciales rechazadas o respuesta inválida: indicar que no se pudo consultar la disponibilidad y permitir reintentar. No presentar el error como ausencia de disponibilidad.
- El fallo de disponibilidad no debe impedir consultar la ficha cinematográfica.
- No se promete tiempo real. Se mostrará la fecha de consulta de CineMatch, sin presentarla como fecha de actualización de JustWatch. Cualquier caché futura deberá conservar esa fecha y señalar datos anteriores si se muestran tras un fallo.

## Presentación y atribución

En la ficha se distinguirá «Incluida en tus suscripciones» de alquiler, compra y
otras modalidades. La fuente de disponibilidad se identificará como JustWatch,
junto a la atribución existente a TMDB. Se conservarán los requisitos de
atribución evaluados en S2-01-T01.

El enlace proporcionado por TMDB se presentará como «Consultar opciones en
TMDB», validando que sea HTTPS del dominio esperado antes de mostrarlo.
No se prometerá que sea un enlace directo de reproducción ni se inventarán
URLs de Netflix, Prime Video u otros proveedores.

## Ejemplos para las pruebas posteriores

Los IDs siguientes son ficticios y sirven solo para explicar la regla:

| Preferencias | Datos de España | Resultado |
|---|---|---|
| `[10]` | `flatrate: [10]`, `rent: [20]` | Incluida en la suscripción 10; alquiler separado. |
| `[10]` | `flatrate: [20]`, `rent: [10]` | No consta incluida en la seleccionada; 10 solo ofrece alquiler. |
| `[10]` | Proveedor 10 únicamente en otro país | Sin coincidencia para España. |
| `[]` | Cualquier disponibilidad | Sin plataformas seleccionadas. |
| `[10]` | Error del proveedor | Disponibilidad no comprobada; permitir reintento. |

T06 comprobará también persistencia entre sesiones, aislamiento entre cuentas,
selección vacía y recuperación tras fallos. Estos casos quedan definidos, no
implementados ni ejecutados en T01.

## Configuración y siguiente tarea

T01 no modifica código, `.env`, secretos, Cloud Run ni PostgreSQL. Los endpoints
previstos reutilizan `TMDB_READ_ACCESS_TOKEN`; no se necesita una credencial de
JustWatch independiente para estos endpoints de TMDB.

La siguiente tarea del backlog es **S2-02-T02 — Crear persistencia de plataformas**.
Allí se preparará una nueva migración, que deberá aplicarse en las bases local y
Cloud SQL antes de desplegar código que dependa de ella. T01 no la crea ni aplica.
No se avanza a T02 sin indicación del usuario.

## Fuentes oficiales

Consultadas el 12 de noviembre de 2026:

- [TMDB: proveedores por película, país y atribución JustWatch](https://developer.themoviedb.org/reference/movie-watch-providers).
- [TMDB: catálogo de proveedores y filtro watch_region](https://developer.themoviedb.org/reference/watch-providers-movie-list).
- [Evaluación previa de fuentes y condiciones de CineMatch](S2-01-T01-fuente-datos.md).

Las decisiones sobre selección vacía, coincidencia por ID y mensajes son reglas
de CineMatch para este prototipo, no garantías del proveedor.
