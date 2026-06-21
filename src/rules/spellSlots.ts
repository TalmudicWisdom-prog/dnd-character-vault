export function remainingSpellSlots(maximum: number, used: number) {
  return Math.max(0, maximum - used);
}

export function changeUsedSpellSlots(maximum: number, used: number, change: number) {
  return Math.max(0, Math.min(Math.max(0, maximum), used + change));
}

export function resetUsedSpellSlots<T extends Record<string, number>>(used: T) {
  return Object.fromEntries(Object.keys(used).map((level) => [level, 0])) as T;
}

export function shouldConfirmLongRest(hasUsedSlots: boolean, confirm: (message: string) => boolean) {
  return confirm(hasUsedSlots ? "Take a Long Rest and reset used spell slots?" : "Take a Long Rest? No used spell slots need resetting right now.");
}
