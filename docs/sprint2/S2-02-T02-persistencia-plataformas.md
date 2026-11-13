# S2-02-T02 — Persistencia de plataformas

- **Sprint:** 2
- **Hito:** 1 — Catálogo y preferencias
- **PBI:** S2-02
- **Tarea:** T02 — Crear persistencia de plataformas
- **Fecha:** 12 de noviembre de 2026
- **Alcance:** migración, repositorios y pruebas. API e interfaz pendientes.

## Modelo y contrato

La migración `sql/006-preferencias-plataformas.sql` añade
`preferencias_plataformas(usuario_id, region, proveedor_id)`.
La clave compuesta evita duplicados. La región está restringida a España (`ES`)
y el proveedor es un entero PostgreSQL positivo. La clave foránea pertenece a
`usuarios(id)` y un borrado físico de usuario elimina sus preferencias.

Una selección vacía se representa sin filas. No distingue entre primera visita
y selección vaciada; ambas devuelven el mismo conjunto vacío. La baja lógica
conserva las filas, pero los repositorios bloquean su lectura y escritura.
Una nueva cuenta con otro ID no hereda preferencias aunque reutilice el correo.

Los dos repositorios ofrecen el mismo contrato asíncrono:

- `PreferenciasPlataformas(datosUsuarios)`: almacenamiento en memoria para pruebas.
- `PreferenciasPlataformasPostgres(pool)`: almacenamiento persistente.
- `obtener(usuarioId)` devuelve `{ region: "ES", plataformas: [ids] }`.
- `guardar(usuarioId, ids)` reemplaza el conjunto completo y devuelve ese formato.
- Las entradas son arrays de enteros de 1 a 2147483647. Se eliminan duplicados y se ordenan de menor a mayor. Las listas se copian para evitar modificaciones externas.
- Datos inválidos: `ErrorDatos` con código `PREFERENCIAS_INVALIDAS`.
- Usuario inexistente o eliminado: `ErrorDatos` con código `USUARIO_NO_ENCONTRADO`.

Aquí se valida la forma de los IDs. La pertenencia al catálogo de proveedores de
España, la sesión y la traducción a respuestas HTTP corresponden a T03. El
repositorio PostgreSQL puede propagar errores técnicos como los repositorios
existentes; la futura API deberá convertirlos en respuestas seguras.

## Atomicidad

El guardado PostgreSQL abre una transacción y bloquea la fila del usuario con
`FOR UPDATE` antes de borrar e insertar preferencias. Los guardados de la misma
cuenta se serializan incluso cuando la selección está vacía. Un fallo revierte
el reemplazo y conserva el conjunto anterior. Se libera la conexión en todos
los caminos y se descarta si falla el rollback. Las consultas usan parámetros.

La lectura se realiza en una sola consulta y devuelve un conjunto confirmado,
sin observar la parte intermedia de un reemplazo. Las cuentas distintas tienen
conjuntos independientes.

## Validación realizada

Se creó un contenedor temporal PostgreSQL 17 separado de las bases del usuario,
con puerto local efímero, credenciales ficticias y sin volumen persistente.

- Se aplicaron las migraciones 001–006; 006 se ejecutó dos veces para comprobar que admite repetición.
- Contrato compartido: tres pruebas en memoria y las mismas tres en PostgreSQL.
- Otras tres pruebas PostgreSQL: persistencia entre pools y reemplazos concurrentes, rollback tras fallo SQL real, y restricciones de la tabla con eliminación en cascada.
- Las cuatro pruebas PostgreSQL anteriores de cuentas, sesiones, OAuth y confirmación siguieron pasando.
- Ejecución conjunta enfocada: 13 pruebas superadas (3 memoria + 6 plataformas PostgreSQL + 4 regresión PostgreSQL).

La primera batería general encontró `spawn UNKNOWN` al iniciar un proceso de
prueba en Windows. Se repitió con `--test-concurrency=2`, sin cambiar los scripts
del proyecto: **178 pruebas superadas, 0 fallos, 0 omitidas**. Las pruebas
PostgreSQL suman 10 resultados correctos (6 plataformas + 4 regresión).

En la validación inicial de T02 no se aplicaron migraciones en la base local del usuario ni en Cloud SQL. Véase la corrección posterior al final.
No hay cambios de `.env`, secretos, dependencias o rutas HTTP. OpenCode no
recibió respuesta del modelo tras un reintento y no generó código de esta tarea;
la implementación y comprobación se completaron directamente en esta sesión.

## Aplicar en desarrollo y producción

Cuando se prepare la prueba local tras T03, aplicar 006 después de 001–005.
Si se utiliza el servicio `db` de Docker Compose del repositorio, desde su raíz:

```powershell
Get-Content -Raw sql/006-preferencias-plataformas.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
```

El servicio debe estar iniciado. Este comando corresponde a los nombres del
`compose.yml` actual. Si se usa otra instancia o base, adaptar la conexión y
verificar el destino antes de ejecutarlo.

En Cloud SQL, ejecutar el contenido de 006 mediante la conexión habitual antes
de desplegar código que use las preferencias. No cambiar la conexión existente,
la región, la cuenta de servicio ni los secretos. No ejecutar las pruebas sobre
Cloud SQL de producción.

## Repetir pruebas

```powershell
node --test test/preferencias-plataformas.test.js
npm.cmd test -- --test-concurrency=2
npm.cmd run test:postgres
```

`test:postgres` requiere una base exclusiva de pruebas con 001–006 aplicadas y
las variables `DB_*` configuradas para ella. Crea y elimina cuentas ficticias.
La prueba de concurrencia usa dos pools. No requiere token TMDB.
El CI aplica ahora 006 y ejecuta también las pruebas nuevas de PostgreSQL.
La ejecución remota del CI queda pendiente de la PR.

## Continuidad

T01 y T02 permanecen sin commit, según la agrupación acordada: el primer commit
incluirá T01–T03. T03 conectará este almacenamiento con la sesión y añadirá la API.
T02 no modifica el comportamiento de la aplicación publicada ni añade un selector.

## Corrección posterior: pruebas locales PostgreSQL

La salida aportada por el usuario mostró dos problemas: la base local aún no
contenía `preferencias_plataformas` (migración 006 pendiente) y el alta Google
concurrente podía detectar el correo recién insertado por otra petición como
un conflicto antes de releer su identidad.

Se verificó el destino PostgreSQL local del proyecto (puerto 5433) y se aplicó
006 sin modificar las tablas existentes. No se cambió `.env` ni Cloud SQL.
`npm.cmd run test:postgres` se ejecutó en ese entorno: **10/10 superadas**.

La lógica OAuth relee la identidad al detectar un correo existente y solo
reutiliza la cuenta si coincide su ID con el de esa misma identidad. Se mantiene
el rechazo de cuentas locales, otras identidades y usuarios no confirmados.
`test/oauth-concurrencia.test.js` reproduce la intercalación de lecturas de forma
determinista: cuatro casos que verifican esos límites. Antes de la corrección
fallaba el caso de identidad concurrente; tras ella pasan los cuatro.

Esta corrección queda junto a los cambios pendientes de T01–T03. No se ha
creado commit ni avanzado a T03.