import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, cn } from "../src/index";

describe("@ilm/ui", () => {
  it("merges Tailwind classes deterministically", () => {
    const hidden = Boolean(Date.now() < 0) && "hidden";
    expect(cn("px-2", "px-4", hidden)).toContain("px-4");
    expect(cn("px-2", "px-4")).not.toContain("px-2 ");
  });

  it("renders accessible buttons", () => {
    render(<Button>Connect GitHub</Button>);

    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
  });
});
