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