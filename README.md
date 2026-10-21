# CineMatch — Procesos-26-27

Proyecto de Procesos de la Ingeniería del Software. Sprint 1: arquitectura base.

## Estado actual

La aplicación permite registrar cuentas pendientes, iniciar y cerrar sesión,
consultar el perfil y eliminar la propia cuenta. Los usuarios y sus hashes se
guardan en PostgreSQL. Hay roles `usuario` y `administrador`, comprobados en el
servidor en cada petición. El administrador puede listar cuentas, consultar su
estado y eliminar otras cuentas desde la interfaz.

El acceso con Google está implementado. Las cuentas nuevas de Google se crean
confirmadas y con rol `usuario`. La confirmación por correo de las cuentas locales
sigue pendiente. Activo significa `confirmado && !eliminado`. En el arranque
con PostgreSQL, las sesiones y los intentos OAuth se comparten entre instancias
y sobreviven a reinicios; las versiones en memoria se usan en pruebas.
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
- `Servidor/google-oauth.js`: adaptador de Google con `google-auth-library`.
- `Servidor/intentos-oauth.js`: intentos de acceso de un solo uso y duración de 10 minutos.
- `Servidor/sesiones-postgres.js`: sesiones de 8 horas, con el token almacenado como SHA-256.
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
Get-Content -Raw -Encoding UTF8 .\sql\003-oauth-google.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
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

La segunda orden requiere PostgreSQL con las tres migraciones (001, 002 y 003) aplicadas. Comprueba
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
5. Recargar y reiniciar el servidor: PostgreSQL conserva la sesión durante sus 8 horas, salvo cierre de sesión o eliminación de la cuenta.

## Despliegue en Cloud Run

El servicio usa PostgreSQL en Cloud SQL. Configuración del entorno:

- `NODE_ENV=production`, `HOST=0.0.0.0`.
- `DB_HOST=/cloudsql/cinematch-procesos:europe-west1:cinematch-db`.
- `DB_PORT=5432`, `DB_NAME=cinematch`, `DB_USER=cinematch_app`.
- `DB_PASSWORD`: referencia al secreto `cinematch-db-password`.
- Instancia de Cloud SQL adjunta y cuenta de servicio con Cloud SQL Client y
  acceso al contenido del secreto.

**Antes de fusionar esta rama y desplegar el código nuevo**, ejecutar
`sql/003-oauth-google.sql` (con 001 y 002 ya aplicadas) en la base `cinematch` de Cloud SQL con el propietario de la
tabla. El usuario de ejecución de la aplicación no necesita permisos DDL.
La migración es compatible con el código anterior y puede aplicarse antes.
Las tablas nuevas necesitan permisos para el usuario de ejecución. Ejecutar
con el propietario, en la base `cinematch`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sesiones, intentos_oauth TO cinematch_app;
```

Las sesiones antiguas en memoria no se migran; habrá que entrar otra vez tras
este primer despliegue. Los usuarios, sus roles y contraseñas se conservan.

El arranque comprueba `usuarios.google_sub`, `sesiones` e `intentos_oauth` antes de escuchar.
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
requiere el Docker local y las migraciones 001, 002 y 003.

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


## Hito 4: acceso con Google

### Configuración local

En Google Auth Platform crear un cliente OAuth de tipo **Aplicación web**, con
estas URI de redirección exactas (sin barra final):

- `http://localhost:3000/api/auth/google/callback`
- `https://cinematch-437102806627.europe-west1.run.app/api/auth/google/callback`

Mantener OAuth en pruebas y añadir las cuentas que vayan a probarlo en Público →
Usuarios de prueba. No es necesario configurar orígenes JavaScript para este flujo
de redirección gestionado por el servidor.

Añadir a tu `.env` existente, conservando las variables de PostgreSQL:

```dotenv
GOOGLE_CLIENT_ID=REEMPLAZAR_POR_EL_ID_DEL_CLIENTE
GOOGLE_CLIENT_SECRET=REEMPLAZAR_POR_EL_SECRETO
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

`.env.example` solo contiene nombres y ejemplos. No subir `.env` ni el JSON de
credenciales. Si las tres variables OAuth están vacías, el login local funciona
y el botón de Google muestra que el servicio no está disponible. Configuración
parcial produce `CONFIGURACION_INVALIDA` al arrancar. En local abrir exactamente
`http://localhost:3000`, y mantener `NODE_ENV` en desarrollo (no producción).

