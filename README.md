# CineMatch — Procesos-26-27

Proyecto de Procesos de la Ingeniería del Software. Sprint 1: arquitectura base.

## Estado actual

La aplicación permite registrar cuentas pendientes, iniciar y cerrar sesión,
consultar el perfil y eliminar la propia cuenta. Los usuarios y sus hashes se
guardan en PostgreSQL. Hay roles `usuario` y `administrador`, comprobados en el
servidor en cada petición. El administrador puede listar cuentas, consultar su
estado y eliminar otras cuentas desde la interfaz.

La confirmación por correo y OAuth están pendientes. En esta etapa, activo
significa `confirmado && !eliminado`. Las sesiones siguen en memoria: se pierden
al reiniciar y no se comparten entre instancias. Usuarios y roles sí persisten.
Los logs de actividad se emiten como JSON por la salida estándar.

## Arquitectura

- `Cliente/index.html`: formularios, perfil y tabla de administración.
- `Cliente/gui.js`: interacción y presentación; muestra datos con `textContent`.
- `Cliente/rest.js`: peticiones HTTP del mismo origen, con cookie de sesión.
- `Servidor/api.js`: rutas, validación HTTP y autorización.
- `Servidor/logica.js`: reglas de negocio y eliminación con permisos.
- `Servidor/datos.js`: repositorio en memoria para pruebas.
- `Servidor/datos-postgres.js`: repositorio persistente con consultas parametrizadas.
- `Servidor/inicio-postgres.js`: arranque con PostgreSQL.
- `sql/`: migraciones, aplicadas en orden.

JavaScript, Node.js 24, HTML y PostgreSQL 17. El backend sirve el frontend.
Las contraseñas se almacenan como hashes scrypt con sal; no se devuelven por API.

## Ejecución local (PowerShell)

Requisitos: Node.js >=24.19.0 de la serie 24 y Docker Compose.

```powershell
npm ci
```

Crear `.env` en la raíz (no se sube a Git):

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=cinematch
DB_USER=cinematch
DB_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_LOCAL
```

Mantener la contraseña existente si la base ya está creada.

```powershell
docker compose up -d --wait
Get-Content -Raw -Encoding UTF8 .\sql\001-usuarios.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\002-roles.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
npm run start:postgres
```

Abrir http://localhost:3000. `start:postgres` carga `.env` si existe.
`npm start` también usa PostgreSQL, pero recibe las variables del entorno,
como ocurre en Cloud Run. `PORT` vale 3000 por defecto; en producción se escucha
en `0.0.0.0` salvo que se indique `HOST`.

La migración 002 añade el rol sin borrar cuentas ni contraseñas y asigna
`usuario` a las cuentas existentes. No se debe borrar el volumen local.

## Primer administrador y cuentas de prueba

1. Registrar una cuenta desde la aplicación para que se genere su hash.
2. Con una conexión de administración a la base correcta, sustituir el correo
   del ejemplo y ejecutar:

```sql
UPDATE usuarios
SET rol = 'administrador', confirmado = TRUE
WHERE email = 'tu-correo@example.com'
  AND eliminado = FALSE AND password_hash IS NOT NULL
RETURNING id, email, rol, confirmado;
```

Debe devolver exactamente la cuenta elegida. No incluir contraseñas en SQL,
commits ni capturas. Esta confirmación manual es únicamente el procedimiento
de pruebas mientras se implementa la verificación por correo.

Para habilitar una cuenta normal de prueba, usar otra cuenta registrada:

```sql
UPDATE usuarios SET confirmado = TRUE
WHERE email = 'usuario-prueba@example.com'
  AND eliminado = FALSE AND password_hash IS NOT NULL
