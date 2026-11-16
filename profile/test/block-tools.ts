/** A test helper for the `# Ballerina` section's templates: the tools their blocks name. */
import type { Template } from "../extensions/ballerina/template.ts";

type Node = Template[number];

/** Every tool the template's blocks name. */
export function blockTools(template: Template): Set<string> {
	const found = new Set<string>();
	const walk = (nodes: readonly Node[]) => {
		for (const node of nodes) {
			if (typeof node === "string" || "value" in node) continue;
			for (const tool of node.when.flat()) found.add(tool);
			walk(node.then);
			walk(node.otherwise);
		}
	};
	walk(template);
	return found;
}
