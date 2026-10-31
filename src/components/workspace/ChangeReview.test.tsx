import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyOperations, validateProposal } from "@/domain/planChange";
import { communityPlan, op, proposal, TODAY } from "@/test/fixtures";
import { ChangeReview } from "./ChangeReview";

describe("ChangeReview", () => {
  it("does not show AI success claims when every proposed operation is rejected", () => {
    const plan = communityPlan();
    const candidate = proposal([op({ type: "remove_budget_item", targetId: "bud_photo" })]);
    candidate.summary = "The photographer has been removed.";
    candidate.answer = "Done, I removed the photographer.";
    candidate.tradeoffs = ["The photographer was removed."];
    candidate.alternatives = [
      {
        title: "Photographer removed",
        description: "It has been removed.",
        estimatedSaving: 15_000,
        consequence: "No photographer.",
      },
    ];
    const validation = validateProposal(plan, candidate, TODAY);
    const pending = {
      request: "Remove the photographer",
      basePlanSignature: JSON.stringify(plan),
      proposal: candidate,
      validation,
      selected: [],
    };
    const preview = applyOperations(plan, [], TODAY);

    render(
      <ChangeReview
        headingRef={createRef<HTMLHeadingElement>()}
        plan={plan}
        pending={pending}
        preview={preview}
        onToggle={() => {}}
        onAccept={() => {}}
        onDiscard={() => {}}
      />,
    );

    expect(screen.getByText(/Not applied \(failed validation\)/)).toBeInTheDocument();
    expect(screen.queryByText(candidate.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(candidate.answer)).not.toBeInTheDocument();
    expect(screen.queryByText(candidate.tradeoffs[0]!)).not.toBeInTheDocument();
    expect(screen.queryByText(candidate.alternatives[0]!.description)).not.toBeInTheDocument();
    expect(screen.getByText(/essential/)).toBeInTheDocument();
  });
});
