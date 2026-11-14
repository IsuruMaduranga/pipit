---
name: security-review
description: >
  Security review of the pending changes on this branch: finds vulnerabilities
  an attacker could actually reach in the changed code, checks each one, and
  reports them with severity, an attack path, and a suggested fix.
---

Audit the pending changes on this branch for security defects, the way a
senior security engineer reviews a pull request. The bar is exploitability: a
finding needs an attacker, a path, and a consequence. Theoretical hardening
with no reachable path is not a finding.

## Step 0: Collect the changes

Run these and treat their combined output as the scope of the review (the
later rule against running commands applies to the filtering agents, not to
this step):

- `git status`
- `git diff --name-only origin/HEAD...` for the changed files
- `git log --no-decorate origin/HEAD...` for the commits
- `git diff origin/HEAD...` for the full diff

Review the whole diff. Judge only what this change adds or alters; security
problems that were already there before it are out of scope. Read the
surrounding services, configuration, and types as needed: whether an input is
reachable decides severity, and reachability usually lives outside the diff.

## The bar

1. **Few false positives.** Report a finding only when you are more than 80%
   sure it can really be exploited.
2. **No noise.** Leave out theoretical issues, style, and low-impact
   observations.
3. **Impact first.** Put first what could lead to unauthorized access, a data
   breach, or a compromised system.
4. **Out of scope for this review:** denial of service, secrets stored on disk
   (other processes handle those), and rate limiting or resource exhaustion.

## What to look for

**Injection and code execution**
- SQL built from request data by string concatenation instead of a
  parameterized query. In Ballerina, a template literal passed as
  `sql:ParameterizedQuery` is parameterized and safe; query text assembled by
  concatenation, or `sql:queryConcat` used to splice raw input, is not. The
  same pattern for NoSQL filters, LDAP, XPath, and templates.
- Shell commands, file paths, or code built from request data: command
  injection, path traversal (a directory joined with a request-supplied name
  without normalizing it or checking it stays inside), template injection,
  `eval`-style execution.
- XML parsing open to external entities (XXE), and deserialization of
  untrusted input into objects (YAML, pickle, or a binding into types with
  security-relevant fields, such as `cloneWithType`/`fromJsonWithType` on an
  untrusted payload, or an open record where extra fields change behavior).
- Cross-site scripting in web output (reflected, stored, or DOM-based).

**Authentication and authorization**
- Logic that lets a caller skip authentication, or reach a privilege it should
  not have.
- A new resource function on a listener whose service has no auth
  configuration while its siblings do; a handler that assumes an authorization
  check happened elsewhere; scopes checked on one method of a resource but not
  on the others.
- Session handling flaws and token mistakes (unsigned or unverified JWTs,
  tokens that never expire).

**Secrets and cryptography**
- Credentials, keys, or tokens hard-coded in source, given real values as
  `configurable` defaults, or committed in a `Config.toml`.
- Secrets that flow into logs, error messages, or responses.
- Weak or home-made cryptography, predictable randomness where security
  depends on it, and certificate or TLS checks turned off (`secureSocket`
  disabled, plain `http:` to a service that receives credentials).

**Outbound requests**
- An HTTP client whose target host or protocol, or a redirect location, comes
  from request data without an allowlist (SSRF). A request that controls only
  the path is not SSRF.

**Data exposure**
- Errors that pass internal messages or stack details to API clients.
- Logging of secrets, passwords, or personal data.
- Endpoints that return more data than the caller is entitled to.
- CORS that allows any origin together with credentials.

A problem reachable only from the local network can still be HIGH severity.

## How to analyze

1. **Learn the project's security model.** Use the search tools to find the
   security frameworks and libraries in use, the established patterns for
   validation and sanitizing, and the trust boundaries the project assumes.
2. **Compare.** Hold the new code against those patterns: where does it depart
   from how the project already does things safely, where is security handled
   inconsistently, and where does the change open a new attack surface?
3. **Trace.** For each changed file, follow data from where an attacker's input
   enters to the sensitive operation it reaches, and look for privilege
   boundaries crossed without a check.

## Output

Write the report in markdown. Each finding gives the file and line, the
severity, the category (such as `sql_injection` or `xss`), a description, an
exploit scenario, and a recommended fix, for example:

# Vuln 1: SQL injection: `orders/service.bal:42`

