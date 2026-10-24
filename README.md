# Gather Grace Gatherings

PROJECT: EVENT PLANNING ASSISTANT

Build a polished, functional, production-oriented web application for PromptWars Virtual Challenge 5.

The application helps users organize weddings, birthdays, and community events by creating personalized event plans, managing budgets, organizing timelines, tracking vendor requirements, and adapting the existing plan when the user's requirements change.

This must be a real, interactive application—not a static prototype, landing-page-only design, or chatbot with decorative dashboard components.

1. PRIMARY PRODUCT OBJECTIVE

Build an AI-assisted event-planning workspace for first-time, budget-conscious organizers managing events with multiple arrangements and changing constraints.

Support three event categories:

Weddings

Birthdays

Community events

The central workflow is:

Understand the event and user's preferences
→ Generate a structured initial plan
→ Organize the budget, tasks, timeline and vendor requirements
→ Allow the user to revise the plan using natural language
→ Recalculate and validate the affected parts
→ Explain the consequences and outstanding decisions.

The application should help users make their events happen, rather than merely suggest party ideas.

2. CORE ARCHITECTURAL PRINCIPLES

Use a clean, modular React and TypeScript architecture appropriate for the existing Lovable environment.

Separate the following responsibilities:

Presentation and UI components.

Event and planning domain types.

Deterministic planning and validation logic.

AI provider integration.

Input validation and structured AI output validation.

State management and plan updates.

Tests.

Do not implement the entire application inside one giant component.

Use descriptive names, focused functions, strict types and reusable components. Avoid unnecessary abstractions and duplicated logic.

Before creating files, inspect the available project structure and use the existing framework and conventions where appropriate. Do not replace the project's framework or existing infrastructure without a concrete reason.

Keep the AI integration isolated behind a small, replaceable provider interface. We intend to migrate the AI implementation to Google Gemini in a later development phase, so avoid coupling the entire application to one provider.

Do not expose API keys, credentials or other secrets in client-side code.

3. INITIAL EVENT SETUP

Create an intuitive onboarding flow that captures the minimum information needed to produce a useful initial plan.

Collect or infer, where appropriate:

Event name.

Event type.

Event date or approximate date.

Location.

Expected guest count.

Budget.

Currency.

Preferred atmosphere or theme.

Important priorities.

Must-have arrangements.

Accessibility requirements.

Dietary or cultural requirements.

Other constraints supplied by the user.

Ask targeted follow-up questions when essential information is missing.

Do not force users to complete an unnecessarily long questionnaire before they can start planning.

Allow users to enter their requirements through natural language and review or edit the extracted details before generating the plan.

Support reasonable defaults, but explicitly identify assumptions. Never silently invent confirmed arrangements, bookings or quotations.

4. EVENT PLAN DATA MODEL

Create a typed, validated domain model for the event plan.

At minimum, represent:

Event details

Stable event ID.

Event name and category.

Date and location.

Guest count.

Budget and currency.

Preferences and constraints.

User priorities.

Explicit assumptions.

Budget

Each budget item should include:

Stable ID.

Category.

Description.

Estimated or quoted amount.

Cost status.

Source or notes where relevant.

Whether the item is essential or optional.

Distinguish clearly between:

Planning estimates.

User-provided quotations.

Confirmed costs.

Calculate totals, remaining budget and budget variance using deterministic application logic.

Do not rely on the AI model to perform authoritative financial calculations.

Timeline tasks

Each task should include:

Stable ID.

Title.

Description.

Priority.

Status.

Deadline.

Dependencies where applicable.

Relevant notes.

Support task statuses such as:

Not started.

In progress.

Completed.

Blocked.

Vendor requirements

Each vendor record should include:

Stable ID.

Vendor category.

Requirement description.

Contact details if supplied by the user.

Quoted amount if supplied.

Quotation status.

Inclusions and exclusions.

Questions requiring clarification.

Booking status.

Do not fabricate vendor contact details, quotations or availability.

Plan history

Track meaningful user-approved changes so the application can explain what changed between plan versions.

Avoid storing unnecessary personal information.

5. AI INTEGRATION

Implement a real AI integration using the supported Lovable environment and its secure server-side capabilities.

Keep the provider-specific code isolated so it can later be replaced with a Gemini implementation without rewriting the planning engine or UI.

The AI should perform tasks that benefit from language understanding and contextual reasoning, including:

Interpreting natural-language event requirements.

Identifying missing information.

