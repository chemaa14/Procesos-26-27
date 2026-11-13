# S2-02-T03 — API de preferencias

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **Tarea:** S2-02-T03 — Crear API de preferencias
- **Fecha:** 12 de noviembre de 2026
- **Estado:** implementada y probada en local. Selector visual pendiente de T04.

## Contrato HTTP

Todas las operaciones requieren una sesión de cuenta confirmada y no eliminada.
La cuenta se obtiene de la cookie HttpOnly, nunca de un ID enviado por el cliente.
Un administrador utiliza sus propias preferencias igual que cualquier usuario.
Las respuestas JSON llevan `Cache-Control: no-store`.

| Método y ruta | Entrada | Respuesta 200 |
|---|---|---|
| `GET /api/plataformas` | Sin parámetros | `{region:"ES", plataformas:[{id,nombre,logo}]}` |
| `GET /api/preferencias/plataformas` | Sin parámetros | `{region:"ES", plataformas:[ids]}` |
| `PUT /api/preferencias/plataformas` | JSON `{plataformas:[ids]}` | Conjunto guardado, mismo formato que GET preferencias |

PUT exige `Content-Type: application/json` y `X-CineMatch: 1`, siguiendo la
protección de escritura existente. Las rutas no habilitan CORS. Se rechazan
parámetros de consulta y campos extra, incluidos `usuarioId` y `region`.
El cuerpo admite hasta 16 KiB y la selección hasta 100 elementos antes de
eliminar duplicados. Los IDs deben ser enteros positivos int32. Se ordenan y
se valida su pertenencia al catálogo de España antes de escribir.

`GET /api/plataformas` utiliza el adaptador TMDB existente con
`/watch/providers/movie`, `watch_region=ES` y `language=es-ES`. Normaliza nombres,
IDs y logos seguros; no expone credenciales ni datos originales del proveedor.
No se ha añadido caché: un guardado no vacío consulta el catálogo actual.

GET preferencias lee solo PostgreSQL y no necesita TMDB. Guardar `[]` permite
vaciar la selección sin consultar el proveedor. Si un ID guardado deja de
figurar en el catálogo, GET conserva ese ID; no se borran preferencias de forma
silenciosa. El futuro selector deberá permitir al usuario retirarlo.

## Errores

| Estado | Significado |
|---|---|
| 400 | Cuerpo, parámetros o IDs inválidos; plataforma fuera del catálogo español |
| 401 | Sesión ausente, inválida o cuenta no activa |
| 403 | Falta la cabecera de protección de escritura |
| 405 | Método no permitido; incluye `Allow` |
| 413 / 415 | Cuerpo demasiado grande / tipo de contenido incorrecto |
| 502 | Fallo de proveedor, datos inválidos, red o credenciales TMDB rechazadas |
| 503 | Catálogo no configurado o límite temporal del proveedor |
| 504 | Tiempo de espera agotado |
| 500 | Error interno genérico, sin detalles de SQL ni credenciales |

Una validación o consulta de proveedor fallida no cambia la selección anterior.
La persistencia conserva la atomicidad descrita en T02.

## Configuración y despliegue

No hay variables nuevas ni dependencias nuevas. Se reutilizan `DB_*` y
`TMDB_READ_ACCESS_TOKEN`. Sin token, GET preferencias y PUT vacío funcionan;
el catálogo y los guardados no vacíos devuelven 503.

La migración 006 ya se aplicó y verificó en la base local durante la corrección
de T02. En producción debe aplicarse en Cloud SQL **antes de desplegar** esta
versión: el arranque comprueba que la tabla existe. No se han cambiado Cloud SQL,
Cloud Run, secretos o permisos desde T03.

## Pruebas realizadas

- Diez pruebas nuevas aisladas: dos del catálogo de proveedores y ocho de API.
  Cubren sesión, métodos, aislamiento incluso con administrador, datos inválidos,
  escritura protegida, JSON, límites, errores, recuperación y ausencia de datos
  internos en respuestas.
- `npm.cmd run test:postgres`: **11/11 superadas** en PostgreSQL local.
  La integración nueva usa dos servidores HTTP y dos pools: login local, guardado,
  cierre del primer servidor, recuperación en el segundo, aislamiento con una
  cuenta Google ficticia ya verificada y revocación de sesión. Solo el transporte
  de TMDB se simula. No prueba la pantalla real de Google.
- Prueba adicional local con TMDB real: catálogo ES con **88 proveedores** en
  esta consulta; login de cuenta temporal, guardado, lectura desde otro pool,
  vaciado y logout correctos. Servidor temporal y cuenta retirados al terminar.
  El número de proveedores puede cambiar.
- La regresión general se ejecuta con `npm.cmd test -- --test-concurrency=2 --test-reporter=dot`.
  Resultado: **192 pruebas superadas, sin fallos**.

No se ha probado T03 en producción ni añadido interfaz. OpenCode no obtuvo
respuesta del modelo y no escribió cambios; T03 se implementó y revisó
directamente en esta sesión.

## Repetir la prueba manual en local

1. Reiniciar el servidor: detener el proceso anterior y ejecutar `npm.cmd run start:postgres`.
2. Abrir la aplicación local e iniciar sesión (cuenta local o Google).
3. En la consola del navegador de esa misma página, consultar el catálogo:

```javascript
const listadoPlataformas = await (await fetch('/api/plataformas')).json();
console.table(listadoPlataformas.plataformas);
await (await fetch('/api/preferencias/plataformas')).json();
```

4. Elegir los IDs de las plataformas propias mostradas en la tabla. Definir
   `idsElegidos` como array de esos números y guardar. Esta operación reemplaza
   toda la selección anterior. Revisar el estado antes de interpretar la respuesta:

```javascript
const guardadoPreferencias = await fetch('/api/preferencias/plataformas', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-CineMatch': '1' },
  body: JSON.stringify({ plataformas: idsElegidos })
});
console.log(guardadoPreferencias.status, await guardadoPreferencias.json());
```

5. Recargar o cerrar y volver a iniciar sesión; repetir GET preferencias y
   comprobar los mismos IDs. Iniciar sesión con otra cuenta debe devolver su
   propia selección. Para quitar todas las plataformas usar `idsElegidos = []`
   y repetir PUT. Definir la variable con `let` para poder cambiarla.
6. Cerrar sesión y repetir GET: debe devolver 401.

No pegar tokens, cookies ni credenciales en la consola. El navegador envía su
cookie de sesión del mismo origen automáticamente. No aparecerá todavía un
selector en la página: corresponde a T04.

## Commit acordado

T01–T03 se entregan en un único commit junto con la corrección de concurrencia
OAuth detectada al probar T02. No se crea commit, PR ni despliegue desde esta tarea.
No se avanza a T04 sin indicación del usuario.
