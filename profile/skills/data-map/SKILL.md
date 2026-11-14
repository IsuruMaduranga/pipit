---
name: data-map
description: Use this skill whenever you are generating Ballerina mapping or transformation expressions between any data types (records, JSON, XML, arrays or primitive types), for example implementing a transform function body, converting JSON to a record, mapping XML elements to fields, or transforming primitive values.
argument-hint: "[<function name> | <output type> | generate mappings using input as <records> and output as <record> using the <function> function]"
---

### Mapping request
$ARGUMENTS

Interpret the request above with whichever of these patterns fits:
- "generate mappings for the <functionname> function": function mode; the function name is the word right before "function".
- "generate mappings using input as <inputs> and output as <output> using the <name> function": records mode; create a new transform function with that signature.
- "generate mappings using record fields and external values", or a single record or type name with no function around it: inline mode; produce inline field expressions for that output type, not a function body.
- A single function name with no other text: function mode; fill in the existing function with the mapping.
- Empty: take the mapping from the user's latest message and the file they are working on; if neither names the input and output types, ask.

Read the input and output types before writing anything: find them with `grep` in the integration (usually `types.bal`), and read a library's record with `bal discover type <Name> -p <org>/<name>`.

### Priority
When generating mapping expressions, follow this order strictly:
1. **User-defined mappings**: the highest priority; they take precedence over everything else.
2. **Existing sub-mappings**: use the sub-mapping's output name as a direct reference.
3. **Context and constraints**: apply every business rule and transformation given.
4. **Ballerina knowledge**: use built-in functions and standard approaches.
5. **Default handling**: only for non-optional fields with no mapping available.

### Output modes

**Mode 1: transform function (a reusable mapping).** When implementing a named transform function, you MUST use the expression-body syntax with `=>`. This is critical: the `=>` expression body is what the Ballerina tooling uses to classify the function as a data mapper. A block-body function with `return` is listed under "Functions" instead of "Data Mappers" in the BI designer and does not work as a data mapper.
- The syntax is `function name(params) returns Type => { field: expression, ... };`, in `data_mappings.bal`.
- Never write a block body with `{ ... }` and a `return` statement: that produces a regular function, not a data mapper.
- The `{...}` after `=>` is a record constructor. Each entry is `outputField: expression`. No `return` and no variable declarations inside it.
- For intermediate values, use a `let` expression before the record constructor (see below).

**Mode 2: inline field expression.** When mapping output fields directly inside a service or resource function (not writing a transform function body), for example when constructing a record variable inline, produce one standalone expression per field:
- No `=>`, no function declarations, no `let` expressions: the expression only.
- No `return` statements.
- If complex logic is needed, define a separate helper function and call it from the expression.

### Schema and type handling
- Never use generic types like `anydata` or `any`; use the exact type names from the schema.
- For nullable or optional types use only the `?` suffix (`string?`, `CustomType?`), never `string|()`, and never combine `|()` with `?`.
- Only reference fields and symbols that exist in the schema.
- Use existing sub-mappings in the data model when available.
- Ensure type compatibility between input and output fields.
- For records of an imported package, use the package alias prefix (`petstore:Pet`).

### Field access
- Use `?.` (safe navigation) only when the field is actually optional or nullable.
- Use `.` for non-optional, non-nullable fields.
- Same input and output type: assign directly, even for optional fields.
- Different types: apply the right transformation or conversion.
- For output field names, use dot notation from the root level.

### Union types and enums
- When either the input or the output is a union type or an enum, always write a custom helper function; never handle it inline.
- For nested union types, write a separate function per nesting level: each function handles one level of union complexity.
- Narrow types with `is` checks or `if-else` inside the helper functions.
- Use exact type names from the schema in every function signature.

### Mapping strategy
- Map at field level, not at record or array level.
- Break complex structures down and map their individual components.
- For arrays of records, map the individual fields of those records.
- Use query expressions (`from InputType item in inputArray select {...}`) only when both input and output are arrays.
- For nested records, use record constructor expressions that call the right helpers.

### Custom functions for advanced transformations
Define separate Ballerina functions for logic that a simple inline expression cannot express:
- union type or enum handling;
- a multi-step computation reused by several output fields;
- any transformation that needs conditionals or loops.

Place every helper function before the main transform function. Helpers are plain block-body functions.

### `let` expressions for reusable sub-mappings
Use a `let` expression only when:
- the user explicitly asks for sub-mappings, or
- several output fields need the same intermediate value.

- The syntax is `function name(params) returns Type => let Type varName = computedExpression in { fieldA: varName, fieldB: varName, ... };`.
- The `let` binding goes between `=>` and the record constructor, with `in` separating them.
- Use `let` only inside an expression-body function, for reusable intermediate values.
- Do not use a `let` clause inside query expressions (`from ... select`).
- For complex logic that a single `let` cannot express, write a helper function instead.

### Regular expressions
- `re` literals (`` re `[0-9]+` ``) and their methods need no import; naming `regexp:` (for example `regexp:fromString`) needs `import ballerina/lang.regexp;`.
- Common functions: `isFullMatch()`, `find()`, `findAll()`, `replace()`, `replaceAll()`, `split()`.

### Reserved keywords
Reserved keywords cannot be plain identifiers. Prefix them with a single quote (`'`) when used as field names, variable names or loop variables (`'limit`, `'order`).
Reserved keywords: `if`, `else`, `fork`, `join`, `while`, `foreach`, `in`, `return`, `returns`, `break`, `transaction`, `transactional`, `retry`, `commit`, `rollback`, `continue`, `typeof`, `enum`, `wait`, `check`, `checkpanic`, `panic`, `trap`, `match`, `import`, `public`, `private`, `as`, `lock`, `new`, `record`, `limit`, `start`, `flush`, `abstract`, `external`, `final`, `listener`, `remote`, `is`, `from`, `on`, `select`, `where`, `annotation`, `type`, `function`, `resource`, `service`, `worker`, `object`, `client`, `const`, `let`, `source`, `parameter`, `field`, `xmlns`, `true`, `false`, `null`, `table`, `do`, `base16`, `base64`, `conflict`, `outer`, `equals`, `boolean`, `int`, `float`, `string`, `decimal`, `handle`, `var`, `any`, `anydata`, `byte`, `future`, `typedesc`, `map`, `json`, `xml`, `error`, `never`, `readonly`, `distinct`, `stream`, `isolated`, `configurable`, `class`, `order`, `by`, `ascending`, `descending`, `fail`.

### Syntax rules
- Write syntactically correct Ballerina with no compilation errors.
- Use `.toString()` to convert values to strings.
- Use `check` for error handling; never `trap` or `panic`.
- Handle union types and enums with `check` expressions or `if-else` type narrowing.
- Use dot notation for nested field access.
- Use the built-in langlib methods for transformations.
- Prefer record constructor expressions for nested structures.
- Give default values only to non-optional fields that have no mapping; never to fields with an explicit mapping or to optional fields.

### Repairing mapping errors
Write the mapping with `edit` or `write`; the compiler errors the edit caused arrive after it. If errors appear on a mapping expression, fix them, looking at:
1. **Type compatibility**: the expression must produce the output field's type.
2. **Field access**: required fields use `record.field`, optional fields `record?.field`.
3. **Null safety**: handle optional and nilable types.
4. **Function calls**: imported functions are called correctly.
5. **Type conversions**: add the conversions needed.
6. **Syntax errors**: fix any Ballerina syntax issue.

Repeat until the mapping expressions have no errors.
