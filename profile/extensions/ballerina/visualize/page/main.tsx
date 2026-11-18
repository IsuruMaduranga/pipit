// The diagram view's page: the BI designer's integration overview
// (@wso2/component-diagram) and flow diagram (@wso2/bi-diagram), view only,
// fed by the local server's model endpoints (routes.ts) and refreshed on its
// server-sent `changed` events. build-bundle.mjs bundles it; it runs in the
// user's browser, never in the agent.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Diagram as FlowDiagram } from "@wso2/bi-diagram";
import { Diagram as OverviewDiagram } from "@wso2/component-diagram";
import "@vscode/codicons/dist/codicon.css";
import "theme:light";
import "theme:dark";
import "./page.css";
import { agentFlow, type Components, functionPlaces, keepChildren, toolKey, toolNames } from "./agent-tools";

type Position = { line: number; offset: number };
type Location = { filePath?: string; fileName?: string; startLine: Position; endLine: Position };
type Item = { key: string; label: string; verb?: string; location?: Location; children?: Item[]; agent?: boolean };
type Sidebar = { entryPoints: Item[]; agents: Item[]; functions: Item[] };
type View = { kind: "overview" } | { kind: "flow"; key?: string; title: string; location: Location };
type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; message: string };
/** A model with the package and view it was fetched for: a render never hands one view's model to the other's diagram. */
type OverviewProps = React.ComponentProps<typeof OverviewDiagram>;
/** The design model, as the overview takes it (`designModelService/getDesignModel`'s `designModel`). */
type DesignModel = OverviewProps["project"];
/** The flow model, as the flow diagram takes it (`flowDesignService/getFlowModel`'s `flowModel`). */
type FlowModel = React.ComponentProps<typeof FlowDiagram>["model"];
type FlowNode = FlowModel["nodes"][number];
/** What a click in the overview hands back: a function, a resource, or the automation. */
type OverviewTarget = Parameters<OverviewProps["onFunctionSelect"]>[0] | Parameters<OverviewProps["onAutomationSelect"]>[0];
/** `agent`: the flow is an agent's declaration, drawn the way the designer's agent view does. */
type Drawn = { kind: "overview"; design: DesignModel } | { kind: "flow"; flow: FlowModel; agent: boolean };
type Shown = { state: "loading" } | { state: "ready"; drawn: Drawn; pkg: string; view: View } | { state: "failed"; message: string; pkg: string; view: View };
type Connection = "live" | "updating" | "disconnected" | "ended";
type ProjectInfo = { product: string; name: string; packages: string[]; initialPackage?: string };

const noop = () => {};

// ---- Theme: follows the system setting, live.

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme(dark: boolean) {
    const kind = dark ? "vscode-dark" : "vscode-light";
    document.body.classList.remove("vscode-dark", "vscode-light");
    document.body.classList.add(kind);
    document.body.setAttribute("data-vscode-theme-kind", kind);
    // The diagrams' icons look for "dark" in this variable.
    document.documentElement.style.setProperty("--vscode-theme-kind", kind);
}
applyTheme(darkQuery.matches);

function useDarkTheme(): boolean {
    const [dark, setDark] = useState(darkQuery.matches);
    useEffect(() => {
        const onChange = (event: MediaQueryListEvent) => {
            applyTheme(event.matches);
            setDark(event.matches);
        };
        darkQuery.addEventListener("change", onChange);
        return () => darkQuery.removeEventListener("change", onChange);
    }, []);
    return dark;
}

// ---- Talking to the local server.

