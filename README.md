# CineMatch — Procesos-26-27

Prototipo funcional de catálogo y disponibilidad de películas para la asignatura
de Procesos de la Ingeniería del Software. Reúne la base SaaS del Sprint 1 y los
incrementos S2-01 (catálogo, búsqueda paginada y ficha) y S2-02 (preferencias de
plataformas en España y disponibilidad propia).

- Repositorio: <https://github.com/chemaa14/Procesos-26-27>
- Aplicación pública: <https://cinematch-437102806627.europe-west1.run.app>
- Documentación de sprint: [docs/sprint2](docs/sprint2)

## Estado actual

La aplicación permite registrarse, confirmar la cuenta por correo, iniciar y
cerrar sesión, consultar el perfil, eliminar la propia cuenta y, con una sesión
válida, buscar películas en TMDB, paginar resultados y abrir una ficha. También
permite seleccionar plataformas de streaming para España y consultar en la ficha
la disponibilidad asociada a esa selección.

El administrador puede listar cuentas, consultar su estado y eliminarlas desde la
interfaz. El acceso con Google reutiliza el flujo OAuth existente del servidor.
Los permisos y el estado de la cuenta se comprueban en cada petición contra la
base de datos.

### Incluido en Sprint 1

- Registro público con cuenta pendiente y confirmación por correo.
- Login local, sesiones de 8 horas, logout y perfil propio.
- Roles `usuario` y `administrador`, con autorización en el servidor.
- Baja lógica propia y administrativa, con revocación de sesiones.
- Google OAuth/OpenID Connect con identidad estable por `sub`.
- Persistencia PostgreSQL, logs JSON y despliegue en Cloud Run.

### Incluido en Sprint 2

- **S2-01:** búsqueda de películas en TMDB, contrato normalizado, paginación,
  ficha de detalle y estados de carga, error y reintento.
- **S2-02:** catálogo de plataformas para España, preferencias por cuenta,
  selección vacía válida y disponibilidad propia. La ficha separa suscripción,
  alquiler, compra, gratis y anuncios; solo marca como incluidas las
  suscripciones cuyo proveedor coincide con la selección de la cuenta.

### Límites de alcance

Recomendaciones, reseñas, valoraciones, historial, listas y funciones sociales
siguen pendientes. No se inventan películas, valoraciones, recomendaciones ni
enlaces de proveedores. La disponibilidad se limita a la información de TMDB
para España y no verifica el contrato real del usuario. La interfaz no ofrece
reproducción ni promete disponibilidad en tiempo real.

## Tecnologías

| Tecnología | Uso y motivo |
|---|---|
| Node.js 24 (`>=24.19.0 <25`) y módulos ES | Mismo lenguaje en cliente y servidor, con capas separadas. |
| HTTP nativo de Node.js | API y frontend en el mismo origen, sin framework adicional. |
| HTML, CSS y JavaScript del navegador | Interfaz sin compilación ni dependencias de cliente. |
| PostgreSQL 17 y `pg` | Persistencia relacional con consultas parametrizadas y transacciones. |
| Docker Compose | Base local reproducible, separada de producción. |
| `node:crypto` y scrypt | Hash de contraseñas con sal aleatoria. |
| Google OAuth/OpenID Connect y `google-auth-library` | Acceso externo y verificación del token de identidad. |
| Nodemailer y Gmail SMTP con TLS | Envío del enlace de confirmación para la demostración. |
| `node:test` y `node:assert/strict` | Pruebas automatizadas integradas en Node.js. |
| GitHub Actions, Cloud Build, Cloud Run y Cloud SQL | CI, construcción, despliegue y persistencia centralizada. |
| Secret Manager | Credenciales fuera del repositorio. |

No se añadieron frameworks, fuentes remotas, scripts externos ni dependencias de
cliente. El CSS vive en `Cliente/estilos.css` y se sirve desde el mismo backend.

## Arquitectura