### Flujo y decisiones

1. `Cliente/gui.js` escucha el botón y llama a `prepararAccesoGoogle()` en
   `Cliente/rest.js`. Este envía POST `/api/auth/google` con `X-CineMatch: 1`.
2. `Servidor/api.js` genera `state`, `nonce`, verificador PKCE y una cookie
   temporal HttpOnly/SameSite=Lax (Secure en producción). Guarda el intento en
   PostgreSQL con caducidad de 10 minutos y devuelve la URL de Google.
3. El navegador visita Google. Google devuelve un código al GET
   `/api/auth/google/callback`. El servidor consume el intento atómicamente,
   comprobando `state` y la cookie del navegador, y canjea el código con PKCE.
4. `google-auth-library` comprueba firma, emisor, audiencia y caducidad del ID
   token. El adaptador comprueba también `nonce` y `email_verified`.
5. `LogicaUsuarios.autenticarGoogle()` busca por `sub`, la identidad estable de
   Google. Si es nueva, crea la cuenta confirmada con rol `usuario` y sin hash
   de contraseña. Rechaza las cuentas eliminadas. Nunca toma el rol del cliente.
6. El servidor crea su propia sesión de 8 horas y redirige a `/`. La interfaz
   recupera `/api/sesion`. Los tokens de Google no se entregan al frontend ni
   se guardan en logs, localStorage o la base de datos.

**Coincidencia de correos:** si existe una cuenta local con el mismo correo,
se solicita entrar con la contraseña. No se confirma ni vincula automáticamente.
La vinculación de cuentas queda fuera de esta rama. Un cambio de correo en Google
no crea otra cuenta: la identidad se mantiene por `sub`; el correo local no se
actualiza automáticamente. El registro local sigue pendiente de confirmación por
correo, que se implementará en la siguiente rama.

Las sesiones guardan solo el identificador del usuario: los permisos y la
eliminación se vuelven a comprobar contra la base en cada petición. Los intentos
OAuth se consumen una sola vez; sesiones e intentos caducados se limpian al crear
otros nuevos. Un fallo del proveedor o una cancelación muestran mensajes conocidos,
sin reflejar textos externos ni códigos/tokens en la URL final.

### Cloud Run

Aplicar la migración 003 y los permisos descritos en Despliegue antes del merge.
Configurar estas variables en Cloud Run:

- `GOOGLE_CLIENT_ID`: ID del cliente web.
- `GOOGLE_REDIRECT_URI`: la URI pública exacta indicada arriba.
- `GOOGLE_CLIENT_SECRET`: referencia a un secreto de Secret Manager, por ejemplo
  `cinematch-google-client-secret`, versión 1. Dar acceso a ese secreto a la cuenta
  de servicio de Cloud Run, igual que se hizo con la contraseña de la base.

No cambiar `DB_*`, la conexión Cloud SQL ni la cuenta de servicio. El código usa
la URI de configuración y no construye redirecciones a partir de la cabecera Host.
El navegador solo necesita recibir las cookies y la URL de autorización; el secreto
se utiliza exclusivamente en el servidor.

### Validación

- `npm test`: incluye pruebas OAuth con proveedor simulado y tokens RSA firmados
  para comprobar firma, emisor, audiencia, expiración, nonce y correo verificado;
  también cancelación, replay, protección del inicio, conflictos de cuentas,
  borrado, rol y ausencia de secretos en logs. No requiere credenciales de Google.
- `npm run test:postgres`: incluye el contrato persistente entre dos pools,
  altas concurrentes, identidad Google, revocación/caducidad de sesiones e intento
  de un solo uso. Requiere la migración 003.
- Manual: entrar con una cuenta de prueba de Google cuyo correo no exista como
  cuenta local; comprobar perfil, recarga, reinicio, cierre y nuevo login. Repetir
  en la URL pública. Cancelar Google y verificar que aparece un mensaje claro.
  Una cuenta local con el mismo correo debe conservar su estado y contraseña.

Referencias técnicas:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://github.com/googleapis/google-auth-library-nodejs
