import "dotenv/config";

/** Lê uma variável de ambiente obrigatória do .env; lança se ausente. */
export function getRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}