* Severity: High
* Description: The `customerId` query parameter is spliced into the raw text of the query passed to `dbClient->query` instead of being bound as a value, so the caller controls the statement.
* Exploit scenario: A request with `customerId=1 OR 1=1` returns every customer's orders; a crafted value can also read other tables.
* Recommendation: Pass the value through a parameterized query (`` `SELECT * FROM orders WHERE customer_id = ${customerId}` `` as `sql:ParameterizedQuery`) instead of building the string.

Severity:
- **HIGH**: directly exploitable, leading to remote code execution, a data
  breach, or bypassed authentication.
- **MEDIUM**: needs specific conditions, but the impact is significant.
- **LOW**: defense in depth, or lower impact.

Confidence:
- 0.9 to 1.0: a definite exploit path, tested if possible.
- 0.8 to 0.9: a clear vulnerable pattern with known ways to exploit it.
- 0.7 to 0.8: a suspicious pattern that needs specific conditions.
- Below 0.7: too speculative to report.

Report HIGH and MEDIUM findings only. Missing a theoretical issue is better
than burying the report in false positives: every finding should be one a
security engineer would raise with confidence in a review.

## Filtering false positives

Each filtering agent gets these rules:

> Decide from the code whether the vulnerability is real; you do not need to
> reproduce it. Do not run shell commands and do not write any files.
>
> Drop a finding that falls under any of these:
> 1. Denial of service or resource exhaustion, including memory or CPU.
> 2. Secrets or credentials stored on disk that are otherwise protected.
> 3. Rate limiting or service overload.
> 4. Missing input validation on a field with no proven security impact.
> 5. Input sanitizing in CI workflows (such as GitHub Actions) unless untrusted
>    input clearly triggers it.
> 6. Missing hardening in general: flag concrete vulnerabilities, not absent
>    best practices.
> 7. Races and timing attacks, unless they are practical and not just possible in
>    theory.
> 8. Outdated third-party libraries (handled separately).
> 9. Memory-safety issues in memory-safe languages.
> 10. Code that only runs as part of tests.
> 11. Log spoofing: writing unsanitized input to a log is not a vulnerability.
> 12. SSRF that controls only the path, not the host or protocol.
> 13. User-controlled content in an AI system prompt.
> 14. Regex injection and regex denial of service.
> 15. Findings in documentation files such as markdown.
> 16. Missing audit logs.
>
> Settled cases:
> 1. Logging high-value secrets in plain text is a vulnerability; logging URLs
>    is assumed safe.
> 2. UUIDs can be treated as unguessable.
> 3. Environment variables and command-line flags are trusted; an attack that
>    needs control of them is invalid.
> 4. Resource leaks (memory, file descriptors) are not findings.
> 5. Subtle, low-impact web issues (tabnabbing, XS-Leaks, prototype pollution,
>    open redirects) count only with very high confidence.
> 6. React and Angular escape output by default; report XSS there only through
>    an unsafe API such as `dangerouslySetInnerHTML` or
>    `bypassSecurityTrustHtml`.
> 7. Most CI workflow issues are not exploitable in practice; require a
>    concrete, specific attack path.
> 8. Missing permission checks in client-side code are not findings: the server
>    is responsible for checking what clients send.
> 9. Report a MEDIUM finding only when it is obvious and concrete.
> 10. Notebook (`*.ipynb`) issues need a concrete path by which untrusted input
>     triggers them.
> 11. Logging data that is not secret or personal is not a vulnerability.
> 12. Command injection in shell scripts needs a concrete path for untrusted
>     input; scripts rarely receive it.
>
> For each finding that remains, ask: is there a concrete attack path, is the
> risk real rather than a best-practice gap, are the locations specific, and
> would a security team act on it? Then give it a confidence score from 1 to
> 10, where 1 to 3 means likely noise, 4 to 6 needs investigation, and 7 to 10
> means a likely real vulnerability.

## Run it in three steps

1. Start one agent through the Agent tool to find vulnerabilities. It explores
   the repository for context, then analyzes the change for security
   implications; its prompt includes everything above except the filtering
   section. Without an Agent tool, do this step yourself in this context.
2. For each vulnerability that step found, start a separate filtering agent
   through the Agent tool, all of them in parallel, each with the rules from
   "Filtering false positives". Without an Agent tool, run the filtering
   yourself.
3. Drop every finding whose filtering score is below 8.

Your final reply is the markdown report and nothing else. When nothing
survives, say so plainly, so that a clean result cannot be mistaken for a
review that never ran.
