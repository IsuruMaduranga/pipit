/**
 * The diagram view's workflow logic (page/workflows.ts): which activities
 * each workflow calls, from the design model, and where a click on a flow
 * node leads. The answer shapes are the language server's, as recorded in
 * working-docs/findings/06-bi-diagram-components/workflows.md.
 */
import { describe, expect, it } from "vitest";
import { activityKey, nodeById, nodeTarget, workflowActivities, type WorkflowFlowNode } from "../extensions/ballerina/visualize/page/workflows.ts";

describe("workflowActivities", () => {
	it("names each workflow's activities by their ids, sorted by name whatever order the design model sends", () => {
		const calls = workflowActivities({
			workflows: [
				{ symbol: "orderWorkflow", kind: "WORKFLOW", activities: ["a1", "a3", "gone"] },
				{ symbol: "refundWorkflow", activities: [] },
			],
			activities: [
				{ symbol: "reserveStock", uuid: "a1" },
				{ symbol: "unused", uuid: "a2" },
				{ symbol: "notifyCustomer", uuid: "a3" },
			],
		});
		expect([...calls]).toEqual([
			["orderWorkflow", ["notifyCustomer", "reserveStock"]],
			["refundWorkflow", []],
		]);
	});

	it("leaves out a durable agent, which shares the list with its own kind", () => {
		const calls = workflowActivities({ workflows: [{ symbol: "support", kind: "DURABLE_AGENT", activities: [] }], activities: [] });
		expect(calls.size).toBe(0);
	});

	it("answers an empty map for a design model with no workflows", () => {
		expect(workflowActivities(undefined).size).toBe(0);
		expect(workflowActivities({}).size).toBe(0);
	});
});

describe("nodeById", () => {
	it("finds a node inside a branch", () => {
		const nodes: WorkflowFlowNode[] = [
			{ id: "1", codedata: { node: "EVENT_START" } },
			{ id: "2", codedata: { node: "IF" }, branches: [{ children: [{ id: "3", codedata: { node: "ACTIVITY_CALL", symbol: "notifyCustomer" } }] }] },
		];
		expect(nodeById(nodes, "3")?.codedata?.symbol).toBe("notifyCustomer");
		expect(nodeById(nodes, "9")).toBeUndefined();
	});
});

describe("nodeTarget", () => {
	it("leads a workflow run to the workflow it starts", () => {
		expect(nodeTarget({ codedata: { node: "WORKFLOW_RUN", symbol: "orderWorkflow" }, properties: { workflow: { value: "orderWorkflow" } } })).toEqual({ kind: "workflow", name: "orderWorkflow" });
	});

	it("leads an activity call to its activity, read from the symbol when no activityFunction property is sent", () => {
		expect(nodeTarget({ codedata: { node: "ACTIVITY_CALL", symbol: "reserveStock" }, properties: {} })).toEqual({ kind: "activity", name: "reserveStock" });
		expect(nodeTarget({ codedata: { node: "ACTIVITY_CALL" }, properties: { activityFunction: { value: '"chargeCustomer"' } } })).toEqual({ kind: "activity", name: "chargeCustomer" });
	});

	it("leads nowhere for another module's activity, which has no source in the integration", () => {
		expect(nodeTarget({ codedata: { node: "ACTIVITY_CALL", symbol: "activity:callRestAPI" } })).toBeUndefined();
	});

	it("leads nowhere for any other node", () => {
		expect(nodeTarget({ codedata: { node: "SLEEP" } })).toBeUndefined();
		expect(nodeTarget(undefined)).toBeUndefined();
	});
});

describe("activityKey", () => {
	it("keys an activity under the workflow that calls it", () => {
		expect(activityKey("workflow:orderWorkflow", "reserveStock")).toBe("workflow:orderWorkflow/activity:reserveStock");
	});
});
