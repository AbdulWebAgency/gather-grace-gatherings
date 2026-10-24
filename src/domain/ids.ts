export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export function roundMoney(value: number): number {
  return Math.round(value);
}

/** User-entered money: non-finite or negative input becomes 0. */
export function safeMoney(value: number): number {
  return Number.isFinite(value) ? roundMoney(Math.max(0, value)) : 0;
}
