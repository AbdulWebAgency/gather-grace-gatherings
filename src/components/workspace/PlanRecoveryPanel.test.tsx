import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { communityPlan } from "@/test/fixtures";
import { PlanRecoveryPanel } from "./PlanRecoveryPanel";

describe("PlanRecoveryPanel", () => {
  it("requires confirmation to restore and leaves recovery untouched when cancelled or dismissed", () => {
    const onRestore = vi.fn();
    const onDismiss = vi.fn();
    const plan = {
      ...communityPlan(),
      event: { ...communityPlan().event, name: "Recovered celebration" },
    };
    render(
      <PlanRecoveryPanel
        recovery={{ status: "available", plan }}
        dismissed={false}
        currentPlan={communityPlan()}
        onDismiss={onDismiss}
        onRestore={onRestore}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review and restore" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("alertdialog")).getByText(/replace.*active plan/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRestore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review and restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore saved plan" }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
