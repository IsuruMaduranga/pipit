/**
 * The product's SubagentHandback words (the profile's `text.handback`): the
 * tool's description and its message parameter's.
 */

import type { HandbackText } from "../../../extensions/sdk/profile.ts";

export const handback: HandbackText = {
    description:
        "Hand your final report to the agent that started you (your caller). Call SubagentHandback({message: <your full report>}) once, when the work is done; that is its only use. Calling it ends your run, so finish everything else first and put all your caller needs into that single report. Progress updates and questions do not go through it.\n\nYour caller receives only what you send through SubagentHandback; plain text you write as your run ends does NOT reach it. The tool takes no recipient: the report always goes to your caller.",
    messageParam: "Your complete report, for your caller",
};
