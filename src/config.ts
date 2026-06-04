import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// .env fica na raiz do repo (mesma pasta de onde o backend roda).
loadEnv({ path: resolve(process.cwd(), ".env") });

/** Lê uma variável de ambiente obrigatória do .env; lança se ausente. */
export function getRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}
