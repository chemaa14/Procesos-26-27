# S2-01-T01 — Evaluación de fuente de datos

- **Sprint:** 2
- **Hito:** 1
- **Tarea:** S2-01-T01
- **Fecha de evaluación:** 12 de noviembre de 2026
- **Estado:** evaluación documental cerrada; sin implementación
- **Alcance:** elegir la fuente de datos externa para el catálogo de CineMatch y dejar orientaciones para el backlog.

## 1. Alcance y método

Esta tarea solo evalúa alternativas. No implementa adaptadores, rutas, migraciones,
interfaz ni llamadas reales a proveedores.

Se han consultado fuentes oficiales actuales y se han separado los datos
**verificados** de los **no comprobados**. Esta tarea no ha configurado ni usado
credenciales, no ha inspeccionado las existentes y no puede afirmar el estado de
`.env`; tampoco se han usado secretos. No se ha realizado ninguna prueba real
contra esos servicios.

Consecuencias explícitas:

- No se promete disponibilidad en tiempo real.
- No se prometen enlaces directos de reproducción.
- La disponibilidad de streaming puede cambiar y debe tratarse como un dato
  cacheado, con fecha de obtención y posibilidad de estar desactualizado.
- Las condiciones legales citadas son un resumen técnico, no asesoramiento
  jurídico. Deben revisarse antes de publicar el incremento.

## 2. Necesidades de CineMatch

Criterios usados para comparar:

1. Búsqueda por título, con año y paginación.
2. Identificador estable para guardar referencias en la base de datos.
3. Sinopsis, géneros, duración y cartel.
4. Textos en español.
5. Proveedores de streaming en España, distinguiendo suscripción, alquiler y compra.
6. Condiciones compatibles con un proyecto académico no comercial.
7. Atribución exigida, incluida la de JustWatch cuando corresponda.
8. Límites de uso conocidos.
9. Credenciales que puedan mantenerse solo en el servidor.

## 3. Candidatos

- **TMDB (The Movie Database)**: catálogo generalista con búsqueda, detalles,
  imágenes y disponibilidad de streaming por país.
- **OMDb (Open Movie Database)**: API sencilla basada en IMDb, con búsqueda y
  ficha técnica, sin disponibilidad de streaming.
- **Watchmode**: alternativa centrada en disponibilidad de streaming y metadatos,
  con plan gratuito no comercial.
- **JustWatch**: fuente especializada en disponibilidad de streaming. Se analiza
  como proveedor subyacente de TMDB y como integración directa, pero su API es
  de partner y requiere contrato.

## 4. Comparación

### 4.1. Datos y capacidades

| Criterio | TMDB | OMDb | Watchmode |
|---|---|---|---|
| Búsqueda por título + año + paginación | Sí. `/search/movie` admite `query`, `year`/`primary_release_year`, `page`, `language` y `region`; devuelve `total_pages` y `total_results`. | Parcial. `s` busca por título, `y` filtra por año y `page` va de 1 a 100. No hay parámetro de idioma. | Parcial. `/search` busca por nombre, IMDb o TMDB, pero no admite año ni paginación. `/list-titles` pagina y filtra por fecha, pero no busca texto libre por título. |
| Identificador estable | `id` entero de TMDB; la ficha incluye además `imdb_id`. | `imdbID` de IMDb. | `id` de Watchmode, con `imdb_id` y `tmdb_id` en los resultados. |
| Sinopsis | `overview`, localizable con `language`. | `Plot` corto o completo. | `plot_overview`, localizable con `language` (ISO 639-1). |
| Géneros | `genres` con nombre en la ficha; `genre_ids` en la búsqueda. | `Genre` como texto separado por comas. | `genres` con IDs y `genre_names` con nombres. |
| Duración | `runtime` en minutos. | `Runtime` como texto. | `runtime_minutes`. |
| Cartel | `poster_path` + configuración de imágenes de TMDB. | Campo `Poster`; la API de carteles es solo para patronos. | `poster`, `posterMedium` y `posterLarge`; los términos no conceden licencia sobre imágenes de terceros. |
| Español | `language=es-ES`; las traducciones pueden faltar y caer a otro idioma. | No se documenta parámetro de idioma; el campo `Language` describe idiomas de la película, no localización de la ficha. | `language=es` para título y sinopsis; cobertura y calidad no verificadas. |
| Streaming en España | `/movie/{id}/watch/providers` devuelve `results.ES` con `flatrate`, `rent`, `buy`, `free` y `ads`, además de un enlace a la página de TMDB. Datos suministrados por JustWatch. | No ofrece disponibilidad de streaming. | `/title/{id}/sources?regions=ES` devuelve `sub`, `rent`, `buy`, `free` y `tve`, con precio y `web_url`. El plan gratuito limita a 3 países y los enlaces de app son marcadores de posición. |
| Enlaces de reproducción | No devuelve enlaces directos; devuelve un enlace a la página de watch/providers de TMDB. | No aplica. | Devuelve `web_url`; los enlaces de app requieren plan de pago. No garantiza reproducción. |