async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`api/${path}${query ? `?${query}` : ""}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `The server answered ${response.status}.`);
    // The language server reports a failure inside a normal result.
    if (body && typeof body.errorMsg === "string" && body.errorMsg) throw new Error(body.errorMsg);
    return body as T;
}

function flowParams(pkg: string, location: Location): Record<string, string> {
    return {
        package: pkg,
        file: location.filePath ?? location.fileName ?? "",
        startLine: String(location.startLine.line),
        startOffset: String(location.startLine.offset),
        endLine: String(location.endLine.line),
        endOffset: String(location.endLine.offset),
    };
}

/** The flow model of the function, resource or declaration at `location`. */
const flowOf = (pkg: string, location: Location) => api<{ flowModel?: FlowModel }>("flow", flowParams(pkg, location)).then((answer) => answer.flowModel);

/** Whether a `changed` event says the project's package list may have changed. */
function changedProject(data: string): boolean {
    try {
        return (JSON.parse(data) as { project?: boolean }).project === true;
    } catch {
        return false;
    }
}

// ---- The sidebar, from designModelService/artifacts.

type Artifact = { id?: string; name?: string; type?: string; accessor?: string; location?: Location; children?: Record<string, Artifact> };

function childItem(service: string, child: Artifact): Item {
    const name = child.name ?? child.id ?? "?";
    if (child.type === "RESOURCE") {
        const path = name === "." ? "/" : `/${name.replace(/^\//, "")}`;
        return { key: `${service}/${child.accessor ?? ""} ${path}`, label: path, verb: (child.accessor ?? "").toUpperCase(), location: child.location };
    }
    if (child.type === "REMOTE") return { key: `${service}/remote ${name}`, label: name, verb: "REMOTE", location: child.location };
    return { key: `${service}/${child.type ?? ""} ${name}`, label: name, location: child.location };
}

function sidebarOf(result: { artifacts?: Record<string, Record<string, Artifact>> }): Sidebar {
    const artifacts = result.artifacts ?? {};
    const entryPoints: Item[] = [];
    for (const entry of Object.values(artifacts["Entry Points"] ?? {})) {
        const name = entry.name ?? entry.id ?? "?";
        if (entry.type === "AUTOMATION") {
            entryPoints.push({ key: "automation", label: "Automation", location: entry.location });
            continue;
        }
        const key = `${entry.type ?? ""}:${name}`;
        const children = Object.values(entry.children ?? {}).filter((child) => child.location).map((child) => childItem(key, child));
        entryPoints.push({ key, label: name, children, location: children.length === 0 ? entry.location : undefined });
    }
    const named = (group: string, prefix: string, agent?: boolean): Item[] =>
        Object.values(artifacts[group] ?? {})
            .filter((artifact) => artifact.location)
            .map((artifact) => ({ key: `${prefix}:${artifact.name}`, label: artifact.name ?? "?", location: artifact.location, agent }))
            .sort((a, b) => a.label.localeCompare(b.label));
    return { entryPoints, agents: named("Agents", "agent", true), functions: named("Functions", "function") };
}

const allItems = (sidebar: Sidebar): Item[] => [
    ...[...sidebar.entryPoints, ...sidebar.agents].flatMap((item) => [item, ...(item.children ?? [])]),
    ...sidebar.functions,
];

const baseName = (path = "") => path.split(/[\\/]/).pop() ?? "";
/** The sidebar item at a location, matched by file name and start line: how a click in the overview finds its item. */
const itemAt = (sidebar: Sidebar | undefined, location: Location) =>
    sidebar && allItems(sidebar).find((item) => item.location && baseName(item.location.filePath ?? item.location.fileName) === baseName(location.filePath ?? location.fileName) && item.location.startLine.line === location.startLine.line);

// ---- Agent tools (agent-tools.ts holds the logic).

/** The sidebar with each agent's tools as its children. Rejects when the language server cannot answer. */
async function withTools(sidebar: Sidebar, pkg: string): Promise<Sidebar> {
    if (sidebar.agents.length === 0) return sidebar;
    const [places, flows] = await Promise.all([
        api<Components>("components", { package: pkg }).then(functionPlaces),
        Promise.all(sidebar.agents.map((agent) => (agent.location ? flowOf(pkg, agent.location) : undefined))),
    ]);
    const agents = sidebar.agents.map((agent, index) => {
        const children = toolNames(flows[index]).flatMap((name) => {
            const location = places.get(name);
            return location ? [{ key: toolKey(agent.key, name), label: name, location }] : [];
        });
        return { ...agent, children };
    });
    return { ...sidebar, agents };
}

// ---- Keeping the overview's pan and zoom across a refresh.
// The overview fits itself to the screen after every model change, and draws
// twice per change (its GraphQL-group state is rebuilt from each model). Its
// engine is internal, so the page finds it through React's fiber on the
// canvas and, for a short while after a refresh, turns each fit into a
// restore of the saved viewport.
const RESTORE_WINDOW_MS = 1500;

