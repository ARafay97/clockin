import { describe, it, expect } from "vitest";
import { encodeQR } from "../lib/qr";

describe("encodeQR", () => {
  it("encodes a punch payload into a square matrix with a finder pattern in each corner-ish area", () => {
    const { matrix, size } = encodeQR("CAFEPUNCH|1|CAFE01|123456|ABCDEFGHJK", "M");
    expect(matrix).toHaveLength(size);
    expect(matrix[0]).toHaveLength(size);
    // top-left finder pattern's outer ring is dark
    expect(matrix[0][0]).toBe(true);
    expect(matrix[6][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
  });

  it("picks a version large enough for longer payloads without throwing", () => {
    const { matrix } = encodeQR("CAFEPUNCH|1|SOME-LONGER-SITE-IDENTIFIER-01|99999999|ABCDEFGHJK", "M");
    expect(matrix.length).toBeGreaterThan(0);
  });

  it("produces a deterministic matrix for the same input", () => {
    const a = encodeQR("hello world", "M");
    const b = encodeQR("hello world", "M");
    expect(a.matrix).toEqual(b.matrix);
  });
});
