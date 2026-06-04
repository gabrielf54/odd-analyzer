import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// O backend roda de dentro de ts/; o .env fica na RAIZ do repo (um nível acima).
// Tenta ../.env (coexistência com o Python) e ./.env (quando ts/ virar a raiz).
loadEnv({ path: [resolve(process.cwd(), "..", ".env"), resolve(process.cwd(), ".env")] });

/** Lê uma variável de ambiente obrigatória do .env; lança se ausente. */
export function getRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}
