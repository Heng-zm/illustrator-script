#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Icon Search & Import";

    if (app.documents.length === 0) {
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }
    var doc = app.activeDocument;
    var originalLayer = doc.activeLayer;
    var originalSelection = [];
    var selectionValue = doc.selection;
    if (selectionValue && selectionValue.typename !== "TextRange") {
        for (var originalIndex = 0, originalIndexLen = selectionValue.length; originalIndex < originalIndexLen; originalIndex++) {
            originalSelection.push(selectionValue[originalIndex]);
        }
    }
    var helperFile = (function () {
        var candidates = [
            ($.fileName ? new File($.fileName).parent.fsName + "/lib/iconify-api.ps1" : null),
            ($.fileName ? new File($.fileName).parent.fsName + "/Script all/lib/iconify-api.ps1" : null),
            Folder.current.fsName + "/lib/iconify-api.ps1",
            Folder.current.fsName + "/Script all/lib/iconify-api.ps1"
        ];
        for (var i = 0, iLen = candidates.length; i < iLen; i++) {
            if (candidates[i]) {
                var f = new File(candidates[i]);
                if (f.exists) return f;
            }
        }
        var fallbackDir = ($.fileName ? new File($.fileName).parent.fsName : Folder.current.fsName);
        return new File(fallbackDir + "/lib/iconify-api.ps1");
    })();

    function errorMessage(error) {
        return error && error.message ? error.message : String(error);
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function quotePowerShell(value) {
        return "'" + String(value).replace(/'/g, "''") + "'";
    }

    function base64Utf16Le(value) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var bytes = [];
        for (var index = 0, indexLen = value.length; index < indexLen; index++) {
            var code = value.charCodeAt(index);
            bytes.push(code & 255, (code >>> 8) & 255);
        }
        var result = "";
        for (index = 0; index < bytes.length; index += 3) {
            var first = bytes[index];
            var second = index + 1 < bytes.length ? bytes[index + 1] : 0;
            var third = index + 2 < bytes.length ? bytes[index + 2] : 0;
            result += alphabet.charAt(first >>> 2);
            result += alphabet.charAt(((first & 3) << 4) | (second >>> 4));
            result += index + 1 < bytes.length ?
                alphabet.charAt(((second & 15) << 2) | (third >>> 6)) : "=";
            result += index + 2 < bytes.length ? alphabet.charAt(third & 63) : "=";
        }
        return result;
    }

    function base64Utf8(value) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var bytes = [];
        var accumulator = 0;
        var bitCount = 0;
        for (var index = 0, indexLen = value.length; index < indexLen; index++) {
            var digit = alphabet.indexOf(value.charAt(index));
            if (digit < 0) {
                if (value.charAt(index) === "=") break;
                continue;
            }
            accumulator = (accumulator << 6) | digit;
            bitCount += 6;
            if (bitCount >= 8) {
                bitCount -= 8;
                bytes.push((accumulator >>> bitCount) & 255);
            }
        }
        var text = "";
        for (index = 0; index < bytes.length;) {
            var first = bytes[index++];
            var code;
            if (first < 0x80) {
                code = first;
            } else if ((first & 0xE0) === 0xC0 && index < bytes.length) {
                code = ((first & 0x1F) << 6) | (bytes[index++] & 0x3F);
            } else if ((first & 0xF0) === 0xE0 && index + 1 < bytes.length) {
                code = ((first & 0x0F) << 12) |
                    ((bytes[index++] & 0x3F) << 6) | (bytes[index++] & 0x3F);
            } else if ((first & 0xF8) === 0xF0 && index + 2 < bytes.length) {
                code = ((first & 7) << 18) | ((bytes[index++] & 0x3F) << 12) |
                    ((bytes[index++] & 0x3F) << 6) | (bytes[index++] & 0x3F);
            } else {
                code = 0xFFFD;
            }
            if (code > 0xFFFF) {
                code -= 0x10000;
                text += String.fromCharCode(0xD800 + (code >>> 10),
                    0xDC00 + (code & 0x3FF));
            } else {
                text += String.fromCharCode(code);
            }
        }
        return text;
    }

    function quoteCommandArgument(value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
    }

    function quoteVbs(value) {
        return String(value).replace(/"/g, '""');
    }

    function uniqueTempFile(extension) {
        return new File(Folder.temp.fsName + "/ozo_iconify_" +
            new Date().getTime() + "_" + Math.floor(Math.random() * 1000000) + extension);
    }

    function callIconify(mode, query, iconId, destination, options) {
        options = options || {};
        var isWindows = ($.os.indexOf("Windows") !== -1 || File.fs === "Windows");
        var queryFile = uniqueTempFile(".query.txt");
        var outputFile = uniqueTempFile(".result.txt");
        var runnerFile = isWindows ? uniqueTempFile(".cmd") : uniqueTempFile(".sh");
        try {
            if (query) {
                queryFile.encoding = "UTF-8";
                if (!queryFile.open("w")) throw new Error("Could not prepare the icon search.");
                queryFile.write(query);
                queryFile.close();
            }

            if (isWindows) {
                var powerShellCommand =
                    "& " + quotePowerShell(helperFile.fsName) +
                    " -Mode " + quotePowerShell(mode) +
                    " -OutputPath " + quotePowerShell(outputFile.fsName);
                if (query) powerShellCommand += " -QueryFile " + quotePowerShell(queryFile.fsName);
                if (iconId) powerShellCommand += " -IconId " + quotePowerShell(iconId);
                if (destination) powerShellCommand += " -DestinationPath " + quotePowerShell(destination.fsName);
                if (options.prefix) powerShellCommand += " -Prefix " + quotePowerShell(options.prefix);
                if (options.color) powerShellCommand += " -Color " + quotePowerShell(options.color);
                if (typeof options.limit !== "undefined") powerShellCommand += " -Limit " + options.limit;
                if (typeof options.start !== "undefined") powerShellCommand += " -Start " + options.start;

                var command = "powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden " +
                    "-ExecutionPolicy Bypass -EncodedCommand " + base64Utf16Le(powerShellCommand);

                runnerFile.encoding = "ASCII";
                var executed = false;
                if (runnerFile.open("w")) {
                    runnerFile.writeln("@echo off");
                    runnerFile.writeln('start "" /b ' + command);
                    runnerFile.close();
                    executed = runnerFile.execute();
                }
                if (!executed) {
                    try {
                        if (typeof app.system === "function") {
                            app.system('cmd.exe /c start "" /b ' + command);
                            executed = true;
                        }
                    } catch (ignoreSystem) {}
                }
                if (!executed) {
                    throw new Error("Windows could not start the icon service.");
                }
            } else {
                // macOS using curl
                runnerFile.encoding = "UTF-8";
                runnerFile.lineFeed = "Unix";
                if (!runnerFile.open("w")) throw new Error("Could not prepare icon service runner.");

                runnerFile.writeln("#!/bin/sh");
                runnerFile.writeln('OUTPUT="' + outputFile.fsName.replace(/"/g, '\\"') + '"');
                runnerFile.writeln('TMP_OUT="${OUTPUT}.partial"');
                runnerFile.writeln('write_result() {');
                runnerFile.writeln('  STATUS="$1"');
                runnerFile.writeln('  MSG="$2"');
                runnerFile.writeln('  B64=$(printf "%s" "$MSG" | base64 | tr -d "\\r\\n")');
                runnerFile.writeln('  printf "%s:%s" "$STATUS" "$B64" > "$TMP_OUT"');
                runnerFile.writeln('  mv "$TMP_OUT" "$OUTPUT"');
                runnerFile.writeln('}');

                var color = (options.color || "000000").replace(/^#/, "").toUpperCase();
                var limit = typeof options.limit !== "undefined" ? options.limit : 100;
                var start = typeof options.start !== "undefined" ? options.start : 0;

                if (mode === "Search") {
                    runnerFile.writeln('QUERY=$(cat "' + queryFile.fsName.replace(/"/g, '\\"') + '" | tr -d "\\r\\n")');
                    runnerFile.writeln('ESCAPED_Q=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$QUERY" 2>/dev/null || printf "%s" "$QUERY")');
                    var prefixParam = options.prefix ? ('&prefix=' + encodeURIComponent(options.prefix)) : '';
                    runnerFile.writeln('URL="https://api.iconify.design/search?query=${ESCAPED_Q}&limit=' + limit + '&start=' + start + prefixParam + '"');
                    runnerFile.writeln('RES=$(curl -s -f -m 15 "$URL" || curl -s -f -m 15 "https://api.simplesvg.com/search?query=${ESCAPED_Q}&limit=' + limit + '&start=' + start + prefixParam + '")');
                    runnerFile.writeln('if [ -z "$RES" ]; then write_result "ERROR" "Could not connect to Iconify API."; exit 1; fi');
                    runnerFile.writeln('PAYLOAD=$(python3 -c \'import json, sys\n' +
                        'try:\n' +
                        '  d = json.loads(sys.argv[1])\n' +
                        '  icons = d.get("icons", [])\n' +
                        '  tot = d.get("total", len(icons))\n' +
                        '  print("@total:" + str(tot))\n' +
                        '  for ic in icons: print(ic)\n' +
                        'except Exception as e: print("ERROR: " + str(e))\n' +
                        '\' "$RES" 2>/dev/null)');
                    runnerFile.writeln('if [ -z "$PAYLOAD" ]; then');
                    runnerFile.writeln('  ICONS=$(printf "%s" "$RES" | grep -o \'\\"[a-z0-9-]*:[a-z0-9-]*\\"\' | tr -d \'"\')');
                    runnerFile.writeln('  PAYLOAD="@total:' + limit + '\n$ICONS"');
                    runnerFile.writeln('fi');
                    runnerFile.writeln('write_result "OK" "$PAYLOAD"');
                } else if (mode === "Download") {
                    var iconParts = (iconId || "").split(":");
                    var pfx = iconParts[0];
                    var name = iconParts[1];
                    var dlUrl = "https://api.iconify.design/" + pfx + "/" + name + ".svg?color=%23" + color + "&box=1";
                    var destPath = destination ? destination.fsName.replace(/"/g, '\\"') : "";
                    runnerFile.writeln('DEST="' + destPath + '"');
                    runnerFile.writeln('mkdir -p "$(dirname "$DEST")"');
                    runnerFile.writeln('curl -s -f -m 15 -L "' + dlUrl + '" -o "$DEST" || curl -s -f -m 15 -L "https://api.simplesvg.com/' + pfx + '/' + name + '.svg?color=%23' + color + '&box=1" -o "$DEST"');
                    runnerFile.writeln('if [ -f "$DEST" ] && [ -s "$DEST" ]; then');
                    runnerFile.writeln('  write_result "OK" "' + iconId + '"');
                    runnerFile.writeln('else');
                    runnerFile.writeln('  write_result "ERROR" "Failed to download icon ' + iconId + '"');
                    runnerFile.writeln('fi');
                } else if (mode === "DownloadBatch") {
                    var destDir = destination ? destination.fsName.replace(/"/g, '\\"') : "";
                    runnerFile.writeln('DEST_DIR="' + destDir + '"');
                    runnerFile.writeln('mkdir -p "$DEST_DIR"');
                    runnerFile.writeln('SUCCESS=0');
                    runnerFile.writeln('TOTAL=0');
                    runnerFile.writeln('FAILED=""');
                    runnerFile.writeln('while IFS= read -r ICON_ID || [ -n "$ICON_ID" ]; do');
                    runnerFile.writeln('  ICON_ID=$(printf "%s" "$ICON_ID" | tr -d "\\r\\n")');
                    runnerFile.writeln('  [ -z "$ICON_ID" ] && continue');
                    runnerFile.writeln('  PFX=$(printf "%s" "$ICON_ID" | cut -d: -f1)');
                    runnerFile.writeln('  NAME=$(printf "%s" "$ICON_ID" | cut -d: -f2)');
                    runnerFile.writeln('  FILE_NAME=$(printf "%s" "$ICON_ID" | sed "s/:/--/g")"--' + color.toLowerCase() + '.svg"');
                    runnerFile.writeln('  DL_URL="https://api.iconify.design/${PFX}/${NAME}.svg?color=%23' + color + '&box=1"');
                    runnerFile.writeln('  DEST_FILE="$DEST_DIR/$FILE_NAME"');
                    runnerFile.writeln('  TOTAL=$((TOTAL + 1))');
                    runnerFile.writeln('  if curl -s -f -m 15 -L "$DL_URL" -o "$DEST_FILE" && [ -s "$DEST_FILE" ]; then');
                    runnerFile.writeln('    SUCCESS=$((SUCCESS + 1))');
                    runnerFile.writeln('  else');
                    runnerFile.writeln('    rm -f "$DEST_FILE"');
                    runnerFile.writeln('    FAILED="$FAILED $ICON_ID"');
                    runnerFile.writeln('  fi');
                    runnerFile.writeln('done < "' + queryFile.fsName.replace(/"/g, '\\"') + '"');
                    runnerFile.writeln('if [ "$SUCCESS" -eq 0 ]; then');
                    runnerFile.writeln('  write_result "ERROR" "Downloaded 0 of $TOTAL icon(s). Failed:$FAILED"');
                    runnerFile.writeln('elif [ -n "$FAILED" ]; then');
                    runnerFile.writeln('  write_result "OK" "Downloaded $SUCCESS of $TOTAL icon(s). Failed:$FAILED"');
                    runnerFile.writeln('else');
                    runnerFile.writeln('  write_result "OK" "Downloaded $SUCCESS of $TOTAL icon(s)."');
                    runnerFile.writeln('fi');
                }
                runnerFile.close();
                var macOk = false;
                try { macOk = runnerFile.execute(); } catch (eExec) {}
                if (!macOk && typeof app.system === "function") {
                    try {
                        app.system('chmod +x "' + runnerFile.fsName + '" && "' + runnerFile.fsName + '" &');
                    } catch (ignoreSystem) {}
                }
            }

            var batchCount = (mode === "DownloadBatch" && iconId) ?
                iconId.split(/\r?\n/).length : 0;
            var timeout = mode === "DownloadBatch" ?
                Math.min(600000, 60000 + batchCount * 20000) : 60000;
            var deadline = new Date().getTime() + timeout;
            while (!outputFile.exists && new Date().getTime() < deadline) {
                $.sleep(100);
            }
            if (!outputFile.exists) {
                throw new Error("The icon service timed out after " +
                    Math.round(timeout / 1000) + " seconds.");
            }
            outputFile.encoding = "ASCII";
            if (!outputFile.open("r")) throw new Error("Could not read the icon service response.");
            var response = trim(outputFile.read());
            outputFile.close();
            var separator = response.indexOf(":");
            if (separator < 0) throw new Error("The icon service returned an invalid response.");
            var status = response.substring(0, separator);
            var payload = base64Utf8(response.substring(separator + 1));
            if (status !== "OK") throw new Error(payload || "The icon request failed.");
            return payload;
        } finally {
            try { if (queryFile.opened) queryFile.close(); } catch (ignoreQueryClose) {}
            try { if (outputFile.opened) outputFile.close(); } catch (ignoreOutputClose) {}
            try { if (runnerFile.opened) runnerFile.close(); } catch (ignoreRunnerClose) {}
            try { if (queryFile.exists) queryFile.remove(); } catch (ignoreQueryRemoval) {}
            try { if (outputFile.exists) outputFile.remove(); } catch (ignoreOutputRemoval) {}
            try { if (runnerFile.exists) runnerFile.remove(); } catch (ignoreRunnerRemoval) {}
        }
    }

    function searchIcons(query, options) {
        var payload = callIconify("Search", query, "", null, options);
        if (!payload) return {icons: [], total: 0};
        var lines = payload.split(/\r?\n/);
        var results = [];
        var total = 0;
        for (var index = 0, indexLen = lines.length; index < indexLen; index++) {
            var iconId = trim(lines[index]);
            if (iconId.indexOf("@total:") === 0) {
                total = Number(iconId.substring(7));
                continue;
            }
            if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(iconId)) results.push(iconId);
        }
        if (!isFinite(total) || total < results.length) total = results.length;
        return {icons: results, total: total};
    }

    function iconCacheFolder() {
        var cacheFolder = new Folder(Folder.userData.fsName +
            "/Ozo Illustrator Scripts/icon-cache");
        if (!cacheFolder.exists && !cacheFolder.create()) {
            throw new Error("Could not create the local icon cache.");
        }
        return cacheFolder;
    }

    function previewCacheFolder() {
        var cacheFolder = new Folder(Folder.userData.fsName +
            "/Ozo Illustrator Scripts/icon-preview-cache");
        if (!cacheFolder.exists && !cacheFolder.create()) {
            throw new Error("Could not create the local icon preview cache.");
        }
        return cacheFolder;
    }

    function cacheFileFor(iconId, color) {
        return new File(iconCacheFolder().fsName + "/" +
            iconId.replace(/:/g, "--") + "--" + color.toLowerCase() + ".svg");
    }

    function isValidSvgFile(file) {
        if (!file || !file.exists || file.length < 20) return false;
        try {
            file.encoding = "UTF-8";
            if (!file.open("r")) return false;
            var header = file.read(512);
            file.close();
            return /<svg(?:\s|>)/i.test(header);
        } catch (ignoreValidation) {
            try { if (file.opened) file.close(); } catch (ignoreClose) {}
            return false;
        }
    }

    function isValidPngFile(file) {
        if (!file || !file.exists || file.length < 20) return false;
        try {
            file.encoding = "BINARY";
            if (!file.open("r")) return false;
            var signature = file.read(8);
            file.close();
            return signature.length === 8 &&
                signature.charCodeAt(0) === 137 && signature.substring(1, 4) === "PNG";
        } catch (ignoreValidation) {
            try { if (file.opened) file.close(); } catch (ignoreClose) {}
            return false;
        }
    }

    function previewCacheFileFor(iconId, color) {
        return new File(previewCacheFolder().fsName + "/" +
            iconId.replace(/:/g, "--") + "--" + color.toLowerCase() + ".png");
    }

    function prunePreviewCache() {
        try {
            var files = previewCacheFolder().getFiles("*.png");
            if (files.length <= 250) return;
            files.sort(function (first, second) {
                return first.modified.getTime() - second.modified.getTime();
            });
            for (var index = 0; index < files.length - 200; index++) {
                try { files[index].remove(); } catch (ignoreRemoval) {}
            }
        } catch (ignorePrune) {}
    }

    function downloadIcon(iconId, destination, color) {
        if (!isValidSvgFile(destination)) {
            try { if (destination.exists) destination.remove(); } catch (ignoreBadCache) {}
            callIconify("Download", "", iconId, destination, {color: color});
        }
        if (!isValidSvgFile(destination)) {
            throw new Error("Could not download " + iconId + ".");
        }
        return destination;
    }

    function downloadIconsToCache(iconIds, color) {
        var missing = [];
        for (var index = 0, indexLen = iconIds.length; index < indexLen; index++) {
            var cached = cacheFileFor(iconIds[index], color);
            if (!isValidSvgFile(cached)) {
                try { if (cached.exists) cached.remove(); } catch (ignoreBadCache) {}
                missing.push(iconIds[index]);
            }
        }
        if (missing.length > 0) {
            callIconify("DownloadBatch", missing.join("\n"), "", iconCacheFolder(),
                {color: color});
        }
        for (var index = 0, indexLen = iconIds.length; index < indexLen; index++) {
            if (!isValidSvgFile(cacheFileFor(iconIds[index], color))) {
                throw new Error("Could not download " + iconIds[index] + ".");
            }
        }
    }

    function selectedIconIds(list) {
        var result = [];
        if (!list.selection) return result;
        if (list.selection instanceof Array) {
            for (var index = 0, indexLen = list.selection.length; index < indexLen; index++) {
                result.push(list.selection[index]._iconId || list.selection[index].text);
            }
        } else {
            result.push(list.selection._iconId || list.selection.text);
        }
        return result;
    }

    function numberValue(control, label, minimum, maximum) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(trim(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "")));
        if (!isFinite(value)) {
            throw new Error("Enter a valid number for " + label + ".");
        }
        if (value < minimum || value > maximum) {
            throw new Error(label + " must be between " + minimum + " and " + maximum + ".");
        }
        return value;
    }

    function integerValue(control, label, minimum, maximum) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(trim(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "")));
        if (!isFinite(value) || value !== Math.floor(value)) {
            throw new Error("Enter a whole number for " + label + ".");
        }
        if (value < minimum || value > maximum) {
            throw new Error(label + " must be between " + minimum + " and " + maximum + ".");
        }
        return value;
    }

    function colorValue(control) {
        var value = trim(control.text).replace(/^#/, "");
        if (!/^[0-9a-f]{6}$/i.test(value)) {
            throw new Error("Color must be a six-digit hexadecimal value, such as #000000.");
        }
        return value.toUpperCase();
    }

    function uniqueLayerName(baseName) {
        var used = {};
        for (var index = 0, indexLen = doc.layers.length; index < indexLen; index++) {
            used[doc.layers[index].name] = true;
        }
        if (!used[baseName]) return baseName;
        var suffix = 2;
        while (used[baseName + " " + suffix]) suffix++;
        return baseName + " " + suffix;
    }

    var dialog = new Window("dialog", SCRIPT_NAME);
    var previewPngFile = null;
    var previewImage = null;
    var previewName = null;
    var currentPreviewKey = "";
    var previewBusy = false;

    function restoreOriginalSelection() {
        try {
            doc.selection = null;
            for (var index = 0, indexLen = originalSelection.length; index < indexLen; index++) {
                try { originalSelection[index].selected = true; } catch (ignoreItem) {}
            }
        } catch (ignoreSelection) {}
    }

    function importSvgGroup(svgFile, targetGroup) {
        var imported = null;
        var wrapper = null;
        var sourceDocument = null;
        try {
            wrapper = targetGroup.groupItems.add();
            try {
                imported = doc.groupItems.createFromFile(svgFile);
                imported.move(wrapper, ElementPlacement.PLACEATEND);
            } catch (directImportError) {
                try { if (imported) imported.remove(); } catch (ignoreDirectRemoval) {}
                try { if (wrapper) wrapper.remove(); } catch (ignoreWrapperRemoval) {}
                imported = null;
                wrapper = targetGroup.groupItems.add();
                sourceDocument = app.open(svgFile);
                for (var index = 0, indexLen = sourceDocument.pageItems.length; index < indexLen; index++) {
                    var sourceItem = sourceDocument.pageItems[index];
                    if (sourceItem.parent && sourceItem.parent.typename === "Layer") {
                        sourceItem.duplicate(wrapper, ElementPlacement.PLACEATEND);
                    }
                }
                if (!wrapper.pageItems.length) {
                    throw new Error("The SVG contains no importable vector artwork.");
                }
            }
            if (sourceDocument) {
                sourceDocument.close(SaveOptions.DONOTSAVECHANGES);
                sourceDocument = null;
                doc.activate();
            }
            return wrapper;
        } catch (error) {
            try {
                if (sourceDocument) sourceDocument.close(SaveOptions.DONOTSAVECHANGES);
            } catch (ignoreDocumentClose) {}
            try { doc.activate(); } catch (ignoreDocumentActivate) {}
            try { if (wrapper) wrapper.remove(); } catch (ignoreImportRemoval) {}
            throw error;
        }
    }

    function clearPreview() {
        try { if (previewImage) previewImage.image = null; } catch (ignoreImageClear) {}
        previewPngFile = null;
        currentPreviewKey = "";
        if (previewName) previewName.text = "Select an icon and click Preview.";
    }

    function createDialogPreview(svgFile, iconId, color) {
        var previewDocument = null;
        var pngFile = previewCacheFileFor(iconId, color);
        var temporaryPng = new File(pngFile.parent.fsName + "/preview_" +
            new Date().getTime() + "_" + Math.floor(Math.random() * 1000000) + ".png");
        try {
            if (!isValidPngFile(pngFile)) {
                try { if (pngFile.exists) pngFile.remove(); } catch (ignoreBadPreview) {}
                previewDocument = app.open(svgFile);
                var exportOptions = new ExportOptionsPNG24();
                exportOptions.antiAliasing = true;
                exportOptions.transparency = true;
                exportOptions.artBoardClipping = true;
                var previewArtboard = previewDocument.artboards[
                    previewDocument.artboards.getActiveArtboardIndex()].artboardRect;
                var previewWidth = Math.abs(previewArtboard[2] - previewArtboard[0]);
                var previewHeight = Math.abs(previewArtboard[1] - previewArtboard[3]);
                var previewLongestSide = Math.max(previewWidth, previewHeight);
                var previewScale = previewLongestSide > 0 ?
                    150 / previewLongestSide * 100 : 100;
                previewScale = Math.max(1, Math.min(1600, previewScale));
                exportOptions.horizontalScale = previewScale;
                exportOptions.verticalScale = previewScale;
                previewDocument.exportFile(temporaryPng, ExportType.PNG24, exportOptions);
                previewDocument.close(SaveOptions.DONOTSAVECHANGES);
                previewDocument = null;
                doc.activate();
                if (!isValidPngFile(temporaryPng)) {
                    throw new Error("Illustrator could not render the icon preview.");
                }
                if (!temporaryPng.rename(pngFile.name)) {
                    if (!temporaryPng.copy(pngFile.fsName)) {
                        throw new Error("Could not save the rendered icon preview.");
                    }
                    temporaryPng.remove();
                }
                prunePreviewCache();
            }
            if (!isValidPngFile(pngFile)) throw new Error("The cached preview is invalid.");
            previewPngFile = pngFile;
            previewImage.image = ScriptUI.newImage(previewPngFile);
            previewName.text = iconId;
            dialog.layout.layout(true);
            dialog.update();
        } catch (error) {
            try {
                if (previewDocument) previewDocument.close(SaveOptions.DONOTSAVECHANGES);
            } catch (ignoreDocumentClose) {}
            try { doc.activate(); } catch (ignoreDocumentActivate) {}
            try { if (temporaryPng.exists) temporaryPng.remove(); } catch (ignorePngRemoval) {}
            throw error;
        }
    }

    function previewSelectedIcon() {
        var iconIds = selectedIconIds(resultsList);
        if (iconIds.length === 0 || previewBusy) return;
        var previewColor;
        try {
            previewColor = colorValue(colorInput);
        } catch (colorError) {
            alert(SCRIPT_NAME + "\n\n" + errorMessage(colorError));
            return;
        }
        var previewKey = iconIds[0] + "|" + previewColor;
        if (currentPreviewKey === previewKey && isValidPngFile(previewPngFile)) {
            statusText.text = OZO.tr("Previewing") + " " + iconIds[0] + " " +
                OZO.tr("in this dialog.");
            return;
        }
        previewBusy = true;
        clearPreview();
        statusText.text = OZO.tr("Loading preview for") + " " + iconIds[0] + "...";
        dialog.update();
        try {
            var svgFile = downloadIcon(iconIds[0],
                cacheFileFor(iconIds[0], previewColor), previewColor);
            createDialogPreview(svgFile, iconIds[0], previewColor);
            currentPreviewKey = previewKey;
            statusText.text = OZO.tr("Previewing") + " " + iconIds[0] + " " +
                OZO.tr("in this dialog.");
        } catch (error) {
            clearPreview();
            statusText.text = OZO.tr("Icon preview failed.");
            alert(SCRIPT_NAME + " preview failed.\n\n" + errorMessage(error));
        } finally {
            previewBusy = false;
        }
    }

    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;
    dialog.minimumSize = [780, 600];
    OZO.addDialogHeader(dialog, OZO.tr("Search Iconify"), "v2.2 \u2022 200,000+ Vector Icons");

    var searchRow = dialog.add("group");
    searchRow.orientation = "row";
    searchRow.alignChildren = ["fill", "center"];
    var searchInput = searchRow.add("edittext", undefined, "");
    searchInput.alignment = ["fill", "center"];
    searchInput.characters = 34;
    searchInput.helpTip = "Try home, arrow, phone, user, cart, or social media.";
    searchInput._ozoNoSave = true;
    var searchButton = searchRow.add("button", undefined, "Search");

    var filterRow = dialog.add("group");
    filterRow.orientation = "row";
    filterRow.alignChildren = ["left", "center"];
    filterRow.add("statictext", undefined, "Icon set:");
    var prefixInput = filterRow.add("edittext", undefined, "");
    prefixInput.characters = 12;
    prefixInput.helpTip = "Optional Iconify prefix, for example mdi, tabler, or lucide.";
    filterRow.add("statictext", undefined, "Results:");
    var limitList = filterRow.add("dropdownlist", undefined, ["50", "100", "200"]);
    limitList.selection = 1;
    filterRow.add("statictext", undefined, "Color:");
    var colorInput = filterRow.add("edittext", undefined, "#000000");
    colorInput.characters = 8;
    colorInput.helpTip = "Applied to monochrome icons. Multicolor icons retain their palette.";
    var blackColorButton = filterRow.add("button", undefined, "Black");
    blackColorButton.preferredSize.width = 54;
    var whiteColorButton = filterRow.add("button", undefined, "White");
    whiteColorButton.preferredSize.width = 54;
    var blueColorButton = filterRow.add("button", undefined, "Blue");
    blueColorButton.preferredSize.width = 50;

    var browserRow = dialog.add("group");
    browserRow.orientation = "row";
    browserRow.alignChildren = ["fill", "fill"];
    browserRow.alignment = ["fill", "fill"];
    var resultsList = browserRow.add("listbox", undefined, [], {
        multiselect: true,
        numberOfColumns: 2,
        showHeaders: true,
        columnTitles: [OZO.tr("Icon Set"), OZO.tr("Icon Name")],
        columnWidths: [135, 315]
    });
    resultsList.alignment = ["fill", "fill"];
    resultsList.preferredSize = [510, 320];
    var previewPanel = browserRow.add("panel", undefined, "Icon Preview");
    previewPanel.orientation = "column";
    previewPanel.alignChildren = ["center", "top"];
    previewPanel.preferredSize = [220, 320];
    previewPanel.margins = [10, 20, 10, 10];
    previewImage = previewPanel.add("image", undefined, undefined);
    previewImage.preferredSize = [190, 190];
    previewName = previewPanel.add("statictext", undefined,
        "Select an icon and click Preview.", {multiline: true});
    previewName.preferredSize = [195, 62];
    previewName.justify = "center";
    var statusText = dialog.add("statictext", undefined,
        "Type a keyword to search hundreds of thousands of icons.");

    var pageRow = dialog.add("group");
    pageRow.orientation = "row";
    pageRow.alignment = ["fill", "top"];
    var previousButton = pageRow.add("button", undefined, "Previous");
    previousButton.enabled = false;
    var nextButton = pageRow.add("button", undefined, "Next");
    nextButton.enabled = false;
    var pageText = pageRow.add("statictext", undefined, "Page 1");
    var pageSpacer = pageRow.add("group");
    pageSpacer.alignment = ["fill", "fill"];
    var selectAllButton = pageRow.add("button", undefined, "Select All");
    selectAllButton.enabled = false;
    var autoPreviewCheck = pageRow.add("checkbox", undefined, "Auto preview");
    autoPreviewCheck.value = false;

    var layoutPanel = dialog.add("panel", undefined, "Import Layout");
    layoutPanel.orientation = "row";
    layoutPanel.alignChildren = ["left", "center"];
    layoutPanel.margins = [12, 18, 12, 10];
    layoutPanel.add("statictext", undefined, "Size (mm):");
    var sizeInput = layoutPanel.add("edittext", undefined, "20");
    sizeInput.characters = 6;
    layoutPanel.add("statictext", undefined, "Columns:");
    var columnsInput = layoutPanel.add("edittext", undefined, "5");
    columnsInput.characters = 5;
    layoutPanel.add("statictext", undefined, "Gap (mm):");
    var gapInput = layoutPanel.add("edittext", undefined, "5");
    gapInput.characters = 6;
    var selectionSummary = dialog.add("statictext", undefined,
        "No icons selected for import.");

    var licenseText = dialog.add("statictext", undefined,
        "Icons come from multiple open-source sets. Check the source set license before distribution.",
        {multiline: true});
    licenseText.preferredSize = [540, 34];
    var buttons = dialog.add("group");
    buttons.orientation = "row";
    buttons.alignment = ["fill", "top"];
    var previewButton = buttons.add("button", undefined, "Preview");
    previewButton.enabled = false;
    var downloadButton = buttons.add("button", undefined, "Download SVG...");
    downloadButton.enabled = false;
    var spacer = buttons.add("group");
    spacer.alignment = ["fill", "fill"];
    var cancelBtn = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var importButton = buttons.add("button", undefined, OZO.tr("Import Selected"));
    importButton.enabled = false;
    dialog.defaultElement = importButton;
    dialog.cancelElement = cancelBtn;

    OZO.addLanguageSelector(dialog, function () {
        updateImportSummary();
        if (!previewPngFile) {
            previewName.text = OZO.tr("Select an icon and click Preview.");
        }
    });

    var chosenIconIds = [];
    var currentStart = 0;
    var currentTotal = 0;
    var currentLimit = 100;
    var lastQuery = "";
    var lastPrefix = "";
    var allSearchResults = [];
    var searchMayHaveMore = false;
    var populatingResults = false;
    var searchCacheKeys = [];
    var searchCacheValues = [];

    function updateImportSummary() {
        var selected = selectedIconIds(resultsList).length;
        var size = trim(sizeInput.text) || "?";
        var columns = trim(columnsInput.text) || "?";
        var rows = selected > 0 && /^\d+$/.test(columns) && Number(columns) > 0 ?
            Math.ceil(selected / Number(columns)) : 0;
        selectionSummary.text = selected > 0 ? selected + " " +
            OZO.tr("icon(s) selected") + " | " +
            size + " mm | " + columns + " " + OZO.tr("column(s)") + " | " +
            rows + " " + OZO.tr("row(s)") :
            OZO.tr("No icons selected for import.");
    }

    function setColorPreset(value) {
        colorInput.text = value;
        clearPreview();
        updateImportSummary();
        if (autoPreviewCheck.value && selectedIconIds(resultsList).length === 1) {
            previewSelectedIcon();
        }
    }

    function cachedSearchResult(key) {
        for (var index = 0, indexLen = searchCacheKeys.length; index < indexLen; index++) {
            if (searchCacheKeys[index] === key) return searchCacheValues[index];
        }
        return null;
    }

    function rememberSearchResult(key, value) {
        searchCacheKeys.push(key);
        searchCacheValues.push(value);
        if (searchCacheKeys.length > 12) {
            searchCacheKeys.shift();
            searchCacheValues.shift();
        }
    }

    function renderSearchPage(startAt) {
        currentLimit = Number(limitList.selection ? limitList.selection.text : "100");
        currentTotal = allSearchResults.length;
        startAt = Math.max(0, Number(startAt) || 0);
        if (startAt >= currentTotal && currentTotal > 0) {
            startAt = Math.floor((currentTotal - 1) / currentLimit) * currentLimit;
        }
        currentStart = startAt;
        var shownEnd = Math.min(currentStart + currentLimit, currentTotal);
        populatingResults = true;
        resultsList.removeAll();
        for (var index = currentStart; index < shownEnd; index++) {
            var split = allSearchResults[index].indexOf(":");
            var item = resultsList.add("item",
                allSearchResults[index].substring(0, split));
            item.subItems[0].text = allSearchResults[index].substring(split + 1);
            item._iconId = allSearchResults[index];
        }
        if (resultsList.items.length > 0) resultsList.selection = 0;
        populatingResults = false;
        var totalLabel = String(currentTotal) + (searchMayHaveMore ? "+" : "");
        statusText.text = resultsList.items.length ? OZO.tr("Showing") + " " +
            (currentStart + 1) + "\u2013" + shownEnd + " " + OZO.tr("of") + " " +
            totalLabel + " " + OZO.tr("icons.") :
            OZO.tr("No icons found. Try a different keyword.");
        pageText.text = OZO.tr("Page") + " " + (Math.floor(currentStart / currentLimit) + 1) +
            " / " + Math.max(1, Math.ceil(currentTotal / currentLimit));
        previousButton.enabled = currentStart > 0;
        nextButton.enabled = shownEnd < currentTotal;
        selectAllButton.enabled = resultsList.items.length > 0;
        importButton.enabled = resultsList.items.length > 0;
        downloadButton.enabled = resultsList.items.length > 0;
        previewButton.enabled = resultsList.items.length > 0;
        updateImportSummary();
        if (autoPreviewCheck.value && resultsList.items.length > 0) previewSelectedIcon();
    }

    function runSearch() {
        var query = trim(searchInput.text);
        if (!query) {
            alert(OZO.tr("Enter an icon search keyword."));
            searchInput.active = true;
            return;
        }
        var prefix = trim(prefixInput.text).toLowerCase();
        if (prefix && !/^[a-z0-9-]+$/.test(prefix)) {
            alert(OZO.tr("The icon-set prefix can contain only letters, numbers, and hyphens."));
            prefixInput.active = true;
            return;
        }
        clearPreview();
        searchButton.enabled = false;
        importButton.enabled = false;
        downloadButton.enabled = false;
        previewButton.enabled = false;
        previousButton.enabled = false;
        nextButton.enabled = false;
        selectAllButton.enabled = false;
        statusText.text = OZO.tr("Searching Iconify for") + " '" + query + "'...";
        dialog.update();
        try {
            var searchKey = prefix + "\n" + query.toLowerCase();
            var searchResult = cachedSearchResult(searchKey);
            if (!searchResult) {
                searchResult = searchIcons(query, {
                    prefix: prefix,
                    limit: 999,
                    start: 0
                });
                rememberSearchResult(searchKey, searchResult);
            }
            allSearchResults = searchResult.icons;
            searchMayHaveMore = searchResult.total >= 999;
            lastQuery = query;
            lastPrefix = prefix;
            renderSearchPage(0);
        } catch (error) {
            populatingResults = false;
            allSearchResults = [];
            searchMayHaveMore = false;
            resultsList.removeAll();
            statusText.text = OZO.tr("Icon search failed.");
            alert(SCRIPT_NAME + "\n\n" + errorMessage(error));
        }
        searchButton.enabled = true;
    }

    searchButton.onClick = runSearch;
    searchInput.onEnterKey = runSearch;
    blackColorButton.onClick = function () { setColorPreset("#000000"); };
    whiteColorButton.onClick = function () { setColorPreset("#FFFFFF"); };
    blueColorButton.onClick = function () { setColorPreset("#0088CC"); };
    colorInput.onChange = function () {
        clearPreview();
        updateImportSummary();
        if (autoPreviewCheck.value && selectedIconIds(resultsList).length === 1) {
            previewSelectedIcon();
        }
    };
    autoPreviewCheck.onClick = function () {
        if (autoPreviewCheck.value && selectedIconIds(resultsList).length === 1) {
            previewSelectedIcon();
        }
    };
    sizeInput.onChanging = updateImportSummary;
    columnsInput.onChanging = updateImportSummary;
    gapInput.onChanging = updateImportSummary;
    previousButton.onClick = function () {
        searchInput.text = lastQuery;
        prefixInput.text = lastPrefix;
        clearPreview();
        renderSearchPage(Math.max(0, currentStart - currentLimit));
    };
    nextButton.onClick = function () {
        searchInput.text = lastQuery;
        prefixInput.text = lastPrefix;
        clearPreview();
        renderSearchPage(currentStart + currentLimit);
    };
    limitList.onChange = function () {
        if (allSearchResults.length > 0) {
            clearPreview();
            renderSearchPage(0);
        }
    };
    selectAllButton.onClick = function () {
        populatingResults = true;
        for (var index = 0, indexLen = resultsList.items.length; index < indexLen; index++) {
            resultsList.items[index].selected = true;
        }
        populatingResults = false;
        var selected = selectedIconIds(resultsList).length;
        importButton.enabled = selected > 0;
        downloadButton.enabled = selected > 0;
        previewButton.enabled = selected > 0;
        statusText.text = selected + " " + OZO.tr("icon(s) selected") + ".";
        updateImportSummary();
    };
    previewButton.onClick = previewSelectedIcon;
    resultsList.onChange = function () {
        if (populatingResults) return;
        if (previewPngFile) clearPreview();
        var selected = selectedIconIds(resultsList).length;
        importButton.enabled = selected > 0;
        downloadButton.enabled = selected > 0;
        previewButton.enabled = selected > 0;
        updateImportSummary();
        if (autoPreviewCheck.value && selected === 1) previewSelectedIcon();
    };
    resultsList.onDoubleClick = function () {
        previewSelectedIcon();
    };
    importButton.onClick = function () {
        chosenIconIds = selectedIconIds(resultsList);
        if (chosenIconIds.length > 0) dialog.close(1);
    };
    downloadButton.onClick = function () {
        var iconIds = selectedIconIds(resultsList);
        if (iconIds.length === 0) return;
        var selectedColor;
        try {
            selectedColor = colorValue(colorInput);
        } catch (colorError) {
            alert(SCRIPT_NAME + "\n\n" + errorMessage(colorError));
            return;
        }
        var destinationFolder = Folder.selectDialog("Choose a folder for the SVG icons");
        if (!destinationFolder) return;
        downloadButton.enabled = false;
        statusText.text = "Downloading " + iconIds.length + " SVG icon(s)...";
        dialog.update();
        try {
            var downloadSummary = callIconify("DownloadBatch", iconIds.join("\n"), "",
                destinationFolder, {color: selectedColor});
            statusText.text = downloadSummary || ("Downloaded " + iconIds.length + " SVG icon(s).");
        } catch (error) {
            statusText.text = "Icon download failed.";
            alert(SCRIPT_NAME + "\n\n" + errorMessage(error));
        }
        downloadButton.enabled = selectedIconIds(resultsList).length > 0;
    };

    OZO.makeNumericSmooth(sizeInput, {step: 1, min: 1, max: 1000});
    OZO.makeNumericSmooth(columnsInput, {step: 1, min: 1, max: 100});
    OZO.makeNumericSmooth(gapInput, {step: 1, min: 0, max: 500});

    OZO.restoreWindowState(dialog, "icon_search_import_v2");
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);
    updateImportSummary();
    searchInput.active = true;
    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        clearPreview();
        return;
    }

    var selectedIds = chosenIconIds;
    if (selectedIds.length === 0) {
        clearPreview();
        return;
    }
    var settings;
    try {
        settings = {
            size: OZO.toPoints(numberValue(sizeInput, "Size", 0.1, 10000), "mm"),
            columns: integerValue(columnsInput, "Columns", 1, 1000),
            gap: OZO.toPoints(numberValue(gapInput, "Gap", 0, 10000), "mm"),
            color: colorValue(colorInput)
        };
    } catch (settingsError) {
        clearPreview();
        alert(SCRIPT_NAME + "\n\n" + errorMessage(settingsError));
        return;
    }

    clearPreview();

    var progress = new Window("palette", "Importing Icons");
    progress.orientation = "column";
    progress.alignChildren = ["fill", "top"];
    progress.margins = 14;
    var progressText = progress.add("statictext", undefined, "Downloading icons...");
    progressText.preferredSize.width = 380;
    var progressBar = progress.add("progressbar", undefined, 0, selectedIds.length);
    progressBar.preferredSize = [380, 18];
    progress.show();
    progress.update();

    var createdLayer = null;
    var importGroup = null;
    try {
        progressText.text = "Downloading " + selectedIds.length + " icon(s)...";
        progress.update();
        downloadIconsToCache(selectedIds, settings.color);
        createdLayer = doc.layers.add();
        createdLayer.name = uniqueLayerName("[Iconify Icons]");
        doc.activeLayer = createdLayer;
        importGroup = createdLayer.groupItems.add();
        importGroup.name = "Iconify Icons";
        var artboardIndex = doc.artboards.getActiveArtboardIndex();
        var artboard = doc.artboards[artboardIndex].artboardRect;
        var startLeft = artboard[0] + settings.gap;
        var startTop = artboard[1] - settings.gap;
        var step = settings.size + settings.gap;
        doc.selection = null;

        var importedCount = 0;
        var failedList = [];
        for (var index = 0, indexLen = selectedIds.length; index < indexLen; index++) {
            var iconId = selectedIds[index];
            progressText.text = "Importing " + (index + 1) + " of " +
                selectedIds.length + ": " + iconId;
            progressBar.value = index;
            progress.update();
            var svgFile = cacheFileFor(iconId, settings.color);
            if (!isValidSvgFile(svgFile)) {
                failedList.push(iconId + " (invalid file)");
                continue;
            }
            try {
                var importedIcon = importSvgGroup(svgFile, importGroup);
                importedIcon.name = iconId;
                var longestSide = Math.max(importedIcon.width, importedIcon.height);
                if (!(longestSide > 0)) {
                    try { importedIcon.remove(); } catch (eRem) {}
                    failedList.push(iconId + " (zero bounds)");
                    continue;
                }
                var scale = settings.size / longestSide * 100;
                importedIcon.resize(scale, scale, true, true, true, true, scale,
                    Transformation.CENTER);
                var column = importedCount % settings.columns;
                var row = Math.floor(importedCount / settings.columns);
                importedIcon.position = [
                    startLeft + column * step + (settings.size - importedIcon.width) / 2,
                    startTop - row * step - (settings.size - importedIcon.height) / 2
                ];
                importedCount++;
            } catch (eImportOne) {
                failedList.push(iconId + " (" + eImportOne.message + ")");
            }
        }
        progressBar.value = selectedIds.length;
        if (importedCount === 0) {
            throw new Error("No icons could be imported.\n" + failedList.join("\n"));
        }
        doc.selection = null;
        importGroup.selected = true;
        OZO.saveWindowState(dialog, "icon_search_import_v2");
        app.redraw();
    } catch (error) {
        try {
            if (createdLayer) {
                createdLayer.locked = false;
                createdLayer.visible = true;
                createdLayer.remove();
            }
        } catch (ignoreRollback) {}
        try { doc.activeLayer = originalLayer; } catch (ignoreLayer) {}
        restoreOriginalSelection();
        try { progress.close(); } catch (ignoreProgress) {}
        app.redraw();
        alert(SCRIPT_NAME + " failed.\n\n" + errorMessage(error));
        return;
    }
    try { progress.close(); } catch (ignoreProgressClose) {}
    var resultMsg = "Imported " + importedCount +
        (importedCount === 1 ? " icon." : " icons.");
    if (failedList.length > 0) {
        resultMsg += "\n\nSkipped (" + failedList.length + "):\n" +
            failedList.slice(0, 5).join("\n") + (failedList.length > 5 ? "\n..." : "");
    }
    alert(resultMsg + "\n\n" + OZO.credit());
})();
