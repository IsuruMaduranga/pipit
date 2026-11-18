/**
 * The diagram view's agent logic (page/agent-tools.ts): the agent view's
 * model, each agent's tool names and their places, and the sidebar keeping
 * the last known tools while new ones load. The answer shapes are the
 * language server's, as recorded in
 * working-docs/findings/06-bi-diagram-components/agents.md.
 */
import { describe, expect, it } from "vitest";
import { agentFlow, functionPlaces, keepChildren, toolKey, toolNames } from "../extensions/ballerina/visualize/page/agent-tools.ts";

const agentNode = {
	id: "",
	codedata: { node: "AGENT" },
	metadata: { data: { agentInfo: { tools: [{ name: "getTime" }, { name: "bookMeeting" }, {}] } } },
	branches: [{ label: "x" }],
};

describe("functionPlaces", () => {
	it("places the default module's functions by name, with the package-relative file and both ends", () => {
		const places = functionPlaces({
			packages: [
				{
					modules: [
						{ functions: [{ name: "getTime", filePath: "agents.bal", startLine: 22, startColumn: 0, endLine: 25, endColumn: 1 }] },
						{ name: "util", functions: [{ name: "pad", filePath: "util.bal", startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 }] },
					],
				},
			],
		});
		expect([...places.keys()]).toEqual(["getTime"]);
		expect(places.get("getTime")).toEqual({ fileName: "agents.bal", startLine: { line: 22, offset: 0 }, endLine: { line: 25, offset: 1 } });
	});

	it("reads an answer with no packages, modules or functions as no places", () => {
		expect(functionPlaces({}).size).toBe(0);
		expect(functionPlaces({ packages: [{}, { modules: [{}] }] }).size).toBe(0);
	});
});

describe("toolNames", () => {
	it("lists the named tools of the flow's AGENT node", () => {
		expect(toolNames({ nodes: [{ codedata: { node: "EVENT_START" } }, agentNode] })).toEqual(["getTime", "bookMeeting"]);
	});

	it("finds none without a flow, nodes, an agent node or its tools", () => {
		expect(toolNames(undefined)).toEqual([]);
		expect(toolNames({})).toEqual([]);
		expect(toolNames({ nodes: [{ codedata: { node: "RETURN" } }] })).toEqual([]);
		expect(toolNames({ nodes: [{ codedata: { node: "AGENT" }, metadata: {} }] })).toEqual([]);
	});
});

describe("agentFlow", () => {
	it("keeps the AGENT node alone, as the end of its flow with no branches, and names it when the server left the id empty", () => {
		const flow = agentFlow({ fileName: "agents.bal", nodes: [{ codedata: { node: "EVENT_START" } }, agentNode] }, "helpdeskAgent");
		expect(flow.fileName).toBe("agents.bal");
		expect(flow.nodes).toHaveLength(1);
		expect(flow.nodes[0]).toMatchObject({ id: "agent", codedata: { node: "AGENT" }, branches: [], flags: 0, returning: true });
	});

	it("says the agent is gone when the declaration holds no agent", () => {
		expect(() => agentFlow({ nodes: [{ codedata: { node: "VARIABLE" } }] }, "helpdeskAgent")).toThrow("helpdeskAgent is no longer declared as an agent there.");
	});
});

describe("the sidebar's tools", () => {
	it("keys a tool under its agent", () => {
		expect(toolKey("agent:helpdeskAgent", "getTime")).toBe("agent:helpdeskAgent/tool:getTime");
	});

	it("keeps each agent's last known tools until new ones arrive, and only for an agent of the same key", () => {
		type Row = { key: string; label: string; children?: Row[] };
		const tools: Row[] = [{ key: "agent:a/tool:t", label: "t" }];
		const previous: Row[] = [{ key: "agent:a", label: "a", children: tools }, { key: "agent:gone", label: "gone", children: tools }];
		const next = keepChildren<Row>([{ key: "agent:a", label: "a" }, { key: "agent:new", label: "new" }], previous);
		expect(next).toEqual([{ key: "agent:a", label: "a", children: tools }, { key: "agent:new", label: "new" }]);
		expect(keepChildren<Row>([{ key: "agent:a", label: "a", children: [] }], previous)[0].children).toEqual([]);
		expect(keepChildren<Row>([{ key: "agent:a", label: "a" }], undefined)).toEqual([{ key: "agent:a", label: "a" }]);
	});
});