- `Cliente/index.html`: estructura de acceso, perfil, catálogo, plataformas y administración.
- `Cliente/estilos.css`: interfaz cinematográfica, diseño responsive y accesibilidad visual.
- `Cliente/google-g.svg`: recurso SVG oficial de la G multicolor de Google, servido localmente.
- `Cliente/gui.js`: interacción, presentación con `textContent` y navegación por teclado.
- `Cliente/rest.js`: peticiones HTTP del mismo origen con cookie de sesión.
- `Cliente/catalogo.js`: validación, datos ausentes, URLs de cartel y estado del catálogo.
- `Cliente/disponibilidad.js`: normalización y presentación de disponibilidad.
- `Cliente/preferencias-estado.js`: estado de la selección de plataformas.
- `Cliente/selector-plataformas.js`: selector visual y guardado de preferencias.
- `Servidor/api.js`: rutas, validación HTTP, archivos estáticos y autorización.
- `Servidor/logica.js`: reglas de negocio y eliminación con permisos.
- `Servidor/datos.js`: repositorio en memoria para pruebas.
- `Servidor/datos-postgres.js`: repositorio persistente con SQL parametrizado.
- `Servidor/inicio-postgres.js`: arranque con PostgreSQL y adaptadores reales.
- `Servidor/catalogo-tmdb.js`: transporte HTTP interno con TMDB.
- `Servidor/busqueda-peliculas.js`, `detalle-pelicula.js`, `disponibilidad-pelicula.js`: servicios del catálogo.
- `Servidor/plataformas-tmdb.js`: catálogo de proveedores y validación de selección.
- `Servidor/preferencias-plataformas.js` y `preferencias-plataformas-postgres.js`: preferencias por cuenta.
- `Servidor/sesiones.js`, `sesiones-postgres.js`, `intentos-oauth.js`: sesiones e intentos OAuth.
- `Servidor/confirmaciones.js`, `confirmaciones-postgres.js` y `correo.js`: confirmación por correo.
- `Servidor/google-oauth.js`: adaptador de Google con PKCE, `state` y `nonce`.
- `Servidor/actividad.js`: logs JSON con campos cerrados y sin secretos.
- `sql/`: migraciones aplicadas en orden.

El navegador nunca recibe `TMDB_READ_ACCESS_TOKEN`, secretos SMTP, el secreto
OAuth ni tokens de Google. Las contraseñas se guardan como hash scrypt con sal y
no se devuelven por API.

## Ejecución local en PowerShell

Requisitos: Node.js `>=24.19.0` de la serie 24 y Docker Compose.

```powershell
npm.cmd ci
```

Crear `.env` a partir de `.env.example` solo si todavía no existe, para no
sobrescribir una configuración local ya preparada. `.env` no se versiona:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Configuración mínima para arrancar con PostgreSQL:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=cinematch
DB_USER=cinematch
DB_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_LOCAL
SMTP_USER=REEMPLAZAR_POR_CUENTA@gmail.com
SMTP_PASSWORD=REEMPLAZAR_POR_CLAVE_DE_APLICACION
APP_URL=http://localhost:3000
NODE_ENV=development
```

Mantener la contraseña existente si la base ya está creada. Después, iniciar
PostgreSQL y aplicar las seis migraciones reales en orden:

```powershell
docker compose up -d --wait
Get-Content -Raw -Encoding UTF8 .\sql\001-usuarios.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\002-roles.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\003-oauth-google.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\004-confirmacion-correo.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\005-correos-disponibles.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding UTF8 .\sql\006-preferencias-plataformas.sql | docker compose exec -T db psql -U cinematch -d cinematch -v ON_ERROR_STOP=1
npm.cmd run start:postgres
```

Abrir <http://localhost:3000>. `start:postgres` carga `.env` si existe.
`npm.cmd start` también usa PostgreSQL, pero toma las variables del entorno, como
en Cloud Run. `PORT` vale 3000 por defecto; en producción se escucha en
`0.0.0.0` salvo que se indique `HOST`.

La migración 002 conserva las cuentas existentes y les asigna el rol `usuario`.
La migración 005 permite reutilizar un correo después de una baja. No se debe
borrar el volumen local para actualizar el esquema.

### Migraciones

| Migración | Contenido |
|---|---|
| `001-usuarios.sql` | Tabla `usuarios`, identidad y estado básico. |
| `002-roles.sql` | Columna `rol` con `usuario` y `administrador`. |
| `003-oauth-google.sql` | `google_sub`, `sesiones` e `intentos_oauth`. |
| `004-confirmacion-correo.sql` | Confirmaciones y límite global de correo. |
| `005-correos-disponibles.sql` | Correo e identidad de Google reservados solo por cuentas vigentes. |
| `006-preferencias-plataformas.sql` | Tabla `preferencias_plataformas` por cuenta, región `ES` y proveedor. |

Antes de desplegar código que use preferencias hay que aplicar la migración 006
en local y en Cloud SQL.

## Variables de entorno

| Variables | Necesidad |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Obligatorias para PostgreSQL. |
| `SMTP_USER`, `SMTP_PASSWORD`, `APP_URL` | Obligatorias para arrancar con `Servidor/inicio-postgres.js` y para el registro con confirmación por correo. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Las tres juntas habilitan Google; vacías lo desactivan en desarrollo. Una configuración parcial impide arrancar. |
| `TMDB_READ_ACCESS_TOKEN` | Sprint 2. Token de lectura de TMDB; sin él, las cuentas funcionan y el catálogo responde 503. |
| `TMDB_TIMEOUT_MS` | Opcional, entero entre 1 y 120000; por defecto 10000. |
| `NODE_ENV` | Comportamiento de producción, incluidas cookies `Secure`. |
| `HOST`, `PORT` | Opcionales; Cloud Run proporciona `PORT`. |

Los valores reales se mantienen en `.env` local o en Cloud Run y Secret Manager.
`.env.example` solo contiene nombres y ejemplos sin credenciales. El CI usa una
base efímera y credenciales ficticias. Las variables de preferencias reutilizan
la sesión y el token de TMDB; la migración 006 no añade variables nuevas.

## Recorridos de la aplicación

### Cuenta y acceso

1. **Registro.** Crea una cuenta pendiente. El correo incluye un enlace con el
   token en el fragmento `#confirmar=...`; la interfaz lo retira del historial.
   La confirmación se completa al pulsar **Confirmar cuenta**.