RETURNING id, email, rol, confirmado;
```

No existe una ruta pública para asignar roles. Registro y alta administrativa
siempre crean usuarios con rol `usuario`; ignoran roles y estados enviados por
el cliente. El primer administrador se habilita explícitamente, nunca de forma
automática por ser la primera cuenta.

## API y permisos

Se conservan los nombres españoles usados por el proyecto: `/api/usuarios`
equivale a `/users` en las tareas y `/activo` a `/active`.

| Método y ruta | Acceso |
|---|---|
| GET `/api/health` | Público |
| POST `/api/registro` | Público; crea una cuenta pendiente |
| POST `/api/login` | Credenciales de una cuenta confirmada y no eliminada |
| GET `/api/sesion` | Sesión válida |
| POST `/api/logout` | Cierra la sesión y borra su cookie |
| GET `/api/perfil` | Datos de la propia cuenta |
| DELETE `/api/perfil` | Elimina la propia cuenta |
| GET `/api/usuarios` | Administrador; listado de cuentas no eliminadas con rol y estado |
| POST `/api/usuarios` | Administrador; alta sin contraseña, conservada de la API inicial |
| GET `/api/usuarios/:id/activo` | Administrador; devuelve `{ activo: boolean }` |
| DELETE `/api/usuarios/:id` | Cuenta propia o administrador |

Las rutas protegidas responden 401 sin sesión válida y 403 sin permiso. Una
cuenta normal no puede borrar otra, aunque conozca su identificador. El rol se
consulta en el repositorio en cada petición; no se confía en el navegador ni
se guarda una copia del rol en la sesión.

El mecanismo provisional `API_ADMIN_TOKEN` ha sido retirado. Un token Bearer
no concede acceso. Login, logout, alta administrativa y eliminaciones exigen
`X-CineMatch: 1`. La cookie es HttpOnly, SameSite=Lax y Secure en producción.
Las respuestas JSON llevan `Cache-Control: no-store`.

La eliminación es lógica: retira la cuenta del listado, impide iniciar sesión
y revoca sus sesiones. Al eliminar la cuenta propia también se borra la cookie.
La interfaz pide confirmación antes de ambas formas de eliminación.

## Pruebas

```powershell
npm test
npm run test:postgres
```

La segunda orden requiere PostgreSQL con ambas migraciones aplicadas. Comprueba
persistencia de usuario, hash y rol entre conexiones, restricciones de rol y
borrado lógico. GitHub Actions prepara PostgreSQL y ejecuta ambos comandos.

Las pruebas de roles cubren registro sin elevación de privilegios, 401/403,
acceso administrativo, borrado propio y ajeno, protección de las operaciones,
revocación de sesiones y cambios de rol durante una sesión abierta.

Comprobación manual de interfaz:

1. Iniciar sesión como usuario: no debe aparecer la tabla de administración.
2. Iniciar sesión como administrador: debe mostrar nombre, correo, rol y estado.
3. Cancelar una eliminación: la cuenta debe conservarse.
4. Eliminar una cuenta de prueba: desaparece de la tabla y pierde su sesión.
5. Recargar: se conserva la sesión mientras siga vivo el proceso del servidor.

## Despliegue en Cloud Run

El servicio usa PostgreSQL en Cloud SQL. Configuración del entorno:

- `NODE_ENV=production`, `HOST=0.0.0.0`.
- `DB_HOST=/cloudsql/cinematch-procesos:europe-west1:cinematch-db`.
- `DB_PORT=5432`, `DB_NAME=cinematch`, `DB_USER=cinematch_app`.
- `DB_PASSWORD`: referencia al secreto `cinematch-db-password`.
- Instancia de Cloud SQL adjunta y cuenta de servicio con Cloud SQL Client y
  acceso al contenido del secreto.

**Antes de fusionar esta rama y desplegar el código nuevo**, ejecutar
`sql/002-roles.sql` en la base `cinematch` de Cloud SQL con el propietario de la
tabla. El usuario de ejecución de la aplicación no necesita permisos DDL.
La migración es compatible con el código anterior y puede aplicarse antes.
Después se habilita explícitamente la cuenta administradora que se vaya a usar.

El arranque comprueba que existen la tabla y la columna `rol` antes de escuchar.
Tras el despliegue, buscar el evento JSON `servidor_iniciado` con `puerto: 8080`
y comprobar login y permisos con una cuenta normal y otra administradora.


## Logs de actividad (Hito 3)

`Servidor/actividad.js` genera una línea JSON por registro, sin dependencias
adicionales. En local se ve en la terminal; Cloud Run recoge la salida estándar
como logs estructurados. No se crea una tabla ni se necesita otro secreto.

Cada petición completada produce un registro con `solicitudId`, `metodo`,
`ruta`, `estado` HTTP, `duracionMs`, `time`, `evento`, `message` y `severity`.
`X-Request-Id` en la respuesta contiene el mismo identificador, generado por el
servidor. No se reutilizan identificadores suministrados por el cliente.

Eventos principales:

- `usuario_registrado`, `usuario_creado`: alta pública o administrativa.
- `login_correcto`, `login_rechazado`, `logout`: accesos y cierre de sesión.
- `usuario_eliminado`: baja lógica; incluye `usuarioId` del actor y
  `objetivoId` de la cuenta eliminada cuando son UUID válidos.
- `usuarios_listados`, `estado_consultado`: consultas de administración.
- `acceso_denegado`: 401/403; `peticion_rechazada`: otros errores 4xx.
- `error_interno`: respuesta 5xx; `peticion_http`: demás peticiones completadas.
- `peticion_interrumpida`: conexión cerrada antes de terminar la respuesta;
  no se asigna un estado HTTP de éxito a esa interrupción.
- `servidor_iniciado`, `servidor_cerrando`, `servidor_cerrado` y errores de
  inicio, cierre o conexiones PostgreSQL.

Se usa INFO para operaciones correctas, WARNING para rechazos e interrupciones
y ERROR para fallos internos o de infraestructura. Logout indica que se ha
procesado la solicitud; también se admite sin una sesión existente.

La lista de campos es cerrada. No se registran contraseñas, hashes, tokens,
cookies, cabeceras, cuerpos de petición/respuesta, correos, nombres, SQL ni
mensajes o stacks de excepciones. Las rutas dinámicas se convierten en
`/api/usuarios/:id` o `/api/usuarios/:id/activo`; las desconocidas se registran
como `otra`. Se descartan los parámetros de consulta. Los errores pueden
incluir un `codigo` de una lista permitida, como `ECONNREFUSED`, `42P01` o
`CONFIGURACION_INVALIDA`, para orientar el diagnóstico.

Estas reglas corresponden a los logs de la aplicación. Los registros de
peticiones generados por la plataforma se gestionan por separado. Los logs por
stdout no constituyen una auditoría transaccional garantizada; un fallo al
escribirlos no cambia el resultado de una operación de la aplicación.

### Validación local

```powershell
npm test
npm run test:postgres
npm run start:postgres
```

`npm test` incluye pruebas del formato, accesos, bajas, códigos HTTP,
identificadores, fallos de base de datos y arranque, y exclusión de secretos
(incluso en rutas desconocidas o parámetros de consulta). La prueba PostgreSQL
requiere el Docker local y las migraciones 001 y 002, ya utilizadas en roles.

Desde el navegador, iniciar sesión con una cuenta local confirmada, cerrar la
sesión y realizar un intento con contraseña incorrecta. En la terminal deben
aparecer `login_correcto`, `logout` y `login_rechazado`. No deben aparecer los
datos introducidos. `npm test` también muestra líneas JSON de otras pruebas;
es normal y no representa un fallo.

### Consulta en Google Cloud

Después del merge y despliegue, revisar Observabilidad → Registros de Cloud Run.
En el Explorador de registros se puede utilizar:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="cinematch"
jsonPayload.evento="login_rechazado"
```

Cambiar el evento por `servidor_iniciado`, `usuario_eliminado` o `error_interno`,
o quitar la última condición y filtrar por `severity>=WARNING`.
La cuenta administradora local y la de Cloud SQL son independientes: para
probar roles en la URL pública se debe registrar y habilitar una cuenta en esa
base, siguiendo el procedimiento del primer administrador.

Referencia: https://docs.cloud.google.com/run/docs/logging
