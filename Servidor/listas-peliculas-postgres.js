import { ErrorDatos } from "./errores-datos.js";
import {
  ErrorListas,
  normalizarPlataformasCoincidentes,
  validarElementoLista,
  validarPeliculaIdLista,
  validarUsuarioLista
} from "./listas-peliculas.js";

function mapearFila(fila) {
  return {
    peliculaId: fila.pelicula_id,
    estado: fila.estado,
    titulo: fila.titulo,
    anio: fila.anio ?? null,
    cartel: fila.cartel ?? null,
    disponibleEnPlataformas: Boolean(fila.disponible_en_plataformas),
    plataformasCoincidentes: Array.isArray(fila.plataformas_coincidentes)
      ? fila.plataformas_coincidentes.map(p => ({ ...p }))
      : [],
    recienDisponible: Boolean(fila.recien_disponible),
    actualizadoEn: fila.actualizado_en instanceof Date
      ? fila.actualizado_en.toISOString()
      : String(fila.actualizado_en)
  };
}

export class ListasPeliculasPostgres {
  constructor(pool) {
    this.pool = pool;
  }

  async comprobarUsuario(usuarioId) {
    validarUsuarioLista(usuarioId);
    const { rows } = await this.pool.query(
      "SELECT id FROM usuarios WHERE id = $1 AND eliminado = FALSE",
      [usuarioId]
    );
    if (!rows.length) {
      throw new ErrorDatos("USUARIO_NO_ENCONTRADO", "El usuario no está disponible.");
    }
  }

  async listar(usuarioId) {
    await this.comprobarUsuario(usuarioId);
    const { rows } = await this.pool.query(
      `SELECT pelicula_id, estado, titulo, anio, cartel,
              disponible_en_plataformas, plataformas_coincidentes,
              recien_disponible, actualizado_en
       FROM listas_peliculas
       WHERE usuario_id = $1
       ORDER BY actualizado_en DESC, pelicula_id ASC`,
      [usuarioId]
    );
    return { elementos: rows.map(mapearFila) };
  }

  async guardar(usuarioId, entrada, disponibilidadInicial = null) {
    validarUsuarioLista(usuarioId);
    const datos = validarElementoLista(entrada?.peliculaId, entrada);
    await this.comprobarUsuario(usuarioId);
    const tieneDisponibilidad = disponibilidadInicial !== null;
    const disponible = tieneDisponibilidad ? Boolean(disponibilidadInicial.disponibleEnPlataformas) : false;
    const coincidentes = tieneDisponibilidad
      ? JSON.stringify(normalizarPlataformasCoincidentes(disponibilidadInicial.plataformasCoincidentes))
      : "[]";

    const { rows } = await this.pool.query(
      `INSERT INTO listas_peliculas (
         usuario_id, pelicula_id, estado, titulo, anio, cartel,
         disponible_en_plataformas, plataformas_coincidentes, recien_disponible, actualizado_en
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, FALSE, NOW())
       ON CONFLICT (usuario_id, pelicula_id) DO UPDATE SET
         estado = EXCLUDED.estado,
         titulo = EXCLUDED.titulo,
         anio = EXCLUDED.anio,
         cartel = EXCLUDED.cartel,
         disponible_en_plataformas = CASE
           WHEN $9 THEN EXCLUDED.disponible_en_plataformas
           ELSE listas_peliculas.disponible_en_plataformas
         END,
         plataformas_coincidentes = CASE
           WHEN $9 THEN EXCLUDED.plataformas_coincidentes
           ELSE listas_peliculas.plataformas_coincidentes
         END,
         recien_disponible = CASE
           WHEN $9 AND NOT EXCLUDED.disponible_en_plataformas THEN FALSE
           ELSE listas_peliculas.recien_disponible
         END,
         actualizado_en = NOW()
       RETURNING pelicula_id, estado, titulo, anio, cartel,
                 disponible_en_plataformas, plataformas_coincidentes,
                 recien_disponible, actualizado_en`,
      [
        usuarioId,
        datos.peliculaId,
        datos.estado,
        datos.titulo,
        datos.anio,
        datos.cartel,
        disponible,
        coincidentes,
        tieneDisponibilidad
      ]
    );
    return mapearFila(rows[0]);
  }

  async eliminar(usuarioId, peliculaId) {
    validarUsuarioLista(usuarioId);
    const id = validarPeliculaIdLista(peliculaId);
    await this.comprobarUsuario(usuarioId);
    const { rowCount } = await this.pool.query(
      "DELETE FROM listas_peliculas WHERE usuario_id = $1 AND pelicula_id = $2",
      [usuarioId, id]
    );
    if (rowCount === 0) {
      throw new ErrorListas("ELEMENTO_NO_ENCONTRADO", "La película no está en tu lista.");
    }
  }

  async actualizarDisponibilidad(usuarioId, peliculaId, { disponibleEnPlataformas, plataformasCoincidentes }) {
    validarUsuarioLista(usuarioId);
    const id = validarPeliculaIdLista(peliculaId);
    await this.comprobarUsuario(usuarioId);
    const ahoraDisponible = Boolean(disponibleEnPlataformas);
    const coincidentes = JSON.stringify(normalizarPlataformasCoincidentes(plataformasCoincidentes));

    const { rows } = await this.pool.query(
      `UPDATE listas_peliculas
       SET recien_disponible = CASE
             WHEN $3 = FALSE THEN FALSE
             WHEN disponible_en_plataformas = FALSE AND $3 = TRUE THEN TRUE
             ELSE recien_disponible
           END,
           disponible_en_plataformas = $3,
           plataformas_coincidentes = $4::jsonb
       WHERE usuario_id = $1 AND pelicula_id = $2
       RETURNING pelicula_id, estado, titulo, anio, cartel,
                 disponible_en_plataformas, plataformas_coincidentes,
                 recien_disponible, actualizado_en`,
      [usuarioId, id, ahoraDisponible, coincidentes]
    );
    return rows[0] ? mapearFila(rows[0]) : null;
  }
}
