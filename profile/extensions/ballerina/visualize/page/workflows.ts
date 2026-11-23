// The diagram view's workflow logic, pure: which activities each workflow
// calls, for the sidebar, and where a click on a flow node leads. The artifacts
// list workflows and activities side by side, in their "Workflows" group; the
// design model says which activities each workflow calls (its `activities`
// holds the activities' ids). A flow drawn read only ignores clicks, so the
// page reads the clicked node from the model by the `data-nodeid` the diagram
// puts on it, which is the node's id. Structural types only and no imports, so
// the repository's tests and typecheck reach it without the diagram packages.

/** The part of the design model the workflow logic reads. */
export type WorkflowDesign = {
    workflows?: { symbol?: string; kind?: string; activities?: string[] }[];
    activities?: { symbol?: string; uuid?: string }[];
};

/** The part of a flow node the workflow logic reads. */
export type WorkflowFlowNode = {
    id?: string;
    codedata?: { node?: string; symbol?: string };
    properties?: Record<string, { value?: unknown } | undefined>;
    branches?: { children?: WorkflowFlowNode[] }[];
};

/** Where a click on a flow node leads: the workflow a run starts, or the activity a call runs. */
export type NodeTarget = { kind: "workflow"; name: string } | { kind: "activity"; name: string };

/**
 * The activities each workflow calls, by workflow name, sorted by name: the
 * design model's order changes from one answer to the next, and the sidebar
 * must not reshuffle on every refresh. A durable agent sits in the same list
 * with its own kind; it is left out, since the page does not draw durable
 * agents yet.
 */
export function workflowActivities(design: WorkflowDesign | undefined): Map<string, string[]> {
    const names = new Map((design?.activities ?? []).flatMap((activity) => (activity.uuid && activity.symbol ? [[activity.uuid, activity.symbol] as const] : [])));
    return new Map(
        (design?.workflows ?? [])
            .filter((workflow) => workflow.symbol && (workflow.kind ?? "WORKFLOW") === "WORKFLOW")
            .map((workflow) => [workflow.symbol as string, (workflow.activities ?? []).flatMap((id) => (names.has(id) ? [names.get(id) as string] : [])).sort((a, b) => a.localeCompare(b))]),
    );
}

/** The sidebar key of an activity under the workflow that calls it. */
export const activityKey = (workflowKey: string | undefined, name: string) => `${workflowKey}/activity:${name}`;

/** The node with this id, searched through every branch. */
export function nodeById<N extends WorkflowFlowNode>(nodes: readonly N[] | undefined, id: string): N | undefined {
    for (const node of nodes ?? []) {
        if (node.id === id) return node;
        for (const branch of node.branches ?? []) {
            const found = nodeById(branch.children as N[] | undefined, id);
            if (found) return found;
        }
    }
    return undefined;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim().replace(/^["']|["']$/g, "") : undefined);

/**
 * Where a click on `node` leads, or nothing. A call to an activity of another
 * module (`activity:callRestAPI`) has no source in the integration, as the
 * designer's own "View function flow" treats it, so it leads nowhere.
 */
export function nodeTarget(node: WorkflowFlowNode | undefined): NodeTarget | undefined {
    if (node?.codedata?.node === "WORKFLOW_RUN") {
        const name = text(node.properties?.workflow?.value) ?? text(node.codedata.symbol);
        return name ? { kind: "workflow", name } : undefined;
    }
    if (node?.codedata?.node === "ACTIVITY_CALL") {
        const ref = text(node.properties?.activityFunction?.value) ?? text(node.codedata.symbol);
        if (!ref || ref.includes(":")) return undefined;
        const name = ref.split("(")[0].trim();
        return name ? { kind: "activity", name } : undefined;
    }
    return undefined;
}
