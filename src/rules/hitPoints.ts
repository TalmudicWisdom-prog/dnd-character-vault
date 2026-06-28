export type HitPointState = {
  currentHp: number;
  maxHp: number;
  temporaryHp: number;
};

export type HitPointChange = HitPointState & {
  absorbedByTemporaryHp: number;
};

export function applyDamage(state: HitPointState, amount: number): HitPointChange {
  const damage = Math.max(0, Math.round(amount || 0));
  const absorbedByTemporaryHp = Math.min(state.temporaryHp, damage);
  const remainingDamage = Math.max(0, damage - absorbedByTemporaryHp);
  return {
    currentHp: Math.max(0, state.currentHp - remainingDamage),
    maxHp: Math.max(0, state.maxHp),
    temporaryHp: Math.max(0, state.temporaryHp - absorbedByTemporaryHp),
    absorbedByTemporaryHp,
  };
}

export function applyHealing(state: HitPointState, amount: number): HitPointChange {
  const healing = Math.max(0, Math.round(amount || 0));
  return {
    currentHp: Math.min(Math.max(0, state.maxHp), Math.max(0, state.currentHp) + healing),
    maxHp: Math.max(0, state.maxHp),
    temporaryHp: Math.max(0, state.temporaryHp),
    absorbedByTemporaryHp: 0,
  };
}