2. **Login.** Solo permite cuentas confirmadas y no eliminadas. Un nuevo login
   sustituye la sesión anterior de ese navegador.
3. **Google.** Usa el flujo OAuth del servidor y conserva el botón
   `#entrar-google`. Las cuentas nuevas de Google se crean confirmadas con rol
   `usuario`; no se vinculan automáticamente cuentas locales del mismo correo.
4. **Reenvío.** Permite solicitar otro enlace con límites de 60 segundos, cinco
   intentos por cuenta/hora y 100 globales/hora.
5. **Perfil y baja.** El usuario puede cerrar sesión o eliminar su cuenta. La
   baja es lógica, revoca las sesiones y permite un registro posterior nuevo.

### Catálogo y ficha (S2-01)

`GET /api/peliculas?titulo=...&anio=...&pagina=...` busca en TMDB y devuelve un
contrato propio:

```json
{
  "pagina": 1,
  "totalPaginas": 2,
  "totalResultados": 21,
  "peliculas": [
    {
      "id": 438631,
      "titulo": "Dune",
      "anio": 2021,
      "cartel": "https://image.tmdb.org/t/p/w500/ejemplo.jpg"
    }
  ]
}
```

- `titulo` es obligatorio, se recorta y admite hasta 200 caracteres.
- `anio` es opcional, de cuatro dígitos entre 1000 y 9999.
- `pagina` es opcional, entero entre 1 y 500.
- Los datos ausentes se marcan como no disponibles; no se inventan.
- `GET /api/peliculas/:id` devuelve título, año, sinopsis, géneros, duración y
  cartel normalizados. La ruta rechaza identificadores no canónicos.

La interfaz busca solo al enviar el formulario, reinicia la página a 1 en cada
búsqueda nueva, conserva la búsqueda al volver del detalle y descarta respuestas
antiguas. El detalle se cierra con Escape o con **Volver a resultados**.

### Plataformas y disponibilidad (S2-02)

- `GET /api/plataformas` devuelve el catálogo de proveedores para España.
- `GET /api/preferencias/plataformas` devuelve la selección de la cuenta.
- `PUT /api/preferencias/plataformas` reemplaza la selección con `{ "plataformas": [ids] }`.
- Una selección vacía es válida y significa exactamente “ninguna plataforma”,
  nunca “todas”.
- `GET /api/peliculas/:id/disponibilidad` consulta TMDB `watch/providers` y usa
  solo `results.ES`. Separa suscripción (`flatrate`), alquiler (`rent`), compra
  (`buy`), gratis (`free`) y anuncios (`ads`).
