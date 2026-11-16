## Code structure

- Declare a `configurable` for every external value (hosts, ports, API keys, credentials), in `config.bal` (see Configuration).
- Initialize clients at module level, before any function or service, fed by configurables, in `connections.bal`.
- Declare a listener with the `listener` keyword: `listener http:Listener orderListener = new (port = servicePort);`. A `final http:Listener` variable cannot take a service ("invalid listener attachment").
- Declare listeners and attach services statically at module level; never register a listener dynamically.
- Write the `main` function or the service that the requirement asks for.
- Paths the user asks a service to expose are the exact URLs its callers use, unless a loaded skill sets the service's paths. An `http` resource's URL is its service base path followed by its resource path, so any base path other than `/` changes every URL the user named. For a new `http` service, write `service /` and put each full path on its resources unless the user sets a base path. Keep an existing service's base path unless the user asks to change it: changing it moves every URL it already serves.
- Before you finish, compare each path the user asked a service to expose with the URL its resource actually serves (the base path, then the resource path), and fix any that differs. A wrong path compiles and fails only when a caller uses it.
- Write tests only when the user asks for them.

## Coding rules

- Use records as the canonical representation of data. Define a record for every data structure instead of using `map<json>`, `map<anydata>` or raw `json`, and navigate it by its fields.
- Never access or manipulate a `json` value directly. Define a record, convert with `cloneWithType()` or `fromJsonStringWithType()`, and use the record's fields. Member access on a record (see Data binding) is not json manipulation.
- Do not invoke a method on a field-access expression, and do not narrow an optional or union-typed field in place: assign the field to a typed variable first, then use that variable. A plain read (`if order.status == "NEW"`) needs no intermediate.
- To narrow a union or optional type, declare a separate variable and test that variable in the `if` condition.
- Declare types explicitly in variable declarations and `foreach` statements. Avoid `var`.
- `.` calls a normal function or method; `->` calls a remote or resource function on a client. Call a resource function by path and accessor: `exampleClient->/path1/["param"]/path2.get(key = "value")`.
- Pass every argument by name when the parameter has one (`.get(key = "value")`, `client->post("/path", message = payload)`).
- A remote call (`->`) may stand alone, be the whole right-hand side of an assignment, or be returned (`return api->get("/a");`). It may not nest inside a larger expression: `io:println(check api->get("/a"))` fails with "action invocation as an expression not allowed here". Assign it to a variable first.
- Function parameters are immutable: assigning to one fails with "cannot assign a value to function argument". Copy it into a local variable and change that.
- Identifiers are descriptive two-word camelCase for variables, parameters, resource parameters and record fields (`userName`, `baseUrl`, `responseBody`); never single letters or bare abbreviations (`x`, `res`, `tmp`). Exception: a record that binds an external payload uses the exact source key names, even single-word or PascalCase (`Name`, `CreatedDate`): the wire contract wins.
- A reserved word used as an identifier takes a leading quote: `'limit`, `'order`, `'type`, `'error`, `'start`, `'join`. Without it, `limit` fails with "invalid token 'limit'".
- A parameter typed `record {| anydata...; |}` accepts any record: pass an existing named record or declare a purpose-built one, never an anonymous literal. When a return type defaults to such a parameter, choose and declare the concrete record shape. When a return typedesc is marked `<>` in the API docs, define a record for the expected data.
- In a loop over independent items (files, messages, rows) where a failing item should be skipped, do not `check` the per-item work: `check` exits the whole loop, and so does an `on fail` attached to the loop itself. Capture the error and continue: `error? result = processItem(item); if result is error { log:printError("Skipped item", 'error = result); continue; }`. Keep `check` for failures that should stop all the work.
- `//` is the only comment form; `/* */` is not Ballerina ("invalid token '/*'"). `#` starts documentation. Keep comments rare and short.
- Never create a markdown file to document a change unless the user asks.

## Data binding, type casts and narrowing

Records for external data:
- A record that binds data from an external system (an event, a webhook, a third-party API response) should be an **open** record (`record { ... }`): its exact shape is not known, and an open record accepts extra `anydata` fields. Converting json with a field the record does not declare into a **closed** record (`record {| ... |}`) fails at run time with a `ConversionError`, which the compiler cannot catch. If a library defines a record for that schema, use the library's record.
- In such records declare only the fields the code uses, and mark any field that may be absent optional (`string eventVersion?;`).
- Use closed records for the shapes this code owns (its own API contracts, its own stored data).

Type casts:
- Whether a record can be cast to `map<json>` depends on how the record type is declared, not on the values in it. A closed record whose fields are all json-compatible (string, int, float, decimal, boolean, nil, json, and arrays or closed records of these) **is** a `map<json>`, so `<map<json>>closedValue` is safe. An open record may hold extra `anydata` fields, so it is **not** a `map<json>` even when every value happens to be json: `<map<json>>openValue` compiles and panics with a `TypeCastError`.
- To get a `map<json>` from an open record, convert instead of casting: `map<json> converted = check payload.cloneWithType();` or `json converted = payload.toJson();`. If you only need a map view, `map<anydata>` accepts any record.
- Do not guess a type and cast to it. Check first with `if value is T { ... }` (inside the block `value` is a `T`), or convert with `T checked = check value.ensureType();`. Both give an error instead of a panic.
- Turn `json` into a record with `T converted = check jsonValue.cloneWithType();`, never `<T>jsonValue`.

