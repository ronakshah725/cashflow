/**
 * Lever reactivity regression test.
 *
 * Renders the real App, moves levers (number input, slider, toggle),
 * and asserts the verdict sentence updates. This is the exact symptom
 * once reported against the live site ("changing rent did nothing").
 */
import { describe, expect, it, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

afterEach(cleanup);

async function renderApp() {
  render(<App />);
  // Boot completes after the (failing, in jsdom) /api/* fetches resolve.
  await waitFor(() => {
    if (!document.querySelector(".verdict"))
      throw new Error("verdict not rendered yet");
  });
}

function verdictText(): string {
  const el = document.querySelector(".verdict");
  if (!el || !el.textContent) throw new Error("verdict not rendered");
  return el.textContent;
}

function numberInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label, {
    selector: "input",
  }) as HTMLInputElement;
}

describe("lever reactivity", () => {
  it("typing a new rent updates the verdict", async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(verdictText()).toMatch(/At \$0 rent/);

    const rent = numberInput("Effective rent");
    await user.clear(rent);
    await user.type(rent, "7000");
    await user.tab(); // blur so the change commits

    await waitFor(() => {
      expect(verdictText()).toMatch(/At \$7k rent/);
    });
  });

  it("moving the rent slider updates the verdict", async () => {
    await renderApp();

    const slider = screen.getByLabelText("Effective rent slider");
    fireEvent.change(slider, { target: { value: "5500" } });

    await waitFor(() => {
      expect(verdictText()).toMatch(/At \$5\.5k rent/);
    });
  });

  it("toggling the bonus changes the invested total", async () => {
    const user = userEvent.setup();
    await renderApp();

    // Expand Fine-tune (jsdom doesn't toggle <details> on click) and give
    // the bonus a nonzero amount first.
    const details = document.querySelector("details.fine-tune");
    if (!details) throw new Error("fine-tune details not rendered");
    (details as HTMLDetailsElement).open = true;
    const bonusNet = document.getElementById("bonusNet") as HTMLInputElement;
    if (!bonusNet) throw new Error("bonusNet input not rendered");
    await user.clear(bonusNet);
    await user.type(bonusNet, "100000");
    await user.tab();

    const before = verdictText();
    expect(before).toMatch(/cash-flow only/);

    await user.click(screen.getByLabelText(/include bonus in investing/i));

    await waitFor(() => {
      const after = verdictText();
      expect(after).not.toBe(before);
      expect(after).toMatch(/\$8\.3k\/mo/);
    });
  });
});