- `incluidas` solo contiene proveedores de suscripción cuyo ID coincide con una
  plataforma seleccionada. No se agrupan marcas, canales ni nombres parecidos.
- Si no hay datos o coincidencias, se informa de que no consta disponibilidad en
  las suscripciones; no se afirma que la película no se pueda ver.
- Un fallo de disponibilidad no impide consultar la ficha.

## API y permisos

| Método y ruta | Acceso |
|---|---|
| GET `/api/health` | Público |
| POST `/api/registro` | Público; crea una cuenta pendiente |
| POST `/api/confirmacion` | Público; confirma con un token válido de un solo uso |
| POST `/api/confirmacion/reenviar` | Público; solicita otro enlace con límites |
| POST `/api/auth/google` | Público; prepara el acceso externo |
| GET `/api/auth/google/callback` | Retorno de Google; valida intento e identidad |
| POST `/api/prueba/email` | Público; valida el formato de correo sin crear cuenta |
| POST `/api/login` | Credenciales de una cuenta confirmada y no eliminada |
| GET `/api/sesion` | Sesión válida |
| POST `/api/logout` | Cierra la sesión y borra su cookie |
| GET `/api/perfil` | Datos de la propia cuenta |
| DELETE `/api/perfil` | Elimina la propia cuenta |
| GET `/api/peliculas` | Sesión válida; búsqueda paginada |
| GET `/api/peliculas/:id` | Sesión válida; ficha normalizada |
| GET `/api/peliculas/:id/disponibilidad` | Sesión válida; disponibilidad en España |
| GET `/api/plataformas` | Sesión válida; catálogo de plataformas |
| GET `/api/preferencias/plataformas` | Sesión válida; preferencias propias |
| PUT `/api/preferencias/plataformas` | Sesión válida y `X-CineMatch: 1`; guarda preferencias |
| GET `/api/usuarios` | Administrador; listado de cuentas no eliminadas |
| POST `/api/usuarios` | Administrador; alta sin contraseña |
| GET `/api/usuarios/:id/activo` | Administrador; devuelve `{ activo: boolean }` |
| DELETE `/api/usuarios/:id` | Cuenta propia o administrador |

Las rutas protegidas responden 401 sin sesión válida y 403 sin permiso. El rol se
consulta de nuevo en el repositorio en cada petición. El mecanismo provisional
`API_ADMIN_TOKEN` fue retirado. Login, logout, altas administrativas,
eliminaciones y escrituras de preferencias exigen `X-CineMatch: 1`. La cookie es
`HttpOnly`, `SameSite=Lax` y `Secure` en producción. Las respuestas JSON llevan
`Cache-Control: no-store`.

## Interfaz cinematográfica (Sprint 2)

La tarea de mejora estética y README de la rama
`sprint2/hito1-actualizacion-readme-interfaz` reorganiza la presentación sin
cambiar los IDs, los contratos de la API, los permisos ni el comportamiento del
cliente. La referencia de organización visual es Letterboxd para la jerarquía de
catálogo y ficha, y JustWatch para la presentación de disponibilidad. No existe
integración con esas webs ni se copian sus datos; sus marcas pertenecen a sus
titulares.

Paleta e identidad:

| Uso | Color |
|---|---|
| Fondo berenjena oscuro | `#201827` |
| Acento coral | `#ff977d` |
| Blanco cálido | `#f8f2e9` |

La cabecera agrupa marca y lema; el buscador es el bloque protagonista cuando hay
sesión; los resultados usan una rejilla de carteles; la ficha cuida cartel, datos
y disponibilidad; las plataformas se presentan como tarjetas seleccionables. Los
botones primarios (coral), secundarios (borde) y destructivos (peligro) son
coherentes en toda la aplicación. Acceso, registro y reenvío permanecen visibles
y organizados en tarjetas, sin ocultar funciones.

Criterios de validación visual:

- Responsive real desde 320 px hasta escritorio, sin desbordamiento horizontal.
  La tabla de administración es la única excepción y desplaza su contenido dentro
  de `.tabla-usuarios`.
- Objetivos táctiles de al menos 44 px en botones y controles.
- Contraste AA sobre fondo oscuro, estados `focus-visible` claros y navegación
  por teclado. Se conservan labels, `role="status"`, `role="alert"`, `hidden`,
  `aria-live`, `aria-busy`, `aria-invalid` y el cierre del detalle con Escape.
