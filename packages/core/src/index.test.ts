import { describe, expect, it } from "vitest";
import { FILE_EXTENSION } from "./index.js";

describe("core", () => {
  it("uses the .genie file extension", () => {
    expect(FILE_EXTENSION).toBe(".genie");
  });
});