type Engine = {
    getModel(): { getZoomLevel(): number; getOffsetX(): number; getOffsetY(): number; setZoomLevel(z: number): void; setOffset(x: number, y: number): void };
    zoomToFitNodes(options?: unknown): void;
    repaintCanvas(): void;
    __viewRestore?: { zoom: number; x: number; y: number; until: number };
    __viewPatched?: boolean;
};

/** The part of a React fiber the walk reads; React keeps it on a DOM node under `__reactFiber$<random>`. */
type Fiber = { memoizedProps?: { engine?: unknown } | null; return?: Fiber | null };

const isEngine = (value: unknown): value is Engine =>
    typeof value === "object" && value !== null && typeof (value as Engine).zoomToFitNodes === "function" && typeof (value as Engine).getModel === "function";

function findEngine(host: HTMLElement | null): Engine | undefined {
    const start = host?.querySelector("svg") ?? host?.querySelector("div div");
    if (!start) return undefined;
    const key = Object.keys(start).find((name) => name.startsWith("__reactFiber$"));
    let fiber = key ? (start as unknown as Record<string, Fiber | undefined>)[key] : undefined;
    while (fiber) {
        const engine = fiber.memoizedProps?.engine;
        if (isEngine(engine)) return engine;
        fiber = fiber.return ?? undefined;
    }
    return undefined;
}

function keepViewport(host: HTMLElement | null) {
    const engine = findEngine(host);
    if (!engine) return;
    const model = engine.getModel();
    engine.__viewRestore = { zoom: model.getZoomLevel(), x: model.getOffsetX(), y: model.getOffsetY(), until: Date.now() + RESTORE_WINDOW_MS };
    if (engine.__viewPatched) return;
    engine.__viewPatched = true;
    const fit = engine.zoomToFitNodes.bind(engine);
    engine.zoomToFitNodes = (options?: unknown) => {
        const saved = engine.__viewRestore;
        if (!saved || Date.now() > saved.until) {
            engine.__viewRestore = undefined;
            return fit(options);
        }
        const current = engine.getModel();
        current.setZoomLevel(saved.zoom);
        current.setOffset(saved.x, saved.y);
        engine.repaintCanvas();
    };
}

/**
 * The flow diagram keeps its viewport across a refresh by itself, from
 * localStorage, but saves it only when the canvas pans: a zoom from its
 * controls alone would be lost. Save the live viewport before a refresh.
 */
function keepFlowViewport(host: HTMLElement | null) {
    const engine = findEngine(host);
    if (!engine) return;
    const model = engine.getModel();
    try {
        localStorage.setItem("diagram-zoom-level", JSON.stringify(model.getZoomLevel()));
        localStorage.setItem("diagram-offset-x", JSON.stringify(model.getOffsetX()));
        localStorage.setItem("diagram-offset-y", JSON.stringify(model.getOffsetY()));
    } catch {
        // Storage refused (a private window): the flow falls back to its own last save.
    }
}

// ---- The page.

function Notice({ title, message, error, onRetry }: { title: string; message?: string; error?: boolean; onRetry?: () => void }) {
    return (
        <div className={`notice${error ? " error" : ""}`} role={error ? "alert" : "status"}>
            <div>
                <h2>{title}</h2>
                {message && <p>{message}</p>}
                {onRetry && <button onClick={onRetry}>Try again</button>}
            </div>
        </div>
    );
}

/** A diagram that throws while drawing shows why, instead of taking the page down. */
class DrawingGuard extends React.Component<{ onRetry: () => void; children: React.ReactNode }, { error?: string }> {
    state: { error?: string } = {};
    static getDerivedStateFromError(error: unknown) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
    render() {
        if (this.state.error === undefined) return this.props.children;
        return (
            <Notice
                error
                title="The diagram could not be drawn"
                message={`The diagram component failed on this model: ${this.state.error}`}
                onRetry={() => {
                    this.setState({ error: undefined });
                    this.props.onRetry();
                }}
            />
        );
    }
}

const STATUS_TEXT: Record<Connection, string> = { live: "Live", updating: "Updating", disconnected: "Disconnected", ended: "Session ended" };

