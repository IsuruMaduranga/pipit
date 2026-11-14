---
name: ballerina-setup
description: Use this skill when Ballerina is missing or out of date on the machine, that is when the `bal` command is not found, the distribution is older than the product supports, or a `bal` tool such as `discover` or `openapi` is not installed. It installs or updates only after the user agrees.
---

# Ballerina setup

Install or update Ballerina and the `bal` tools this product uses. Everything here changes the user's machine, so the user decides. Follow the steps in order.

## Step 1: see what is there

Run these and read the answers before proposing anything:

- `bal version`: the active distribution (`Ballerina 2201.14.1 (Swan Lake Update 14)`), or "command not found".
- `bal tool list`: the installed tools. This product uses `discover` (library lookup) and, for the `connector` skill, `openapi`.
- `uname -sm` (on Windows: `$env:PROCESSOR_ARCHITECTURE`): the operating system and the processor, to pick the installer.

If `bal` is not found, also check whether it is installed but not on `PATH`: `/Library/Ballerina/bin/bal` (macOS), `/usr/lib/ballerina/bin/bal` (a DEB install), `/usr/lib64/ballerina/bin/bal` (an RPM install), `C:\Program Files\Ballerina\bin\bal.bat` (Windows). If one exists, nothing needs installing: tell the user to open a new terminal, or to add that `bin` folder to `PATH`, and stop here.

## Step 2: tell the user and ask

Say in plain words what is missing, what you would run, where it installs, and roughly how large the download is (an installer is about 350 to 400 MB). Then ask with `ask_user_question`, offering the routes that fit the machine and "Do not install". Do not run an install or update command before the user has chosen. If the user declines, say what will not work (builds, runs, tests, diagnostics, library lookup) and carry on with what does not need Ballerina.

The permission prompt may ask the user again when the command runs. That is expected.

## Step 3: install Ballerina

Use the route the user chose. `<VERSION>` is the latest release shown on https://ballerina.io/downloads/ ; installers are at `https://dist.ballerina.io/downloads/<VERSION>/<file>`.

**macOS**

- Homebrew, when `brew` is installed: `brew install bal`. No administrator password is needed.
- The package installer: download `ballerina-<VERSION>-swan-lake-macos-arm-x64.pkg` (Apple silicon) or `ballerina-<VERSION>-swan-lake-macos-x64.pkg` (Intel) and install it. It installs to `/Library/Ballerina` and sets `PATH`. Installing a package needs the administrator password, which you cannot type: give the user the command to run themselves (`sudo installer -pkg <file> -target /`), or tell them to open the downloaded file.

**Linux**

- Debian or Ubuntu: download `ballerina-<VERSION>-swan-lake-linux-x64.deb` (`...-linux-arm-x64.deb` on ARM) and install it with `sudo dpkg -i <file>`. It installs to `/usr/lib/ballerina`.
- Red Hat, CentOS or Fedora: download `ballerina-<VERSION>-swan-lake-linux-x64.rpm` and install it with `sudo rpm -i <file>`. It installs to `/usr/lib64/ballerina`.
- `sudo` asks for a password you cannot type. Download the file, then give the user the one install command to run in their own terminal.

**Windows**

- Download `ballerina-<VERSION>-swan-lake-windows-x64.msi` and have the user run it. It installs to `C:\Program Files\Ballerina` and sets `PATH`.

**Any other system**

- The ZIP file `ballerina-<VERSION>-swan-lake.zip`: unzip it, add its `bin` folder to `PATH`, and set `JAVA_HOME` to a Java 21 runtime (Update 11 and later need Java 21). Use this only when no installer fits.

A terminal that was open before the install does not see the new `PATH`. If `bal version` still fails afterwards, call `bal` by its full path for the rest of this session, and tell the user to restart the terminal.

## Step 4: update an old distribution

When `bal` is installed but the distribution is older than the product supports:

1. `bal update` updates the update tool itself. Run it first.
2. `bal dist update` moves to the latest patch of the active distribution. `bal dist pull latest` moves to the latest release and makes it active. `bal dist list` shows what is installed and what is available.

Ask before running them, as in step 2. An update can change how the user's other Ballerina projects build, so say that. A Homebrew install is updated with `brew upgrade bal` instead.

## Step 5: install the tools

- `bal tool pull discover`: library lookup (`bal discover`).
- `bal tool pull openapi`: only when the `connector` skill needs it.

These download from Ballerina Central into the user's home folder (`~/.ballerina`). Ask first, in the same question as the install when both are needed.

## Step 6: verify

Run `bal version` and `bal tool list` again and check the answers. Then tell the user what was installed, where, and how to remove it:

- Homebrew: `brew uninstall bal`.
- A DEB install: `sudo apt-get remove ballerina-<VERSION>-swan-lake`. An RPM install: `sudo rpm -e ballerina-<VERSION>-swan-lake`.
- macOS package or Windows: delete `/Library/Ballerina`, or uninstall from the Windows control panel.
- One distribution: `bal dist remove <VERSION>`. A tool: `bal tool remove <id>`.

Compiler diagnostics for `.bal` files need `bal` on the session's `PATH`. If they do not appear after the install, ask the user to restart the session.
