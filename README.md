# CineMatch — Procesos-26-27

Proyecto de Procesos de la Ingeniería del Software. Sprint 1: arquitectura base.

- Repositorio: https://github.com/chemaa14/Procesos-26-27
- Aplicación pública: https://cinematch-437102806627.europe-west1.run.app

## Alcance del Sprint 1

Este incremento implementa la base SaaS de CineMatch: gestión de cuentas,
autenticación, roles, persistencia y despliegue. El catálogo de películas,
las valoraciones, las recomendaciones y las funciones sociales pertenecen a
incrementos posteriores.

## Tecnologías y justificación

| Tecnología | Uso y motivo |
|---|---|
| Node.js 24 y JavaScript con módulos ES | Permiten usar el mismo lenguaje en cliente y servidor y separar explícitamente las capas. |
| HTTP de Node.js | Expone la API y sirve el frontend del mismo origen, con control directo de rutas y respuestas. |
| HTML, CSS y JavaScript del navegador | Interfaz sencilla sin compilación ni framework adicional para el alcance del sprint. |
| PostgreSQL 17 y `pg` | Persistencia relacional con restricciones, transacciones y consultas SQL parametrizadas. |
| Docker Compose | Proporciona una base local reproducible, separada de producción. |
| `node:crypto` y scrypt | Hash de contraseñas con sal aleatoria, sin almacenar contraseñas en texto plano. |
| Google OAuth/OpenID Connect y `google-auth-library` | Autenticación externa y verificación del token de identidad con la biblioteca del proveedor. |
| Nodemailer y Gmail SMTP con TLS | Envío autenticado del enlace de confirmación para la demostración académica. |
| `node:test` y `node:assert/strict` | Pruebas automatizadas con aserciones, integradas en Node.js. |
| GitHub y GitHub Actions | Historial incremental, revisión mediante PR y ejecución automática de pruebas. |
| Cloud Build, Cloud Run y Cloud SQL | Construcción y despliegue del backend público y persistencia centralizada. |
| Secret Manager | Proporciona las credenciales al servicio sin incorporarlas al repositorio. |

## Estado actual

La aplicación permite registrar cuentas pendientes, iniciar y cerrar sesión,
consultar el perfil y eliminar la propia cuenta. Los usuarios y sus hashes se
guardan en PostgreSQL. Hay roles `usuario` y `administrador`, comprobados en el
servidor en cada petición. El administrador puede listar cuentas, consultar su
estado y eliminar otras cuentas desde la interfaz.

El acceso con Google está implementado. Las cuentas nuevas de Google se crean
confirmadas y con rol `usuario`. Las cuentas locales reciben un enlace de confirmación mediante Gmail SMTP,
con caducidad de 24 horas y un solo uso. Activo significa `confirmado && !eliminado`. En el arranque
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
- `Servidor/confirmaciones.js`: reglas de emisión y confirmación.
- `Servidor/confirmaciones-postgres.js`: tokens y límites persistentes, con transacciones.
- `Servidor/correo.js`: envío con Nodemailer y Gmail SMTP mediante TLS.
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

Copiar `.env.example` a `.env` y completar los valores locales. `.env` no se sube a Git.
Los siguientes valores son ejemplos de desarrollo, nunca credenciales de entrega:

```powershell
Copy-Item .env.example .env
```

Configuración mínima para ejecutar el servidor:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=cinematch
DB_USER=cinematch
DB_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_LOCAL
SMTP_USER=TU_CUENTA@gmail.com
SMTP_PASSWORD=CONTRASEÑA_DE_APLICACION_GMAIL
APP_URL=http://localhost:3000
NODE_ENV=development
```

Mantener la contraseña existente si la base ya está creada.

```powershell
docker compose up -d --wait
Get-Content -Raw -Encoding UTF8 .\sql\001-usuarios.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\002-roles.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\003-oauth-google.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\004-confirmacion-correo.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\005-correos-disponibles.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
npm run start:postgres
```

Abrir http://localhost:3000. `start:postgres` carga `.env` si existe.
`npm start` también usa PostgreSQL, pero recibe las variables del entorno,
como ocurre en Cloud Run. `PORT` vale 3000 por defecto; en producción se escucha
en `0.0.0.0` salvo que se indique `HOST`.

La migración 002 añade el rol sin borrar cuentas ni contraseñas y asigna
`usuario` a las cuentas existentes. No se debe borrar el volumen local.

## Variables de entorno

| Nombres | Necesidad |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Obligatorias para PostgreSQL. |
| `SMTP_USER`, `SMTP_PASSWORD`, `APP_URL` | Obligatorias para el servidor con confirmación de correo. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Las tres juntas para habilitar Google; vacías para deshabilitarlo en desarrollo. |
| `NODE_ENV` | Configura el comportamiento de producción, incluidas las cookies seguras. |
| `HOST`, `PORT` | Opcionales; Cloud Run proporciona `PORT`. |

Los valores reales se mantienen en `.env` local o en la configuración y los secretos
de Cloud Run. `.env.example` solo contiene nombres y ejemplos sin credenciales.
El CI usa una base efímera y credenciales ficticias; no requiere secretos de producción.

## Primer administrador y cuentas de prueba

1. Registrar una cuenta desde la aplicación y confirmarla mediante el correo recibido.
2. Con una conexión de administración a la base correcta, sustituir el correo
   del ejemplo y ejecutar:

```sql
UPDATE usuarios
SET rol = 'administrador'
WHERE email = 'tu-correo@example.com'
  AND eliminado = FALSE AND confirmado = TRUE AND password_hash IS NOT NULL
