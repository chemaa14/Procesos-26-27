# Procesos-26-27

Proyecto para la asignatura Procesos de la ingenieria del software.

Bienvenidos al proyecto


# Sprint 1 : Desarrollar la arquitectura base
## Ejecución local

Requiere Node.js 24.19 o posterior de la serie 24.

Arrancar:
npm start

Abrir:
http://localhost:3000

Ejecutar pruebas:
npm test

## Arquitectura

- Cliente/index.html: página inicial.
- Cliente/gui.js: presentación e interacción.
- Cliente/rest.js: comunicación con la API.
- Servidor/api.js: servidor HTTP y rutas.
- Servidor/logica.js: lógica de negocio.
- Servidor/datos.js: almacenamiento en memoria.

El backend sirve el frontend desde el mismo origen.
El cliente se comunica con el servidor mediante la API.

## Tecnologías

JavaScript y Node.js para mantener un único lenguaje.
HTML y JavaScript nativo para una interfaz sin compilación.
node:test para ejecutar las pruebas automatizadas.

## Configuración

Variables opcionales: PORT y HOST.
En esta etapa no se necesitan secretos ni servicios externos.

## Gestión de usuarios en memoria

La capa de datos almacena los usuarios en un Map. Los datos se pierden
cuando se reinicia el proceso y no se comparten entre instancias.

La capa lógica permite:
- Dar de alta usuarios pendientes de confirmación.
- Validar nombres y correos y rechazar correos duplicados.
- Listar los usuarios no eliminados.
- Consultar si un usuario está activo.
- Realizar una baja lógica del usuario.

Un usuario está activo cuando está confirmado y no está eliminado.
La confirmación es una operación interna, todavía sin verificación
por correo ni ruta pública.

Estas operaciones aún no están expuestas mediante la API.
El registro con contraseña y la sesión se implementarán posteriormente.

### Pruebas

Ejecutar `npm test`.

Actualmente hay 13 pruebas: 3 del esqueleto y 10 de gestión de usuarios,
incluidos casos de error y protección frente a modificaciones
accidentales de los objetos devueltos.


### API de usuarios

Los datos se almacenan en memoria y se pierden al reiniciar el servidor.

| Método | Ruta | Operación |
|---|---|---|
| POST | /api/usuarios | Crear un usuario |
| GET | /api/usuarios | Listar usuarios no eliminados |
| GET | /api/usuarios/:id/activo | Consultar si un usuario está activo |
| DELETE | /api/usuarios/:id | Eliminar un usuario mediante borrado lógico |

Un usuario está activo cuando está confirmado y no está eliminado.

Las rutas de usuarios requieren provisionalmente la cabecera:
Authorization: Bearer <valor de API_ADMIN_TOKEN>

El token se configura mediante la variable de entorno API_ADMIN_TOKEN.
Si no está configurado, estas rutas responden con 503.
Este mecanismo se sustituirá por la autenticación y autorización
correspondientes durante el desarrollo de las sesiones.

### Pruebas automatizadas

Ejecutar con:

npm test

Actualmente hay 26 pruebas:
- 3 de estructura.
- 10 de lógica de usuarios.
- 13 de la API de usuarios.

### Registro local

POST /api/registro permite registrar una cuenta sin token administrativo.

Recibe un objeto JSON con:
- nombre
- email
- password: entre 15 y 128 caracteres.

La contraseña se almacena mediante un hash scrypt con sal aleatoria.
Ni la contraseña ni su hash aparecen en las respuestas de usuarios.

Respuestas:
- 201: usuario creado, pendiente de confirmación.
- 400: datos no válidos.
- 409: correo ya registrado.

Los usuarios y los hashes siguen en memoria y se pierden al reiniciar.
El inicio de sesión y la confirmación por correo están pendientes.

### Autenticación y sesiones

- POST /api/login: recibe email y password; inicia sesión únicamente
  si la contraseña es correcta y la cuenta está confirmada y no eliminada.
- GET /api/sesion: devuelve el usuario conectado o 401 si la sesión
  no es válida.
- POST /api/logout: elimina la sesión del servidor y borra su cookie.

Login y logout requieren la cabecera X-CineMatch: 1.
El login recibe el cuerpo en formato application/json.

Las sesiones se almacenan en memoria y caducan a las 8 horas.
La cookie utiliza HttpOnly, SameSite=Lax y Path=/.
Con NODE_ENV=production también utiliza Secure y requiere HTTPS.

Usuarios y sesiones se pierden al reiniciar el servidor y no se
comparten entre instancias.

Las rutas administrativas /api/usuarios siguen protegidas mediante
API_ADMIN_TOKEN. Tener una sesión no concede permisos de administrador.

La interfaz y la comprobación de la sesión al recargar el navegador
están pendientes de implementar.