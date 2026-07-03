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

  it("connects, saves a draft, and publishes from the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /connect github/i }));
    expect(await screen.findAllByText("local/ilm-starter")).toHaveLength(2);

    await user.click(screen.getByRole("link", { name: /editor/i }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Complete Ilm");
    await user.click(screen.getByRole("button", { name: /generate/i }));
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    expect(await screen.findByText(/Draft saved at/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /publish/i }));
    expect(await screen.findByText(/Published at/i)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /^posts$/i }));
    expect(screen.getByRole("heading", { name: "Complete Ilm" })).toBeInTheDocument();
  });
});