### 4.2. Condiciones, límites y credenciales

| Criterio | TMDB | OMDb | Watchmode |
|---|---|---|---|
| Uso académico no comercial | La API es gratuita para uso no comercial con atribución. Un proyecto sin ánimo de lucro encaja, pero debe mantenerse la atribución. | Uso personal y no comercial; contenido bajo CC BY-NC 4.0. No hay una cláusula académica específica y los términos restringen copia, indexación y obras derivadas. | Plan Developer gratuito para uso no comercial con atribución. El uso comercial exige plan de pago. |
| Atribución | Logo de TMDB y aviso: “This product uses the TMDB API but is not endorsed or certified by TMDB.” Debe figurar en “About” o “Créditos”. | Atribución CC BY-NC 4.0 y conservación de avisos. | En el plan gratuito, crédito y enlace a Watchmode.com donde se muestren sus datos. |
| Atribución adicional | La disponibilidad de watch/providers exige atribuir la fuente como **JustWatch**. | No aplica. | No aplica. |
| Límites | Límite histórico de 40 peticiones cada 10 s desactivado; queda un límite superior orientativo de unas 40 peticiones por segundo y hay que respetar los `429`. Sin SLA. | Clave gratuita con 1.000 peticiones diarias. No se documenta un límite por minuto en la página consultada. | 2.500 créditos al mes en el plan gratuito, hasta 3 países y límites de peticiones por minuto. El plan gratuito puede cachear datos no gráficos un máximo de 30 días. |
| Credenciales en servidor | Clave de API v3 o API Read Access Token Bearer (sirve también para v3). Debe usarse solo desde el backend; nunca en el navegador. | Clave de API enviada como parámetro `apikey`; debe quedar en el servidor. | Clave de API preferentemente en cabecera `X-API-Key` o `Authorization`; debe quedar en el servidor. |
| Madurez y encaje | Muy buen encaje: una sola integración cubre catálogo y disponibilidad en España. | Buena para fichas y IDs de IMDb, insuficiente para streaming y localización. | Buena para streaming, pero la búsqueda por título con año y paginación no está resuelta en un solo endpoint. |

## 5. Datos verificados en fuentes oficiales

### 5.1. TMDB

Verificado en la documentación oficial:

- `/search/movie` acepta `query`, `include_adult`, `language`, `primary_release_year`,
  `page`, `region` y `year`, y devuelve resultados paginados con `total_pages` y
  `total_results`.
- `/movie/{movie_id}` devuelve `id`, `imdb_id`, `title`, `original_title`,
  `overview`, `genres`, `runtime`, `poster_path`, `release_date` y
  `original_language`, entre otros campos.
- `/movie/{movie_id}/watch/providers` devuelve disponibilidad por país. Para
  España, la clave es `ES`, con listas `flatrate`, `rent`, `buy`, `free` y `ads`,
  y un campo `link` a la página de TMDB.
- La documentación de watch/providers indica expresamente que los datos están
  suministrados por la colaboración con JustWatch y que **es obligatorio atribuir
  la fuente como JustWatch**.
- Las imágenes se construyen con `base_url`, tamaño y `file_path`; el cartel se
  obtiene a partir de `poster_path`.
