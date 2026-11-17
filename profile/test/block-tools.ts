/** A test helper for the `# Ballerina` section's templates: the tools and features their blocks name. */
import type { TermPart, Template } from "../extensions/ballerina/template.ts";

type Node = Template[number];

/** Every term part the template's blocks name. */
function blockParts(template: Template): TermPart[] {
	const found: TermPart[] = [];
	const walk = (nodes: readonly Node[]) => {
		for (const node of nodes) {
			if (typeof node === "string" || "value" in node) continue;
			found.push(...node.when.flat());
			walk(node.then);
			walk(node.otherwise);
		}
	};
	walk(template);
	return found;
}

/** Every tool the template's blocks name. */
export function blockTools(template: Template): Set<string> {
	return new Set(blockParts(template).flatMap((part) => ("tool" in part ? [part.tool] : [])));
}

/** Every feature the template's blocks name. */
export function blockFeatures(template: Template): Set<string> {
	return new Set(blockParts(template).flatMap((part) => ("feature" in part ? [part.feature] : [])));
}
