/** Salida y entrada con el mismo peso: salvia y arcilla, no el verde y el rojo de cotización. */
export const flowIn = 'text-[color:var(--flow-in)]';
export const flowOut = 'text-[color:var(--flow-out)]';

export function flowClass(amount: number): string {
  if (amount > 0) return flowIn;
  if (amount < 0) return flowOut;
  return 'text-slate-400';
}
