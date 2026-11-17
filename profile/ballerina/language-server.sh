#!/bin/sh
# The Ballerina language server for the product's `.bal` files, on macOS and
# Linux (language-server.ts declares it; Windows gets the stock server).
#
#   language-server.sh [--check] <jar> <jar size in bytes> <distribution update> <java major>
#
# Starts the BI designer's fat jar when the file is present and the expected
# size, the active distribution belongs to <distribution update> (such as
# 2201.14), and the distribution ships a JRE of <java major> or newer. The
# Java command is the one the BI extension for VS Code builds: the
# distribution's jars minus the stale copies the fat jar replaces, the fat jar
# last. Anything else starts `bal start-language-server`, so diagnostics keep
# working without the jar.
#
# With --check it starts nothing and prints one line: `jar <java>` or
# `stock <reason> [detail]`, where the reason is no-jar, jar-size, no-bal,
# distribution or no-java.

check=
if [ "$1" = "--check" ]; then
	check=1
	shift
fi
jar=$1
size=$2
update=$3
java_major=$4

stock() {
	if [ -n "$check" ]; then
		echo "stock $*"
		exit 0
	fi
	# Exit 127, as for a missing command, with the cause on stderr, which the
	# base shows; `exec bal` would only say "bal: not found".
	if ! command -v bal > /dev/null 2>&1; then
		echo "Ballerina is not installed: the bal command is not on PATH. Install Ballerina, then restart the session." >&2
		exit 127
	fi
	echo "language-server.sh: starting bal start-language-server ($*)" >&2
	exec bal start-language-server
}

[ -f "$jar" ] || stock no-jar
actual=$(wc -c < "$jar" | tr -d ' ')
[ "$actual" = "$size" ] || stock jar-size "$actual"

home=$(bal home 2>/dev/null) || stock no-bal
home=${home%/}
{ [ -n "$home" ] && [ -d "$home" ]; } || stock no-bal
case "${home##*/}" in
	ballerina-"$update".*) ;;
	*) stock distribution "${home##*/}" ;;
esac

# The JREs sit beside the distributions folder: <root>/dependencies/jdk-25.0.3+9-jre.
root=${home%/distributions/*}
java=
best=0
for dir in "$root"/dependencies/jdk-*-jre; do
	[ -x "$dir/bin/java" ] || continue
	major=${dir##*/jdk-}
	major=${major%%[.+-]*}
	case "$major" in '' | *[!0-9]*) continue ;; esac
	if [ "$major" -ge "$java_major" ] && [ "$major" -gt "$best" ]; then
		best=$major
		java="$dir/bin/java"
	fi
done
[ -n "$java" ] || stock no-java "$root/dependencies"

if [ -n "$check" ]; then
	echo "jar $java"
	exit 0
fi

classpath=
for dir in "$home/bre/lib" "$home/lib/tools/lang-server/lib" "$home/lib/tools/debug-adapter/lib"; do
	for file in "$dir"/*.jar; do
		[ -f "$file" ] || continue
		case "${file##*/}" in
			architecture-model* | flow-model* | graphql-model* | model-generator* | sequence-model* | service-model* | test-manager-service* | language-server* | bal-shell-service* | org.eclipse.lsp4j* | diagram-util* | openapi-ls-extension* | sqlite-jdbc*) ;;
			*) classpath="$classpath$file:" ;;
		esac
	done
done
exec "$java" -cp "$classpath$jar" "-Dballerina.home=$home" org.ballerinalang.langserver.launchers.stdio.Main
