## Built-in language libraries

Prefer these langlib functions over hand-written logic. The shapes below compile on the installed distribution: write them as shown. Write any other langlib function when you are sure of its name, and let the compiler check it; when you are not sure, or the compiler rejects one, list the module's functions with `bal discover function -p ballerina/lang.<module> --output-format text`.

Type conversion and copying:
```ballerina
int age = check int:fromString("25");              // also float:, decimal:, boolean:, xml:fromString
float notANumber = check float:fromString("NaN");  // "Infinity" and "-Infinity" work too
decimal exact = check decimal:fromString("10.50");
json parsed = check "{\"id\":12}".fromJsonString();
int[] numbers = check "[1, 2, 3]".fromJsonStringWithType();
Config config = check configText.fromJsonStringWithType(Config);  // straight into a record
string shown = scores.toString();                  // any value, for display or logging
json asJson = person.toJson();                     // a record to json, for an API
string jsonText = person.toJsonString();
Config fromJson = check configJson.cloneWithType(); // json to a record; json[] to int[] works the same way
json[] subjects = check student.subjects.ensureType();  // check a value against a type
int[] copy = original.clone();                     // a mutable copy of mutable data
```
`clone()` on an already readonly value returns the same immutable value, and cloning a mutable container keeps its readonly members readonly: use `cloneWithType()` with a non-readonly target for a mutable copy. For open versus closed records see Data binding.

Arrays:
```ballerina
int count = numbers.length();
int? position = numbers.indexOf(30);               // () when absent
numbers.push(4);
int last = numbers.pop();
numbers.unshift(0);
int first = numbers.shift();
int[] sortedUp = numbers.sort();
int[] sortedDown = numbers.sort("descending");
```

Strings:
```ballerina
int length = text.length();
string joined = string:'join(", ", "apple", "banana");  // `join` is a reserved word, hence the quote
int comparison = "apple".codePointCompare("banana");    // negative, 0 or positive
string greeting = "Hello".concat(" ", "World");
boolean starts = text.startsWith("Hello");         // also endsWith
boolean found = text.includes("World");            // includes("o", 5) starts at index 5
int? at = text.indexOf("World");                   // () when absent; indexOf("o", 5) starts at 5
string head = text.substring(0, 5);
string tail = text.substring(6);
string upper = text.toUpperAscii();                // also toLowerAscii
string trimmed = "  hello  ".trim();
byte[] bytes = text.toBytes();                     // UTF-8
string decoded = check string:fromBytes(bytes);
int code = string:toCodePointInt("A");             // 65; also fromCodePointInt, toCodePointInts, fromCodePointInts
int firstCode = text.getCodePoint(0);
```
A string has no `toLowerCase`, `toUpperCase` or `split` method; the compiler rejects each one as an undefined function. Write `toLowerAscii()` and `toUpperAscii()`, and split a string with a regular expression: ``re `,`.split("a,b")`` gives `["a","b"]` (see Regular expressions).

Regular expressions: `re` literals and `string:RegExp` methods need no import; naming `regexp:` (`regexp:Span`, `regexp:Groups`, `regexp:fromString`) needs `import ballerina/lang.regexp;`.
```ballerina
string:RegExp digits = re `[0-9]+`;
string:RegExp built = check regexp:fromString("[0-9]+");
regexp:Span? firstMatch = digits.find("a1b23");
regexp:Span[] matches = digits.findAll("a1b23c456");  // "1", "23", "456"
regexp:Groups? groups = re `([a-z]+)([0-9]+)`.findGroups("abc123");
if groups is regexp:Groups {
    regexp:Span? letters = groups[1];              // groups[0] is the whole match; .substring() gives the text
}
boolean valid = digits.isFullMatch("123");
string once = digits.replace("a1b2", "X");         // "aXb2"
string all = digits.replaceAll("a1b2", "X");       // "aXbX"
string[] parts = re `,\s*`.split("a, b, c");
```

Maps:
```ballerina
int entries = scores.length();
int aliceScore = scores.get("Alice");              // panics when the key is absent
boolean hasAlice = scores.hasKey("Alice");
string[] names = scores.keys();
int[] values = scores.toArray();
int removed = scores.remove("Alice");              // panics when absent
int? maybeRemoved = scores.removeIfHasKey("Carol");
scores.removeAll();
```

Numbers and errors:
```ballerina
string hex = (255).toHexString();                  // "ff"
int fromHex = check int:fromHexString("ff");
error failure = error("Connection failed", code = 500);
string message = failure.message();
map<value:Cloneable> & readonly detail = failure.detail();  // needs import ballerina/lang.value
error? cause = failure.cause();                    // error("Outer", innerError) sets the cause
```

Pausing (needs `import ballerina/lang.runtime;`): `runtime:sleep(2);` waits two seconds.

Query expressions work over arrays, streams and tables, like SQL:
```ballerina
int[] evenDoubled = from int num in numbers
    where num % 2 == 0
    select num * 2;
string[] adultNames = from Person candidate in people
    where candidate.age > 23
    select candidate.name;
int[] large = from int num in numberStream         // a stream<int>, for example [1, 2, 3].toStream()
    where num > 2
    select num;
```

XML:
```ballerina
xml book = xml `<book><title>Hamlet</title></book>`;
xml books = xml `<book>One</book>` + xml `<book>Two</book>`;
xml items = xml:concat(xml `<item>First</item>`, xml `<item>Second</item>`);
xml parsedXml = check xml:fromString("<root><item>Value</item></root>");
int itemCount = items.length();
```
To convert between XML and records, use the `ballerina/data.xmldata` module.