RETURNING id, email, rol, confirmado;
```

Debe devolver exactamente la cuenta elegida. No incluir contraseñas en SQL,
commits ni capturas. La promoción administrativa se hace explícitamente en SQL;
el registro público siempre crea usuarios normales.

Para una cuenta normal, registrarla y confirmar el enlace recibido por correo.

### Acceso del profesor para la revisión

Abrir la URL pública e iniciar sesión con el correo y la contraseña de la cuenta
administradora de revisión, entregados por separado junto con la entrega.
La cuenta debe estar confirmada y promocionada en Cloud SQL mediante la consulta
anterior. Al entrar se muestra el panel de administración con el listado, rol y
estado de las cuentas. Una cuenta creada en Docker local no existe automáticamente
en producción. Las credenciales de revisión no se publican en este README ni en Git.

## API y permisos

Se conservan los nombres españoles usados por el proyecto: `/api/usuarios`
equivale a `/users` en las tareas y `/activo` a `/active`.

| Método y ruta | Acceso |
|---|---|
| GET `/api/health` | Público |
| POST `/api/registro` | Público; crea una cuenta pendiente |
| POST `/api/confirmacion` | Público; confirma con un token válido de un solo uso |
| POST `/api/confirmacion/reenviar` | Público; solicita otro enlace con límites de envío |
| POST `/api/auth/google` | Público; prepara el acceso externo |
| GET `/api/auth/google/callback` | Retorno de Google; valida el intento y la identidad |
| POST `/api/prueba/email` | Público; validación del formato de correo, sin crear cuenta |
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

La segunda orden requiere PostgreSQL con las cinco migraciones (001 a 005) aplicadas. Comprueba
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

La base de producción debe tener las cinco migraciones aplicadas, en orden:
001 usuarios, 002 roles, 003 OAuth y sesiones, 004 confirmación y 005 correos
reutilizables tras la baja. Las migraciones se aplican con el propietario en la
base `cinematch`, antes del despliegue que las necesita. El usuario de ejecución
`cinematch_app` no necesita permisos DDL.

Conceder con el propietario los permisos sobre las tablas y la secuencia identity:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE usuarios, sesiones, intentos_oauth, confirmaciones_correo, limite_correo
TO cinematch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cinematch_app;
```

Configurar también las tres variables Google y las tres variables de correo
indicadas en sus apartados. Las contraseñas de base de datos, cliente OAuth y SMTP
se inyectan desde Secret Manager, con acceso para la cuenta de servicio.

El arranque comprueba las tablas de usuarios, sesiones, intentos OAuth, confirmaciones
y límites de correo, y valida la configuración SMTP antes de escuchar.
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
requiere el Docker local y las migraciones 001 a 005.

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
   de contraseña. Tras una baja crea una cuenta nueva, sin reactivar la anterior. Nunca toma el rol del cliente.
6. El servidor crea su propia sesión de 8 horas y redirige a `/`. La interfaz
   recupera `/api/sesion`. Los tokens de Google no se entregan al frontend ni
   se guardan en logs, localStorage o la base de datos.

**Coincidencia de correos:** si existe una cuenta local con el mismo correo,
se solicita entrar con la contraseña. No se confirma ni vincula automáticamente.
La vinculación de cuentas no forma parte del Sprint 1. Un cambio de correo en Google
no crea otra cuenta: la identidad se mantiene por `sub`; el correo local no se
actualiza automáticamente. El registro local sigue pendiente de confirmación por
correo; ahora puede confirmarse mediante el enlace enviado por Gmail.

