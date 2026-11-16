## HTTP

Design a service's contract first: write each resource function signature with its path, query, payload and header parameters and a return type covering every outcome, with `http:NotImplemented` as a placeholder member until the body is written:

```ballerina
resource function get users() returns UserList|http:NotFound|http:NotImplemented {
    return http:NOT_IMPLEMENTED;
}
```

Then implement each resource and remove the placeholder.

Configure retries on the client; do not hand-write a retry loop with `runtime:sleep`:

```ballerina
http:Client partnerClient = check new (partnerBaseUrl,
    timeout = 30,
    retryConfig = {
        count: 2,                              // retries, not attempts: 2 means 3 calls
        interval: 1,
        backOffFactor: 2.0,
        maxWaitInterval: 20,
        statusCodes: [500, 502, 503, 504]
    }
);
```

- `count` is the number of retries, so "at most N attempts" is `count: N - 1`.
- `statusCodes` is an explicit list, not a range: `[500, 502, 503, 504]` leaves 501, 505, 507 and 511 unretried. List every code you mean.
- When retries run out, a listed status code comes back as an `http:Response` carrying its real status, and a transport failure (DNS, connection refused, timeout) as an `http:ClientError`. Never invent a status code for a call that never reached the server; record "no response" as its own outcome.
- A `ballerinax` connector that speaks HTTP usually has `retryConfig` on its own `ConnectionConfig`: configure it there instead of wrapping the connector in a loop. Database and messaging clients usually have no such field. The connector's config record, which its `init` lookup prints, settles it.
- Hand-roll a retry loop only when the decision depends on something `retryConfig` cannot see (an error in the response body, a whole unit of work, added jitter), when the client has no retry configuration, or when each attempt must be logged. Keeping the status code is not a reason: exhausted retries already return it.

## SQL

Most SQL mistakes compile cleanly and fail when the statement runs, so `bal build` will not catch any of these.

- The client alone is not enough. The JDBC driver arrives as a side-effect import that looks unused and must stay: `import ballerinax/postgresql;` plus `import ballerinax/postgresql.driver as _;`. The same holds for `mysql`, `mssql`, `oracledb` and `h2`; without the driver import the code compiles and fails at run time with "Error while loading database driver". `ballerinax/java.jdbc` has no driver package: add the vendor's JDBC JAR as a platform dependency in `Ballerina.toml` instead.
- Write queries as backtick templates so values are bound as parameters, and never concatenate a value into a query string (an injection risk and a binding error):
  ```ballerina
  sql:ParameterizedQuery query = `SELECT id, name FROM users WHERE id = ${userId}`;
  ```
- Bind the native type the column expects. A string bound to a temporal or JSON column compiles and fails with SQL state `42804`: bind `time:Utc` or `time:Civil` for `timestamp`/`timestamptz`, `postgresql:JsonBinaryValue` for PostgreSQL `jsonb`, `postgresql:JsonValue` for `json`.
- `queryRow()` returns `sql:NoRowsError` when nothing matches. For a lookup that is a normal outcome: handle it in the union (`User|sql:Error result = dbClient->queryRow(...); if result is sql:NoRowsError { ... }`) instead of letting it propagate.
- Matching columns to record fields is case-insensitive (a `receivedat` column fills `receivedAt`). A record field with no matching column is silently left at its zero value, which can look like real data; a column with no matching field raises `sql:FieldMismatchError`.
- PostgreSQL folds unquoted identifiers to lowercase. Pick one convention for the whole schema; if the DDL quotes camelCase names, every query must quote them too.
- `sql:ExecutionResult.lastInsertId` covers `SERIAL` and `IDENTITY` columns; for other generated columns in the same round trip use `RETURNING` with `queryRow`.

## Event-driven services

For anything that receives events through a listener: a broker or queue consumer (Kafka, RabbitMQ, NATS, JMS, MQTT, ...) or a change-data-capture listener.

Where the destination goes depends on the connector, and you cannot infer it from the kind of connector. For a connector named below, use the form given; for any other, check its `service` and its `Listener` (see Using bal discover):
1. On the listener config, and `service on myListener { ... }` is the whole attach form: `ballerinax/kafka` (`topics`), `ballerina/mqtt` (`subscriptions`), `ballerinax/cdc`.
2. As the service attach path, `service <pkg>:<ServiceType> "<destination>" on <listener>`: `ballerinax/rabbitmq` (queue name), `ballerinax/nats` (subject), `ballerinax/salesforce` (CDC channel).
3. In a service annotation, `@solace:ServiceConfig { queueName: "orders" }`: `ballerinax/solace`, `ballerinax/ibm.ibmmq`, and `ballerinax/cdc` for its tables (`@cdc:ServiceConfig { tables: ... }`).
Only form 2 fails at build time when the destination is missing (Salesforce fails at startup). Forms 1 and 3 build and run and receive nothing, and a Kafka listener with no `topics` compiles and subscribes to nothing, so confirm the destination is set before you run.

Acknowledgement (any broker): check whether the remote method receives one message or a batch (RabbitMQ and NATS deliver one, Kafka an array). When the requirement is at-least-once delivery ("if X fails, do not acknowledge"), where you acknowledge is the design:
- A failed persistence or other required side effect blocks the acknowledgement: do not acknowledge, arrange redelivery.
- A malformed payload that can never succeed does not: log and skip it, or the consumer wedges on a poison message forever.
- A downstream call the design tolerates failing does not: record the outcome and carry on.
- Check whether the acknowledgement call is per message or batch-scoped before using it: a batch-scoped call inside the loop acknowledges messages not yet processed, including skipped ones. Switch off automatic acknowledgement only together with these rules.

To keep the untouched payload (audit, replay, dead letter), bind the body as `string` or `byte[]` and persist it before parsing; binding straight to a record loses the original bytes when parsing fails.

Kafka specifics:
- `caller->'commit()` commits every offset the consumer holds, the whole batch: call it once, after the loop.
- To block the acknowledgement on failure, `caller->seek(...)` back to that record's offset and return without committing; without the `seek` the record is not redelivered in this session.
- `caller->commitOffset(...)` takes the next offset to consume: to acknowledge record `N`, commit `N + 1`.
- Set `autoCommit: false` only together with the rules above. Record inclusion keeps the raw bytes and puts `offset` in scope for `seek`: `type RawOrderRecord record {| *kafka:AnydataConsumerRecord; string value; |};`.
