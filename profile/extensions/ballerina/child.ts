/**
 * The Ballerina extension in a child (subagent) session: the `config_status`
 * and `create_integration` tools and the redaction of `Config.toml` values, as in the main session.
 * No prompt section: a child ignores one (index.ts).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { productExtension } from "../../../extensions/sdk/extension.ts";
import { registerBallerinaSession } from "./session.ts";

export default productExtension("ballerina", function ballerinaChild(pi: ExtensionAPI) {
	registerBallerinaSession(pi);
});