Copying values:
- `.clone()` copies mutable values into a new mutable copy, but it does **not** copy immutable subtrees: on an immutable value it returns that same value, still immutable.
- `readonly` distributes into members: when a structured type (map, array, table, record, tuple) or its member type is `readonly`, the members have type `T & readonly` even when `T` is a mutable record (`T[] & readonly` and `(T & readonly)[]`, `map<T> & readonly` and `map<T & readonly>`). Judge immutability by the value's inherent type, not the static type of the variable you assign it to: `T? item = items[key].clone();` is still immutable, type-checks with no diagnostic, and panics with an `InvalidUpdate` error on the first in-place change.
- For a mutable copy of a readonly value use `T copy = check readonlyValue.cloneWithType();` with a target type that is not itself `readonly`.

Reading fields:
- Access a record field known at compile time with `.`.
- Never cast to reach a field. To read a field the record type does not declare, or one whose name is known only at run time, use member access and check the result: `anydata claim = payload[claimName]; if claim is string { ... }`. Member access gives `()` when the field is absent.
- To read members of json, convert it to a record first (`record { string sub; } payload = check jsonValue.cloneWithType();`), then read the field (`string sub = payload.sub;`).

## Module-level initialization

- Prefer initializing a module-level variable at its declaration.
- When a value can only be built inside the module's `init()` function, declare the variable without an initializer, as `final` (drop `final` only if it is reassigned after `init()`), and assign it in `init()`. With a conditional, assign it in every branch; otherwise the compiler reports "uninitialized variable".
- Exception: in a package that declares an `ai:Agent`, never write a module `init` function{{#tool skill}} (the `agent-builder` skill explains why){{/tool}}; put startup work in `main`.

## Concurrency safety and shared state

Apply these rules whenever the code has module-level state, service or class fields, or workers. They let the compiler infer services as `isolated`, so their methods run concurrently.

Module-level variables:
- `configurable` variables are implicitly final and readable from any isolated context without a lock. Never write `final configurable` (a compile error: "configurable variables are implicitly final").
- Declare never-changed values `final`.
- A `final` variable is readable from `isolated` functions and service methods without a lock only when its type is a literal type (string, int, boolean, decimal, float, byte), `readonly` (`final int[] & readonly defaults = [1, 2];`), or an isolated object: most library clients and listeners (`final http:Client httpClient = check new (url);`), `ai:Agent`, or an instance of your own `isolated class`. For such a variable, do not declare it `isolated`, do not wrap its use in `lock { }`, and do not add `& readonly`. For a library client or listener, assume it is isolated; if the compiler says otherwise, make the module variable `isolated` and wrap every access in `lock { }`.
- `final` alone is still non-isolated mutable state for other types (`final map<string>`, `final int[]`). For shared mutable state declare the variable `isolated` with an initializer (`isolated int[] requests = [];`) and access it only inside `lock { }`.

Lock statements:
- One isolated root per lock: never access two `isolated` variables, or an `isolated` variable and `self`, in the same lock. Use separate locks and pass values between them through locals; if two pieces of state must change together, keep them in one value (a record or map behind one isolated variable).
- Keep locks minimal: only the shared-state read or write belongs inside. Never do I/O or a remote call (a client call, a database query, `runtime:sleep`) inside a lock.

Services and classes with mutable state:
- Declare every mutable field `private`, initialize it with a fresh literal (`[]`, `{}`, `new Foo()`) or in the init method (never with a reference to module-level mutable state), and access it through `self` only inside `lock { }`. A field can never be `isolated` (a compile error); `private` plus `lock { }` is the field pattern.
- Clone values that cross the lock boundary: `.clone()` or `.cloneReadOnly()`.
- A service's resource and remote methods run concurrently only when the service and the method are `isolated`. Each method must call only `isolated` functions and never touch non-final module-level mutable state (use `isolated` module variables with `lock { }`). When these rules hold, the compiler infers the service and its methods as `isolated`; explicit `isolated` qualifiers also work.
- A function called from an `isolated` function, or inside a lock over isolated state, must itself be `isolated`. Write a helper as `isolated` when it uses only its parameters and local state.

## Errors and logging

- Propagate errors with `check`, or handle them with `do { } on fail error failure { }`. Never use `checkpanic` or `panic` to silence an error in real code.
- Log with `ballerina/log` (`log:printInfo`, `log:printWarn`, `log:printError`, `log:printDebug`), and attach context as named key-value arguments (`log:printInfo("Order stored", orderId = orderId)`) instead of concatenating it into the message.
- Ballerina has built-in metrics and tracing: build with `--observability-included` (or `observabilityIncluded = true` under `[build-options]`) and configure `[ballerina.observe]` in `Config.toml`. Use `ballerina/observe` only for custom spans or metrics beyond that.
