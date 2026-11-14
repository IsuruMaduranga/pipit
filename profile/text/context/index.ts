/**
 * The product's part of the first-message context words (the profile's
 * `text.context`): the preamble over its own instruction file, PIPIT.md, and
 * the descriptors of that file's sections.
 */

import type { ContextText } from "../../../extensions/sdk/profile.ts";

export const context: ContextText = {
	productPreamble: ({ above }) =>
		"# pipitMd\n" +
		"The files below hold instructions written for Pipit alone; no other tool reads them. " +
		`They rank above the ${above} instructions earlier in this message and above your defaults: ` +
		`when the two disagree, do what these files say, exactly as they say it.`,
	descriptors: {
		product: "Pipit's own project instructions, read by no other tool",
		productGlobal: "Pipit's own instructions for all of the user's projects, read by no other tool",
	},
};
