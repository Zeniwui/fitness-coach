import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { seedSupabaseSession } from "../test/authHelpers";

describe("Theme & Visual Direction Switcher", () => {
  beforeEach(() => {
    window.localStorage.removeItem("fc-visual-direction");
    window.localStorage.removeItem("fc-theme-mode");
    document.documentElement.removeAttribute("data-direction");
    document.documentElement.removeAttribute("data-theme");
    seedSupabaseSession("tok-athlete");
  });

  it("defaults to Ateneo Deportivo and switches live across all 3 directions and light/dark modes with persistence", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App initialEntries={["/coach"]} />);

    await screen.findByRole("navigation", { name: /navegación principal/i });

    expect(document.documentElement.getAttribute("data-direction")).toBe("ateneo");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Switch to Instrumento Clínico
    await user.click(screen.getByRole("button", { name: /^Clínico$/i }));
    expect(document.documentElement.getAttribute("data-direction")).toBe("clinico");
    expect(window.localStorage.getItem("fc-visual-direction")).toBe("clinico");

    // Switch to Cuaderno de Hierro
    await user.click(screen.getByRole("button", { name: /^Hierro$/i }));
    expect(document.documentElement.getAttribute("data-direction")).toBe("hierro");
    expect(window.localStorage.getItem("fc-visual-direction")).toBe("hierro");

    // Toggle to Dark mode
    await user.click(screen.getByRole("button", { name: /cambiar a tema oscuro/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("fc-theme-mode")).toBe("dark");

    // Remount and verify persistence
    unmount();
    render(<App initialEntries={["/coach"]} />);
    await screen.findByRole("navigation", { name: /navegación principal/i });
    expect(document.documentElement.getAttribute("data-direction")).toBe("hierro");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Toggle back to Light and Ateneo
    await user.click(screen.getByRole("button", { name: /cambiar a tema claro/i }));
    await user.click(screen.getByRole("button", { name: /^Ateneo$/i }));
    expect(document.documentElement.getAttribute("data-direction")).toBe("ateneo");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