- El límite histórico de 40 peticiones cada 10 segundos está desactivado; el
  límite actual es orientativo, del orden de 40 peticiones por segundo, y puede
  cambiar.
- La API es gratuita para uso no comercial con atribución. La atribución exige
  logo de TMDB y el aviso literal indicado en la FAQ oficial.
- No se garantiza un SLA.

No verificado en esta tarea:

- El tamaño exacto de página y el máximo de páginas de `/search/movie` no están
  verificados; la referencia oficial consultada no los fija.
- La cobertura real de traducciones al español para cada película.
- La disponibilidad real y actual de proveedores en España para títulos concretos.
- La página oficial de términos de uso devolvió HTTP 403 desde este entorno; las
  condiciones citadas se apoyan en la FAQ oficial y en la referencia de
  watch/providers.

### 5.2. OMDb

Verificado en la documentación oficial:

- Búsqueda por título con `s`, filtro de año con `y` y paginación con `page`
  (1–100).
- Búsqueda por ID con `i`, usando un `imdbID` válido.
- Parámetros `type`, `plot` (`short`/`full`), `r` (`json`/`xml`) y `callback`.
- La ficha devuelve `Title`, `Year`, `Rated`, `Released`, `Runtime`, `Genre`,
  `Plot`, `Language`, `Poster`, `imdbID` y otros campos.
- La API de carteles (`img.omdbapi.com`) es solo para patronos.
- La clave gratuita tiene un límite de 1.000 peticiones diarias.
- El contenido está licenciado bajo CC BY-NC 4.0 y los términos permiten uso
  personal no comercial, con restricciones sobre copia, indexación y obras
  derivadas.
- No se documenta ningún endpoint de disponibilidad de streaming.

No verificado en esta tarea:

- Si una clave gratuita devuelve siempre una URL de cartel utilizable o un
  marcador de posición. La documentación solo indica que la API de carteles es
  para patronos.
- El tamaño de página de la búsqueda; la tabla oficial limita `page` a 1–100,
  pero no fija el número de resultados por página.
- La calidad y actualización de los datos, que son aportados por usuarios.
- El comportamiento exacto de `Language` en cada título.

### 5.3. Watchmode

Verificado en la documentación oficial y en su especificación OpenAPI:

- `/search` busca por nombre, IMDb ID o TMDB ID, pero no acepta año ni
  paginación.
- `/autocomplete-search` tampoco pagina.
- `/list-titles` pagina (`page`, `limit` de 1 a 250), filtra por tipo, región,
  fuente, género, idioma principal y rango de fechas, pero no busca texto libre
  por título.
- `/title/{title_id}/details` devuelve `title`, `plot_overview`,
  `runtime_minutes`, `year`, `genres`, `genre_names`, `poster`, `imdb_id`,
  `tmdb_id` y `original_language`, entre otros.
- El parámetro `language` es un código ISO 639-1 para localizar título y
  sinopsis; por defecto `en`.
- `/title/{title_id}/sources` devuelve `sub`, `rent`, `buy`, `free` y `tve`,
  con región, precio, `web_url` y enlaces de app.
- En el plan gratuito, los enlaces de app devuelven textos como “Deeplinks
  available for paid plans only.” y “TV links available for paid plans only.”;
  `web_url` sí se devuelve.
- El plan Developer es gratuito, no comercial y con atribución, con 2.500
  créditos al mes, hasta 3 países y caché máxima de 30 días para datos no
  gráficos.
- Los términos indican que las imágenes de terceros no están licenciadas por
  Watchmode y que no se debe hacer hotlinking de sus recursos; si se usan, deben
  alojarse y licenciarse por cuenta del proyecto.
- Watchmode no ofrece reproducción ni acceso directo a los vídeos; solo datos,
  enlaces y disponibilidad.

No verificado en esta tarea:

- Que una cuenta gratuita pueda seleccionar España entre sus 3 países. España
  aparece en el catálogo de fuentes y en las regiones, pero no se ha creado una
  cuenta ni se ha comprobado la configuración del plan.
- La cobertura y calidad de las traducciones al español.
- La disponibilidad real de proveedores españoles para títulos concretos.

### 5.4. JustWatch

Verificado en la documentación oficial:

