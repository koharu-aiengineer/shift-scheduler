import { describe, expect, it } from "vitest";
import {
  buildRequirementLookup,
  requirementKey,
  resolveRequirements,
} from "../resolveRequirements";
import type { StaffingRequirement } from "../types";

describe("resolveRequirements", () => {
  it("期間内の全日付にデフォルト必要人数を適用する", () => {
    const requirements: StaffingRequirement[] = [
      { shiftTypeId: "shift-a", defaultRequiredCount: 2, overrides: [] },
    ];

    const resolved = resolveRequirements("2026-09-01", "2026-09-03", requirements);

    expect(resolved).toEqual([
      { date: "2026-09-01", shiftTypeId: "shift-a", requiredCount: 2 },
      { date: "2026-09-02", shiftTypeId: "shift-a", requiredCount: 2 },
      { date: "2026-09-03", shiftTypeId: "shift-a", requiredCount: 2 },
    ]);
  });

  it("特定日の上書きがある日はデフォルトより上書き値を優先する", () => {
    const requirements: StaffingRequirement[] = [
      {
        shiftTypeId: "shift-a",
        defaultRequiredCount: 2,
        overrides: [{ date: "2026-09-02", requiredCount: 5 }],
      },
    ];

    const resolved = resolveRequirements("2026-09-01", "2026-09-03", requirements);

    expect(resolved).toEqual([
      { date: "2026-09-01", shiftTypeId: "shift-a", requiredCount: 2 },
      { date: "2026-09-02", shiftTypeId: "shift-a", requiredCount: 5 },
      { date: "2026-09-03", shiftTypeId: "shift-a", requiredCount: 2 },
    ]);
  });

  it("店舗の定休日・特別休業日（closedDates）は特定日の上書きより優先して0にする", () => {
    const requirements: StaffingRequirement[] = [
      {
        shiftTypeId: "shift-a",
        defaultRequiredCount: 2,
        overrides: [{ date: "2026-09-02", requiredCount: 5 }],
      },
    ];

    const resolved = resolveRequirements("2026-09-01", "2026-09-03", requirements, [
      "2026-09-02",
    ]);

    expect(resolved).toEqual([
      { date: "2026-09-01", shiftTypeId: "shift-a", requiredCount: 2 },
      { date: "2026-09-02", shiftTypeId: "shift-a", requiredCount: 0 },
      { date: "2026-09-03", shiftTypeId: "shift-a", requiredCount: 2 },
    ]);
  });

  it("複数の勤務区分をそれぞれ独立して解決する", () => {
    const requirements: StaffingRequirement[] = [
      { shiftTypeId: "shift-a", defaultRequiredCount: 1, overrides: [] },
      { shiftTypeId: "shift-b", defaultRequiredCount: 3, overrides: [] },
    ];

    const resolved = resolveRequirements("2026-09-01", "2026-09-01", requirements);

    expect(resolved).toEqual([
      { date: "2026-09-01", shiftTypeId: "shift-a", requiredCount: 1 },
      { date: "2026-09-01", shiftTypeId: "shift-b", requiredCount: 3 },
    ]);
  });
});

describe("buildRequirementLookup", () => {
  it("(date, shiftTypeId) で必要人数を引けるマップを作る", () => {
    const requirements: StaffingRequirement[] = [
      {
        shiftTypeId: "shift-a",
        defaultRequiredCount: 2,
        overrides: [{ date: "2026-09-02", requiredCount: 5 }],
      },
    ];
    const resolved = resolveRequirements("2026-09-01", "2026-09-02", requirements);

    const lookup = buildRequirementLookup(resolved);

    expect(lookup.get(requirementKey("2026-09-01", "shift-a"))).toBe(2);
    expect(lookup.get(requirementKey("2026-09-02", "shift-a"))).toBe(5);
    expect(lookup.get(requirementKey("2026-09-03", "shift-a"))).toBeUndefined();
  });
});
