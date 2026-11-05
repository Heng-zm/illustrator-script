#target illustrator

var __ozoHostScriptFile = (function () {
    try {
        if (typeof $.fileName === "string" && $.fileName.length > 0) {
            return new File($.fileName);
        }
    } catch (e) {}
    return null;
})();

var __ozoPluginFolder = (function () {
    if (__ozoHostScriptFile && __ozoHostScriptFile.parent && __ozoHostScriptFile.parent.parent) {
        return __ozoHostScriptFile.parent.parent;
    }
    return Folder.current;
})();

var __ozoExplicitPluginFolder = null;

// Illustrator's ExtendScript has no native JSON object, so the panel bridge
// cannot rely on JSON.stringify. Use the native implementation when a host
// provides one and fall back to this minimal serializer otherwise.
function ozoJsonStringify(value) {
    if (typeof JSON !== "undefined" && JSON && typeof JSON.stringify === "function") {
        return JSON.stringify(value);
    }
    var type = typeof value;
    if (value === null || type === "undefined") {
        return "null";
    }
    if (type === "number") {
        return isFinite(value) ? String(value) : "null";
    }
    if (type === "boolean") {
        return value ? "true" : "false";
    }
    if (type === "string") {
        return ozoJsonQuote(value);
    }
    if (value instanceof Array || Object.prototype.toString.call(value) === "[object Array]") {
        var items = [];
        for (var i = 0; i < value.length; i++) {
            items.push(ozoJsonStringify(value[i]));
        }
        return "[" + items.join(",") + "]";
    }
    if (type === "object") {
        var pairs = [];
        for (var key in value) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) {
                continue;
            }
            var entry = value[key];
            var entryType = typeof entry;
            if (entryType === "undefined" || entryType === "function") {
                continue;
            }
            pairs.push(ozoJsonQuote(key) + ":" + ozoJsonStringify(entry));
        }
        return "{" + pairs.join(",") + "}";
    }
    return "null";
}

function ozoJsonQuote(text) {
    var result = '"';
    for (var i = 0; i < text.length; i++) {
        var character = text.charAt(i);
        var code = text.charCodeAt(i);
        if (character === '"') {
            result += '\\"';
        } else if (character === "\\") {
            result += "\\\\";
        } else if (character === "\b") {
            result += "\\b";
        } else if (character === "\f") {
            result += "\\f";
        } else if (character === "\n") {
            result += "\\n";
        } else if (character === "\r") {
            result += "\\r";
        } else if (character === "\t") {
            result += "\\t";
        } else if (code < 32) {
            var hex = code.toString(16);
            while (hex.length < 4) {
                hex = "0" + hex;
            }
            result += "\\u" + hex;
        } else {
            result += character;
        }
    }
    return result + '"';
}

// eval-free JSON parser for bridge parameters. The panel always sends JSON,
// but the host must never evaluate that string as code.
function ozoJsonParse(source) {
    var text = String(source === null || source === undefined ? "" : source).replace(/^\uFEFF/, "");
    var at = 0;
    var depth = 0;

    function fail(message) {
        throw new Error("Invalid JSON at position " + at + ": " + message);
    }

    function skipWhitespace() {
        while (at < text.length) {
            var ch = text.charAt(at);
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                at++;
            } else {
                break;
            }
        }
    }

    function parseString() {
        if (text.charAt(at) !== '"') fail("expected a string");
        at++;
        var out = "";
        while (at < text.length) {
            var ch = text.charAt(at++);
            if (ch === '"') return out;
            if (ch !== "\\") {
                if (ch.charCodeAt(0) < 32) fail("control character in string");
                out += ch;
                continue;
            }
            var escape = text.charAt(at++);
            if (escape === '"' || escape === "\\" || escape === "/") out += escape;
            else if (escape === "b") out += "\b";
            else if (escape === "f") out += "\f";
            else if (escape === "n") out += "\n";
            else if (escape === "r") out += "\r";
            else if (escape === "t") out += "\t";
            else if (escape === "u") {
                var hex = text.substr(at, 4);
                if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
                at += 4;
                out += String.fromCharCode(parseInt(hex, 16));
            } else {
                fail("invalid escape sequence");
            }
        }
        fail("unterminated string");
    }

    function parseNumber() {
        var match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.substr(at));
        if (!match) fail("invalid value");
        at += match[0].length;
        return Number(match[0]);
    }

    function parseObject() {
        depth++;
        if (depth > 64) fail("nesting too deep");
        at++;
        var object = {};
        skipWhitespace();
        if (text.charAt(at) === "}") {
            at++;
            depth--;
            return object;
        }
        while (true) {
            skipWhitespace();
            var key = parseString();
            skipWhitespace();
            if (text.charAt(at) !== ":") fail("expected ':'");
            at++;
            var value = parseValue();
            if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
                object[key] = value;
            }
            skipWhitespace();
            var ch = text.charAt(at);
            if (ch === ",") { at++; continue; }
            if (ch === "}") { at++; depth--; return object; }
            fail("expected ',' or '}'");
        }
    }

    function parseArray() {
        depth++;
        if (depth > 64) fail("nesting too deep");
        at++;
        var array = [];
        skipWhitespace();
        if (text.charAt(at) === "]") {
            at++;
            depth--;
            return array;
        }
        while (true) {
            array.push(parseValue());
            skipWhitespace();
            var ch = text.charAt(at);
            if (ch === ",") { at++; continue; }
            if (ch === "]") { at++; depth--; return array; }
            fail("expected ',' or ']'");
        }
    }

    function parseValue() {
        skipWhitespace();
        if (at >= text.length) fail("unexpected end of input");
        var ch = text.charAt(at);
        if (ch === "{") return parseObject();
        if (ch === "[") return parseArray();
        if (ch === '"') return parseString();
        if (text.substr(at, 4) === "true") { at += 4; return true; }
        if (text.substr(at, 5) === "false") { at += 5; return false; }
        if (text.substr(at, 4) === "null") { at += 4; return null; }
        return parseNumber();
    }

    var result = parseValue();
    skipWhitespace();
    if (at < text.length) fail("unexpected trailing characters");
    return result;
}

