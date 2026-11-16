## Syntax skeletons

Follow these shapes exactly. Each part goes in the standard file named in its comment.

```ballerina
// config.bal
configurable string ordersApiUrl = ?;              // the value comes from Config.toml at run time
configurable int servicePort = ?;

// types.bal
type Order record {|                               // closed: a shape this code owns
    string id;
    decimal total;
|};

type PartnerOrder record {                         // open: data from an external system
    string id;
    decimal amount;
    string note?;                                  // may be absent
};

enum OrderStatus {                                 // an enum: braces, members separated by commas
    PENDING,                                       // each member is a string constant: PENDING is "PENDING"
    SHIPPED,
    DELIVERED = "delivered"                        // or give a member its own string value
}

// connections.bal
import ballerina/http;

final http:Client ordersApi = check new (ordersApiUrl);  // module-level client

// main.bal
import ballerina/http;

listener http:Listener orderListener = new (port = servicePort);  // `listener`, never `final`

service / on orderListener {
    resource function get orders/[string orderId]() returns Order|http:NotFound|error {
        PartnerOrder|http:ClientError response = ordersApi->/orders/[orderId];  // remote call on its own line
        if response is http:ClientRequestError {
            return http:NOT_FOUND;
        }
        PartnerOrder partnerOrder = check response;
        Order result = toOrder(partnerOrder);
        return result;
    }
}

// data_mappings.bal
function toOrder(PartnerOrder partnerOrder) returns Order => {  // expression body: a data mapper
    id: partnerOrder.id,
    total: partnerOrder.amount
};

// automation.bal (an automation instead of a service)
import ballerina/log;

public function main() returns error? {
    Order[] orders = check fetchOrders();
    foreach Order 'order in orders {                // `order` is a reserved word: quote it as `'order`
        log:printInfo("Order", orderId = 'order.id);
    }
    foreach int attempt in 1 ... 3 {                // a range: 1, 2 and 3; `0 ..< count` stops before count
        log:printInfo("Attempt", attempt = attempt);
    }
}

// functions.bal
function fetchOrders() returns Order[]|error {     // block body: a plain function
    Order[] orders = check ordersApi->/orders;
    return orders;
}
```