Las sesiones guardan solo el identificador del usuario: los permisos y la
eliminación se vuelven a comprobar contra la base en cada petición. Los intentos
OAuth se consumen una sola vez; sesiones e intentos caducados se limpian al crear
otros nuevos. Un fallo del proveedor o una cancelación muestran mensajes conocidos,
sin reflejar textos externos ni códigos/tokens en la URL final.

### Cloud Run

Aplicar las migraciones 001 a 005 y los permisos descritos en Despliegue.
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
  de un solo uso. Requiere las migraciones 001 a 005.
- Manual: entrar con una cuenta de prueba de Google cuyo correo no exista como
  cuenta local; comprobar perfil, recarga, reinicio, cierre y nuevo login. Repetir
  en la URL pública. Cancelar Google y verificar que aparece un mensaje claro.
  Una cuenta local con el mismo correo debe conservar su estado y contraseña.

Referencias técnicas:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://github.com/googleapis/google-auth-library-nodejs

## Confirmación por correo (Hito 4)

El registro conserva la contraseña con scrypt y crea una cuenta pendiente.
Después reserva un token aleatorio de 32 bytes y espera el resultado del envío
SMTP antes de responder. La respuesta 201 contiene `usuario` y `correoEnviado`;
si el envío falla, la cuenta permanece pendiente y se puede solicitar otro.
SMTP aceptado no garantiza entrega en la bandeja de entrada: revisar spam.

El correo incluye `APP_URL/#confirmar=TOKEN`. El fragmento no se envía en
peticiones HTTP ni en Referer. La interfaz lo retira del historial y solo lo
mantiene en memoria mientras está abierta la página. Al recargar antes de
confirmar hay que abrir nuevamente el enlace del correo. La vista previa no
confirma: se necesita pulsar **Confirmar cuenta**.

- `POST /api/confirmacion`: JSON `{token}`, cabecera `X-CineMatch: 1`.
  Activa la cuenta con 200; token inválido, caducado o usado devuelve 400.
  No inicia sesión automáticamente ni cambia el rol.
- `POST /api/confirmacion/reenviar`: JSON `{email}`, misma cabecera.
  Devuelve el mismo mensaje 200 para cuentas desconocidas, activas, eliminadas,
  limitadas y pendientes. Un correo con formato inválido devuelve 400.
- Otros métodos devuelven 405; falta de cabecera de protección, 403.
- Un token dura 24 horas, se almacena como SHA-256 y se consume junto con la
  activación dentro de una transacción. Las cuentas eliminadas no se reactivan.
- Cada nuevo envío invalida el enlace anterior. Espera mínima de 60 segundos,
  máximo cinco intentos por cuenta/hora y 100 globales/hora, compartidos en
  PostgreSQL. Un fallo SMTP también cuenta para estos límites.
- El reenvío sirve también para cuentas pendientes de hitos anteriores.
- Google sigue creando cuentas confirmadas; no se vinculan cuentas automáticamente.
- Logs: `confirmacion_enviada`, `cuenta_confirmada`, `error_correo`.
  No incluyen el enlace, token, contraseña SMTP, dirección del destinatario ni
  errores crudos del proveedor. `EAUTH` orienta a credenciales Gmail; `ETIMEDOUT`
  a conectividad. No habilitar debug SMTP en producción.

### Configuración Gmail

Activar verificación en dos pasos y crear una contraseña de aplicación.
Usar la dirección de esa misma cuenta en `SMTP_USER` y la contraseña de
aplicación en `SMTP_PASSWORD`. No es el secreto del cliente OAuth.
El adaptador utiliza `smtp.gmail.com:465` con TLS y tiempos de espera acotados.
Los mensajes salen desde esa dirección Gmail, con el nombre CineMatch.

Esta configuración es adecuada para la demostración de bajo volumen.
Gmail aplica sus propios límites y controles de acceso; el envío real debe
comprobarse también desde Cloud Run. Para un servicio de mayor volumen,
conviene migrar el adaptador a un proveedor de correo transaccional.

### Correo en producción

Configurar `SMTP_USER` con la cuenta remitente, `SMTP_PASSWORD` con una referencia
al secreto de la contraseña de aplicación y `APP_URL` con el origen público:
`https://cinematch-437102806627.europe-west1.run.app`.
La contraseña SMTP y el secreto del cliente OAuth son credenciales distintas.
La cuenta de servicio de Cloud Run necesita acceso al secreto SMTP.
Tras el despliegue, comprobar desde la URL pública el registro, recepción del
correo, confirmación, login, recarga y logout.

### Pruebas y límites de la validación

