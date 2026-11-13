# S2-02-T06 — Pruebas de preferencias y permisos

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **PBI:** S2-02 — Seleccionar plataformas de streaming
- **Tarea:** S2-02-T06 — Probar preferencias y permisos
- **Fecha:** 13 de noviembre de 2026
- **Base:** T01–T05 y sus cambios locales pendientes, sin commit.
- **Resultado local:** 229 pruebas generales superadas, sin fallos, y **13/13**
  pruebas de PostgreSQL superadas. T06 añade dos pruebas de integración de
  disponibilidad con PostgreSQL real y tres pruebas de integración en memoria.

## Alcance y entorno

Se comprueba el recorrido de preferencias implementado en T02–T05 sobre la API
HTTP real. En memoria se usan usuarios, sesiones y preferencias reales; en
PostgreSQL se usan `DatosUsuariosPostgres`, `SesionesPostgres` y
`PreferenciasPlataformasPostgres`, con dos pools para simular dos instancias.

En memoria se simula el adaptador TMDB completo; en PostgreSQL se usa
`crearCatalogoTMDB` real y solo se simula `fetch`. En ambos casos se usan los
servicios reales de catálogo y disponibilidad. Los proveedores y la película de
las pruebas son ficticios; los datos de prueba se eliminan al terminar. No se ha
probado en navegador, Cloud Run ni con la base PostgreSQL de producción, y no se
aplican migraciones nuevas.

## Cobertura automatizada

| Archivo | Cobertura |
|---|---|
| `integracion/api-disponibilidad-postgres.js` (nuevo) | Recorrido HTTP de disponibilidad con usuarios, sesiones y preferencias en PostgreSQL. Guardado, lectura desde otro pool, sesión persistente, aislamiento entre cuentas, selección vacía, fallo TMDB sin pérdida de preferencias y recuperación. |
| `test/preferencias-permisos-integracion.test.js` (nuevo) | Persistencia entre inicios de sesión, aislamiento entre cuenta normal y administrador, intentos de usar `usuarioId` ajeno, selección vacía, permisos de sesión y escritura, recuperación tras fallos y cruce con la disponibilidad en memoria. |
| `test/api-preferencias.test.js` | Contrato HTTP, validación, límites, errores seguros y conservación de la selección. |
| `test/preferencias-plataformas.test.js`, `integracion/contrato-preferencias.js`, `integracion/preferencias-postgres.js` | Contrato de los repositorios en memoria y PostgreSQL: reemplazo, vacío, orden, copias, concurrencia e independencia. |
| `test/preferencias-cliente.test.js`, `test/selector-plataformas.test.js` | Estado del selector, borradores tras fallos, invalidación al cerrar sesión, catálogos inválidos y guardado vacío. |
| `test/api-disponibilidad.test.js`, `test/disponibilidad-pelicula.test.js`, `test/disponibilidad-cliente.test.js` | Cruce solo con `flatrate`, IDs exactos, selección vacía, ausencia de España, errores TMDB y presentación en la ficha. |
| `test/actividad.test.js` | Regresión de registros seguros; se conserva el ajuste local que evita el problema de `spawn` en Windows. |

## Casos nuevos de T06

1. **Persistencia y aislamiento en memoria.** Una cuenta guarda `[20, 10, 20]`,
   recibe `[10, 20]` y conserva la selección al iniciar otra sesión. Una cuenta
   administradora mantiene su propio conjunto y no puede leer ni escribir el de
   la primera mediante `usuarioId`. Guardar `[]` deja la selección vacía sin
   afectar a la otra cuenta.
2. **Permisos.** Sin sesión, con token inventado, con cuenta no confirmada, con
   cuenta eliminada o tras cerrar sesión se responde 401. Una cuenta normal y
   una administradora solo acceden a sus preferencias. Los métodos no admitidos
   responden 405 con `Allow`, la escritura exige `X-CineMatch: 1` y las entradas
   inválidas o plataformas fuera del catálogo no cambian los datos guardados.
3. **Fallos y recuperación.** Un timeout o un error de red del catálogo durante
   el guardado no sustituye la selección anterior; al recuperar TMDB el guardado
   vuelve a funcionar. La disponibilidad usa la selección real de cada cuenta,
   pide plataformas si está vacía y no convierte un fallo del proveedor en
   ausencia de disponibilidad.
4. **Disponibilidad con PostgreSQL real.** La cuenta se registra, confirma e
   inicia sesión contra PostgreSQL. Al guardar `[10]`, la consulta de
   `/api/peliculas/550/disponibilidad` devuelve la inclusión exacta de `flatrate`.
   Tras cerrar el primer servidor, otro pool lee la misma sesión y preferencias y
   obtiene la misma disponibilidad. Una segunda cuenta no hereda la selección,
   guarda `[20]` y recibe su propio resultado. Vaciar la primera cuenta deja de
   marcar `[10]` sin alterar a la segunda.
