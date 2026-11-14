// Stands in for @wso2/ballerina-side-panel in the diagram view's bundle. The
// flow diagram imports the side panel only for the prompt node's inline
// editor and the InputMode names; the view edits nothing, so a prompt shows
// as plain text and the editing stack (about 1 MB) stays out of the bundle.
import React from "react";

// The values of the side panel's InputMode enum, which the diagram compares against.
export const InputMode = {
    TEXT: "Text",
    EXP: "Expression",
    RECORD: "Record",
    TEMPLATE: "Template",
    NUMBER: "Number",
    BOOLEAN: "Boolean",
    SQL: "SQL",
    SELECT: "Select",
    ARRAY: "Array",
    TEXT_ARRAY: "Text Array",
    PROMPT: "Prompt",
    MAP: "Map",
    SIMPLE_TEXT: "Info",
};

export const ChipExpressionEditorComponent = (props) =>
    React.createElement("pre", { className: "prompt-text" }, props.value ?? "");
export const ExpandedEditor = () => null;
export const Context = React.createContext({});
export const RawTemplateEditorConfig = undefined;
export const HelperpaneOnChangeOptions = undefined;