function ozoInitExtensionPath(pathStr) {
    try {
        if (pathStr && typeof pathStr === "string") {
            var f = new Folder(pathStr);
            if (f.exists) {
                __ozoExplicitPluginFolder = f;
            }
        }
    } catch (e) {}
}

function ozoResolveScriptsFolder() {
    var candidates = [];
    if (__ozoExplicitPluginFolder && __ozoExplicitPluginFolder.exists) {
        candidates.push(__ozoExplicitPluginFolder.fsName + "/scripts");
        candidates.push(__ozoExplicitPluginFolder.fsName + "/Script all");
    }
    candidates.push(__ozoPluginFolder.fsName + "/scripts");
    candidates.push(__ozoPluginFolder.fsName + "/Script all");
    try {
        if (app.path) {
            var roots = [
                new Folder(app.path.fsName + "/Presets"),
                new Folder(app.path.fsName + "/Presets.localized")
            ];
            if (app.path.parent) {
                roots.push(new Folder(app.path.parent.fsName + "/Presets"));
                roots.push(new Folder(app.path.parent.fsName + "/Presets.localized"));
            }
            for (var r = 0; r < roots.length; r++) {
                var rt = roots[r];
                if (rt && rt.exists) {
                    var locale = app.locale || "en_US";
                    candidates.push(rt.fsName + "/" + locale + "/Scripts/Ozo Tools");
                    var sub = rt.getFiles(function (f) { return f instanceof Folder; });
                    for (var s = 0; s < sub.length; s++) {
                        candidates.push(sub[s].fsName + "/Scripts/Ozo Tools");
                    }
                }
            }
        }
    } catch (ignoreApp) {}
    try {
        if (Folder.userData && Folder.userData.exists) {
            candidates.push(Folder.userData.fsName + "/Adobe/CEP/extensions/com.ozo.illustrator.tools/scripts");
        }
        if (Folder.myDocuments && Folder.myDocuments.exists) {
            candidates.push(Folder.myDocuments.fsName + "/Script all");
            candidates.push(Folder.myDocuments.fsName + "/script/Script all");
        }
    } catch (ignoreDocs) {}

    for (var i = 0; i < candidates.length; i++) {
        var f = new Folder(candidates[i]);
        if (f.exists) {
            return f;
        }
    }
    return new Folder(__ozoPluginFolder.fsName + "/scripts");
}

function ozoRunScript(scriptFileName) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/" + scriptFileName);

        if (!scriptFile.exists) {
            // Also check root of plugin folder and current directory
            var alt1 = new File(__ozoPluginFolder.fsName + "/" + scriptFileName);
            if (alt1.exists) {
                scriptFile = alt1;
            } else if (Folder.current) {
                var altCur = new File(Folder.current.fsName + "/" + scriptFileName);
                if (altCur.exists) scriptFile = altCur;
            }
        }

        if (!scriptFile.exists) {
            return ozoJsonStringify({
                status: "error",
                message: "Script not found: " + scriptFileName
            });
        }

        // Set Folder.current to script's directory so #include and relative paths resolve properly
        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) {
                Folder.current = scriptFile.parent;
            }
            // Execute script directly inside the Illustrator host engine
            $.evalFile(scriptFile);
        } finally {
            try { Folder.current = savedFolder; } catch (e) {}
        }

        return ozoJsonStringify({
            status: "success",
            message: "Finished: " + scriptFile.name
        });
    } catch (err) {
        var msg = err && err.message ? err.message : String(err);
        return ozoJsonStringify({
            status: "error",
            message: msg
        });
    }
}