5. **Fallo TMDB con PostgreSQL.** Tras guardar `[10]`, un 500 simulado del
   proveedor devuelve 502, conserva las preferencias en la base y no filtra el
   token. Al recuperar el proveedor, la misma sesión vuelve a obtener `[10]`.

## Reproducción

Desde la raíz del repositorio, con las dependencias instaladas y Node.js 24:

```powershell
node --test test/preferencias-permisos-integracion.test.js
npm.cmd run test:postgres
git diff --check
```

Resultados verificados en esta tarea: integración en memoria **3/3**;
`test:postgres` **13/13**, incluidas las dos pruebas nuevas de disponibilidad con
PostgreSQL real. La suite general ya estaba verificada con **229/229** y no se
repite en esta revisión. Se usa `npm.cmd` porque PowerShell puede bloquear
`npm.ps1`.

## Lista manual reproducible

Requiere una base de desarrollo con la migración 006 aplicada y
`npm.cmd run start:postgres`. Usar cuentas temporales; no introducir tokens,
cookies ni credenciales en capturas.

| Caso | Acción y resultado esperado |
|---|---|
| Cuenta nueva | Iniciar sesión, abrir Mis plataformas y comprobar que se muestra «No has seleccionado ninguna plataforma» con el catálogo de España. |
| Guardado | Filtrar, marcar plataformas y guardar. Recargar y volver a iniciar sesión: debe mantenerse la misma selección. |
| Aislamiento | Entrar con otra cuenta: no debe heredar la selección. Un administrador tampoco debe ver ni editar las preferencias de otra cuenta. |
| Vacío | Pulsar Quitar todas, guardar y recargar. Debe conservarse la selección vacía y pedir plataformas antes de comprobar disponibilidad personal. |
| Fallo | Simular un fallo de catálogo durante un guardado no vacío. La selección anterior debe conservarse y el reintento debe funcionar al recuperar TMDB. |
| Permisos | Sin sesión, con una sesión caducada o tras cerrar sesión, las operaciones deben rechazarse. Las peticiones de escritura sin la cabecera de protección deben responder 403. |
| Disponibilidad | Con una selección guardada, abrir una ficha y comprobar que solo se marcan como incluidas las coincidencias exactas de suscripción. Un fallo de TMDB debe mostrar error con reintento, no «sin disponibilidad». |
| Persistencia | Guardar una selección, reiniciar el servidor y repetir la ficha con la misma sesión. La selección y la disponibilidad deben mantenerse en PostgreSQL. |
| Móvil y teclado | Repetir filtro, casillas, guardado y vaciado en una vista real estrecha y con teclado. |

**Estado de una nueva ejecución manual T06:** pendiente; la tabla es una guía,
no un registro de resultados adicionales.

## Validación final independiente

La revisión final de Codex ejecutó `npm.cmd run test:postgres` contra una base
temporal exclusiva (`cinematch_test`, puerto local 58935 y credenciales
ficticias): **13/13** pruebas superadas. Al terminar, las tablas de usuarios,
preferencias y sesiones quedaron con **0 filas**. La suite general ya estaba
verificada con **229/229**. Tras estas comprobaciones solo se ajustó la
documentación, sin modificar código ejecutable.

## Validaciones previas T04 y T05

El usuario confirmó T04 y T05 en local. Codex probó ambas en navegador con
PostgreSQL local y TMDB real: inclusión por suscripción, alquiler separado,
ausencia de España, error con reintento, vaciado que actualiza la ficha,
aislamiento entre cuentas y logout con respuesta tardía. No es una prueba de
navegador nueva de T06.

Quedan pendientes el CI remoto, el despliegue de T04–T06, la revisión móvil y la
tarea de CSS aparte.

## Límites y continuidad

- La integración con PostgreSQL se ejecutó contra bases locales de pruebas con
  las migraciones 001–006. No se ha usado ni modificado Cloud SQL.
- No se ha verificado el despliegue público ni se repite la comprobación visual
  móvil pendiente de T04.
- No se modifican archivos de producción, `.env`, secretos, dependencias,
  migraciones ni CSS general. Se conservan todos los cambios pendientes de T04 y
  T05, incluido el ajuste de `test/actividad.test.js`.
- Solo se añade el nuevo archivo de integración a `test:postgres`; no se crea
  commit, stage, push ni PR. T06 queda lista para la revisión y pruebas de Codex.