- `prefers-reduced-motion` desactiva transiciones y desplazamientos decorativos.

El recurso de la G de Google se descarga del paquete oficial de branding y se
sirve localmente como `/google-g.svg`; el botón blanco mantiene el texto
**Continuar con Google**, el espaciado y el contraste indicados por Google. El
servidor expone únicamente `/estilos.css` y `/google-g.svg` como rutas estáticas
nuevas.

Referencias visuales y de marca:

- Letterboxd: <https://letterboxd.com/>
- JustWatch: <https://www.justwatch.com/>
- Google Identity branding guidelines: <https://developers.google.com/identity/branding-guidelines>
- Paquete oficial de iconos de acceso: <https://developers.google.com/static/identity/images/signin-assets.zip>

## Pruebas

Comandos en PowerShell:

```powershell
npm.cmd test
npm.cmd run test:postgres
```

- `npm.cmd test` ejecuta `node --test` sobre las pruebas unitarias, HTTP y de
  integración en memoria. No requiere PostgreSQL, TMDB, Gmail ni credenciales.
- `npm.cmd run test:postgres` carga `.env` si existe y comprueba persistencia con
  PostgreSQL real. Requiere una base exclusiva con las migraciones 001 a 006
  aplicadas.
- GitHub Actions prepara PostgreSQL 17, aplica las seis migraciones y ejecuta
  ambos comandos en cada PR hacia `main` y en cada cambio de `main`.

La cobertura automatizada incluye registro, sesiones, roles, OAuth, confirmación,
catálogo, paginación, detalle, preferencias, disponibilidad, aislamiento entre
cuentas, permisos, errores y ausencia de secretos en logs. La comprobación visual
en navegador y la entrega real de correo siguen siendo validaciones manuales.
No se añadieron pruebas que solo inspeccionen CSS.

## Primer administrador y cuenta de revisión

1. Registrar una cuenta y confirmarla con el correo recibido.
2. Con una conexión administrativa a la base correcta, ejecutar:

```sql
UPDATE usuarios
SET rol = 'administrador'
WHERE email = 'tu-correo@example.com'
  AND eliminado = FALSE AND confirmado = TRUE AND password_hash IS NOT NULL
RETURNING id, email, rol, confirmado;
```

Debe devolver exactamente la cuenta elegida. No incluir contraseñas en SQL,
commits ni capturas. El registro público siempre crea usuarios normales.

Para la revisión del profesor, abrir la URL pública e iniciar sesión con la cuenta
administradora entregada por un canal separado. Las credenciales de revisión no
se publican en este README ni en Git. Una cuenta creada en Docker local no existe
automáticamente en producción.

## Google OAuth y confirmación por correo

En Google Auth Platform crear un cliente OAuth de tipo **Aplicación web** con
estas URI de redirección exactas, sin barra final:

- `http://localhost:3000/api/auth/google/callback`
- `https://cinematch-437102806627.europe-west1.run.app/api/auth/google/callback`

Añadir al `.env` local:

```dotenv
GOOGLE_CLIENT_ID=REEMPLAZAR_POR_EL_ID_DEL_CLIENTE
GOOGLE_CLIENT_SECRET=REEMPLAZAR_POR_EL_SECRETO
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

El servidor genera `state`, `nonce`, verificador PKCE y una cookie temporal. Un
intento OAuth dura 10 minutos y se consume una sola vez. `google-auth-library`
comprueba firma, emisor, audiencia y caducidad del ID token; el adaptador valida
además `nonce` y `email_verified`. Los tokens de Google no se entregan al
frontend ni se guardan en logs, localStorage o la base de datos.

El registro local sigue pendiente de confirmación por correo. El correo incluye
`APP_URL/#confirmar=TOKEN`; el fragmento no se envía al servidor ni en el
`Referer`. El token dura 24 horas, se almacena como SHA-256 y se consume junto
con la activación en una transacción. Un nuevo envío invalida el enlace anterior.

Gmail requiere verificación en dos pasos y una contraseña de aplicación. Usar la
misma dirección en `SMTP_USER` y la contraseña de aplicación en `SMTP_PASSWORD`;
no es el secreto OAuth. Esta configuración es adecuada para la demostración de
bajo volumen y debe verificarse también desde Cloud Run.