function ozoOpenScriptsFolder() {
    try {
        var folder = ozoResolveScriptsFolder();
        if (folder && folder.exists) {
            var opened = false;
            try { opened = folder.execute(); } catch (eExec) {}
            if (!opened) {
                try {
                    if (Folder.fs === "Windows") {
                        if (typeof app.system === "function") {
                            app.system('explorer.exe "' + folder.fsName.replace(/"/g, '""') + '"');
                            opened = true;
                        }
                    } else {
                        if (typeof app.system === "function") {
                            app.system('open "' + folder.fsName.replace(/"/g, '\\"') + '"');
                            opened = true;
                        }
                    }
                } catch (eSys) {}
            }
            return ozoJsonStringify({ status: "success" });
        }
    } catch (e) {}
    return ozoJsonStringify({ status: "error", message: "Folder not found" });
}

function ozoGetDocumentStatus() {
    try {
        if (app.documents.length === 0) {
            return ozoJsonStringify({
                hasDoc: false,
                name: "",
                colorSpace: "",
                artboardsCount: 0,
                selectedCount: 0,
                itemCount: 0
            });
        }
        var doc = app.activeDocument;
        var selCount = 0;
        try {
            var selection = doc.selection;
            if (selection) {
                // A single selected object is not an Array in Illustrator's DOM.
                if (selection instanceof Array ||
                        selection.typename === "Array" ||
                        Object.prototype.toString.call(selection) === "[object Array]") {
                    selCount = selection.length;
                } else {
                    selCount = 1;
                }
            }
        } catch (eSel) {}

        var itemCount = 0;
        try {
            if (doc.pageItems) itemCount = doc.pageItems.length;
        } catch (eItems) {}

        return ozoJsonStringify({
            hasDoc: true,
            name: doc.name,
            colorSpace: String(doc.documentColorSpace).replace("DocumentColorSpace.", ""),
            artboardsCount: doc.artboards.length,
            selectedCount: selCount,
            itemCount: itemCount
        });
    } catch (e) {
        return ozoJsonStringify({
            hasDoc: false,
            error: String(e)
        });
    }
}

function ozoOpenURL(url) {
    try {
        if (url && typeof url === "string") {
            var localFile = null;
            try {
                localFile = new File(url);
                if (localFile.exists) {
                    localFile.execute();
                    return ozoJsonStringify({ status: "success" });
                }
            } catch (ignoreLocalFile) {}

            // Only plain web links reach the shell.
            if (!/^https?:\/\/[^\s"'`$\\]+$/i.test(url)) {
                return ozoJsonStringify({ status: "error", message: "Only http and https links can be opened." });
            }
            if (Folder.fs === "Windows") {
                try {
                    var sc = new File(Folder.temp.fsName + "/ozo_url_" + (new Date().getTime()) + ".url");
                    sc.open("w");
                    sc.writeln("[InternetShortcut]");
                    sc.writeln("URL=" + url);
                    sc.close();
                    sc.execute();
                    try { sc.remove(); } catch (eRemSc) {}
                } catch (eWinUrl) {
                    if (typeof app.system === "function") {
                        app.system('explorer.exe "' + url + '"');
                    }
                }
            } else {
                try {
                    var cmd = new File(Folder.temp.fsName + "/ozo_url_" + (new Date().getTime()) + ".command");
                    cmd.open("w");
                    cmd.writeln("#!/bin/sh");
                    cmd.writeln('open "' + url.replace(/"/g, '\\"') + '"');
                    cmd.close();
                    cmd.execute();
                    try { cmd.remove(); } catch (eRemCmd) {}
                } catch (eMacUrl) {
                    if (typeof app.system === "function") {
                        app.system('open "' + url + '"');
                    }
                }
            }
            return ozoJsonStringify({ status: "success" });
        }
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: String(e) });
    }
    return ozoJsonStringify({ status: "error", message: "Invalid URL" });
}

function ozoDownloadAndApplyUpdate(zipUrl, versionTag) {
    try {
        if (!zipUrl || typeof zipUrl !== "string") {
            return ozoJsonStringify({ status: "error", message: "Invalid download URL" });
        }

        // Validate URL format (http/https only, reject shell metacharacters)
        if (!/^https?:\/\/[^\s"'`<>;&|]+$/i.test(zipUrl)) {
            return ozoJsonStringify({ status: "error", message: "Invalid or unsupported URL" });
        }

        var cleanTag = String(versionTag || "").replace(/[^a-zA-Z0-9\.\-_]/g, "");

        var targetFolder = __ozoExplicitPluginFolder;
        if (!targetFolder || !targetFolder.exists) {
            targetFolder = __ozoPluginFolder;
        }
        if (!targetFolder || !targetFolder.exists) {
            targetFolder = new Folder(Folder.userData.fsName + "/Adobe/CEP/extensions/com.ozo.illustrator.tools");
        }
        if (!targetFolder.exists) {
            try { targetFolder.create(); } catch (eCreate) {}
        }

        var timestamp = (new Date()).getTime();
        var tempFolder = Folder.temp;
        var resultFile = new File(tempFolder.fsName + "/ozo_update_res_" + timestamp + ".json");
        if (resultFile.exists) {
            try { resultFile.remove(); } catch (e) {}
        }

        var runnerFile = null;
        var runnerBat = null;
        var runnerCommand = null;

        if (Folder.fs === "Windows") {
            runnerFile = new File(tempFolder.fsName + "/ozo_update_runner_" + timestamp + ".ps1");
            runnerBat = new File(tempFolder.fsName + "/ozo_update_launcher_" + timestamp + ".bat");
            var targetFsPath = targetFolder.fsName.replace(/'/g, "''");
            var resultFsPath = resultFile.fsName.replace(/'/g, "''");
            var safeZipUrl = zipUrl.replace(/'/g, "''");

            var psScript = [
                "$ProgressPreference = 'SilentlyContinue'",
                "$ErrorActionPreference = 'Stop'",
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls",
                "$zipUrl = '" + safeZipUrl + "'",
                "$targetDir = '" + targetFsPath + "'",
                "$versionTag = '" + cleanTag + "'",
                "$resultFile = '" + resultFsPath + "'",
                "$tempZip = Join-Path $env:TEMP ('ozo_dl_' + [guid]::NewGuid().ToString('N') + '.zip')",
                "$tempDir = Join-Path $env:TEMP ('ozo_ext_' + [guid]::NewGuid().ToString('N'))",
                "$backupDir = Join-Path $env:TEMP ('ozo_backup_' + [guid]::NewGuid().ToString('N'))",
                "$expectedVersion = $versionTag.TrimStart('v', 'V')",
                "try {",
                "    try {",
                "        Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing -UserAgent 'OzoTools-Updater' -TimeoutSec 60",
                "    } catch {",
                "        $wc = New-Object System.Net.WebClient",
                "        $wc.Headers.Add('User-Agent', 'OzoTools-Updater')",
                "        $wc.DownloadFile($zipUrl, $tempZip)",
                "    }",
                "    if (-not (Test-Path $tempZip) -or (Get-Item $tempZip).Length -lt 1000) {",
                "        throw 'Downloaded package is empty or invalid'",
                "    }",
                "    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null",
                "    try {",
                "        Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force",
                "    } catch {",
                "        Add-Type -AssemblyName System.IO.Compression.FileSystem",
                "        [System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $tempDir)",
                "    }",
                "    $cepDir = Get-ChildItem -Path $tempDir -Recurse -Directory -Filter 'com.ozo.illustrator.tools' -ErrorAction SilentlyContinue | Select-Object -First 1",
                "    if (-not $cepDir) {",
                "        throw 'Extension folder com.ozo.illustrator.tools not found in release archive'",
                "    }",
                "    $pkgVersionFile = Get-ChildItem -Path $tempDir -Recurse -File -Filter 'version.json' -ErrorAction SilentlyContinue | Select-Object -First 1",
                "    if (-not $pkgVersionFile) { throw 'Release package is missing version.json' }",
                "    $pkgVersion = [string]((Get-Content -LiteralPath $pkgVersionFile.FullName -Raw | ConvertFrom-Json).version)",
                "    if ($pkgVersion.Trim() -ne $expectedVersion) {",
                "        throw ('Package version ' + $pkgVersion + ' does not match release ' + $expectedVersion)",
                "    }",
                "    if (Test-Path $targetDir) { Copy-Item -Path $targetDir -Destination $backupDir -Recurse -Force }",
                "    try {",
                "        if (-not (Test-Path $targetDir)) {",
                "            New-Item -Path $targetDir -ItemType Directory -Force | Out-Null",
                "        }",
                "        Get-ChildItem -Path $targetDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {",
                "            $rel = $_.FullName.Substring($targetDir.Length).TrimStart([char]92)",
                "            $src = Join-Path $cepDir.FullName $rel",
                "            if (-not (Test-Path -LiteralPath $src)) { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }",
                "        }",
                "        Copy-Item -Path \"$($cepDir.FullName)\\*\" -Destination $targetDir -Recurse -Force",
                "        $scriptsDir = Get-ChildItem -Path $tempDir -Recurse -Directory -Filter 'Script all' -ErrorAction SilentlyContinue | Select-Object -First 1",
                "        if (-not $scriptsDir) {",
                "            $scriptsDir = Join-Path $cepDir.FullName 'scripts'",
                "            if (-not (Test-Path $scriptsDir)) { $scriptsDir = $null }",
                "        }",
                "        if ($scriptsDir) {",
                "            $destScripts = Join-Path $targetDir 'scripts'",
                "            if (-not (Test-Path $destScripts)) {",
                "                New-Item -Path $destScripts -ItemType Directory -Force | Out-Null",
                "            }",
                "            Copy-Item -Path \"$($scriptsDir.FullName)\\*\" -Destination $destScripts -Recurse -Force",
                "        }",
                "        $topLibDir = Get-ChildItem -Path $tempDir -Recurse -Directory -Filter 'lib' -ErrorAction SilentlyContinue | Select-Object -First 1",
                "        if ($topLibDir -and $scriptsDir) {",
                "            $destLib = Join-Path (Join-Path $targetDir 'scripts') 'lib'",
                "            if (-not (Test-Path $destLib)) { New-Item -Path $destLib -ItemType Directory -Force | Out-Null }",
                "            Copy-Item -Path \"$($topLibDir.FullName)\\*\" -Destination $destLib -Recurse -Force -ErrorAction SilentlyContinue",
                "        }",
                "        try {",
                "            if (Test-Path (Join-Path $targetDir '..\\..\\Script all')) {",
                "                if ($scriptsDir) { Copy-Item -Path \"$($scriptsDir.FullName)\\*\" -Destination (Join-Path $targetDir '..\\..\\Script all') -Recurse -Force -ErrorAction SilentlyContinue }",
                "            }",
                "        } catch {}",
                "    } catch {",
                "        if (Test-Path $backupDir) {",
                "            Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue",
                "            Copy-Item -Path $backupDir -Destination $targetDir -Recurse -Force",
                "        }",
                "        throw",
                "    } finally {",
                "        Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue",
                "    }",
                "    $json = '{\"status\":\"success\",\"version\":\"' + $versionTag + '\"}'",
                "    [System.IO.File]::WriteAllText($resultFile, $json, [System.Text.Encoding]::ASCII)",
                "} catch {",
                "    $errMsg = $_.Exception.Message.Replace('\"', '`\"').Replace(\"`r\", ' ').Replace(\"`n\", ' ')",
                "    $json = '{\"status\":\"error\",\"message\":\"' + $errMsg + '\"}'",
                "    [System.IO.File]::WriteAllText($resultFile, $json, [System.Text.Encoding]::ASCII)",
                "} finally {",
                "    try { Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue } catch {}",
                "    try { Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}",
                "    try { Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}",
                "}"
            ].join("\r\n");

            runnerFile.encoding = "UTF-8";
            if (!runnerFile.open("w")) {
                return ozoJsonStringify({ status: "error", message: "Failed to write update script" });
            }
            runnerFile.write(psScript);
            runnerFile.close();

            runnerBat.encoding = "UTF-8";
            if (!runnerBat.open("w")) {
                return ozoJsonStringify({ status: "error", message: "Failed to write launcher batch file" });
            }
            runnerBat.writeln("@echo off");
            runnerBat.writeln('powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "' + runnerFile.fsName + '"');
            runnerBat.close();

            var executed = runnerBat.execute();
            if (!executed && typeof app.system === "function") {
                try {
                    app.system('cmd.exe /c start "" /min "' + runnerBat.fsName + '"');
                    executed = true;
                } catch (eSysWin) {}
            }
            if (!executed) {
                try { runnerFile.remove(); } catch (eRem1) {}
                try { runnerBat.remove(); } catch (eRem2) {}
                return ozoJsonStringify({ status: "error", message: "Failed to launch update process" });
            }
        } else {
            // macOS POSIX
            runnerFile = new File(tempFolder.fsName + "/ozo_update_runner_" + timestamp + ".sh");
            runnerCommand = new File(tempFolder.fsName + "/ozo_update_launcher_" + timestamp + ".command");
            var shScript = [
                "#!/bin/sh",
                "ZIP_URL=\"" + zipUrl.replace(/"/g, '\\"') + "\"",
                "TARGET_DIR=\"" + targetFolder.fsName.replace(/"/g, '\\"') + "\"",
                "RESULT_FILE=\"" + resultFile.fsName.replace(/"/g, '\\"') + "\"",
                "VERSION_TAG=\"" + cleanTag.replace(/"/g, '\\"') + "\"",
                "TEMP_ZIP=\"/tmp/ozo_dl_" + timestamp + ".zip\"",
                "TEMP_DIR=\"/tmp/ozo_ext_" + timestamp + "\"",
                "BACKUP_DIR=\"/tmp/ozo_backup_" + timestamp + "\"",
                "EXPECTED_VERSION=\"${VERSION_TAG#v}\"",
                "write_error() {",
                "    printf '{\"status\":\"error\",\"message\":\"%s\"}\\n' \"$1\" > \"$RESULT_FILE\"",
                "    rm -rf \"$TEMP_ZIP\" \"$TEMP_DIR\" \"$BACKUP_DIR\"",
                "}",
                "mkdir -p \"$TEMP_DIR\"",
                "curl -s -L -A \"OzoTools-Updater\" \"$ZIP_URL\" -o \"$TEMP_ZIP\"",
                "if [ $? -ne 0 ] || [ ! -f \"$TEMP_ZIP\" ]; then",
                "    write_error \"Failed to download update package\"",
                "    exit 1",
                "fi",
                "unzip -q -o \"$TEMP_ZIP\" -d \"$TEMP_DIR\"",
                "FOUND_CEP=$(find \"$TEMP_DIR\" -type d -name \"com.ozo.illustrator.tools\" | head -n 1)",
                "FOUND_SCRIPTS=$(find \"$TEMP_DIR\" -type d -name \"Script all\" | head -n 1)",
                "FOUND_VERSION=$(find \"$TEMP_DIR\" -type f -name \"version.json\" | head -n 1)",
                "if [ -z \"$FOUND_CEP\" ] || [ -z \"$FOUND_VERSION\" ]; then",
                "    write_error \"Release package is invalid or missing version.json\"",
                "    exit 1",
                "fi",
                "PKG_VERSION=$(sed -n 's/.*\"version\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' \"$FOUND_VERSION\" | head -n 1)",
                "if [ \"$PKG_VERSION\" != \"$EXPECTED_VERSION\" ]; then",
                "    write_error \"Package version $PKG_VERSION does not match release $EXPECTED_VERSION\"",
                "    exit 1",
                "fi",
                "if [ -d \"$TARGET_DIR\" ]; then cp -R \"$TARGET_DIR\" \"$BACKUP_DIR\"; fi",
                "if ! (",
                "    mkdir -p \"$TARGET_DIR\" &&",
                "    cd \"$TARGET_DIR\" &&",
                "    find . -type f | while read -r REL; do",
                "        [ -f \"$FOUND_CEP/$REL\" ] || rm -f \"$REL\"",
                "    done &&",
                "    cp -R \"$FOUND_CEP/\"* \"$TARGET_DIR/\"",
                "); then",
                "    if [ -d \"$BACKUP_DIR\" ]; then",
                "        rm -rf \"$TARGET_DIR\"",
                "        cp -R \"$BACKUP_DIR\" \"$TARGET_DIR\"",
                "    fi",
                "    write_error \"Failed to apply update package\"",
                "    exit 1",
                "fi",
                "if [ -n \"$FOUND_SCRIPTS\" ]; then",
                "    mkdir -p \"$TARGET_DIR/scripts\"",
                "    cp -R \"$FOUND_SCRIPTS/\"* \"$TARGET_DIR/scripts/\"",
                "fi",
                "printf '{\"status\":\"success\",\"version\":\"%s\"}\\n' \"$VERSION_TAG\" > \"$RESULT_FILE\"",
                "rm -rf \"$TEMP_ZIP\" \"$TEMP_DIR\" \"$BACKUP_DIR\""
            ].join("\n");

            runnerFile.encoding = "UTF-8";
            if (!runnerFile.open("w")) {
                return ozoJsonStringify({ status: "error", message: "Failed to write update script" });
            }
            runnerFile.write(shScript);
            runnerFile.close();

            runnerCommand.encoding = "UTF-8";
            if (!runnerCommand.open("w")) {
                return ozoJsonStringify({ status: "error", message: "Failed to write launcher command" });
            }
            runnerCommand.writeln("#!/bin/sh");
            runnerCommand.writeln('chmod +x "' + runnerFile.fsName + '"');
            runnerCommand.writeln('"' + runnerFile.fsName + '"');
            runnerCommand.close();

            var executed = runnerCommand.execute();
            if (!executed && typeof app.system === "function") {
                try {
                    app.system('chmod +x "' + runnerFile.fsName + '" && "' + runnerFile.fsName + '"');
                    executed = true;
                } catch (eSysMac) {}
            }
            if (!executed) {
                try { runnerFile.remove(); } catch (eRem1) {}
                try { runnerCommand.remove(); } catch (eRem2) {}
                return ozoJsonStringify({ status: "error", message: "Failed to launch update process" });
            }
        }

        var resultText = "";
        for (var waitCount = 0; waitCount < 600; waitCount++) {
            if (resultFile.exists) break;
            $.sleep(100);
        }
        if (resultFile.exists) {
            resultFile.encoding = "UTF-8";
            if (resultFile.open("r")) {
                resultText = resultFile.read();
                resultFile.close();
            }
            try { resultFile.remove(); } catch (eRemResult) {}
        }

        try { if (runnerFile && runnerFile.exists) runnerFile.remove(); } catch (eRemRunner) {}
        try { if (runnerBat && runnerBat.exists) runnerBat.remove(); } catch (eRemBat) {}
        try { if (runnerCommand && runnerCommand.exists) runnerCommand.remove(); } catch (eRemCmd) {}

        if (resultText && resultText.length > 0) {
            resultText = resultText.replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
            return resultText;
        }
        return ozoJsonStringify({ status: "error", message: "Update timed out or completed without status output" });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: String(e && e.message ? e.message : e) });
    }
}

// -------------------------------------------------------------
// In-Dock Headless Execution Bridge
// -------------------------------------------------------------
var __ozoHeadlessParams = null;
var __ozoHeadlessResult = null;

function ozoGetExportMetadata() {
    try {
        if (app.documents.length === 0) {
            return ozoJsonStringify({
                status: "error",
                hasDoc: false,
                message: "No document open in Illustrator"
            });
        }
        var doc = app.activeDocument;
        var isSaved = false;
        var docPath = "";
        try {
            if (doc.fullName && doc.fullName.exists) {
                isSaved = true;
                docPath = doc.path.fsName;
            }
        } catch (eDocPath) {}

        if (!docPath) {
            try {
                docPath = Folder.desktop.fsName;
            } catch (eDesk) {
                docPath = Folder.current.fsName;
            }
        }

        var defaultUnit = "mm";
        try {
            var ruler = doc.rulerUnits;
            if (ruler === RulerUnits.Millimeters) defaultUnit = "mm";
            else if (ruler === RulerUnits.Centimeters) defaultUnit = "cm";
            else if (ruler === RulerUnits.Inches) defaultUnit = "in";
            else if (ruler === RulerUnits.Points) defaultUnit = "pt";
            else if (ruler === RulerUnits.Pixels) defaultUnit = "px";
        } catch (eUnit) {}

        function cleanNum(num) {
            var rounded = Math.round(num * 100) / 100;
            return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
        }

        function fromPt(pt, unit) {
            if (unit === "mm") return pt / (72 / 25.4);
            if (unit === "cm") return pt / (72 / 2.54);
            if (unit === "in") return pt / 72;
            return pt;
        }

        var artboards = [];
        for (var i = 0; i < doc.artboards.length; i++) {
            var ab = doc.artboards[i];
            var rect = ab.artboardRect;
            var widthPt = Math.abs(rect[2] - rect[0]);
            var heightPt = Math.abs(rect[1] - rect[3]);
            artboards.push({
                index: i,
                name: ab.name || ("Artboard " + (i + 1)),
                width: cleanNum(fromPt(widthPt, defaultUnit)),
                height: cleanNum(fromPt(heightPt, defaultUnit))
            });
        }

        var pdfPresets = [];
        try {
            if (app.PDFPresetsList && app.PDFPresetsList.length > 0) {
                for (var p = 0; p < app.PDFPresetsList.length; p++) {
                    pdfPresets.push(String(app.PDFPresetsList[p]));
                }
            }
        } catch (ePresets) {}
        if (pdfPresets.length === 0) {
            pdfPresets = ["[High Quality Print]", "[Press Quality]", "[Illustrator Default]", "[Smallest File Size]"];
        }

        return ozoJsonStringify({
            status: "success",
            hasDoc: true,
            docName: doc.name.replace(/\.[^\.]+$/, ""),
            fullDocName: doc.name,
            isSaved: isSaved,
            docPath: docPath,
            defaultUnit: defaultUnit,
            colorSpace: (doc.documentColorSpace === DocumentColorSpace.RGB) ? "RGB" : "CMYK",
            totalArtboards: doc.artboards.length,
            activeArtboardIndex: doc.artboards.getActiveArtboardIndex(),
            artboards: artboards,
            pdfPresets: pdfPresets
        });
    } catch (e) {
        return ozoJsonStringify({
            status: "error",
            message: e && e.message ? e.message : String(e)
        });
    }
}

function ozoPickDestinationFolder(initialPath) {
    try {
        var startFolder = null;
        if (initialPath && typeof initialPath === "string") {
            var testF = new Folder(initialPath);
            if (testF.exists) startFolder = testF;
        }
        var picked = Folder.selectDialog("Select Destination Folder", startFolder);
        if (picked && picked.exists) {
            return ozoJsonStringify({
                status: "success",
                folder: picked.fsName
            });
        }
        return ozoJsonStringify({ status: "cancel" });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: String(e && e.message ? e.message : e) });
    }
}

function ozoExecuteBatchExport(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Batch Production Exporter.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Batch Production Exporter.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Batch Production Exporter.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Export completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoExecuteGenerateQR(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Generate QR Code.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Generate QR Code.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Generate QR Code.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "QR generation completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoExecuteCutContour(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/CutContour Generator.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/CutContour Generator.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "CutContour Generator.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "CutContour completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoExecuteSmartDimension(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Smart Dimension.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Smart Dimension.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Smart Dimension.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Smart Dimension completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Print Job Info Bridge
// -------------------------------------------------------------
// A generated header stays selected after creation. It must not be measured as
// artwork, otherwise the next run builds another banner above the first one.
function ozoIsGeneratedPrintJobItem(item) {
    try {
        var layer = item && item.layer;
        return !!layer && (layer.name === "[Print Job Info]" || layer.name === "__PrintJobInfo_Preview__");
    } catch (eLayer) {
        return false;
    }
}

// Returns the header created by an earlier run, if any.
function ozoGetPreviousPrintJobHeader() {
    try {
        var doc = app.activeDocument;
        for (var li = 0; li < doc.layers.length; li++) {
            var layer = doc.layers[li];
            if (layer.name !== "[Print Job Info]") continue;
            for (var pi = 0; pi < layer.pageItems.length; pi++) {
                var item = layer.pageItems[pi];
                try {
                    if (item.name !== "Print Header Block" || !item.geometricBounds) continue;
                    var b = item.geometricBounds;
                    if (!b || b.length !== 4) continue;

                    var headerHeight = null;
                    var noteMatch = /headerHeight=([0-9.+-]+)/.exec(String(item.note || ""));
                    if (noteMatch) {
                        var parsedHeight = parseFloat(noteMatch[1]);
                        if (isFinite(parsedHeight) && parsedHeight > 0) headerHeight = parsedHeight;
                    }

                    var backgroundBottom = null;
                    try {
                        for (var ci = 0; ci < item.pageItems.length; ci++) {
                            var child = item.pageItems[ci];
                            if (child.name === "Header Background" && child.geometricBounds) {
                                backgroundBottom = child.geometricBounds[3];
                                break;
                            }
                        }
                    } catch (eChildren) {}

                    return {
                        bounds: [b[0], b[1], b[2], b[3]],
                        headerHeight: headerHeight,
                        backgroundBottom: backgroundBottom
                    };
                } catch (eItem) {}
            }
        }
    } catch (eLayer) {}
    return null;
}

function ozoGetPrintJobDefaults() {
    try {
        if (app.documents.length === 0) {
            return ozoJsonStringify({ status: "error", message: "No Illustrator document is open." });
        }
        var doc = app.activeDocument;
        var widthPt = 0;
        var heightPt = 0;
        var isArtboard = true;
        var sourceName = "";

        // Check selection first (normalized to handle single-item selection)
        try {
            var sel = doc.selection;
            var selItems = [];
            if (sel && sel.typename !== "TextRange") {
                if (sel instanceof Array || sel.typename === "Array" || Object.prototype.toString.call(sel) === "[object Array]" || typeof sel.length === "number") {
                    for (var si = 0; si < sel.length; si++) selItems.push(sel[si]);
                } else {
                    selItems.push(sel);
                }
            }
            if (selItems.length > 0) {
                var combined = null;
                for (var i = 0; i < selItems.length; i++) {
                    if (ozoIsGeneratedPrintJobItem(selItems[i])) continue;
                    var b = null;
                    try { b = selItems[i].geometricBounds; } catch (eGeo) {
                        try { b = selItems[i].visibleBounds; } catch (eVis) {}
                    }
                    if (!b || b.length !== 4) continue;
                    if (!combined) {
                        combined = [b[0], b[1], b[2], b[3]];
                    } else {
                        combined[0] = Math.min(combined[0], b[0]);
                        combined[1] = Math.max(combined[1], b[1]);
                        combined[2] = Math.max(combined[2], b[2]);
                        combined[3] = Math.min(combined[3], b[3]);
                    }
                }
                if (combined) {
                    widthPt = combined[2] - combined[0];
                    heightPt = combined[1] - combined[3];
                    isArtboard = false;
                    sourceName = "Selection (" + selItems.length + " item" + (selItems.length > 1 ? "s" : "") + ")";
                }
            }
        } catch (eSel) {}

        var abIdx = doc.artboards.getActiveArtboardIndex();
        if (abIdx < 0 || abIdx >= doc.artboards.length) abIdx = 0;
        if (isArtboard) {
            var rect = doc.artboards[abIdx].artboardRect;
            var artboardTop = rect[1];
            // A previous header sits inside the top band of an expanded artboard;
            // report the original artwork height instead of the header-inflated one.
            var previousHeader = ozoGetPreviousPrintJobHeader();
            if (previousHeader) {
                var headerBottom = previousHeader.headerHeight
                    ? previousHeader.bounds[1] - previousHeader.headerHeight
                    : (previousHeader.backgroundBottom !== null ? previousHeader.backgroundBottom : previousHeader.bounds[3]);
                if (headerBottom < rect[1] && headerBottom > rect[3] &&
                        previousHeader.bounds[0] < rect[2] && previousHeader.bounds[2] > rect[0]) {
                    artboardTop = headerBottom;
                }
            }
            widthPt = Math.abs(rect[2] - rect[0]);
            heightPt = Math.abs(artboardTop - rect[3]);
            sourceName = doc.artboards[abIdx].name || ("Artboard " + (abIdx + 1));
        }

        var ru = "cm";
        try {
            if (doc.rulerUnits === RulerUnits.Millimeters) ru = "mm";
            else if (doc.rulerUnits === RulerUnits.Centimeters) ru = "cm";
            else if (doc.rulerUnits === RulerUnits.Inches) ru = "in";
            else if (doc.rulerUnits === RulerUnits.Points) ru = "pt";
            else if (doc.rulerUnits === RulerUnits.Meters) ru = "m";
        } catch (eRu) {}

        // Do not depend on the optional OZO shared library here: this bridge can
        // run before any tool script has been evaluated in the host engine.
        var factor = 72 / 2.54; // points per centimetre (matches the ru default)
        if (ru === "mm") factor = 72 / 25.4;
        else if (ru === "in") factor = 72;
        else if (ru === "pt") factor = 1;
        else if (ru === "m") factor = 72000 / 25.4;
        var w = Math.round((widthPt / factor) * 100) / 100;
        var h = Math.round((heightPt / factor) * 100) / 100;

        var d = new Date();
        var day = ("0" + d.getDate()).slice(-2);
        var mo = ("0" + (d.getMonth() + 1)).slice(-2);
        var dateStr = day + " " + mo + " " + d.getFullYear();

        return ozoJsonStringify({
            status: "success",
            dateStr: dateStr,
            unit: ru,
            width: w,
            height: h,
            isArtboard: isArtboard,
            artboardName: sourceName,
            docName: doc.name
        });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoExecutePrintJob(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Print Job Info.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Print Job Info.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Print Job Info.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Print Job Info completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Object Count & Prepress Inspector Bridge
// -------------------------------------------------------------
function ozoGetObjectCountStats() {
    try {
        if (app.documents.length === 0) {
            return ozoJsonStringify({ status: "error", message: "No Illustrator document is open." });
        }
        var doc = app.activeDocument;
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Count.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Count.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Count.jsx not found" });
        }

        __ozoHeadlessParams = { mode: "stats" };
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Count completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoSelectAllOnActiveArtboard() {
    try {
        if (app.documents.length === 0) return ozoJsonStringify({ status: "error", message: "No document open" });
        var doc = app.activeDocument;
        doc.selection = null;
        doc.selectObjectsOnActiveArtboard();
        var count = doc.selection ? doc.selection.length : 0;
        return ozoJsonStringify({ status: "success", count: count });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoDeselectAll() {
    try {
        if (app.documents.length === 0) return ozoJsonStringify({ status: "error", message: "No document open" });
        app.activeDocument.selection = null;
        return ozoJsonStringify({ status: "success" });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Sequential Numbering Bridge
// -------------------------------------------------------------
function ozoExecuteSequentialNumbering(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Sequential Numbering.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Sequential Numbering.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Sequential Numbering.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Sequential Numbering completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Pathfinder Bridge
// -------------------------------------------------------------
function ozoExecutePathfinder(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Pathfinder.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Pathfinder.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Pathfinder.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Pathfinder completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Guide Layout Bridge
// -------------------------------------------------------------
function ozoExecuteGuideLayout(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/New Guide Layout.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/New Guide Layout.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "New Guide Layout.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "New Guide Layout completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Object Repeat Bridge
// -------------------------------------------------------------
function ozoExecuteObjectRepeat(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Object Repeat.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Object Repeat.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Object Repeat.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Object Repeat completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Nesting Bridge
// -------------------------------------------------------------
function ozoExecuteNesting(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Nesting.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Nesting.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Nesting.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Nesting completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Rich Black Optimizer Bridge
// -------------------------------------------------------------
function ozoExecuteRichBlack(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/Rich Black Optimizer.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/Rich Black Optimizer.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Rich Black Optimizer.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "Rich Black Optimizer completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// ABA KHQR Generator Bridge
// -------------------------------------------------------------
function ozoExecuteKHQR(paramsJsonStr) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/ABA KHQR Generator.jsx");
        if (!scriptFile.exists) {
            var alt1 = new File(__ozoPluginFolder.fsName + "/scripts/ABA KHQR Generator.jsx");
            if (alt1.exists) scriptFile = alt1;
        }
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "ABA KHQR Generator.jsx not found" });
        }

        __ozoHeadlessParams = ozoJsonParse(paramsJsonStr);
        __ozoHeadlessResult = null;

        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
            __ozoHeadlessParams = null;
        }

        if (__ozoHeadlessResult) {
            return ozoJsonStringify(__ozoHeadlessResult);
        }
        return ozoJsonStringify({ status: "error", message: "ABA KHQR Generator completed with no output status" });
    } catch (e) {
        __ozoHeadlessParams = null;
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Icon Importer Bridge (Vector SVG placement)
// -------------------------------------------------------------
function ozoImportIconSvg(paramsJsonStr) {
    var tempFile = null;
    try {
        if (app.documents.length === 0) {
            return ozoJsonStringify({ status: "error", message: "No open document found. Please open or create a document first." });
        }
        var doc = app.activeDocument;
        var params = ozoJsonParse(paramsJsonStr);

        var svgContent = params.svg;
        if (!svgContent) {
            return ozoJsonStringify({ status: "error", message: "No SVG content provided." });
        }

        var iconName = params.name || "Icon";
        var targetSizePt = Number(params.sizePt) || 48;
        var layerName = params.layerName || "[Icons]";

        // Write SVG to temp file
        var tempName = "ozo_icon_" + (new Date().getTime()) + "_" + Math.floor(Math.random() * 1000) + ".svg";
        tempFile = new File(Folder.temp.fsName + "/" + tempName);
        tempFile.encoding = "UTF-8";
        tempFile.open("w");
        tempFile.write(svgContent);
        tempFile.close();

        // Get or create layer
        var targetLayer = null;
        for (var li = 0; li < doc.layers.length; li++) {
            if (doc.layers[li].name === layerName) {
                targetLayer = doc.layers[li];
                break;
            }
        }
        if (!targetLayer) {
            targetLayer = doc.layers.add();
            targetLayer.name = layerName;
        }
        doc.activeLayer = targetLayer;

        // Import SVG
        var wrapper = targetLayer.groupItems.add();
        wrapper.name = iconName;
        var imported = doc.groupItems.createFromFile(tempFile);
        imported.move(wrapper, ElementPlacement.PLACEATEND);

        // Resize proportionally to targetSizePt
        var maxDim = Math.max(wrapper.width, wrapper.height);
        if (maxDim > 0 && targetSizePt > 0) {
            var scaleFactor = (targetSizePt / maxDim) * 100;
            wrapper.resize(scaleFactor, scaleFactor);
        }

        // Center on active artboard
        var abIdx = doc.artboards.getActiveArtboardIndex();
        var abRect = doc.artboards[abIdx].artboardRect;
        var abCenterX = (abRect[0] + abRect[2]) / 2;
        var abCenterY = (abRect[1] + abRect[3]) / 2;

        wrapper.position = [
            abCenterX - (wrapper.width / 2),
            abCenterY + (wrapper.height / 2)
        ];

        // Select the newly imported icon
        doc.selection = null;
        wrapper.selected = true;
        app.redraw();

        // Clean temp file
        try { if (tempFile && tempFile.exists) tempFile.remove(); } catch (eIgnore) {}

        return ozoJsonStringify({
            status: "ok",
            name: iconName,
            width: Math.round(wrapper.width * 10) / 10,
            height: Math.round(wrapper.height * 10) / 10,
            layer: layerName
        });
    } catch (e) {
        try { if (tempFile && tempFile.exists) tempFile.remove(); } catch (eIgnore2) {}
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

// -------------------------------------------------------------
// Script Launcher Bridge (Scan & Run external scripts)
// -------------------------------------------------------------
function ozoScanLauncherScripts(customFolderPath) {
    try {
        var results = [];
        var targetFolder = null;
        if (customFolderPath) {
            targetFolder = new Folder(customFolderPath);
        }
        if (!targetFolder || !targetFolder.exists) {
            targetFolder = ozoResolveScriptsFolder();
        }

        function scanDir(dir, depth) {
            if (!dir || !dir.exists || depth > 2) return;
            var files = dir.getFiles();
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                if (f instanceof Folder) {
                    var fn = f.name;
                    if (fn !== "lib" && fn !== "node_modules" && fn.charAt(0) !== ".") {
                        scanDir(f, depth + 1);
                    }
                } else if (f instanceof File) {
                    var ext = f.name.toLowerCase();
                    if (ext.indexOf(".jsx") !== -1 || ext.indexOf(".js") !== -1) {
                        results.push({
                            name: f.name.replace(/\.(jsx|js)$/i, ""),
                            fileName: f.name,
                            path: f.fsName,
                            size: f.length || 0,
                            modified: f.modified ? f.modified.getTime() : 0
                        });
                    }
                }
            }
        }

        scanDir(targetFolder, 0);

        // Also scan Illustrator application scripts folder
        try {
            if (app.path) {
                var appPresetFolders = [
                    new Folder(app.path.fsName + "/Presets/en_US/Scripts"),
                    new Folder(app.path.fsName + "/Presets/Scripts"),
                    new Folder(app.path.fsName + "/Presets.localized/Scripts")
                ];
                for (var p = 0; p < appPresetFolders.length; p++) {
                    if (appPresetFolders[p].exists) {
                        scanDir(appPresetFolders[p], 0);
                        break;
                    }
                }
            }
        } catch (eAppScan) {}

        // Remove duplicates by path
        var seen = {};
        var unique = [];
        for (var u = 0; u < results.length; u++) {
            if (!seen[results[u].path]) {
                seen[results[u].path] = true;
                unique.push(results[u]);
            }
        }

        return ozoJsonStringify({
            status: "ok",
            folder: targetFolder ? targetFolder.fsName : "",
            scripts: unique
        });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}

function ozoRunLauncherScript(filePath) {
    try {
        var scriptFile = new File(filePath);
        if (!scriptFile.exists) {
            return ozoJsonStringify({ status: "error", message: "Script file not found: " + filePath });
        }
        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) Folder.current = scriptFile.parent;
            $.evalFile(scriptFile);
        } finally {
            Folder.current = savedFolder;
        }
        return ozoJsonStringify({ status: "ok", file: scriptFile.name });
    } catch (e) {
        return ozoJsonStringify({ status: "error", message: e && e.message ? e.message : String(e) });
    }
}