`npm test` incluye pruebas aisladas sin enviar correos reales: bloqueo antes de
confirmar y acceso después, caducidad, manipulación, eliminación, uso único,
reenvío, límites, fallos SMTP, protección HTTP y exclusión de secretos.
`npm run test:postgres` añade pruebas con dos conexiones para comprobar reserva
y consumo únicos, reenvío, caducidad y eliminación. Usar una base de pruebas
local o CI, nunca producción. Las pruebas no requieren credenciales SMTP.
La validación de entrega real requiere el Gmail configurado por el usuario.

Fuentes:
- https://support.google.com/accounts/answer/185833
- https://nodemailer.com/guides/using-gmail
- https://nodemailer.com/smtp


### Bajas y nuevo registro (migración 005)

Aplicar `sql/005-correos-disponibles.sql` en local y en Cloud SQL antes de
publicar esta versión. La migración también libera los correos de bajas anteriores.
Se conserva el registro de baja (`eliminado = true`); no es un borrado físico.
Solo las cuentas vigentes reservan correo e identidad de Google.
La baja propia y la realizada por un administrador permiten registrarse de nuevo:
se crea otro identificador, con rol usuario, sin recuperar sesiones ni permisos.
El registro por contraseña requiere confirmar otra vez el correo. Google crea una
cuenta nueva tras verificar la identidad. El inicio con la contraseña antigua sigue
rechazado. Eliminar no equivale a suspender o prohibir futuros registros.
Las contraseñas admiten de 8 a 128 caracteres; las existentes siguen funcionando.
Registro e inicio de sesión incluyen un botón accesible para mostrar u ocultar la
contraseña. Al enviar el formulario vuelve a ocultarse.


## GitHub Flow y despliegue continuo

Cada cambio se desarrolla en una rama y se integra en `main` mediante una PR,
después de ejecutar las pruebas locales y comprobar el CI en verde.
`.github/workflows/ci.yml` ejecuta las pruebas en cada PR hacia `main` y en cada
cambio de `main`: instala dependencias, prepara PostgreSQL 17, aplica las cinco
migraciones y ejecuta `npm test` y `npm run test:postgres`.

El despliegue está conectado a `main` mediante el trigger de Cloud Build del
proyecto `cinematch-procesos`. Construye la imagen y actualiza el servicio
`cinematch` de Cloud Run en `europe-west1`. La configuración del trigger reside
en Google Cloud; el workflow de GitHub Actions contiene la parte de CI.
Las migraciones y la configuración de nuevos secretos se preparan antes del
merge; el despliegue del código se dispara automáticamente al integrar cambios.

## Errores y diagnóstico

| Situación | Comportamiento y comprobación |
|---|---|
| Credenciales incorrectas o cuenta pendiente | El login se rechaza con un mensaje genérico. Confirmar el correo antes de entrar. |
| Sin sesión / sin permisos | Respuestas 401 / 403. Un 401 inicial de `/api/sesion` es normal si aún no se ha iniciado sesión. |
| Correo de cuenta vigente repetido | Registro rechazado con 409. La baja permite un registro nuevo con otro identificador. |
| Enlace inválido, caducado o utilizado | Confirmación rechazada con 400; solicitar un enlace nuevo y usar el más reciente. |
| Fallo al enviar el correo | La cuenta se conserva pendiente y la interfaz informa del fallo; se permite reenvío con límites. |
| Fallo de Google | La interfaz muestra un mensaje conocido. El log `oauth_rechazado` incluye un diagnóstico permitido, por ejemplo `google_invalid_client`. |
| Fallo de red o respuesta no JSON | El cliente de comunicación muestra un mensaje de conexión o respuesta inesperada. |
| Fallo interno | Respuesta genérica sin detalles internos; consultar el identificador de solicitud en los logs. |
| Error al arrancar | Revisar nombres de variables, conexión PostgreSQL, migraciones y configuración SMTP/OAuth. |

## Comprobación final de la entrega

1. Ejecutar `npm test` y `npm run test:postgres` sobre una base local de pruebas.
2. Comprobar el CI de la PR, integrar y verificar el despliegue automático del mismo commit.
3. En la URL pública, verificar registro pendiente, confirmación, login local,
   persistencia de sesión al recargar, logout y acceso con Google.
4. Probar los permisos con un usuario y un administrador, y las dos formas de baja.
5. Comprobar que un nuevo registro tras una baja no hereda permisos ni sesiones.
6. Entregar URL del repositorio, URL pública y credenciales administrativas por
   un canal separado. Mantener la aplicación disponible durante la evaluación.

Las comprobaciones manuales complementan las pruebas automatizadas; no las sustituyen.
Las capturas de CI/CD y las métricas reales del sprint se documentan en la memoria.