function App() {
    const dark = useDarkTheme();
    const [project, setProject] = useState<Load<ProjectInfo>>({ state: "loading" });
    const [pkg, setPkg] = useState<string>();
    const [sidebar, setSidebar] = useState<Load<Sidebar>>({ state: "loading" });
    const [view, setView] = useState<View>({ kind: "overview" });
    const [model, setModel] = useState<Shown>({ state: "loading" });
    const [version, setVersion] = useState(0);
    const [connection, setConnection] = useState<Connection>("live");
    const overviewHost = useRef<HTMLDivElement>(null);
    const flowHost = useRef<HTMLDivElement>(null);

    // The project's packages, fetched again when a manifest change adds or removes one.
    const [projectVersion, setProjectVersion] = useState(0);
    useEffect(() => {
        api<ProjectInfo>("project")
            .then((info) => {
                setProject({ state: "ready", value: info });
                // Keep the package on screen while it still exists.
                setPkg((current) => (current && info.packages.includes(current) ? current : (info.initialPackage ?? info.packages[0])));
                document.title = `${info.name} · ${info.product}`;
            })
            .catch((error) => setProject({ state: "failed", message: String(error.message ?? error) }));
    }, [projectVersion]);

    // Live update: the server pushes "changed" after the sources change; "closed" when the session ends.
    useEffect(() => {
        const events = new EventSource("events");
        let lost: ReturnType<typeof setTimeout> | undefined;
        let wasLost = false;
        events.addEventListener("changed", (event) => {
            if (changedProject(event.data)) setProjectVersion((v) => v + 1);
            setVersion((v) => v + 1);
        });
        events.addEventListener("closed", () => {
            events.close();
            setConnection("ended");
        });
        events.onopen = () => {
            if (lost) clearTimeout(lost);
            lost = undefined;
            setConnection((current) => (current === "ended" ? current : "live"));
            // Changes may have happened while the page was cut off.
            if (wasLost) setVersion((v) => v + 1);
            wasLost = false;
        };
        events.onerror = () => {
            wasLost = true;
            if (events.readyState === EventSource.CLOSED) setConnection((current) => (current === "ended" ? current : "disconnected"));
            else lost ??= setTimeout(() => setConnection((current) => (current === "ended" ? current : "disconnected")), 3000);
        };
        return () => {
            if (lost) clearTimeout(lost);
            events.close();
        };
    }, []);

    // The sidebar, and the model of what is on screen, fetched again on every change.
    useEffect(() => {
        if (!pkg) return;
        let cancelled = false;
        const refresh = model.state === "ready" && model.pkg === pkg && model.view === view;
        if (refresh) setConnection((current) => (current === "live" ? "updating" : current));
        else setModel({ state: "loading" });
        (async () => {
            let items: Sidebar | undefined;
            try {
                const fresh = sidebarOf(await api("artifacts", { package: pkg }));
                items = fresh;
                // The agents keep their last known tools on screen until the new lists arrive.
                if (!cancelled) setSidebar((previous) => ({ state: "ready", value: { ...fresh, agents: keepChildren(fresh.agents, previous.state === "ready" ? previous.value.agents : undefined) } }));
            } catch (error) {
                if (!cancelled) setSidebar({ state: "failed", message: String((error as Error).message) });
            }
            // The agents' tools take a request per agent: the view waits for them only when it shows a tool.
            const withAgentTools = items && withTools(items, pkg);
            withAgentTools?.then(
                (value) => {
                    if (!cancelled) setSidebar({ state: "ready", value });
                },
                // The sidebar keeps the tools it last had; a tool's own view reports the failure.
                noop,
            );
            try {
                let drawn: Drawn | undefined;
                if (view.kind === "overview") {
                    const design = (await api<{ designModel?: DesignModel }>("design", { package: pkg })).designModel;
                    if (design) drawn = { kind: "overview", design };
                    if (refresh) keepViewport(overviewHost.current);
                } else {
                    // A refresh finds the item again: an edit above it moves its lines.
                    const find = (sidebar?: Sidebar) => (view.key && sidebar ? allItems(sidebar).find((candidate) => candidate.key === view.key) : undefined);
                    // `items` has no tool children, so a tool's view never runs on its last known, stale place.
                    const item = find(items) ?? (view.key && withAgentTools ? find(await withAgentTools) : undefined);
                    if (view.key && items && !item) throw new Error(`${view.title} is no longer in the code.`);
                    const flow = await flowOf(pkg, item?.location ?? view.location);
                    const agent = item?.agent === true;
                    if (flow) drawn = { kind: "flow", flow: agent ? agentFlow(flow, view.title) : flow, agent };
                    if (refresh) keepFlowViewport(flowHost.current);
                }
                if (cancelled) return;
                if (!drawn) throw new Error("The language server sent no model.");
                setModel({ state: "ready", drawn, pkg, view });
            } catch (error) {
                if (!cancelled) setModel({ state: "failed", message: String((error as Error).message), pkg, view });
            } finally {
                if (!cancelled) setConnection((current) => (current === "updating" ? "live" : current));
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pkg, view, version]);

    const openFlow = useCallback(
        (title: string, location?: Location, key?: string) => {
            if (!location) return;
            const found = key ? undefined : itemAt(sidebar.state === "ready" ? sidebar.value : undefined, location);
            // A click in the overview takes the sidebar's name for the same item, so both ways in show one title.
            const label = found ? (found.verb ? `${found.verb} ${found.label}` : found.label) : title;
            setView({ kind: "flow", key: key ?? found?.key, title: label, location });
        },
        [sidebar],
    );
    /** An agent call's "Open Agent": the agent of that name in the sidebar, as the designer opens the declaration. */
    const toAgent = useCallback(
        (node: FlowNode) => {
            const name = node.properties?.connection?.value;
            const agent = sidebar.state === "ready" && typeof name === "string" ? sidebar.value.agents.find((item) => item.label === name.trim()) : undefined;
            if (agent) openFlow(agent.label, agent.location, agent.key);
        },
        [sidebar, openFlow],
    );
    /** A tool on the agent card: its function's flow, as the designer opens it, through its item under the open agent. */
    const toTool = (tool: { name: string }) => {
        const key = view.kind === "flow" ? toolKey(view.key, tool.name) : undefined;
        const target = sidebar.state === "ready" && key ? allItems(sidebar.value).find((item) => item.key === key) : undefined;
        if (target) openFlow(target.label, target.location, target.key);
    };
    const fromOverview = useCallback(
        (target: OverviewTarget) => {
            const title = "accessor" in target ? `${target.accessor.toUpperCase()} /${target.path.replace(/^\//, "")}` : target.name || "Automation";
            openFlow(title, target.location);
        },
        [openFlow],
    );
    const back = () => setView({ kind: "overview" });

    if (project.state === "failed") return <Notice error title="The integration view could not load" message={project.message} onRetry={() => location.reload()} />;
    const info = project.state === "ready" ? project.value : undefined;
    const items = sidebar.state === "ready" ? sidebar.value : undefined;
    const current = view.kind === "flow" ? view.key : "overview";
    const shown: Shown = model.state !== "loading" && model.pkg === pkg && model.view === view ? model : { state: "loading" };
    const drawn = shown.state === "ready" ? shown.drawn : undefined;
    const empty = drawn?.kind === "overview" && isEmptyDesign(drawn.design) && (!items || items.functions.length + items.agents.length === 0);

    const button = (item: Item) => (
        <button aria-current={current === item.key} title={item.label} onClick={() => openFlow(item.verb ? `${item.verb} ${item.label}` : item.label, item.location, item.key)}>
            {item.verb && <span className="verb">{item.verb}</span>}
            {item.label}
        </button>
    );
    const itemButton = (item: Item) => <li key={item.key}>{button(item)}</li>;

    return (
        <div className="view" data-theme={dark ? "dark" : "light"}>
            <header className="bar">
                <h1>{info?.name ?? "Integration"}</h1>
                <nav className="crumbs" aria-label="Location">
                    {view.kind === "flow" ? (
                        <>
                            <button onClick={back}>Overview</button>
                            <span aria-hidden="true">›</span>
                            <span>{view.title}</span>
                        </>
                    ) : (
                        <span>Overview</span>
                    )}
                </nav>
                <span className="spacer" />
                <span className={`status ${connection}`} role="status" title={connection === "ended" ? "Run /visualize in a new session to see changes again." : undefined}>
                    {STATUS_TEXT[connection]}
                </span>
            </header>
            <aside className="side" aria-label="Integration contents">
                {info && info.packages.length > 1 && (
                    <select aria-label="Integration" value={pkg} onChange={(event) => { setPkg(event.target.value); setView({ kind: "overview" }); }}>
                        {info.packages.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                )}
                <ul>
                    <li>
                        <button aria-current={current === "overview"} onClick={back}>Overview</button>
                    </li>
                </ul>
                {sidebar.state === "failed" && <p className="muted">{sidebar.message}</p>}
                {items && (
                    <>
                        <h2>Entry points</h2>
                        {items.entryPoints.length === 0 && <p className="muted">None yet</p>}
                        <ul>
                            {items.entryPoints.map((entry) =>
                                entry.children && entry.children.length > 0 ? (
                                    <li key={entry.key}>
                                        <div className="group" title={entry.label}>{entry.label}</div>
                                        <ul>{entry.children.map(itemButton)}</ul>
                                    </li>
                                ) : (
                                    itemButton(entry)
                                ),
                            )}
                        </ul>
                        {items.agents.length > 0 && (
                            <>
                                <h2>Agents</h2>
                                <ul>
                                    {items.agents.map((agent) => (
                                        <li key={agent.key}>
                                            {button(agent)}
                                            {agent.children && agent.children.length > 0 && <ul aria-label={`Tools of ${agent.label}`}>{agent.children.map(itemButton)}</ul>}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        <h2>Functions</h2>
                        {items.functions.length === 0 && <p className="muted">None yet</p>}
                        <ul>{items.functions.map(itemButton)}</ul>
                    </>
                )}
            </aside>
            <main className="main">
                {connection === "ended" && <div className="banner">The session ended, so this page no longer updates. Run /visualize in a new session to follow the code again.</div>}
                {connection === "disconnected" && <div className="banner">Disconnected from the session. The page shows the last diagram it received.</div>}
                {shown.state === "loading" && <Notice title="Loading the diagram" message="The first diagram can take a few seconds while the language server starts." />}
                {shown.state === "failed" && <Notice error title="The diagram could not be drawn" message={shown.message} onRetry={() => setVersion((v) => v + 1)} />}
                {empty && <Notice title="Nothing to draw yet" message="This integration has no services, automation, connections or functions yet. The view updates as code is added." />}
                {drawn?.kind === "overview" && !empty && (
                    <div className="canvas view-only" ref={overviewHost} key={`overview:${pkg}:${dark}`}>
                        <DrawingGuard onRetry={() => setVersion((v) => v + 1)}>
                        <OverviewDiagram
                            project={drawn.design}
                            readonly={false}
                            onListenerSelect={noop}
                            onServiceSelect={noop}
                            onFunctionSelect={fromOverview}
                            onAutomationSelect={fromOverview}
                            onConnectionSelect={noop}
                            onDeleteComponent={noop}
                        />
                        </DrawingGuard>
                    </div>
                )}
                {drawn?.kind === "flow" && view.kind === "flow" && (
                    <div
                        className="canvas view-only"
                        ref={flowHost}
                        key={`flow:${pkg}:${view.key ?? view.title}:${dark}`}
                        onContextMenuCapture={(event) => event.stopPropagation()}
                    >
                        <DrawingGuard onRetry={() => setVersion((v) => v + 1)}>
                            {drawn.agent ? (
                                // The card follows a tool click only when the diagram is not read only, which takes
                                // these three callbacks too, as the designer's agent view passes them. Right clicks
                                // stop at the canvas (onContextMenuCapture): the card's menu offers only edits.
                                <FlowDiagram model={drawn.flow} readOnly={false} onAddNode={noop} onDeleteNode={noop} onNodeSelect={noop} isAgentFocusView={true} agentNode={{ goToTool: toTool }} />
                            ) : (
                                <FlowDiagram model={drawn.flow} readOnly={true} goToAgent={toAgent} />
                            )}
                        </DrawingGuard>
                    </div>
                )}
            </main>
        </div>
    );
}

function isEmptyDesign(design: DesignModel): boolean {
    // The fields are typed as required, but a server's answer for an empty package may leave one out.
    const count = (list: readonly unknown[] | undefined) => list?.length ?? 0;
    return !design.automation && count(design.services) + count(design.listeners) + count(design.connections) === 0;
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