- La API de contenido es una API de partner. Requiere contrato y un token de
  partner para cada petición.
- Ofrece datos por país; España está incluida con locale `es_ES`.
- Las ofertas distinguen `flatrate`, `rent`, `buy`, `ads`, `free` y `none`,
  con precio, moneda, proveedor y URL.
- Exige enlaces de marca a JustWatch junto a cada widget o integración de
  “dónde ver”.
- Los datos se actualizan con frecuencia diaria, pero no se garantiza que la
  disponibilidad mostrada sea en tiempo real.
- Existe una API, un widget y una exportación de datos; el acceso se entrega
  tras el contrato.

No verificado en esta tarea:

- Que exista un alta académica gratuita o un plan no comercial sin contrato.
- Los límites concretos, el precio y las condiciones contractuales para un
  proyecto universitario.
- La cobertura exacta de metadatos (sinopsis, géneros, duración y cartel) en la
  API de partner para todos los títulos.

## 6. Recomendación

**Fuente principal recomendada: TMDB**, usando su API para búsqueda, ficha y
cartel, y su endpoint de watch/providers para la disponibilidad en España.

Motivos:

1. Es la única candidata que resuelve en una sola integración la búsqueda por
   título con año y paginación, el identificador estable, la ficha en español y
   la disponibilidad por país.
2. El endpoint de watch/providers distingue exactamente suscripción (`flatrate`),
   alquiler (`rent`) y compra (`buy`), y además puede incluir `free` y `ads`.
3. España está soportada como región `ES`.
4. El uso no comercial con atribución encaja con el proyecto académico.
5. La integración es más sencilla que mantener TMDB para metadatos y JustWatch
   por separado: TMDB ya consume datos de JustWatch y exige atribuirle la fuente.

Condiciones que deben respetarse:

- Mostrar el logo aprobado de TMDB y el aviso literal en “About” o “Créditos”.
- Atribuir **JustWatch** junto a la disponibilidad de streaming.
- Enlazar a la página de watch/providers de TMDB, no a una reproducción directa.
- No presentar la disponibilidad como tiempo real.
- Mantener la clave o el token de TMDB solo en el servidor.
- Respetar los `429` y aplicar caché y límites de peticiones.

**OMDb no se recomienda como fuente principal.** Puede servir como apoyo puntual
para un `imdbID` o una valoración de IMDb, pero no cubre streaming, no ofrece
localización al español y sus términos son más restrictivos para copia e
indexación.

**Watchmode no se recomienda como fuente principal en este hito.** Es una
alternativa válida si el streaming pasa a ser el centro del producto, pero su
búsqueda por título no combina año y paginación en un solo endpoint, el plan
gratuito limita a 3 países y la licencia de carteles requiere revisión. Además,
duplicaría la integración si TMDB ya cubre la ficha.

**JustWatch directo no se recomienda ahora.** Es la fuente más especializada en
streaming, pero requiere contrato de partner y no se ha verificado que exista un
alta académica gratuita. La vía práctica es consumir sus datos a través de TMDB
y cumplir la atribución exigida.

## 7. Orientaciones para el backlog (sin implementar)

Las siguientes líneas son orientaciones para planificar el backlog, no requisitos
nuevos aprobados ni una descripción de la implementación de tareas futuras. En
particular, S2-01-T02 solo centraliza las consultas del proveedor en el servidor,
las credenciales y el timeout. La API de CineMatch, la persistencia, la interfaz y
la disponibilidad se implementan en sus respectivas tareas del backlog, no en T02.
Esta tarea no crea código, rutas, migraciones ni interfaz.

1. **Contrato del adaptador.** Definir una interfaz interna con operaciones como
   buscar películas por título y año, obtener la ficha por identificador y
   obtener proveedores de España. El resto del sistema no debe depender de la
   forma exacta de la respuesta de TMDB.
2. **Configuración en servidor.** Prever variables como `TMDB_API_KEY` o
   `TMDB_READ_ACCESS_TOKEN`, `TMDB_LANGUAGE=es-ES` y `TMDB_REGION=ES`. No deben
   exponerse al navegador ni registrarse en logs. La tarea correspondiente del
   backlog decidirá si usa clave v3 o API Read Access Token Bearer; el token
   Bearer sirve también para v3.
