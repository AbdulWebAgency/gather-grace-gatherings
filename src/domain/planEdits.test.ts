import { describe, expect, it } from "vitest";
import { communityPlan } from "@/test/fixtures";
import {
  acceptQuote,
  addBudgetItem,
  addQuote,
  removeBudgetItem,
  removeQuote,
  setTaskStatus,
  setVendorBookingStatus,
  updateBudgetItem,
} from "./planEdits";

describe("planEdits quote handling", () => {
  it("adds a quote to a vendor, calculates safe amounts, and updates status", () => {
    const plan = communityPlan();
    const updated = addQuote(plan, "ven_caterer", {
      vendorName: "Grand Feasts",
      amount: 38_000,
      contact: "grand@example.com",
      inclusions: "Buffet, servers",
      exclusions: "Dessert",
    });

    const vendor = updated.vendors.find((v) => v.id === "ven_caterer");
    expect(vendor?.quotes).toHaveLength(1);
    expect(vendor?.quotes[0]).toMatchObject({
      vendorName: "Grand Feasts",
      amount: 38_000,
      status: "received",
    });
    expect(vendor?.bookingStatus).toBe("quote_received");
    expect(updated.updatedAt).not.toBe(plan.updatedAt);
  });

  it("returns the original plan reference when addQuote is called with a nonexistent vendorId", () => {
    const plan = communityPlan();
    const updated = addQuote(plan, "nonexistent_vendor", {
      vendorName: "Grand Feasts",
      amount: 38_000,
      contact: "",
      inclusions: "",
      exclusions: "",
    });

    expect(updated).toBe(plan);
    expect(updated.updatedAt).toBe(plan.updatedAt);
  });

  it("accepts a quote, updates vendor quotes status, and updates linked budget item", () => {
    let plan = communityPlan();
    plan = addQuote(plan, "ven_caterer", {
      vendorName: "Caterer A",
      amount: 35_000,
      contact: "",
      inclusions: "",
      exclusions: "",
    });
    const quoteIdA = plan.vendors.find((v) => v.id === "ven_caterer")!.quotes[0]!.id;

    plan = addQuote(plan, "ven_caterer", {
      vendorName: "Caterer B",
      amount: 32_000,
      contact: "",
      inclusions: "",
      exclusions: "",
    });
    const quoteIdB = plan.vendors.find((v) => v.id === "ven_caterer")!.quotes[1]!.id;

    // Accept first quote
    const acceptedA = acceptQuote(plan, "ven_caterer", quoteIdA);
    const vendorA = acceptedA.vendors.find((v) => v.id === "ven_caterer")!;
    expect(vendorA.quotes.find((q) => q.id === quoteIdA)?.status).toBe("accepted");
    expect(vendorA.quotes.find((q) => q.id === quoteIdB)?.status).toBe("received");

    const budgetItemA = acceptedA.budgetItems.find((b) => b.id === "bud_catering")!;
    expect(budgetItemA.amount).toBe(35_000);
    expect(budgetItemA.costStatus).toBe("quoted");
    expect(budgetItemA.unitCost).toBe(350); // 35000 / 100 guests
    expect(budgetItemA.notes).toContain("Caterer A");

    // Switching acceptance to second quote reverts first quote to received
    const acceptedB = acceptQuote(acceptedA, "ven_caterer", quoteIdB);
    const vendorB = acceptedB.vendors.find((v) => v.id === "ven_caterer")!;
    expect(vendorB.quotes.find((q) => q.id === quoteIdA)?.status).toBe("received");
    expect(vendorB.quotes.find((q) => q.id === quoteIdB)?.status).toBe("accepted");

    const budgetItemB = acceptedB.budgetItems.find((b) => b.id === "bud_catering")!;
    expect(budgetItemB.amount).toBe(32_000);
    expect(budgetItemB.unitCost).toBe(320);
  });

  it("does not overwrite a confirmed budget item amount or costStatus upon acceptQuote", () => {
    let plan = communityPlan();
    plan = addQuote(plan, "ven_venue", {
      vendorName: "Venue Palace",
      amount: 25_000,
      contact: "",
      inclusions: "",
      exclusions: "",
    });
    const quoteId = plan.vendors.find((v) => v.id === "ven_venue")!.quotes[0]!.id;

    const accepted = acceptQuote(plan, "ven_venue", quoteId);
    const budgetVenue = accepted.budgetItems.find((b) => b.id === "bud_venue")!;
    // bud_venue is already confirmed at 20,000, so it must not be overwritten
    expect(budgetVenue.costStatus).toBe("confirmed");
    expect(budgetVenue.amount).toBe(20_000);
  });

  it("returns original plan reference when acceptQuote receives invalid vendorId or quoteId", () => {
    const plan = communityPlan();
    expect(acceptQuote(plan, "ven_caterer", "nonexistent_quote")).toBe(plan);
    expect(acceptQuote(plan, "nonexistent_vendor", "some_quote")).toBe(plan);
  });

  it("removes a quote and returns original plan if quote or vendor not found", () => {
    let plan = communityPlan();
    plan = addQuote(plan, "ven_caterer", {
      vendorName: "Caterer A",
      amount: 35_000,
      contact: "",
      inclusions: "",
      exclusions: "",
    });
    const quoteId = plan.vendors.find((v) => v.id === "ven_caterer")!.quotes[0]!.id;

    const removed = removeQuote(plan, "ven_caterer", quoteId);
    expect(removed.vendors.find((v) => v.id === "ven_caterer")?.quotes).toHaveLength(0);

    // Nonexistent quote or vendor
    expect(removeQuote(removed, "ven_caterer", "ghost_quote")).toBe(removed);
    expect(removeQuote(removed, "ghost_vendor", quoteId)).toBe(removed);
  });
});

