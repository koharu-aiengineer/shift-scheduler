export type RandomGenerator = () => number; // [0, 1) を返す

// mulberry32: 軽量なシード付き疑似乱数生成器。同じシードなら常に同じ数列を
// 生成するため、局所探索の再現性テストと「再生成」時の多様性の両方に使える。
export function createRandomGenerator(seed: number): RandomGenerator {
  let state = seed >>> 0;
  return function mulberry32(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// SolverInput.randomSeedが省略された場合に使う、都度異なるシード。
export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

// [0, exclusiveMax) の整数を返す
export function randomInt(rng: RandomGenerator, exclusiveMax: number): number {
  return Math.floor(rng() * exclusiveMax);
}

// Fisher-Yatesで配列を破壊的にシャッフルする
export function shuffleInPlace<T>(array: T[], rng: RandomGenerator): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// itemsから1件だけランダムに選ぶ（空配列ならundefined）
export function pickRandomElement<T>(rng: RandomGenerator, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(rng, items.length)];
}
