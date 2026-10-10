// Errores del contrato de almacenamiento, independientes de la base de datos.
export class ErrorDatos extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorDatos";
    this.codigo = codigo;
  }
}