describe("planEdits direct entity modifications", () => {
  it("safely updates a budget item and returns unchanged plan on nonexistent id", () => {
    const plan = communityPlan();
    const updated = updateBudgetItem(plan, "bud_decor", { amount: 12_000, essential: true });
    const item = updated.budgetItems.find((b) => b.id === "bud_decor");
    expect(item?.amount).toBe(12_000);
    expect(item?.essential).toBe(true);

    expect(updateBudgetItem(plan, "nonexistent_item", { amount: 100 })).toBe(plan);
  });

  it("safely removes a budget item and unlinks it from vendors", () => {
    const plan = communityPlan();
    const updated = removeBudgetItem(plan, "bud_catering");
    expect(updated.budgetItems.find((b) => b.id === "bud_catering")).toBeUndefined();
    expect(updated.vendors.find((v) => v.id === "ven_caterer")?.budgetItemId).toBeNull();

    expect(removeBudgetItem(plan, "nonexistent_item")).toBe(plan);
  });

  it("safely updates task status and returns unchanged plan when no-op or nonexistent", () => {
    const plan = communityPlan();
    const updated = setTaskStatus(plan, "task_invites", "in_progress");
    expect(updated.tasks.find((t) => t.id === "task_invites")?.status).toBe("in_progress");

    // Same status no-op
    expect(setTaskStatus(plan, "task_invites", "not_started")).toBe(plan);
    // Nonexistent task
    expect(setTaskStatus(plan, "nonexistent_task", "completed")).toBe(plan);
  });

  it("safely updates vendor booking status and returns unchanged plan when no-op or nonexistent", () => {
    const plan = communityPlan();
    const updated = setVendorBookingStatus(plan, "ven_caterer", "quote_received");
    expect(updated.vendors.find((v) => v.id === "ven_caterer")?.bookingStatus).toBe(
      "quote_received",
    );

    // Same status no-op
    expect(setVendorBookingStatus(plan, "ven_caterer", "contacted")).toBe(plan);
    // Nonexistent vendor
    expect(setVendorBookingStatus(plan, "nonexistent_vendor", "booked")).toBe(plan);
  });

  it("adds a budget item with validated and trimmed values", () => {
    const plan = communityPlan();
    const updated = addBudgetItem(plan, {
      category: "Transport",
      description: "Guest shuttle bus",
      amount: 15_000,
      essential: false,
      costStatus: "estimate",
    });

    expect(updated.budgetItems).toHaveLength(plan.budgetItems.length + 1);
    const added = updated.budgetItems.find((b) => b.category === "Transport");
    expect(added).toBeDefined();
    expect(added?.amount).toBe(15_000);
    expect(added?.scaling).toBe("fixed");
  });
});
