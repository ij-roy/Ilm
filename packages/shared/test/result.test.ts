import { describe, expect, it } from "vitest";
import { AppError, err, isErr, isOk, ok, validationError } from "../src/index";

describe("Result helpers", () => {
  it("creates typed success results", () => {
    const result = ok({ id: "post-1" });

    expect(isOk(result)).toBe(true);
    expect(result.value.id).toBe("post-1");
  });

  it("creates typed error results", () => {
    const result = err(validationError("Title is required"));

    expect(isErr(result)).toBe(true);
    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error.code).toBe("validation_error");
  });
});
