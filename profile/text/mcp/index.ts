/**
 * The product's MCP words (the profile's `text.mcp`): the resource tools'
 * descriptions and parameters.
 */

import type { McpText } from "../../../extensions/sdk/profile.ts";

export const mcp: McpText = {
	resources: {
		descriptions: {
			list_mcp_resources:
				"Show the resources and URI templates that the connected MCP servers offer. A resource is a document or piece of data a server makes readable, and its uri is how you ask for it. For a template, fill in its variables to get a uri you can read.",
			read_mcp_resource: "Fetch one MCP resource by its uri. list_mcp_resources shows which uris exist.",
			read_mcp_resource_dir:
				'Show what sits directly inside a directory resource on an MCP server (the resources/directory/read request). It goes one level deep only. Each entry has its own uri, and a subdirectory is marked with the mimeType "inode/directory": to go further, call this again with that uri. A server that does not support directory listing answers with an error.',
		},
		params: {
			list: { server: "Only list this server's resources (by server name)" },
			read: { server: "Name of the server the resource belongs to", uri: "The uri of the resource" },
			dir: { server: "Name of the server the directory belongs to", uri: "The uri of the directory resource" },
		},
		searchKeywords: ["mcp", "resource", "document", "uri", "directory"],
	},
};
