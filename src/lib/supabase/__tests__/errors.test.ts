import { describe, expect, it } from "vitest";
import { isUniqueViolation, toFriendlyInsertError } from "../errors";

describe("isUniqueViolation", () => {
  it("returns true for Postgres unique_violation (23505)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe("toFriendlyInsertError", () => {
  it("replaces the message with the friendly one on a unique violation", () => {
    const result = toFriendlyInsertError(
      { code: "23505", message: 'duplicate key value violates unique constraint "x"' },
      "この名称は既に登録されています",
    );

    expect(result.message).toBe("この名称は既に登録されています");
  });

  it("keeps the original DB message for other errors", () => {
    const result = toFriendlyInsertError(
      { code: "23503", message: "foreign key violation" },
      "この名称は既に登録されています",
    );

    expect(result.message).toBe("foreign key violation");
  });
});
