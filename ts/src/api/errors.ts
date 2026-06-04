/** Erro de aplicação com status HTTP e código de domínio. */
export class AppError extends Error {
  constructor(public status: number, public codigo: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}
