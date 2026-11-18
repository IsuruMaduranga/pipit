// The diagram view's agent logic, pure: the agent view's model, and each
// agent's tools for the sidebar. The artifacts leave out every function an
// agent uses as a tool, as the designer's explorer does; the designer reaches
// a tool from its agent. The page lists each agent's tools under it: the names
// from the agent's own model, the places from ballerinaPackage/components
// (working-docs/findings/06-bi-diagram-components/agents.md). Structural types
// only and no imports, so the repository's tests and typecheck reach it
// without the diagram packages.

export type Place = { fileName: string; startLine: { line: number; offset: number }; endLine: { line: number; offset: number } };
export type FunctionInfo = { name: string; filePath: string; startLine: number; startColumn: number; endLine: number; endColumn: number };
/** `ballerinaPackage/components`'s answer, as far as the page reads it. */
export type Components = { packages?: { modules?: { name?: string; functions?: FunctionInfo[] }[] }[] };
/** The part of a flow node the agent logic reads. */
export type DeclarationNode = { id?: string; flags?: number; codedata?: { node?: string }; metadata?: { data?: unknown } };

/**
 * Where each function of the package's default module is, by name. The
 * default module's entry has no `name`, and its file paths are relative to
 * the package. A tool in a submodule is named with that module's prefix,
 * which a plain name never matches, so it stays out of the list.
 */
export function functionPlaces(components: Components): Map<string, Place> {
    const defaults = (components.packages ?? []).flatMap((pkg) => (pkg.modules ?? []).filter((module) => !module.name));
    return new Map(
        defaults.flatMap((module) => module.functions ?? []).map((fn) => [
            fn.name,
            { fileName: fn.filePath, startLine: { line: fn.startLine, offset: fn.startColumn }, endLine: { line: fn.endLine, offset: fn.endColumn } },
        ]),
    );
}

/** The tool names an agent declaration's flow lists. */
export function toolNames(flow: { nodes?: DeclarationNode[] } | undefined): string[] {
    const declaration = flow?.nodes?.find((node) => node.codedata?.node === "AGENT");
    const info = (declaration?.metadata?.data as { agentInfo?: { tools?: { name?: string }[] } } | undefined)?.agentInfo;
    return (info?.tools ?? []).flatMap((tool) => (tool.name ? [tool.name] : []));
}

/** The sidebar key of an agent's tool, under the agent's own key. */
export const toolKey = (agentKey: string | undefined, name: string) => `${agentKey}/tool:${name}`;

/**
 * The agent view's model, as the designer's agent view builds it: the flow at
 * the declaration holds one `AGENT` node, whose metadata already carries the
 * prompt, the model provider and the tools; it is drawn alone, as the end of
 * its flow.
 */
export function agentFlow<N extends DeclarationNode, F extends { nodes: N[] }>(flow: F, title: string): F {
    const declaration = flow.nodes.find((node) => node.codedata?.node === "AGENT");
    if (!declaration) throw new Error(`${title} is no longer declared as an agent there.`);
    const node = { ...declaration, id: declaration.id || "agent", branches: [], flags: declaration.flags ?? 0, returning: true } as N;
    return { ...flow, nodes: [node] };
}

/**
 * Items as `next` lists them, each keeping the children its namesake in
 * `previous` had: the sidebar shows the agents' last known tools at once
 * while their new lists load, instead of dropping and redrawing them.
 */
export function keepChildren<T extends { key: string; children?: T[] }>(next: readonly T[], previous: readonly T[] | undefined): T[] {
    const before = new Map((previous ?? []).map((item) => [item.key, item.children]));
    return next.map((item) => (item.children === undefined && before.get(item.key) ? { ...item, children: before.get(item.key) } : item));
}
