import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app";

describe("@ilm/cms", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ilm.cms.state.v1");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the production CMS shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("Git-native publishing")).toBeInTheDocument();
  });
});