Suggesting personalized ideas.

Proposing budget allocations.

Proposing task lists and planning sequences.

Interpreting user-requested changes.

Explaining trade-offs.

Suggesting alternatives that respect the user's stated priorities.

Use structured, schema-validated outputs wherever possible.

Do not allow model-generated text to directly overwrite authoritative application state without validation.

The application must validate the model's proposed changes before applying them.

If the AI request fails, returns malformed data or produces an unusable proposal, display a clear error and preserve the existing plan.

Do not silently substitute hardcoded demo responses when the live AI integration fails.

Do not describe an AI-generated estimate as a confirmed vendor price.

Do not claim that an external vendor has availability unless that information has actually been verified.

6. BUDGET PLANNING ENGINE

Implement deterministic calculations for:

Total planned expenditure.

Remaining budget.

Budget overrun.

Budget allocation percentages where useful.

Cost changes caused by changes in guest count.

Differences between estimates, quotations and confirmed costs.

When the guest count changes, identify which budget items may be affected.

Do not automatically assume every expense changes proportionally with the number of guests.

For example, catering may be guest-dependent, while photography may be a fixed package.

Represent assumptions explicitly and allow users to review them.

When a plan exceeds the budget, show:

The amount of the overrun.

The largest contributing categories.

Practical alternatives.

The consequences of those alternatives.

Respect user priorities. Do not automatically remove essential requirements simply to make the budget balance.

7. TIMELINE AND DEPENDENCY ENGINE

Implement deterministic date and task validation.

Represent meaningful dependencies between tasks.

For example, confirming a venue may need to precede finalizing invitations.

When the event date changes:

Recalculate relevant deadlines.

Identify tasks that are now urgent or overdue.

Preserve task statuses.

Preserve completed tasks unless the user explicitly requests a change.

Identify dependencies that may be affected.

Explain important consequences.

Do not create contradictory task dates or silently discard existing work.

Use an appropriate date-handling library if needed, rather than implementing fragile date arithmetic.

8. NATURAL-LANGUAGE PLAN UPDATES

This is one of the application's most important features.

Users must be able to modify the existing plan using requests such as:

"Increase the guest count to 150."

"Reduce the budget to ₹85,000."

"Move the event two weeks earlier."

"Keep photography as a priority, but suggest cheaper decoration options."

"Mark the venue as confirmed."

"Show me which tasks need immediate attention."

The application must interpret each request in the context of the current event plan.

Do not regenerate the entire plan from scratch after every change.

Instead:

Interpret the requested change.

Produce a structured proposal describing the intended modifications.

Validate the proposal against the current plan.

Recalculate affected budget and timeline values.

Identify downstream consequences.

Preserve unaffected records and existing completed work.

Present a clear change summary.

Apply the changes only according to the application's confirmation rules.

Preserve stable IDs for unaffected tasks and budget items.

Do not mark a vendor as booked, a quotation as confirmed or a payment as completed merely because the AI suggested it.

Require explicit user confirmation for consequential changes to existing confirmed arrangements.

Keep the user in control of priorities and decisions.

9. PRIMARY END-TO-END ACCEPTANCE SCENARIO

Build and test the following scenario.

Initial event:

Community celebration.

100 guests.

Budget of ₹1,00,000.

Event six weeks from the planning date.

Generate a complete initial plan.

Then the user requests:

"Increase the guest count to 150, reduce the budget to ₹85,000, and move the event two weeks earlier."

The application must:

Update the existing event.

Recalculate relevant budget values.

Identify affected arrangements.

Recalculate task deadlines.

Identify urgent tasks and affected dependencies.

Preserve completed tasks and unaffected records.

Detect any budget overrun.

Explain the trade-offs.

Offer alternatives based on the user's priorities.

Clearly distinguish estimates from confirmed costs.

Explain what changed.

The user should not have to restart the planning process.

This scenario must work through the actual user-facing application, not just an isolated utility function.

10. USER INTERFACE

Create a polished, responsive application suitable for a serious hackathon submission.

Use a coherent visual design with clear hierarchy, readable typography, consistent spacing, restrained colors and meaningful empty states.

The interface should include:

A. Event overview

Display the event's essential details, budget status, next deadlines and outstanding decisions.

B. Budget workspace

Show budget categories, allocations, total planned cost, remaining budget and any overrun.

Allow users to edit allocations and understand the impact of their changes.

C. Timeline workspace

