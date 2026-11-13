# S2-01-T06 — Pruebas del catálogo

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **PBI:** S2-01 — Buscar películas y consultar su ficha
- **Tarea:** S2-01-T06 — Probar catálogo
- **Fecha:** 12 de noviembre de 2026
- **Base revisada:** commit `0b7bd59` de T05.
- **Resultado local:** 175 pruebas automatizadas superadas, sin fallos. Se añaden seis comprobaciones (tres pruebas principales y tres subpruebas).

## Alcance y entorno

Se comprueba el catálogo implementado en T02–T05. La nueva integración inicia
la API HTTP real en un puerto efímero, con usuarios y sesiones en memoria,
el adaptador TMDB y los servicios de búsqueda y detalle reales. Solo se simula
la conexión del adaptador con TMDB. Los datos cinematográficos de estas pruebas
son ficticios; no representan fichas verificadas del proveedor.

No requiere credenciales, PostgreSQL, SMTP ni OAuth externos. No carga `.env`,
no modifica Google Cloud, no escribe en cuentas reales y no necesita migraciones.
No se ha ejecutado la regresión PostgreSQL ni una validación pública en T06.

## Cobertura automatizada

| Archivo en `test/` | Cobertura |
|---|---|
| `catalogo-integracion.test.js` (nuevo) | Recorrido autenticado: búsqueda, dos páginas, títulos homónimos con distintos ID, detalle por ID y nueva búsqueda sin año. Token ficticio solo en la cabecera del proveedor; ausencia en respuestas y registros. Logout bloquea búsqueda y detalle sin consultar TMDB. Errores 429, timeout y JSON inválido con recuperación posterior. |
| `catalogo-tmdb.test.js` | Configuración, URL fija, cabecera Bearer, errores HTTP/red, JSON y timeout de petición y lectura. |
| `busqueda-peliculas.test.js`, `api-peliculas.test.js` | Entradas, año de estreno original, paginación, respuestas vacías e incoherentes, normalización, permisos y errores seguros. |
| `detalle-pelicula.test.js`, `api-detalle-pelicula.test.js` | Identificador, ficha, opcionales ausentes, sinopsis con párrafos, permisos, 404 y otros errores del proveedor. |
| `catalogo-cliente.test.js`, `cliente-rest.test.js` | Validación, carteles seguros, textos alternativos, límites de página, respuestas antiguas, limpieza de estado y contrato HTTP del cliente. |

Las pruebas del cliente comprueban lógica y comunicación; no sustituyen la
comprobación visual del DOM ni constituyen automatización de navegador.

## Reproducción

Desde la raíz del repositorio, con las dependencias instaladas y Node.js 24:

```powershell
node --test test/catalogo-integracion.test.js
npm.cmd test -- --test-reporter=dot
git diff --check
```

Resultado verificado: integración **6/6**, batería completa **175/175**, salida
correcta. Se usa `npm.cmd` porque PowerShell puede bloquear `npm.ps1`; no hace
falta cambiar la política de ejecución. La batería incluye las pruebas previas
de cuentas, sesiones y permisos.

## Comprobaciones manuales previas de T05

La revisión de T05 registró los siguientes resultados antes del commit de base.
Se hicieron con un servidor local temporal y sesiones en memoria, consultas TMDB
reales para los recorridos normales y respuestas simuladas para errores y casos
límite. No son una validación de Cloud Run ni de la persistencia PostgreSQL.

- Buscar Batman, filtrar 2022: se observaron 13 resultados con año 2022 tras usar `primary_release_year`. Los resultados del proveedor pueden cambiar.
- Abrir The Batman: ficha, cartel, géneros, sinopsis y duración de 177 minutos.
- Paginar y volver desde la ficha conservando la búsqueda.
- Resultados vacíos, películas homónimas, cartel ausente y error de carga de imagen.
- Timeout y reintento; sesión expirada; cierre de sesión con respuesta pendiente sin volver a mostrar el catálogo.
- Vista de 320 px sin desbordamiento horizontal; ficha y formulario adaptados; cierre de ficha con Escape.

El usuario confirmó también el funcionamiento local de T05 y realizó su commit.
En T06 no se ha repetido esta sesión de navegador ni se han generado nuevas
capturas. La evidencia visual previa se conserva en el espacio de trabajo,
fuera del repositorio.

## Lista manual reproducible

Para una nueva ejecución, reiniciar `npm.cmd run start:postgres`, abrir la URL
local e iniciar sesión con una cuenta confirmada. Usar una base de desarrollo.
Registrar fecha, versión y resultado; no introducir tokens en capturas.

| Caso | Acción y resultado esperado |
|---|---|
| Título y año | Buscar Batman con año 2022. Debe usar el año de estreno original; los años disponibles deben corresponder al filtro. Probar también sin año. |
| Validación | Enviar título vacío o año incompleto. Debe aparecer un mensaje claro, sin una búsqueda inválida. |
| Homónimos | Buscar un título con varias versiones. Distinguirlas por año y abrir la ficha del ID seleccionado. |
| Paginación | Usar una búsqueda amplia con varias páginas. Avanzar, retroceder y comprobar límites; una nueva búsqueda vuelve a página 1. |
| Ficha y volver | Comprobar título, año, sinopsis, géneros, duración y cartel. Volver conserva consulta y página; Escape cierra la ficha. |
| Vacío | Buscar una cadena sin coincidencias. Mostrar ausencia de resultados, sin tratarla como fallo. |
| Datos ausentes | Con una película sin datos opcionales o un proveedor simulado, mostrar los textos alternativos sin romper la ficha. Un cartel que falla debe mostrar su alternativa. |
| Error y recuperación | Con proveedor simulado o red controlada en pruebas, provocar un fallo. Mostrar mensaje y permitir reintentar; restaurar el proveedor y comprobar recuperación. No modificar secretos de producción. |
| Sesión | Cerrar sesión y comprobar que el catálogo desaparece. Las peticiones sin sesión deben devolver 401. Repetir con una respuesta pendiente y comprobar que no restaura la vista. |
| Móvil y teclado | A 320 px, comprobar que no existe desbordamiento horizontal, campos y tarjetas legibles y botones utilizables. Recorrer controles con Tab y abrir/cerrar ficha. |

**Estado de una nueva ejecución manual T06:** pendiente; la tabla es una guía,
no un registro de resultados adicionales.

## Publicación pendiente y cierre

Las nuevas pruebas entran en `npm test` y se ejecutarán en el CI de la PR hacia
`main`. No se ha creado una PR ni verificado un CI remoto en esta tarea.
Tras integrar el hito, verificar el mismo commit desplegado en Cloud Run:
login, búsqueda, paginación, ficha, retorno y logout. La existencia de un secreto
en Secret Manager no demuestra por sí sola su correcta conexión al servicio.

T06 deja verificado el catálogo en el alcance local descrito. La comprobación
pública y la regresión con PostgreSQL permanecen pendientes del cierre de la
entrega. No se declara completado el Hito 1: quedan los PBI de preferencias.
No se inicia la siguiente tarea sin indicación del usuario.

## Validación pública comunicada tras la PR #19

El 12 de noviembre de 2026, el usuario confirmó la integración de la PR #19 y el despliegue correcto. Informó haber probado acceso con Google, búsqueda de una película, consulta de ficha, cierre de sesión y repetición del recorrido. Este registro procede de su comprobación, no de una inspección remota del agente. No acredita pruebas públicas adicionales de paginación, fallos controlados ni ejecución de la batería PostgreSQL. El catálogo S2-01 cuenta con esta validación funcional pública; el resto del Hito 1 sigue su backlog.
