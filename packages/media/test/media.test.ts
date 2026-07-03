import { describe, expect, it } from "vitest";
import { planMediaAsset } from "../src/index";

describe("@ilm/media", () => {
  it("plans media into explicit canonical folders", () => {
    const result = planMediaAsset({
      kind: "image",
      fileName: "diagram.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      alt: "Architecture diagram"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.location.path).toBe("media/images/diagram.png");
    }
  });
});
