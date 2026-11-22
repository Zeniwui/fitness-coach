import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { seedSupabaseSession } from "../test/authHelpers";

describe("Cuaderno de Hierro Theme Switcher (Dark & Light)", () => {
  beforeEach(() => {
    window.localStorage.removeItem("fc-theme-mode");
    document.documentElement.removeAttribute("data-theme");
    seedSupabaseSession("tok-athlete");
  });

  it("defaults to dark mode, toggles to light mode with persistence, and does not render multi-direction preview controls", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App initialEntries={["/coach"]} />);

    await screen.findByRole("navigation", { name: /navegación principal/i });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.queryByRole("button", { name: /^Ateneo$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Clínico$/i })).not.toBeInTheDocument();

    // Toggle to Light mode
    await user.click(screen.getByRole("button", { name: /cambiar a tema claro/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("fc-theme-mode")).toBe("light");

    // Remount and verify persistence
    unmount();
    render(<App initialEntries={["/coach"]} />);
    await screen.findByRole("navigation", { name: /navegación principal/i });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Toggle back to Dark mode
    await user.click(screen.getByRole("button", { name: /cambiar a tema oscuro/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("fc-theme-mode")).toBe("dark");
  });
});