## Despliegue en Cloud Run

El servicio usa PostgreSQL en Cloud SQL y mantiene el flujo OAuth del servidor.
Configuración del entorno:

- `NODE_ENV=production`, `HOST=0.0.0.0`.
- `DB_HOST=/cloudsql/cinematch-procesos:europe-west1:cinematch-db`.
- `DB_PORT=5432`, `DB_NAME=cinematch`, `DB_USER=cinematch_app`.
- `DB_PASSWORD`: referencia al secreto `cinematch-db-password`.
- `APP_URL=https://cinematch-437102806627.europe-west1.run.app`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` y `GOOGLE_CLIENT_SECRET` como secreto.
- `SMTP_USER`, `SMTP_PASSWORD` como secreto y `APP_URL`.
- `TMDB_READ_ACCESS_TOKEN` como secreto, con timeout opcional.

La cuenta de servicio de Cloud Run necesita Cloud SQL Client y acceso de lectura
a los secretos que utiliza. Las migraciones se aplican con el propietario en la
base `cinematch`, en orden 001 a 006, antes del despliegue que las necesita. El
usuario de ejecución `cinematch_app` no necesita permisos DDL.

### Permisos mínimos e incidencia 42501

Si la migración 006 ya está aplicada pero el servicio registra o devuelve un
error PostgreSQL `42501` (`insufficient_privilege`) al leer o guardar
preferencias, puede faltar algún privilegio, pero el mensaje del código no
identifica necesariamente el objeto concreto. Antes de conceder nada, comprobar
con una conexión administrativa el rol efectivo, el acceso al esquema y los
permisos reales sobre la tabla:

```sql
SELECT current_user, session_user;
SELECT has_schema_privilege('cinematch_app', 'public', 'USAGE') AS puede_usar_public;
SELECT has_table_privilege('cinematch_app', 'public.preferencias_plataformas', 'SELECT') AS puede_leer,
       has_table_privilege('cinematch_app', 'public.preferencias_plataformas', 'INSERT') AS puede_insertar,
       has_table_privilege('cinematch_app', 'public.preferencias_plataformas', 'DELETE') AS puede_borrar;
```

Si falta `USAGE` en el esquema, concederlo solo a ese rol; si falta algún permiso
de tabla, conceder únicamente los que hayan devuelto `false`, como propietario y
sin `GRANT ALL` ni DDL para el usuario de ejecución:

```sql
GRANT USAGE ON SCHEMA public TO cinematch_app;

GRANT SELECT, INSERT, DELETE
ON TABLE public.preferencias_plataformas
TO cinematch_app;
```

La aplicación no actualiza filas de esa tabla: reemplaza la selección con
`DELETE` e `INSERT`. No se debe conceder `UPDATE` ni `TRUNCATE` por comodidad,
ni ampliar permisos sobre otras tablas u objetos sin una comprobación previa.
Los permisos de las tablas anteriores se mantienen:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE usuarios, sesiones, intentos_oauth, confirmaciones_correo, limite_correo
TO cinematch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cinematch_app;
```

`preferencias_plataformas` no usa secuencia propia. Tras el cambio de permisos,
repetir la consulta de preferencias y el guardado con una cuenta normal. Si el
error continúa, comprobar que se ha concedido sobre `public.preferencias_plataformas`
en la base correcta y que el rol de ejecución es realmente `cinematch_app`.

El arranque comprueba las tablas de usuarios, sesiones, intentos OAuth,
confirmaciones, límites de correo y preferencias, y valida la configuración SMTP
antes de escuchar. Tras el despliegue, buscar `servidor_iniciado` con
`puerto: 8080` y comprobar login, permisos, catálogo y disponibilidad.

## Logs y diagnóstico

`Servidor/actividad.js` emite una línea JSON por registro. Cada petición incluye
`solicitudId`, `metodo`, `ruta`, `estado`, `duracionMs`, `time`, `evento`,
`message` y `severity`. Las rutas dinámicas se convierten en plantillas como
`/api/peliculas/:id`; no se registran consultas, cuerpos, cookies, tokens,
contraseñas, correos ni mensajes crudos de proveedores.