Show tasks in a clear, chronological and priority-aware view.

Allow users to change task status and inspect dependencies.

D. Vendor checklist

Organize vendor requirements and allow users to add quotations and compare recorded options.

E. AI planning assistant

Provide a natural-language interaction area connected to the actual event plan.

Make it easy to review a proposed plan change before accepting it.

F. Change summary

When the plan changes, explain what was modified, what remains unchanged and what consequences require attention.

Avoid decorative components that imply functionality which does not exist.

Do not build a large number of unrelated features at the expense of the core planning workflow.

11. ACCESSIBILITY

Implement accessibility throughout the application.

Requirements include:

Semantic HTML.

Properly associated form labels.

Accessible names for icon-only buttons.

Keyboard-operable controls.

Visible focus indicators.

Sufficient text and control contrast.

Screen-reader announcements for important dynamic updates.

Reduced-motion support.

Clear error messages.

Responsive layouts that work on smaller screens.

Do not rely on color alone to communicate task status, warnings or budget overruns.

Use appropriate ARIA attributes when needed rather than adding ARIA indiscriminately.

12. SECURITY AND RELIABILITY

Use server-side AI credentials.

Validate user inputs and model outputs at the appropriate boundaries.

Set reasonable input and output size limits.

Handle malformed requests and AI service failures gracefully.

Treat user-provided text as untrusted data rather than executable instructions.

Do not expose stack traces, secrets or sensitive implementation details in user-facing errors.

Do not store unnecessary personal information.

Do not implement fake authentication, fake vendor integrations or simulated booking confirmations.

If persistence is available, use it appropriately and validate records when loading them.

If persistence is not configured, make the current session's capabilities clear rather than pretending data has been permanently saved.

13. TESTING

Create an automated test suite using the project's supported testing framework.

Prioritize deterministic business logic and important user journeys.

At minimum, test:

Budget calculations.

Budget overrun detection.

Guest-count changes and affected costs.

Event-date changes and deadline recalculation.

Task dependency validation.

Preservation of completed tasks during plan updates.

Validation of structured AI output.

Rejection of invalid plan updates.

Preservation of existing state when AI requests fail.

Distinction between estimated and confirmed costs.

Add integration tests for the most important planning workflow where feasible.

Do not claim tests passed unless they were actually executed.

Keep the test setup small and maintainable.

14. CODE QUALITY AND DOCUMENTATION

Maintain a clear project structure and avoid duplicated business logic.

Use TypeScript types and runtime schemas consistently.

Separate calculations and validation from UI rendering.

Use consistent naming and formatting.

Avoid unnecessary dependencies.

Create a comprehensive README explaining:

The chosen primary persona.

The problem being solved.

The solution's approach and logic.

The architecture.

How AI is integrated.

How budget and timeline changes are validated.

The application workflow.

Assumptions and limitations.

How to configure environment variables.

How to run the application.

How to run the tests.

Clearly document any feature that is not implemented.

15. REPOSITORY AND SUBMISSION CONSTRAINTS

The eventual submission must satisfy the PromptWars rules:

Public GitHub repository.

Repository size under 10 MB.

One branch only.

Complete source code and README.

No committed API keys or secrets.

No unnecessary dependency folders, build artifacts or generated files.

Keep the implementation compatible with a later migration to Google Gemini and development in Google Antigravity.

Do not add unrelated features simply to increase the apparent size of the project.

16. REQUIRED IMPLEMENTATION WORKFLOW

Work incrementally.

First inspect the existing project and establish the application architecture.

Then implement the core event model, deterministic budget and timeline logic, and AI-provider boundary.

Next implement the initial planning workflow and natural-language update flow.

Then build the UI around the working domain logic.

Finally, add tests, inspect accessibility and security, and verify the complete application.

After each substantial stage:

Inspect the changed files.

Run the relevant checks.

Fix regressions before continuing.

Avoid unrelated refactors.

Do not declare the project complete merely because the UI renders.

The application must be able to generate an initial plan and correctly update that plan in response to changed user requirements.

FINAL SUCCESS CRITERION

A user should be able to start planning a real event, obtain a structured and personalized plan, understand the budget and timeline, record vendor information, and revise the existing plan when their requirements change.

The AI must meaningfully improve the planning experience, while deterministic application logic preserves consistency, validates calculations and protects existing plan data.

Prioritize a small number of complete, reliable workflows over a large number of superficial features.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b889fd71-477a-4334-856f-db13a882163d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
