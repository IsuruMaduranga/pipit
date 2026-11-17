/**
 * The line under the effort slider's track (`text.effort.sliderNote`): none
 * for the stops at or below low, one fixed line for every stop above it,
 * ultracode included. User-facing, so no tool or product names.
 */
import { describe, expect, it } from "vitest";
import { EFFORT_CHOICES } from "../../extensions/lib/ui/effort-slider.ts";
import { effort, SLIDER_NOTE } from "../text/effort/index.ts";
import { LEVELS_AT_OR_BELOW_DEFAULT } from "../thinking.ts";

describe("the effort slider's note", () => {
	const note = (choice: (typeof EFFORT_CHOICES)[number]) => effort.sliderNote?.(choice);

	it("is absent at low and below", () => {
		for (const choice of LEVELS_AT_OR_BELOW_DEFAULT) expect(note(choice), choice).toBeUndefined();
	});

	it("is the same single line for every stop above low, ultracode included", () => {
		const above = EFFORT_CHOICES.filter((choice) => !(LEVELS_AT_OR_BELOW_DEFAULT as readonly string[]).includes(choice));
		expect(above).toEqual(["medium", "high", "xhigh", "max", "ultracode"]);
		for (const choice of above) expect(note(choice), choice).toBe("Integration tasks rarely need more than low; a higher level may overthink.");
		expect(SLIDER_NOTE).not.toContain("\n");
	});
});