Eventos principales: `usuario_registrado`, `login_correcto`, `login_rechazado`,
`logout`, `usuario_eliminado`, `usuarios_listados`, `estado_consultado`,
`acceso_denegado`, `peticion_rechazada`, `error_interno`, `confirmacion_enviada`,
`cuenta_confirmada`, `oauth_rechazado`, `servidor_iniciado` y
`servidor_cerrado`. En Cloud Run se pueden consultar desde Observabilidad con
filtros como:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="cinematch"
jsonPayload.evento="login_rechazado"
```

| Situación | Comportamiento y comprobación |
|---|---|
| Credenciales incorrectas o cuenta pendiente | Login rechazado con mensaje genérico. Confirmar el correo antes de entrar. |
| Sin sesión o sin permisos | Respuestas 401/403. Un 401 inicial de `/api/sesion` es normal. |
| Correo vigente repetido | Registro 409. La baja permite un registro nuevo con otro identificador. |
| Enlace inválido, caducado o usado | Confirmación 400; solicitar un enlace nuevo. |
| Fallo SMTP | La cuenta queda pendiente y se permite reenvío con límites. |
| Fallo de Google | Mensaje conocido; el log incluye un diagnóstico permitido. |
| Catálogo sin token | Las cuentas funcionan y el catálogo responde 503. |
| Error de TMDB | Se devuelve un estado controlado sin mensajes del proveedor. |
| Error 42501 en preferencias | Diagnosticar con `has_schema_privilege` y `has_table_privilege`; aplicar solo el `GRANT` que falte. |

## Documentación de Sprint 2

- [S2-01-T01 — Fuente de datos](docs/sprint2/S2-01-T01-fuente-datos.md)
- [S2-01-T06 — Pruebas del catálogo](docs/sprint2/S2-01-T06-pruebas-catalogo.md)
- [S2-02-T01 — Disponibilidad y región](docs/sprint2/S2-02-T01-disponibilidad-region.md)
- [S2-02-T02 — Persistencia de plataformas](docs/sprint2/S2-02-T02-persistencia-plataformas.md)
- [S2-02-T03 — API de preferencias](docs/sprint2/S2-02-T03-api-preferencias.md)
- [S2-02-T04 — Selector de plataformas](docs/sprint2/S2-02-T04-selector-plataformas.md)
- [S2-02-T05 — Disponibilidad de películas](docs/sprint2/S2-02-T05-disponibilidad-pelicula.md)
- [S2-02-T06 — Pruebas de preferencias](docs/sprint2/S2-02-T06-pruebas-preferencias.md)

Referencias técnicas:

- TMDB authentication: <https://developer.themoviedb.org/docs/authentication-application>
- TMDB search movie: <https://developer.themoviedb.org/reference/search-movie>
- TMDB movie details: <https://developer.themoviedb.org/reference/movie-details>
- TMDB watch providers: <https://developer.themoviedb.org/reference/movie-watch-providers>
- Google OAuth web server: <https://developers.google.com/identity/protocols/oauth2/web-server>
- Google OpenID Connect: <https://developers.google.com/identity/openid-connect/openid-connect>
- Cloud Run logging: <https://docs.cloud.google.com/run/docs/logging>

## Créditos y atribución

- Datos e imágenes de películas: [The Movie Database (TMDB)](https://www.themoviedb.org/).
  <span lang="en">This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
- Datos de disponibilidad: TMDB `watch/providers`, cuya fuente se identifica como
  [JustWatch](https://www.justwatch.com/) en la ficha. La fecha mostrada es la
  consulta de CineMatch, no una actualización de JustWatch.
- Botón de Google: recurso oficial de la G multicolor descargado del paquete de
  [Google Identity branding guidelines](https://developers.google.com/identity/branding-guidelines)
  y servido localmente. Google es una marca de Google LLC.
- Letterboxd y JustWatch se citan únicamente como referencias visuales y de
  organización; sus marcas y contenidos pertenecen a sus titulares.

## Validación final

```powershell
npm.cmd test
git diff --check
```

Registro de esta revisión:

- La suite completa, ejecutada antes de los ajustes finales de CSS y README,
  terminó con 229/229 pruebas.
- En un entorno aislado con datos ficticios se comprobó en navegador login,
  búsqueda, ficha, guardado de preferencias y actualización de la selección, a
  1280 px y 320 px, sin desbordamiento horizontal en la ficha.
- No se verificaron OAuth real, entrega real de correo ni un despliegue nuevo;
  esas comprobaciones siguen pendientes.
