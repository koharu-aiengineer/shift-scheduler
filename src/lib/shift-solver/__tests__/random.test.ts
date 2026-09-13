import { describe, expect, it } from "vitest";
import {
  createRandomGenerator,
  pickRandomElement,
  randomInt,
  shuffleInPlace,
} from "../random";

describe("createRandomGenerator", () => {
  it("同じシードなら同じ数列を返す（再現性）", () => {
    const rngA = createRandomGenerator(42);
    const rngB = createRandomGenerator(42);

    const sequenceA = Array.from({ length: 5 }, () => rngA());
    const sequenceB = Array.from({ length: 5 }, () => rngB());

    expect(sequenceA).toEqual(sequenceB);
  });

  it("異なるシードなら異なる数列になる", () => {
    const rngA = createRandomGenerator(1);
    const rngB = createRandomGenerator(2);

    const sequenceA = Array.from({ length: 5 }, () => rngA());
    const sequenceB = Array.from({ length: 5 }, () => rngB());

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it("常に[0, 1)の範囲を返す", () => {
    const rng = createRandomGenerator(123);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomInt", () => {
  it("常に[0, exclusiveMax)の範囲の整数を返す", () => {
    const rng = createRandomGenerator(7);
    for (let i = 0; i < 100; i++) {
      const value = randomInt(rng, 10);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });
});

describe("shuffleInPlace", () => {
  it("要素の集合は変えず順序だけを変える", () => {
    const rng = createRandomGenerator(99);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffleInPlace([...original], rng);

    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(original);
  });

  it("同じシードなら同じ並び替え結果になる", () => {
    const resultA = shuffleInPlace([1, 2, 3, 4, 5], createRandomGenerator(2026));
    const resultB = shuffleInPlace([1, 2, 3, 4, 5], createRandomGenerator(2026));

    expect(resultA).toEqual(resultB);
  });

  it("十分な要素数があれば元の並びから変化する", () => {
    const original = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = shuffleInPlace([...original], createRandomGenerator(1));

    expect(shuffled).not.toEqual(original);
  });
});

describe("pickRandomElement", () => {
  it("空配列ならundefinedを返す", () => {
    expect(pickRandomElement(createRandomGenerator(1), [])).toBeUndefined();
  });

  it("配列内の要素のいずれかを返す", () => {
    const rng = createRandomGenerator(5);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 20; i++) {
      expect(items).toContain(pickRandomElement(rng, items));
    }
  });
});
