const MAX_GOLS = 10; // trunca a matriz (P de >10 gols é desprezível)
const RHO = -0.05; // correção Dixon-Coles

function poissonPmf(k: number, lam: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lam) * lam ** k) / fact;
}

function dcTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1.0 - lh * la * rho;
  if (i === 0 && j === 1) return 1.0 + lh * rho;
  if (i === 1 && j === 0) return 1.0 + la * rho;
  if (i === 1 && j === 1) return 1.0 - rho;
  return 1.0;
}

export function scoreMatrix(lambdaHome: number, lambdaAway: number, rho: number = RHO): number[][] {
  const m: number[][] = Array.from({ length: MAX_GOLS + 1 }, () => new Array(MAX_GOLS + 1).fill(0));
  let total = 0;
  for (let i = 0; i <= MAX_GOLS; i++) {
    for (let j = 0; j <= MAX_GOLS; j++) {
      let p = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway) * dcTau(i, j, lambdaHome, lambdaAway, rho);
      p = Math.max(p, 0.0);
      m[i]![j] = p;
      total += p;
    }
  }
  if (total > 0) {
    for (let i = 0; i <= MAX_GOLS; i++) {
      for (let j = 0; j <= MAX_GOLS; j++) m[i]![j]! /= total;
    }
  }
  return m;
}

export function probs1x2(matrix: number[][]): { home: number; draw: number; away: number } {
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i]!.length; j++) {
      const p = matrix[i]![j]!;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

export function probTotalOver(matrix: number[][], linha: number): number {
  let s = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i]!.length; j++) {
      if (i + j > linha) s += matrix[i]![j]!;
    }
  }
  return s;
}
