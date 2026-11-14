---
name: connector
description: Use this skill when the user supplies an OpenAPI specification (an attached or local file, a URL, or pasted text), or names an internal or uncommon HTTP API that has no connector on Ballerina Central, and the integration must call that API (client mode), implement it (service mode), or both (a passthrough or proxy). Generates the Ballerina client or service contract with `bal openapi`.
argument-hint: "[client|service|both] <path or URL of the OpenAPI spec>"
---

# Connector from an OpenAPI spec

$ARGUMENTS

Generate the code from the spec, then build on what was generated. Never hand-write an HTTP
client or the records for an API whose spec you have, and never rewrite, rename or duplicate the
generated types and signatures.

Pick the mode from the request:
- **client** (the default): the integration *calls* the API.
- **service**: the user wants to create, build, implement or expose the API the spec describes.
- **both**: a passthrough or proxy. Generate the service contract and a client, and implement each
  resource by forwarding to the matching client method; do not hand-write HTTP calls to the backend.

If no spec was supplied and the API is not on Central (check with `bal search` first), ask the user
for the spec with `ask_user_question`.

## 1. Get the spec into the integration

Keep the spec in the integration directory, beside its `Ballerina.toml`, named after the API
(`<api>_openapi.yaml` or `.json`): a URL with `curl -fsSL <url> -o <integration>/<api>_openapi.yaml`, pasted
text with `write`, a local file with `cp`. Read its `info`, `servers`, `securitySchemes` and
`paths` before generating, so you know the auth it needs and the server URL.

## 2. Make sure `bal openapi` is available

On the 2201.14.0 distribution `bal openapi` is a Central tool, not part of `bal`. If `bal openapi
--help` says "unknown command 'openapi'", install it with `bal tool pull openapi` (it installs into
the user's Ballerina home, so say that you are doing it). `bal tool list` shows the installed tools.

## 3a. Client mode

Register the spec as a build-time generator in the integration's `Ballerina.toml`, the same entry the
BI designer writes, with `filePath` relative to the integration:

```toml
[[tool.openapi]]
id = "<module>"
targetModule = "<module>"
filePath = "<api>_openapi.yaml"
```

`<module>` is a short lowercase name for the API (`petstore`). Then run `bal build` from the project
root. Every build runs the generator ("Executing Build Tools ... openapi(<module>)") and writes the
submodule to `<integration>/generated/<module>/`:
- `client.bal`: `public isolated client class Client`, with `init(...)` taking the auth config the
  spec's security scheme needs (for an API-key scheme an `ApiKeysConfig` record), then
  `ConnectionConfig config = {}` and `string serviceUrl = "<the spec's server URL>"`.
- `types.bal`: a record per schema, the `<Operation>Queries` records for query parameters, the auth
  records and `ConnectionConfig` (timeouts, `retryConfig`, `secureSocket` and the rest).
- `utils.bal`: helpers the client uses.

`generated/` is in the BI `.gitignore`, so this entry is what recreates the module on a fresh clone.
Never edit `generated/`; to change the API, change the spec and build again. (A one-off alternative
is `mkdir -p <integration>/generated/<module> && bal openapi -i <spec> --mode client -o
<integration>/generated/<module>`; the output folder must exist first. Without the
`[[tool.openapi]]` entry the module does not survive a clean clone, so prefer the entry.)

Read `generated/<module>/client.bal` for the exact `init` and method signatures, then use the client:

```ballerina
// connections.bal
import <integration>.<module>;

final <module>:Client <module>Client = check new ({<auth fields from the generated auth record>});

// functions.bal
import <integration>.<module>;

function listPets() returns <module>:Pet[]|error {
    <module>:Pet[] pets = check <module>Client->/pets('limit = 5);   // query parameters by name
    return pets;
}

function getPet(int petId) returns <module>:Pet|error {
    <module>:Pet pet = check <module>Client->/pets/[petId];         // path parameters as segments
    return pet;
}

function addPet(string petName) returns <module>:Pet|error {
    <module>:NewPet newPet = {name: petName};
    <module>:Pet created = check <module>Client->/pets.post(newPet);  // the payload first
    return created;
}
```

- Methods are resource methods by default: call them by path and accessor (`->/pets.post(...)`; a
  bare `->/pets` is `get`). Each also takes `map<string|string[]> headers = {}`.
- A reserved word as a parameter name keeps its quote (`'limit`).
- A field name with a hyphen is escaped in Ballerina (`X\-API\-Key`).
- Declare a `configurable` for each credential and for the service URL when it differs between
  environments (`configurable string petstoreApiKey = ?;`), and pass them to `init`. The user sets
  their values in `Config.toml`; check with `config_status`.
- Remote methods named after the operation IDs instead of resource methods come from the CLI flag
  `--client-methods remote` (one-off generation only).

## 3b. Service mode

Generate in a scratch folder, never into the integration: `bal openapi` overwrites a `types.bal`
already in its output folder without asking.

```
mkdir -p <scratch> && bal openapi -i <integration>/<api>_openapi.yaml --mode service --with-service-contract -o <scratch>
```

It writes two files:
- `service_contract.bal`: a service contract type,
  ```ballerina
  @http:ServiceConfig {basePath: "/v1"}
  type OASServiceType service object {
      *http:ServiceContract;
      resource function get pets(int? 'limit) returns Pet[];
      resource function post pets(@http:Payload NewPet payload) returns Pet;
      resource function get pets/[int petId]() returns Pet|http:NotFound;
  };
  ```
  `basePath` is the path of the spec's server URL.
- `types.bal`: a record per schema.

Bring them into the integration the way the BI designer does:
1. Save the contract as `<integration>/service_contract_<Type>.bal`, renaming `OASServiceType` to a
   name for the API (`PetStoreService`), and add `|error` to every method's return type
   (`returns Pet[]|error`).
2. Add the records to the integration's `types.bal`; if a name is already taken, rename the new
   record in both the contract and `types.bal`.
3. In `main.bal`, attach a service of that type to a listener and implement every method:
   ```ballerina
   listener http:Listener petStoreListener = new (port = servicePort);

   service PetStoreService on petStoreListener {
       resource function get pets(int? 'limit) returns Pet[]|error {
           ...
       }

       resource function post pets(NewPet payload) returns Pet|error {
           ...
       }

       resource function get pets/[int petId]() returns Pet|http:NotFound|error {
           ...
       }
   }
   ```
   - The service has no base path of its own: it comes from the contract's `basePath`. The URLs are
     the spec's (`/v1/pets` here); tell the user, and change `basePath` only if they ask.
   - Repeat each signature without its HTTP annotations: `@http:Payload` on an implementing method
     fails with "http:Payload annotation is not allowed for resource function implemented via the
     http:ServiceContract type".
   - A resource left out fails with "no implementation found for the method ...", naming it, so the
     diagnostics after your edit list what is still missing.
4. Run `bal build`, then start the service with `bal run` in a background shell from the
   integration's directory and call one resource to check it.

Without `--with-service-contract`, `--mode service` writes `<api>_service.bal` with a listener on the
server URL's port and host (for example 443) and empty resource bodies; do not keep that listener.

## Useful flags (one-off CLI generation)

- `--tags <tags>` or `--operations <operationIds>`: generate only part of the API.
- `-n` / `--nullable`: make every record field nilable, for specs whose responses carry nulls the
  schema does not declare (they fail data binding otherwise).
- `--status-code-binding` (client): methods that return status-code response records.
- `--with-tests` (client): a test skeleton for the client's methods.
- `--license <file>`: a license header on the generated files.

`bal openapi --help` lists them all.