3. **Caché y errores.** Guardar resultados con fecha de obtención; aplicar caché
   a búsquedas, fichas y proveedores; respetar `429`; definir tiempos de espera,
   reintentos acotados y respuestas de error conocidas.
4. **Modelo de datos.** Prever, como mínimo, `tmdb_id`, título original, título
   en español, año, sinopsis, géneros, duración, `poster_path`, idioma original
   y una instantánea de proveedores con `provider_id`, `provider_name`,
   `monetization_type` (`flatrate`/`rent`/`buy`/`free`/`ads`), `region`,
   `display_priority` y `fetched_at`. No se almacenarán enlaces de reproducción.
5. **Interfaz y atribución.** Reservar un espacio discreto para el logo y aviso
   de TMDB, y para la atribución a JustWatch junto a la disponibilidad. El enlace
   debe llevar a la página de TMDB, no a un reproductor.
6. **Pruebas.** Usar HTTP simulado o fixtures; no exigir credenciales reales.
   Cubrir búsqueda con y sin año, paginación, ficha, cartel, disponibilidad en
   España, traducción ausente, `429`, tiempo de espera y ausencia de secretos en
   logs.
7. **Revisión pendiente.** Confirmar con TMDB y JustWatch la redacción exacta de
   la atribución y el uso de sus logos antes de publicar. Revisar si el proyecto
   sigue siendo no comercial durante toda la evaluación.
8. **Criterio orientativo.** Las tareas del backlog no deben prometer
   disponibilidad en tiempo real ni reproducción directa; deben mostrar la fecha
   de los datos y permitir que la disponibilidad se actualice sin bloquear la
   ficha.

## 8. Fuentes oficiales consultadas

Consultadas el 12 de noviembre de 2026:

### TMDB

- Búsqueda de películas: <https://developer.themoviedb.org/reference/search-movie>
- Ficha de película: <https://developer.themoviedb.org/reference/movie-details>
- Proveedores de streaming: <https://developer.themoviedb.org/reference/movie-watch-providers>
- Imágenes: <https://developer.themoviedb.org/docs/image-basics>
- Límites: <https://developer.themoviedb.org/docs/rate-limiting>
- FAQ y atribución: <https://developer.themoviedb.org/docs/faq>
- Logos y atribución: <https://www.themoviedb.org/about/logos-attribution>
- Términos de uso: <https://www.themoviedb.org/documentation/api/terms-of-use>

### OMDb

- Documentación: <https://www.omdbapi.com/>
- Términos de uso: <https://www.omdbapi.com/legal.htm>
- Clave de API: <https://www.omdbapi.com/apikey.aspx>
- Especificación Swagger: <https://www.omdbapi.com/swagger.json>
- Licencia CC BY-NC 4.0: <https://creativecommons.org/licenses/by-nc/4.0/>

### Watchmode

- Inicio: <https://api.watchmode.com/>
- Documentación: <https://api.watchmode.com/docs>
- Precios y planes: <https://api.watchmode.com/pricing>
- Términos y condiciones: <https://api.watchmode.com/tc>
- Enlaces de app: <https://api.watchmode.com/use-cases/app-deep-links>
- Especificación OpenAPI: <https://api.watchmode.com/openapi.json>

### JustWatch

- Partners de contenido: <https://apis.justwatch.com/docs/content_partner/>
- Documentación de la API: <https://apis.justwatch.com/docs/api/>
- Referencia de la API: <https://apis.justwatch.com/docs/api/reference/>
- Exportación de datos: <https://apis.justwatch.com/docs/data_export/>

## 9. Registro de esta tarea

- No se ha inspeccionado `.env` ni se han usado secretos.
- Esta tarea no ha configurado ni usado credenciales y no ha inspeccionado las
  existentes; no se puede afirmar el estado de `.env`.
- No se ha realizado ninguna prueba real de proveedor.
- No se ha implementado ningún adaptador, ruta, migración ni interfaz.
- No se ha modificado el código de la aplicación.
- No se ha hecho commit, push ni PR.
- No se ha avanzado a otra tarea.
