#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Generate QR Code";
    var POINTS_PER_MM = 72 / 25.4;
    var DEFAULT_SIZE_MM = 50;

    if (app.documents.length === 0) {
        alert(OZO.tr("Open an Illustrator document before generating a QR code."));
        return;
    }

    var doc = app.activeDocument;

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function parsePositiveNumber(value) {
        if (value === null || value === undefined) return NaN;
        var normalized = trim(value).replace(/,/g, ".");
        normalized = trim(normalized.replace(/[a-zA-Z%]+$/, ""));
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
            return NaN;
        }
        var num = Number(normalized);
        return isNaN(num) ? NaN : num;
    }

    function unitToMillimeters(unit) {
        if (unit === "cm") return 10;
        if (unit === "m") return 1000;
        if (unit === "in") return 25.4;
        return 1;
    }

    function formatMeasurement(value) {
        var rounded = Math.round(value * 1000000) / 1000000;
        return String(rounded);
    }

    function sizeLimitsForUnit(unit) {
        if (unit === "cm") return {step: 0.5, min: 0.5, max: 500};
        if (unit === "m") return {step: 0.005, min: 0.005, max: 5};
        if (unit === "in") return {step: 0.2, min: 0.2, max: 196.85};
        return {step: 5, min: 5, max: 5000};
    }

    function qrScanWarning(modules, sizeValue, unit, quietZone, includeBackground, telegramStyle) {
        var warnings = [];
        var millimetersPerUnit = unitToMillimeters(unit);
        var sizeMillimeters = sizeValue * millimetersPerUnit;
        var totalModules = modules + quietZone * 2;
        var moduleMillimeters = sizeMillimeters / totalModules;
        var minimumModule = telegramStyle ? 1.1 : 0.9;
        if (moduleMillimeters < minimumModule) {
            var recommended = totalModules * minimumModule / millimetersPerUnit;
            recommended = Math.ceil(recommended * 100) / 100;
            warnings.push("Small modules (" +
                (Math.round(moduleMillimeters * 100) / 100) +
                " mm); use at least " + formatMeasurement(recommended) + " " + unit +
                " for reliable scanning.");
        }
        if (quietZone < 4) {
            warnings.push("Quiet zone below 4 modules may break some scanners.");
        }
        if (!includeBackground) {
            warnings.push("No white background; place the QR on a plain light surface.");
        }
        try {
            var artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
            var artboardWidth = artboard[2] - artboard[0];
            var artboardHeight = artboard[1] - artboard[3];
            var sizePoints = sizeMillimeters * POINTS_PER_MM;
            if (sizePoints > artboardWidth + 0.01 || sizePoints > artboardHeight + 0.01) {
                warnings.push(
                    "Larger than the active artboard; it may clip when exporting.");
            }
        } catch (ignoreArtboard) {}
        return warnings.join(" ");
    }

    function errorMessage(error) {
        return error && error.message ? error.message : String(error);
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
                text += String.fromCharCode(0xD800 + (code >>> 10), 0xDC00 + (code & 0x3FF));
            } else {
                text += String.fromCharCode(code);
            }
        }
        return text;
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

    function decodeQrImage(imageFile) {
        var helperFolder = (function () {
            var scriptFolder = (function () {
                try {
                    if ($.fileName) return new File($.fileName).parent;
                } catch (e) {}
                return null;
            })();
            var candidates = [
                (scriptFolder ? scriptFolder.fsName + "/lib" : null),
                (scriptFolder && scriptFolder.parent ? scriptFolder.parent.fsName + "/lib" : null),
                (scriptFolder ? scriptFolder.fsName + "/Script all/lib" : null),
                Folder.current.fsName + "/lib",
                Folder.current.fsName + "/Script all/lib"
            ];
            for (var i = 0, iLen = candidates.length; i < iLen; i++) {
                if (candidates[i]) {
                    var f = new Folder(candidates[i]);
                    if (f.exists) return f;
                }
            }
            var fallbackDir = scriptFolder ? scriptFolder.fsName : Folder.current.fsName;
            return new Folder(fallbackDir + "/lib");
        })();

        if (Folder.fs !== "Windows") {
            var macToken = new Date().getTime() + "-" + Math.floor(Math.random() * 1000000);
            var macResult = new File(Folder.temp.fsName + "/illustrator-qr-result-" + macToken + ".txt");
            var macRunner = new File(Folder.temp.fsName + "/illustrator-qr-runner-" + macToken + ".sh");
            try {
                macRunner.encoding = "UTF-8";
                macRunner.lineFeed = "Unix";
                if (macRunner.open("w")) {
                    macRunner.writeln("#!/bin/sh");
                    macRunner.writeln('IMG="' + imageFile.fsName.replace(/"/g, '\\"') + '"');
                    macRunner.writeln('OUT="' + macResult.fsName.replace(/"/g, '\\"') + '"');
                    macRunner.writeln('if ! xcode-select -p >/dev/null 2>&1; then');
                    macRunner.writeln('    printf "%s" "ERR:Xcode Command Line Tools are not installed on this Mac." > "$OUT.part"');
                    macRunner.writeln('    mv "$OUT.part" "$OUT"');
                    macRunner.writeln('    exit 1');
                    macRunner.writeln('fi');
                    macRunner.writeln('/usr/bin/swift - "$IMG" "$OUT" << \'SWIFT_CODE\'');
                    macRunner.writeln('import Foundation');
                    macRunner.writeln('import Vision');
                    macRunner.writeln('import AppKit');
                    macRunner.writeln('let args = CommandLine.arguments');
                    macRunner.writeln('guard args.count > 2, let img = NSImage(contentsOfFile: args[1]), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {');
                    macRunner.writeln('    if args.count > 2 { try? "ERR:Could not open the selected image.".write(toFile: args[2], atomically: true, encoding: .ascii) }');
                    macRunner.writeln('    exit(1)');
                    macRunner.writeln('}');
                    macRunner.writeln('let req = VNDetectBarcodesRequest { r, _ in');
                    macRunner.writeln('    guard let bcs = r.results as? [VNBarcodeObservation], let val = bcs.first?.payloadStringValue else {');
                    macRunner.writeln('        try? "ERR:No readable QR code was found in the selected image.".write(toFile: args[2], atomically: true, encoding: .ascii)');
                    macRunner.writeln('        exit(2)');
                    macRunner.writeln('    }');
                    macRunner.writeln('    let b64 = val.data(using: .utf8)?.base64EncodedString() ?? ""');
                    macRunner.writeln('    try? ("OK:" + b64).write(toFile: args[2], atomically: true, encoding: .ascii)');
                    macRunner.writeln('    exit(0)');
                    macRunner.writeln('}');
                    macRunner.writeln('try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])');
                    macRunner.writeln('try? "ERR:No readable QR code was found in the selected image.".write(toFile: args[2], atomically: true, encoding: .ascii)');
                    macRunner.writeln('exit(3)');
                    macRunner.writeln('SWIFT_CODE');
                    macRunner.writeln('swift_status=$?');
                    macRunner.writeln('if [ ! -f "$OUT" ]; then');
                    macRunner.writeln('    printf "%s" "ERR:The macOS QR decoder failed (Swift exit $swift_status)." > "$OUT.part"');
                    macRunner.writeln('    mv "$OUT.part" "$OUT"');
                    macRunner.writeln('fi');
                    macRunner.close();
                    var macOk = false;
                    try { macOk = macRunner.execute(); } catch (eExec) {}
                    if (!macOk && typeof app.system === "function") {
                        try { app.system('chmod +x "' + macRunner.fsName + '" && "' + macRunner.fsName + '" &'); } catch (eSys) {}
                    }
                } else {
                    throw new Error("Could not create the macOS QR decoder helper in the temporary folder.");
                }
                // The first Swift run compiles the Vision helper, which can take
                // up to a minute on a cold cache.
                var macDeadline = new Date().getTime() + 60000;
                while (!macResult.exists && new Date().getTime() < macDeadline) {
                    $.sleep(100);
                }
                if (!macResult.exists) {
                    throw new Error("QR decoding on macOS timed out. The first run compiles the Vision helper and can take up to a minute.");
                }
                if (!macResult.open("r")) {
                    throw new Error("Could not read the QR decoder result on macOS.");
                }
                macResult.encoding = "ASCII";
                var resp = trim(macResult.read());
                macResult.close();
                var sep = resp.indexOf(":");
                if (sep > 0) {
                    var status = resp.substring(0, sep);
                    var payload = resp.substring(sep + 1);
                    if (status === "OK") {
                        return base64Utf8(payload);
                    } else if (status === "ERR") {
                        throw new Error(payload);
                    }
                }
                throw new Error("The QR decoder returned an invalid response.");
            } catch (macError) {
                if (macError && macError.message) throw macError;
            }
            finally {
                try { if (macRunner.exists) macRunner.remove(); } catch (e1) {}
                try { if (macResult.exists) macResult.remove(); } catch (e2) {}
                try {
                    var macPartial = new File(macResult.fsName + ".part");
                    if (macPartial.exists) macPartial.remove();
                } catch (e3) {}
            }
            throw new Error("The QR decoder on macOS failed unexpectedly.");
        }

        var decoderScript = new File(helperFolder.fsName + "/decode-qr.ps1");
        var decoderLibrary = new File(helperFolder.fsName + "/zxing.dll");
        if (!decoderScript.exists || !decoderLibrary.exists) {
            throw new Error("The offline QR decoder files are missing from the lib folder.");
        }

        var token = new Date().getTime() + "-" + Math.floor(Math.random() * 1000000);
        var resultFile = new File(Folder.temp.fsName + "/illustrator-qr-result-" + token + ".txt");
        var runnerFile = new File(Folder.temp.fsName + "/illustrator-qr-runner-" + token + ".cmd");
        // Encode the whole PowerShell command as UTF-16LE Base64 so cmd.exe
        // never has to parse non-ASCII paths or shell metacharacters.
        var powerShellCommand =
            "& " + quotePowerShell(decoderScript.fsName) +
            " -ImagePath " + quotePowerShell(imageFile.fsName) +
            " -DecoderPath " + quotePowerShell(decoderLibrary.fsName) +
            " -OutputPath " + quotePowerShell(resultFile.fsName);
        var command =
            'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden ' +
            '-ExecutionPolicy Bypass -EncodedCommand ' + base64Utf16Le(powerShellCommand);

        try {
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
                throw new Error("Windows could not start the offline QR decoder.");
            }

            var deadline = new Date().getTime() + 25000;
            while (!resultFile.exists && new Date().getTime() < deadline) {
                $.sleep(100);
            }
            if (!resultFile.exists) {
                throw new Error("QR decoding timed out. Please verify that PowerShell is accessible.");
            }

            resultFile.encoding = "ASCII";
            if (!resultFile.open("r")) {
                throw new Error("Could not read the QR decoder result.");
            }
            var response = trim(resultFile.read());
            resultFile.close();
            var separator = response.indexOf(":");
            if (separator < 0) {
                throw new Error("The QR decoder returned an invalid response.");
            }
            var status = response.substring(0, separator);
            var decoded = base64Utf8(response.substring(separator + 1));
            if (status !== "OK") {
                throw new Error(decoded || "The QR image could not be decoded.");
            }
            return decoded;
        } finally {
            try { if (runnerFile.opened) runnerFile.close(); } catch (ignoreRunnerClose) {}
            try { if (resultFile.opened) resultFile.close(); } catch (ignoreResultClose) {}
            try { if (runnerFile.exists) runnerFile.remove(); } catch (ignoreRunnerRemoval) {}
            try { if (resultFile.exists) resultFile.remove(); } catch (ignoreResultRemoval) {}
        }
    }

    function utf8Bytes(text) {
        var bytes = [];
        for (var index = 0, indexLen = text.length; index < indexLen; index++) {
            var code = text.charCodeAt(index);
            if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
                var low = text.charCodeAt(index + 1);
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                    index++;
                }
            }
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xC0 | (code >>> 6));
                bytes.push(0x80 | (code & 0x3F));
            } else if (code < 0x10000) {
                bytes.push(0xE0 | (code >>> 12));
                bytes.push(0x80 | ((code >>> 6) & 0x3F));
                bytes.push(0x80 | (code & 0x3F));
            } else {
                bytes.push(0xF0 | (code >>> 18));
                bytes.push(0x80 | ((code >>> 12) & 0x3F));
                bytes.push(0x80 | ((code >>> 6) & 0x3F));
                bytes.push(0x80 | (code & 0x3F));
            }
        }
        return bytes;
    }

    function BitBuffer() {
        this.buffer = [];
        this.length = 0;
    }
    BitBuffer.prototype.put = function (number, length) {
        for (var index = length - 1; index >= 0; index--) {
            this.putBit(((number >>> index) & 1) === 1);
        }
    };
    BitBuffer.prototype.putBit = function (bit) {
        var bufferIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufferIndex) {
            this.buffer.push(0);
        }
        if (bit) {
            this.buffer[bufferIndex] |= 0x80 >>> (this.length % 8);
        }
        this.length++;
    };

    var EXP_TABLE = [];
    var LOG_TABLE = [];
    (function () {
        var index;
        for (index = 0; index < 8; index++) {
            EXP_TABLE[index] = 1 << index;
        }
        for (index = 8; index < 256; index++) {
            EXP_TABLE[index] = EXP_TABLE[index - 4] ^ EXP_TABLE[index - 5] ^
                EXP_TABLE[index - 6] ^ EXP_TABLE[index - 8];
        }
        for (index = 0; index < 255; index++) {
            LOG_TABLE[EXP_TABLE[index]] = index;
        }
    })();

    function gfExp(number) {
        while (number < 0) {
            number += 255;
        }
        while (number >= 256) {
            number -= 255;
        }
        return EXP_TABLE[number];
    }

    function gfLog(number) {
        if (number < 1) {
            throw new Error("QR encoder encountered an invalid polynomial value.");
        }
        return LOG_TABLE[number];
    }

    function polynomialMultiply(first, second) {
        var result = [];
        var index;
        for (var index = 0, combLen = first.length + second.length - 1; index < combLen; index++) {
            result[index] = 0;
        }
        for (var index = 0, indexLen = first.length; index < indexLen; index++) {
            for (var secondIndex = 0, secondIndexLen = second.length; secondIndex < secondIndexLen; secondIndex++) {
                result[index + secondIndex] ^= gfExp(
                    gfLog(first[index]) + gfLog(second[secondIndex])
                );
            }
        }
        return result;
    }

    var ERROR_POLYNOMIAL_CACHE = {};

    function errorPolynomial(length) {
        if (ERROR_POLYNOMIAL_CACHE.hasOwnProperty(length)) {
            return ERROR_POLYNOMIAL_CACHE[length];
        }
        var polynomial = [1];
        for (var index = 0; index < length; index++) {
            polynomial = polynomialMultiply(polynomial, [1, gfExp(index)]);
        }
        ERROR_POLYNOMIAL_CACHE[length] = polynomial;
        return polynomial;
    }

    function polynomialRemainder(data, divisor) {
        var result = data.slice(0);
        var offset = 0;
        while (result.length - offset >= divisor.length) {
            if (result[offset] === 0) {
                offset++;
                continue;
            }
            var ratio = gfLog(result[offset]) - gfLog(divisor[0]);
            for (var index = 0, indexLen = divisor.length; index < indexLen; index++) {
                result[offset + index] ^= gfExp(gfLog(divisor[index]) + ratio);
            }
            while (offset < result.length && result[offset] === 0) {
                offset++;
            }
        }
        return result.slice(offset);
    }

    // QR Model 2 Reed-Solomon blocks, versions 1-10, ordered L/M/Q/H.
    var RS_BLOCKS = [
        [[1,26,19]], [[1,26,16]], [[1,26,13]], [[1,26,9]],
        [[1,44,34]], [[1,44,28]], [[1,44,22]], [[1,44,16]],
        [[1,70,55]], [[1,70,44]], [[2,35,17]], [[2,35,13]],
        [[1,100,80]], [[2,50,32]], [[2,50,24]], [[4,25,9]],
        [[1,134,108]], [[2,67,43]], [[2,33,15],[2,34,16]], [[2,33,11],[2,34,12]],
        [[2,86,68]], [[4,43,27]], [[4,43,19]], [[4,43,15]],
        [[2,98,78]], [[4,49,31]], [[2,32,14],[4,33,15]], [[4,39,13],[1,40,14]],
        [[2,121,97]], [[2,60,38],[2,61,39]], [[4,40,18],[2,41,19]], [[4,40,14],[2,41,15]],
        [[2,146,116]], [[3,58,36],[2,59,37]], [[4,36,16],[4,37,17]], [[4,36,12],[4,37,13]],
        [[2,86,68],[2,87,69]], [[4,69,43],[1,70,44]], [[6,43,19],[2,44,20]], [[6,43,15],[2,44,16]]
    ];
    var LEVEL_INDEX = {L: 0, M: 1, Q: 2, H: 3};
    var LEVEL_BITS = {L: 1, M: 0, Q: 3, H: 2};
    var ALIGNMENT_POSITIONS = [
        [], [6,18], [6,22], [6,26], [6,30], [6,34],
        [6,22,38], [6,24,42], [6,26,46], [6,28,50]
    ];

    function expandedBlocks(version, level) {
        var definitions = RS_BLOCKS[(version - 1) * 4 + LEVEL_INDEX[level]];
        var blocks = [];
        for (var index = 0, indexLen = definitions.length; index < indexLen; index++) {
            for (var count = 0; count < definitions[index][0]; count++) {
                blocks.push({
                    totalCount: definitions[index][1],
                    dataCount: definitions[index][2]
                });
            }
        }
        return blocks;
    }

    function dataCapacityFor(version, level) {
        var definitions = RS_BLOCKS[(version - 1) * 4 + LEVEL_INDEX[level]];
        var capacity = 0;
        for (var index = 0, indexLen = definitions.length; index < indexLen; index++) {
            capacity += definitions[index][0] * definitions[index][2];
        }
        return capacity;
    }

    function createCodewords(version, level, bytes) {
        var blocks = expandedBlocks(version, level);
        var dataCapacity = 0;
        var index;
        for (var index = 0, indexLen = blocks.length; index < indexLen; index++) {
            dataCapacity += blocks[index].dataCount;
        }

        var buffer = new BitBuffer();
        buffer.put(4, 4); // Byte mode.
        buffer.put(bytes.length, version < 10 ? 8 : 16);
        for (var index = 0, indexLen = bytes.length; index < indexLen; index++) {
            buffer.put(bytes[index], 8);
        }
        if (buffer.length > dataCapacity * 8) {
            throw new Error("Data does not fit QR version " + version + ".");
        }
        if (buffer.length + 4 <= dataCapacity * 8) {
            buffer.put(0, 4);
        }
        while (buffer.length % 8 !== 0) {
            buffer.putBit(false);
        }
        var pad = true;
        while (buffer.buffer.length < dataCapacity) {
            buffer.put(pad ? 0xEC : 0x11, 8);
            pad = !pad;
        }

        var offset = 0;
        var dataBlocks = [];
        var errorBlocks = [];
        var maxData = 0;
        var maxError = 0;
        for (var index = 0, indexLen = blocks.length; index < indexLen; index++) {
            var dataCount = blocks[index].dataCount;
            var errorCount = blocks[index].totalCount - dataCount;
            dataBlocks[index] = buffer.buffer.slice(offset, offset + dataCount);
            offset += dataCount;
            var divisor = errorPolynomial(errorCount);
            var raw = dataBlocks[index].slice(0);
            for (var zero = 0; zero < errorCount; zero++) {
                raw.push(0);
            }
            var remainder = polynomialRemainder(raw, divisor);
            var errorData = [];
            for (var errorIndex = 0; errorIndex < errorCount; errorIndex++) {
                var remainderIndex = errorIndex + remainder.length - errorCount;
                errorData[errorIndex] = remainderIndex >= 0 ? remainder[remainderIndex] : 0;
            }
            errorBlocks[index] = errorData;
            maxData = Math.max(maxData, dataCount);
            maxError = Math.max(maxError, errorCount);
        }

        var codewords = [];
        for (index = 0; index < maxData; index++) {
            for (var dataBlock = 0, dataBlockLen = dataBlocks.length; dataBlock < dataBlockLen; dataBlock++) {
                if (index < dataBlocks[dataBlock].length) {
                    codewords.push(dataBlocks[dataBlock][index]);
                }
            }
        }
        for (index = 0; index < maxError; index++) {
            for (var errorBlock = 0, errorBlockLen = errorBlocks.length; errorBlock < errorBlockLen; errorBlock++) {
                if (index < errorBlocks[errorBlock].length) {
                    codewords.push(errorBlocks[errorBlock][index]);
                }
            }
        }
        return codewords;
    }

    function bchTypeInfo(data) {
        var value = data << 10;
        var generator = 0x537;
        while (bitLength(value) - bitLength(generator) >= 0) {
            value ^= generator << (bitLength(value) - bitLength(generator));
        }
        return ((data << 10) | value) ^ 0x5412;
    }

    function bchTypeNumber(data) {
        var value = data << 12;
        var generator = 0x1F25;
        while (bitLength(value) - bitLength(generator) >= 0) {
            value ^= generator << (bitLength(value) - bitLength(generator));
        }
        return (data << 12) | value;
    }

    function bitLength(value) {
        var length = 0;
        while (value !== 0) {
            length++;
            value >>>= 1;
        }
        return length;
    }

    function maskValue(pattern, row, column) {
        switch (pattern) {
            case 0: return (row + column) % 2 === 0;
            case 1: return row % 2 === 0;
            case 2: return column % 3 === 0;
            case 3: return (row + column) % 3 === 0;
            case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
            case 5: return (row * column) % 2 + (row * column) % 3 === 0;
            case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
            default: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
        }
    }

    function makeEmptyMatrix(size) {
        var matrix = [];
        for (var row = 0; row < size; row++) {
            matrix[row] = [];
            for (var column = 0; column < size; column++) {
                matrix[row][column] = null;
            }
        }
        return matrix;
    }

    function setupFinder(matrix, row, column) {
        var size = matrix.length;
        for (var rowOffset = -1; rowOffset <= 7; rowOffset++) {
            for (var columnOffset = -1; columnOffset <= 7; columnOffset++) {
                var targetRow = row + rowOffset;
                var targetColumn = column + columnOffset;
                if (targetRow < 0 || targetRow >= size || targetColumn < 0 || targetColumn >= size) {
                    continue;
                }
                matrix[targetRow][targetColumn] =
                    rowOffset >= 0 && rowOffset <= 6 && columnOffset >= 0 && columnOffset <= 6 &&
                    (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 ||
                    columnOffset === 6 || (rowOffset >= 2 && rowOffset <= 4 &&
                    columnOffset >= 2 && columnOffset <= 4));
            }
        }
    }

    function setupAlignment(matrix, version) {
        var positions = ALIGNMENT_POSITIONS[version - 1];
        for (var first = 0, firstLen = positions.length; first < firstLen; first++) {
            for (var second = 0, secondLen = positions.length; second < secondLen; second++) {
                var row = positions[first];
                var column = positions[second];
                if (matrix[row][column] !== null) {
                    continue;
                }
                for (var rowOffset = -2; rowOffset <= 2; rowOffset++) {
                    for (var columnOffset = -2; columnOffset <= 2; columnOffset++) {
                        matrix[row + rowOffset][column + columnOffset] =
                            Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1;
                    }
                }
            }
        }
    }

    function setupTiming(matrix) {
        for (var index = 8, mBound = matrix.length - 8; index < mBound; index++) {
            if (matrix[index][6] === null) {
                matrix[index][6] = index % 2 === 0;
            }
            if (matrix[6][index] === null) {
                matrix[6][index] = index % 2 === 0;
            }
        }
    }

    function setupTypeInfo(matrix, level, mask) {
        var bits = bchTypeInfo((LEVEL_BITS[level] << 3) | mask);
        var size = matrix.length;
        for (var index = 0; index < 15; index++) {
            var dark = ((bits >> index) & 1) === 1;
            var verticalRow;
            if (index < 6) verticalRow = index;
            else if (index < 8) verticalRow = index + 1;
            else verticalRow = size - 15 + index;
            matrix[verticalRow][8] = dark;

            var horizontalColumn;
            if (index < 8) horizontalColumn = size - index - 1;
            else if (index < 9) horizontalColumn = 15 - index;
            else horizontalColumn = 15 - index - 1;
            matrix[8][horizontalColumn] = dark;
        }
        matrix[size - 8][8] = true;
    }

    function setupTypeNumber(matrix, version) {
        if (version < 7) return;
        var bits = bchTypeNumber(version);
        var size = matrix.length;
        for (var index = 0; index < 18; index++) {
            var dark = ((bits >> index) & 1) === 1;
            matrix[Math.floor(index / 3)][index % 3 + size - 11] = dark;
            matrix[index % 3 + size - 11][Math.floor(index / 3)] = dark;
        }
    }

    function mapCodewords(matrix, codewords, mask) {
        var size = matrix.length;
        var row = size - 1;
        var direction = -1;
        var byteIndex = 0;
        var bitIndex = 7;
        for (var column = size - 1; column > 0; column -= 2) {
            if (column === 6) column--;
            while (true) {
                for (var offset = 0; offset < 2; offset++) {
                    var targetColumn = column - offset;
                    if (matrix[row][targetColumn] !== null) continue;
                    var dark = false;
                    if (byteIndex < codewords.length) {
                        dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
                    }
                    if (maskValue(mask, row, targetColumn)) dark = !dark;
                    matrix[row][targetColumn] = dark;
                    bitIndex--;
                    if (bitIndex < 0) {
                        byteIndex++;
                        bitIndex = 7;
                    }
                }
                row += direction;
                if (row < 0 || row >= size) {
                    row -= direction;
                    direction = -direction;
                    break;
                }
            }
        }
    }

    function buildMatrix(version, level, codewords, mask) {
        var size = version * 4 + 17;
        var matrix = makeEmptyMatrix(size);
        setupFinder(matrix, 0, 0);
        setupFinder(matrix, size - 7, 0);
        setupFinder(matrix, 0, size - 7);
        setupAlignment(matrix, version);
        setupTiming(matrix);
        setupTypeInfo(matrix, level, mask);
        setupTypeNumber(matrix, version);
        mapCodewords(matrix, codewords, mask);
        return matrix;
    }

    function lostPoints(matrix) {
        var size = matrix.length;
        var score = 0;
        var row;
        var column;

        // Condition 1: Adjacent modules in row/column in same color (runs of >= 5).
        for (row = 0; row < size; row++) {
            var rowColor = matrix[row][0];
            var rowCount = 1;
            for (column = 1; column < size; column++) {
                if (matrix[row][column] === rowColor) {
                    rowCount++;
                } else {
                    if (rowCount >= 5) {
                        score += 3 + (rowCount - 5);
                    }
                    rowColor = matrix[row][column];
                    rowCount = 1;
                }
            }
            if (rowCount >= 5) {
                score += 3 + (rowCount - 5);
            }
        }
        for (column = 0; column < size; column++) {
            var colColor = matrix[0][column];
            var colCount = 1;
            for (row = 1; row < size; row++) {
                if (matrix[row][column] === colColor) {
                    colCount++;
                } else {
                    if (colCount >= 5) {
                        score += 3 + (colCount - 5);
                    }
                    colColor = matrix[row][column];
                    colCount = 1;
                }
            }
            if (colCount >= 5) {
                score += 3 + (colCount - 5);
            }
        }

        // Condition 2: 2x2 blocks of same color.
        for (row = 0; row < size - 1; row++) {
            for (column = 0; column < size - 1; column++) {
                var block = (matrix[row][column] ? 1 : 0) +
                    (matrix[row + 1][column] ? 1 : 0) +
                    (matrix[row][column + 1] ? 1 : 0) +
                    (matrix[row + 1][column + 1] ? 1 : 0);
                if (block === 0 || block === 4) {
                    score += 3;
                }
            }
        }

        // Condition 3: 1:1:3:1:1 ratio pattern with 4 quiet zone modules (10111010000 or 00001011101).
        for (row = 0; row < size; row++) {
            var rowBits = 0;
            for (column = 0; column < size; column++) {
                rowBits = ((rowBits << 1) & 0x7FF) | (matrix[row][column] ? 1 : 0);
                if (column >= 10 && (rowBits === 0x5D0 || rowBits === 0x05D)) {
                    score += 40;
                }
            }
        }
        for (column = 0; column < size; column++) {
            var colBits = 0;
            for (row = 0; row < size; row++) {
                colBits = ((colBits << 1) & 0x7FF) | (matrix[row][column] ? 1 : 0);
                if (row >= 10 && (colBits === 0x5D0 || colBits === 0x05D)) {
                    score += 40;
                }
            }
        }

        // Condition 4: Proportion of dark modules (deviation from 50%).
        var darkCount = 0;
        for (row = 0; row < size; row++) {
            for (column = 0; column < size; column++) {
                if (matrix[row][column]) darkCount++;
            }
        }
        var percentage = (darkCount * 100) / (size * size);
        score += Math.floor(Math.abs(percentage - 50) / 5) * 10;

        return score;
    }

    function encodeQr(text, level) {
        var bytes = utf8Bytes(text);
        var version;
        for (version = 1; version <= 10; version++) {
            var countBits = version < 10 ? 8 : 16;
            if (4 + countBits + bytes.length * 8 <= dataCapacityFor(version, level) * 8) {
                break;
            }
        }
        if (version > 10) {
            throw new Error("The content is too long. This generator supports QR versions 1-10.");
        }
        var codewords = createCodewords(version, level, bytes);
        var bestMask = 0;
        var bestScore = Number.MAX_VALUE;
        for (var mask = 0; mask < 8; mask++) {
            var testMatrix = buildMatrix(version, level, codewords, mask);
            var score = lostPoints(testMatrix);
            if (score < bestScore) {
                bestScore = score;
                bestMask = mask;
            }
        }
        return {matrix: buildMatrix(version, level, codewords, bestMask), version: version};
    }

    function blackColor() {
        if (doc && doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 100;
            return cmyk;
        }
        var color = new RGBColor();
        color.red = 0;
        color.green = 0;
        color.blue = 0;
        return color;
    }

    function whiteColor() {
        if (doc && doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 0;
            return cmyk;
        }
        var color = new RGBColor();
        color.red = 255;
        color.green = 255;
        color.blue = 255;
        return color;
    }

    function assertEditableLayer(layer) {
        var current = layer;
        while (current && current.typename !== "Document") {
            try {
                if (current.typename === "Layer" &&
                        (current.locked || !current.visible || current.editable === false)) {
                    throw new Error(
                        "The destination layer is locked, hidden, isolated, or otherwise not editable."
                    );
                }
                current = current.parent;
            } catch (error) {
                if (error && error.message &&
                        error.message.indexOf("destination layer") !== -1) {
                    throw error;
                }
                throw new Error("Illustrator could not verify the destination layer.");
            }
        }
    }

    function normalizeEditingContext() {
        // New top-level layers cannot be edited while Illustrator is focused
        // inside an isolated object. Exit every isolation level and reset the
        // drawing mode before creating the QR artwork.
        for (var pass = 0; pass < 12; pass++) {
            try {
                app.executeMenuCommand("exitFocus");
            } catch (ignoreExitIsolation) {
                break;
            }
        }
        try {
            app.executeMenuCommand("Adobe Draw Normal");
        } catch (ignoreDrawMode) {}
        try { app.redraw(); } catch (ignoreContextRedraw) {}
    }

    function isFinderModule(row, column, size) {
        return (row <= 6 && column <= 6) ||
            (row <= 6 && column >= size - 7) ||
            (row >= size - 7 && column <= 6);
    }

    function getRoundedRectSpline(top, left, width, height, radius, clockwise) {
        var r = Math.min(radius, width / 2, height / 2);
        var right = left + width;
        var bottom = top - height;
        var k = r * 0.5522847498;

        var cwAnchors = [
            [left + r, top],
            [right - r, top],
            [right, top - r],
            [right, bottom + r],
            [right - r, bottom],
            [left + r, bottom],
            [left, bottom + r],
            [left, top - r]
        ];
        var cwLeft = [
            [left + r - k, top],
            cwAnchors[1],
            [right, top - r + k],
            cwAnchors[3],
            [right - r + k, bottom],
            cwAnchors[5],
            [left, bottom + r - k],
            cwAnchors[7]
        ];
        var cwRight = [
            cwAnchors[0],
            [right - r + k, top],
            cwAnchors[2],
            [right, bottom + r - k],
            cwAnchors[4],
            [left + r - k, bottom],
            cwAnchors[6],
            [left, top - r + k]
        ];

        if (clockwise) {
            return { anchors: cwAnchors, leftDirections: cwLeft, rightDirections: cwRight };
        }

        var ccwAnchors = [];
        var ccwLeft = [];
        var ccwRight = [];
        var count = cwAnchors.length;
        for (var i = 0; i < count; i++) {
            var idx = (count - i) % count;
            ccwAnchors.push(cwAnchors[idx]);
            ccwLeft.push(cwRight[idx]);
            ccwRight.push(cwLeft[idx]);
        }
        return { anchors: ccwAnchors, leftDirections: ccwLeft, rightDirections: ccwRight };
    }

    function addRoundedFinder(group, top, left, moduleSize, fill, opaqueBackground) {
        var outerRadius = moduleSize * 2.1;
        var gapRadius = moduleSize * 1.1;
        var shapeCount = 0;

        // 1. Outer Ring as a true hollow CompoundPath (CW outer squircle + CCW inner squircle cutout)
        try {
            var compound = group.compoundPathItems.add();
            var outerSpline = getRoundedRectSpline(
                top, left,
                moduleSize * 7, moduleSize * 7,
                outerRadius, true
            );
            var innerSpline = getRoundedRectSpline(
                top - moduleSize, left + moduleSize,
                moduleSize * 5, moduleSize * 5,
                gapRadius, false
            );
            addBezierPath(compound, outerSpline.anchors, outerSpline.leftDirections, outerSpline.rightDirections, fill);
            addBezierPath(compound, innerSpline.anchors, innerSpline.leftDirections, innerSpline.rightDirections, fill);
            compound.stroked = false;
            compound.filled = true;
            try { compound.fillColor = fill; } catch (eRCF) {}
            shapeCount++;
        } catch (eCompound) {
            var outer = group.pathItems.roundedRectangle(
                top, left,
                moduleSize * 7, moduleSize * 7,
                outerRadius, outerRadius
            );
            outer.stroked = false;
            outer.filled = true;
            outer.fillColor = fill;
            shapeCount++;
        }

        // 2. White middle gap if opaque background is enabled
        if (opaqueBackground) {
            var middle = group.pathItems.roundedRectangle(
                top - moduleSize, left + moduleSize,
                moduleSize * 5, moduleSize * 5,
                gapRadius, gapRadius
            );
            middle.stroked = false;
            middle.filled = true;
            middle.fillColor = whiteColor();
            shapeCount++;
        }

        // 3. Center eye dot (Authentic circular center matching Telegram's official eye style)
        var center = group.pathItems.ellipse(
            top - moduleSize * 2, left + moduleSize * 2,
            moduleSize * 3, moduleSize * 3
        );
        center.stroked = false;
        center.filled = true;
        center.fillColor = fill;
        shapeCount++;

        return shapeCount;
    }

    function telegramBrandBlue() {
        if (doc && doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 78;
            cmyk.magenta = 39;
            cmyk.yellow = 0;
            cmyk.black = 0;
            return cmyk;
        }
        var color = new RGBColor();
        // Official Telegram Brand Blue #3390EC
        color.red = 51;
        color.green = 144;
        color.blue = 236;
        return color;
    }

    function getTelegramColors(themeName) {
        var isCMYK = doc && doc.documentColorSpace === DocumentColorSpace.CMYK;

        function rgb(r, g, b) {
            var c = new RGBColor();
            c.red = r; c.green = g; c.blue = b;
            return c;
        }

        function cmyk(c, m, y, k) {
            var col = new CMYKColor();
            col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
            return col;
        }

        if (themeName === "Midnight Dark") {
            return {
                qr: isCMYK ? cmyk(78, 39, 0, 0) : rgb(51, 144, 236),
                cardBg: isCMYK ? cmyk(80, 70, 50, 70) : rgb(23, 33, 43),
                subtitle: isCMYK ? cmyk(25, 15, 10, 0) : rgb(170, 190, 210),
                footer: isCMYK ? cmyk(35, 20, 15, 0) : rgb(140, 165, 190)
            };
        } else if (themeName === "Classic Black") {
            return {
                qr: isCMYK ? cmyk(0, 0, 0, 100) : rgb(0, 0, 0),
                cardBg: isCMYK ? cmyk(0, 0, 0, 92) : rgb(28, 28, 30),
                subtitle: isCMYK ? cmyk(0, 0, 0, 40) : rgb(180, 180, 185),
                footer: isCMYK ? cmyk(0, 0, 0, 50) : rgb(150, 150, 155)
            };
        } else if (themeName === "Vibrant Cyan") {
            return {
                qr: isCMYK ? cmyk(75, 18, 0, 0) : rgb(40, 167, 233),
                cardBg: isCMYK ? cmyk(82, 30, 0, 0) : rgb(24, 138, 212),
                subtitle: isCMYK ? cmyk(15, 2, 0, 0) : rgb(215, 242, 255),
                footer: isCMYK ? cmyk(20, 5, 0, 0) : rgb(200, 235, 255)
            };
        }

        // Official Telegram Blue (Default)
        return {
            qr: isCMYK ? cmyk(78, 39, 0, 0) : rgb(51, 144, 236),
            cardBg: isCMYK ? cmyk(80, 42, 0, 0) : rgb(42, 134, 228),
            subtitle: isCMYK ? cmyk(18, 5, 0, 0) : rgb(210, 235, 255),
            footer: isCMYK ? cmyk(22, 7, 0, 0) : rgb(195, 225, 255)
        };
    }

    function parseTelegramContent(content) {
        var raw = String(content || "").replace(/^\s+|\s+$/g, "");
        var handle = "";
        var title = "";

        var match = raw.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/(?:\+)?([A-Za-z0-9_]+)/i);
        if (match && match[1]) {
            var slug = match[1];
            if (raw.indexOf("/+") !== -1) {
                handle = "Invite Link";
                title = "Telegram Group";
            } else {
                handle = "@" + slug;
                title = formatTelegramTitle(slug);
            }
        } else if (raw.indexOf("@") === 0) {
            handle = raw;
            title = formatTelegramTitle(raw.substring(1));
        } else if (raw.length > 0) {
            handle = raw.length > 25 ? (raw.substring(0, 22) + "...") : raw;
            title = "Telegram Channel";
        }

        return { handle: handle, title: title };
    }

    function formatTelegramTitle(slug) {
        if (!slug) return "Telegram";
        var parts = slug.split("_");
        for (var i = 0, iLen = parts.length; i < iLen; i++) {
            if (parts[i].length > 0) {
                parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
            }
        }
        return parts.join(" ");
    }

    function buildTelegramCard(drawingTarget, qrCenter, qrSize, cardTheme, titleText, handleText) {
        var centerX = qrCenter[0];
        var centerY = qrCenter[1];

        // Card Dimensions (Ratio approx 1:1.38, standard Telegram Share Card aspect)
        var cardW = qrSize * 1.40;
        var cardH = qrSize * 1.90;
        var cardRadius = qrSize * 0.085;

        // The white QR tile is size qrSize + 2 * padding
        var tilePad = qrSize * 0.055;
        var tileW = qrSize + tilePad * 2;
        var tileH = qrSize + tilePad * 2;
        var tileRadius = qrSize * 0.065;
        var tileTop = centerY + (qrSize / 2) + tilePad;
        var tileLeft = centerX - (qrSize / 2) - tilePad;

        // Card Top & Left
        var cardTop = tileTop + (qrSize * 0.50);
        var cardLeft = centerX - (cardW / 2);

        // 1. Card Background
        var cardBg = drawingTarget.pathItems.roundedRectangle(
            cardTop, cardLeft, cardW, cardH, cardRadius, cardRadius
        );
        cardBg.name = "Telegram Card Background";
        cardBg.stroked = false;
        cardBg.filled = true;
        cardBg.fillColor = cardTheme.cardBg;

        // 2. White QR Tile
        var whiteTile = drawingTarget.pathItems.roundedRectangle(
            tileTop, tileLeft, tileW, tileH, tileRadius, tileRadius
        );
        whiteTile.name = "QR White Tile";
        whiteTile.stroked = false;
        whiteTile.filled = true;
        whiteTile.fillColor = whiteColor();

        // 3. Avatar (Header)
        var avatarDia = qrSize * 0.24;
        var avatarCenterY = cardTop - (qrSize * 0.16);

        var avatarOuter = drawingTarget.pathItems.ellipse(
            avatarCenterY + (avatarDia / 2),
            centerX - (avatarDia / 2),
            avatarDia, avatarDia
        );
        avatarOuter.stroked = false;
        avatarOuter.filled = true;
        avatarOuter.fillColor = whiteColor();
        avatarOuter.name = "Avatar Outer";

        var avatarInnerDia = avatarDia * 0.90;
        var avatarInner = drawingTarget.pathItems.ellipse(
            avatarCenterY + (avatarInnerDia / 2),
            centerX - (avatarInnerDia / 2),
            avatarInnerDia, avatarInnerDia
        );
        avatarInner.stroked = false;
        avatarInner.filled = true;
        avatarInner.fillColor = cardTheme.qr;
        avatarInner.name = "Avatar Inner";

        addTelegramPlane(drawingTarget, centerX, avatarCenterY, avatarInnerDia, whiteColor());

        // 4. Title (Display Name)
        var titleFrame = drawingTarget.textFrames.add();
        titleFrame.contents = titleText || "Telegram";
        titleFrame.name = "Title Text";
        var titleFontSize = Math.max(9, Math.round(qrSize * 0.078));
        try {
            titleFrame.textRange.characterAttributes.size = titleFontSize;
            titleFrame.textRange.characterAttributes.fillColor = whiteColor();
            titleFrame.textRange.paragraphAttributes.justification = Justification.CENTER;
        } catch (eT1) {}
        var titleTopY = avatarCenterY - (avatarDia / 2) - (qrSize * 0.025);
        titleFrame.top = titleTopY;
        titleFrame.left = centerX - (titleFrame.width / 2);

        // 5. Handle (@username)
        var handleFrame = drawingTarget.textFrames.add();
        handleFrame.contents = handleText || "@telegram";
        handleFrame.name = "Handle Text";
        var handleFontSize = Math.max(7, Math.round(qrSize * 0.055));
        try {
            handleFrame.textRange.characterAttributes.size = handleFontSize;
            handleFrame.textRange.characterAttributes.fillColor = cardTheme.subtitle;
            handleFrame.textRange.paragraphAttributes.justification = Justification.CENTER;
        } catch (eT2) {}
        var handleTopY = titleTopY - titleFrame.height - (qrSize * 0.010);
        handleFrame.top = handleTopY;
        handleFrame.left = centerX - (handleFrame.width / 2);

        // 6. Footer Caption
        var footerFrame = drawingTarget.textFrames.add();
        footerFrame.contents = OZO.tr("Scan with camera to open on Telegram");
        footerFrame.name = "Footer Caption";
        var footerFontSize = Math.max(6, Math.round(qrSize * 0.042));
        try {
            footerFrame.textRange.characterAttributes.size = footerFontSize;
            footerFrame.textRange.characterAttributes.fillColor = cardTheme.footer;
            footerFrame.textRange.paragraphAttributes.justification = Justification.CENTER;
        } catch (eT3) {}
        var tileBottom = tileTop - tileH;
        var footerTopY = tileBottom - (qrSize * 0.038);
        footerFrame.top = footerTopY;
        footerFrame.left = centerX - (footerFrame.width / 2);

        return {
            cardBg: cardBg,
            whiteTile: whiteTile
        };
    }

    function setBezierPoint(point, anchor, leftDirection, rightDirection) {
        point.anchor = anchor;
        point.leftDirection = leftDirection || anchor;
        point.rightDirection = rightDirection || anchor;
        point.pointType = PointType.CORNER;
    }

    function addBezierPath(container, anchors, leftDirections, rightDirections, fill) {
        var path = container.pathItems.add();
        for (var index = 0, indexLen = anchors.length; index < indexLen; index++) {
            var point = path.pathPoints.add();
            setBezierPoint(point, anchors[index], leftDirections[index], rightDirections[index]);
        }
        path.closed = true;
        path.stroked = false;
        path.filled = true;
        path.fillColor = fill;
        return path;
    }

    function recordingPathContainer(container, items) {
        function remember(item) {
            items.push(item);
            return item;
        }
        return {
            pathItems: {
                add: function () {
                    return remember(container.pathItems.add());
                },
                rectangle: function (top, left, width, height) {
                    return remember(container.pathItems.rectangle(top, left, width, height));
                },
                roundedRectangle: function (top, left, width, height,
                        horizontalRadius, verticalRadius) {
                    return remember(container.pathItems.roundedRectangle(
                        top, left, width, height, horizontalRadius, verticalRadius
                    ));
                },
                ellipse: function (top, left, width, height) {
                    return remember(container.pathItems.ellipse(top, left, width, height));
                }
            },
            textFrames: {
                add: function () {
                    return remember(container.textFrames.add());
                }
            },
            compoundPathItems: {
                add: function () {
                    return remember(container.compoundPathItems.add());
                }
            }
        };
    }

    function addTelegramModule(group, top, left, moduleSize, radii, fill) {
        if (radii[0] === 0 && radii[1] === 0 && radii[2] === 0 && radii[3] === 0) {
            var square = group.pathItems.rectangle(top, left, moduleSize, moduleSize);
            square.stroked = false;
            square.filled = true;
            square.fillColor = fill;
            return square;
        }
        var right = left + moduleSize;
        var bottom = top - moduleSize;
        var tl = radii[0];
        var tr = radii[1];
        var br = radii[2];
        var bl = radii[3];
        var kappa = 0.5522847498;
        var anchors = [
            [left + tl, top],
            [right - tr, top],
            [right, top - tr],
            [right, bottom + br],
            [right - br, bottom],
            [left + bl, bottom],
            [left, bottom + bl],
            [left, top - tl]
        ];
        var leftDirections = [
            [left + tl - tl * kappa, top],
            anchors[1],
            [right, top - tr + tr * kappa],
            anchors[3],
            [right - br + br * kappa, bottom],
            anchors[5],
            [left, bottom + bl - bl * kappa],
            anchors[7]
        ];
        var rightDirections = [
            anchors[0],
            [right - tr + tr * kappa, top],
            anchors[2],
            [right, bottom + br - br * kappa],
            anchors[4],
            [left + bl - bl * kappa, bottom],
            anchors[6],
            [left, top - tl + tl * kappa]
        ];

        // A square corner produces two identical anchors in the eight-point
        // rounded outline. Some Illustrator versions reject those zero-length
        // segments with the misleading "Target layer cannot be modified" error.
        var compactAnchors = [];
        var compactLeft = [];
        var compactRight = [];
        function sameAnchor(first, second) {
            return Math.abs(first[0] - second[0]) < 0.000001 &&
                Math.abs(first[1] - second[1]) < 0.000001;
        }
        for (var anchorIndex = 0, anchorIndexLen = anchors.length; anchorIndex < anchorIndexLen; anchorIndex++) {
            var lastIndex = compactAnchors.length - 1;
            if (lastIndex >= 0 && sameAnchor(compactAnchors[lastIndex], anchors[anchorIndex])) {
                compactRight[lastIndex] = rightDirections[anchorIndex];
            } else {
                compactAnchors.push(anchors[anchorIndex]);
                compactLeft.push(leftDirections[anchorIndex]);
                compactRight.push(rightDirections[anchorIndex]);
            }
        }
        if (compactAnchors.length > 1 &&
                sameAnchor(compactAnchors[0], compactAnchors[compactAnchors.length - 1])) {
            compactLeft[0] = compactLeft[compactLeft.length - 1];
            compactAnchors.pop();
            compactLeft.pop();
            compactRight.pop();
        }

        return addBezierPath(group, compactAnchors, compactLeft, compactRight, fill);
    }

    function addTelegramConcaveCorner(group, top, left, moduleSize, corner, fill) {
        var right = left + moduleSize;
        var bottom = top - moduleSize;
        var radius = moduleSize * 0.5;
        var kappa = 0.5522847498;
        var anchors;
        var firstControl;
        var secondControl;

        if (corner === 0) { // Top left.
            anchors = [[left, top], [left + radius, top], [left, top - radius]];
            firstControl = [left + radius - radius * kappa, top];
            secondControl = [left, top - radius + radius * kappa];
        } else if (corner === 1) { // Top right.
            anchors = [[right, top], [right - radius, top], [right, top - radius]];
            firstControl = [right - radius + radius * kappa, top];
            secondControl = [right, top - radius + radius * kappa];
        } else if (corner === 2) { // Bottom right.
            anchors = [[right, bottom], [right, bottom + radius], [right - radius, bottom]];
            firstControl = [right, bottom + radius - radius * kappa];
            secondControl = [right - radius + radius * kappa, bottom];
        } else { // Bottom left.
            anchors = [[left, bottom], [left + radius, bottom], [left, bottom + radius]];
            firstControl = [left + radius - radius * kappa, bottom];
            secondControl = [left, bottom + radius - radius * kappa];
        }

        return addBezierPath(
            group,
            anchors,
            [anchors[0], anchors[1], secondControl],
            [anchors[0], firstControl, anchors[2]],
            fill
        );
    }

    function telegramLogoPoint(centerX, centerY, scale, point) {
        return [
            centerX + (point[0] - 75) * scale,
            centerY - (point[1] - 75) * scale
        ];
    }

    function addTelegramPlane(group, centerX, centerY, diameter, fill) {
        // Official Telegram Android qr_logo.svg paper-plane path.
        var nodes = [
            [[34.5683,73.8431],[31.0376,75.2445],[56.3116,64.3878]],
            [[78.0650,55.1426],[70.8104,58.1543],[98.7782,46.5436]],
            [[105.8876,45.0000],[103.0823,45.0499],[106.5046,44.9897]],
            [[108.7778,45.8660],[107.8841,45.1423],[109.5323,46.4772]],
            [[109.8393,47.8821],[109.7399,47.3027],[109.9386,48.4615]],
            [[109.9640,50.8127],[110.0623,49.7814],[108.8415,62.5841]],
            [[101.5138,104.3345],[103.9847,91.1503],[100.4683,109.9132]],
            [[96.4166,111.9668],[98.4096,111.7837],[92.0852,112.3646]],
            [[84.6011,106.3650],[88.7962,109.1098],[78.0366,102.0701]],
            [[67.9561,95.2053],[74.3281,99.3964],[60.5922,90.3618]],
            [[69.5626,83.3491],[65.3659,87.6997],[70.6609,82.2105]],
            [[90.1142,63.3134],[89.7448,64.8851],[90.1604,63.1168]],
            [[89.7671,61.9972],[90.2032,62.3841],[89.3310,61.6103]],
            [[88.2229,61.8478],[88.6873,61.7426],[87.5645,61.9970]],
            [[56.7622,82.6028],[77.0776,68.9153],[53.7855,84.6430]],
            [[48.6737,85.5849],[51.0894,85.6370],[46.0106,85.5275]],
            [[37.0797,82.8464],[40.8879,84.0820],[32.4087,81.3310]],
            [[29.0196,77.9560],[28.6964,80.5297],[29.1880,76.6155]]
        ];
        var scale = diameter / 150;
        var anchors = [];
        for (var index = 0, indexLen = nodes.length; index < indexLen; index++) {
            anchors.push(telegramLogoPoint(centerX, centerY, scale, nodes[index][0]));
        }
        var leftDirections = [];
        var rightDirections = [];
        for (var index = 0, indexLen = nodes.length; index < indexLen; index++) {
            leftDirections.push(
                telegramLogoPoint(centerX, centerY, scale, nodes[index][1])
            );
            rightDirections.push(
                telegramLogoPoint(centerX, centerY, scale, nodes[index][2])
            );
        }
        return addBezierPath(group, anchors, leftDirections, rightDirections, fill);
    }

    function addTelegramBadge(group, centerX, centerY, moduleSize, matrixSize, logoColor) {
        var white = whiteColor();
        var blue = logoColor || telegramBrandBlue();
        var cutout = telegramCutout(matrixSize);
        var badgeRadius = (cutout[1] - cutout[0]) * moduleSize / 2;
        var logoRadius = badgeRadius * 0.84;

        var badge = group.pathItems.ellipse(
            centerY + badgeRadius,
            centerX - badgeRadius,
            badgeRadius * 2,
            badgeRadius * 2
        );
        badge.stroked = false;
        badge.filled = true;
        badge.fillColor = white;

        var logo = group.pathItems.ellipse(
            centerY + logoRadius,
            centerX - logoRadius,
            logoRadius * 2,
            logoRadius * 2
        );
        logo.stroked = false;
        logo.filled = true;
        logo.fillColor = blue;

        addTelegramPlane(group, centerX, centerY, logoRadius * 2, white);
        return 3;
    }

    function telegramCutout(size) {
        var cutoutSize = Math.round(size / 4.65);
        if (cutoutSize % 2 !== size % 2) {
            cutoutSize++;
        }
        var start = Math.floor((size - cutoutSize) / 2);
        return [start, start + cutoutSize];
    }

    function telegramVisibleGrid(matrix, cutout) {
        // One-cell padding removes bounds checks from the hot drawing loops.
        var grid = [];
        var size = matrix.length;
        var row;
        var column;
        for (row = 0; row < size + 2; row++) {
            grid[row] = [];
            for (column = 0; column < size + 2; column++) {
                grid[row][column] = false;
            }
        }
        for (row = 0; row < size; row++) {
            for (column = 0; column < size; column++) {
                grid[row + 1][column + 1] = matrix[row][column] &&
                    !isFinderModule(row, column, size) &&
                    !(row >= cutout[0] && row < cutout[1] &&
                    column >= cutout[0] && column < cutout[1]);
            }
        }
        return grid;
    }

    function addVectorQr(encoded, sizePoints, quietZone, includeBackground, newLayer,
            outputStyle, telegramOptions) {
        normalizeEditingContext();
        var layer = doc.activeLayer;
        var previousActiveLayer = layer;
        var createdLayer = null;
        var group = null;
        var createdPaths = [];
        var drawingTarget = null;
        var compound = null;
        try {
            if (newLayer) {
                createdLayer = doc.layers.add();
                createdLayer.name = "QR Code";
                createdLayer.locked = false;
                createdLayer.visible = true;
                layer = createdLayer;
            } else {
                assertEditableLayer(layer);
            }

            // Illustrator validates the active layer during path mutations even
            // when a PathItem was requested from a different collection. Make
            // the actual destination active before building any QR geometry.
            try {
                doc.activeLayer = layer;
            } catch (activationError) {
                throw new Error(
                    "Illustrator could not activate the editable QR destination layer. " +
                    errorMessage(activationError)
                );
            }
            assertEditableLayer(layer);

            // Build paths directly on the active layer. Certain Illustrator
            // document states let a GroupItem be created but reject every
            // attempt to modify a child path inside it. Group only after all
            // paths have been fully styled.
            drawingTarget = recordingPathContainer(layer, createdPaths);
            var matrix = encoded.matrix;
            var totalModules = matrix.length + quietZone * 2;
            var moduleSize = sizePoints / totalModules;
            var artboardIndex = doc.artboards.getActiveArtboardIndex();
            var bounds = doc.artboards[artboardIndex].artboardRect;
            var left = bounds[0] + ((bounds[2] - bounds[0]) - sizePoints) / 2;
            var top = bounds[1] - ((bounds[1] - bounds[3]) - sizePoints) / 2;

            var isShareCard = outputStyle === "Telegram 2026 (Share Card)";
            var isQrOnly = outputStyle === "Telegram 2026 (QR Only)";
            var telegramStyle = isShareCard || isQrOnly || outputStyle === "Telegram 2026";
            var themeName = (telegramOptions && telegramOptions.theme) ? telegramOptions.theme : "Official Telegram Blue";
            var cardTheme = getTelegramColors(themeName);
            var fill = telegramStyle ? cardTheme.qr : blackColor();

            var background = null;
            if (includeBackground && !isShareCard) {
                background = drawingTarget.pathItems.rectangle(top, left, sizePoints, sizePoints);
                background.stroked = false;
                background.filled = true;
                background.fillColor = whiteColor();
                background.name = "Quiet Zone";
            }

            if (isShareCard) {
                buildTelegramCard(
                    drawingTarget,
                    [left + sizePoints / 2, top - sizePoints / 2],
                    sizePoints,
                    cardTheme,
                    telegramOptions ? telegramOptions.title : "Telegram",
                    telegramOptions ? telegramOptions.handle : "@telegram"
                );
            }
            var rectangleCount = 0;
            var row;
            var column;
            if (telegramStyle) {
                var cornerRadius = moduleSize * 0.5;
                var cutout = telegramCutout(matrix.length);
                var visibleGrid = telegramVisibleGrid(matrix, cutout);
                for (var row = 0, rowLen = matrix.length; row < rowLen; row++) {
                    for (var column = 0, columnLen = matrix.length; column < columnLen; column++) {
                        var gridRow = row + 1;
                        var gridColumn = column + 1;
                        if (!visibleGrid[gridRow][gridColumn]) {
                            continue;
                        }
                        var hasUp = visibleGrid[gridRow - 1][gridColumn];
                        var hasDown = visibleGrid[gridRow + 1][gridColumn];
                        var hasLeft = visibleGrid[gridRow][gridColumn - 1];
                        var hasRight = visibleGrid[gridRow][gridColumn + 1];
                        addTelegramModule(
                            drawingTarget,
                            top - (row + quietZone) * moduleSize,
                            left + (column + quietZone) * moduleSize,
                            moduleSize,
                            [
                                !hasUp && !hasLeft ? cornerRadius : 0,
                                !hasUp && !hasRight ? cornerRadius : 0,
                                !hasDown && !hasRight ? cornerRadius : 0,
                                !hasDown && !hasLeft ? cornerRadius : 0
                            ],
                            fill
                        );
                        rectangleCount++;
                    }
                }
                // Telegram fills inverse corner joins where three neighboring
                // modules meet around an otherwise white cell.
                for (var row = 0, rowLen = matrix.length; row < rowLen; row++) {
                    for (var column = 0, columnLen = matrix.length; column < columnLen; column++) {
                        gridRow = row + 1;
                        gridColumn = column + 1;
                        if (visibleGrid[gridRow][gridColumn] ||
                                isFinderModule(row, column, matrix.length) ||
                                (row >= cutout[0] && row < cutout[1] &&
                                column >= cutout[0] && column < cutout[1])) {
                            continue;
                        }
                        var cellTop = top - (row + quietZone) * moduleSize;
                        var cellLeft = left + (column + quietZone) * moduleSize;
                        if (visibleGrid[gridRow - 1][gridColumn - 1] &&
                                visibleGrid[gridRow - 1][gridColumn] &&
                                visibleGrid[gridRow][gridColumn - 1]) {
                            addTelegramConcaveCorner(drawingTarget, cellTop, cellLeft,
                                moduleSize, 0, fill);
                            rectangleCount++;
                        }
                        if (visibleGrid[gridRow - 1][gridColumn + 1] &&
                                visibleGrid[gridRow - 1][gridColumn] &&
                                visibleGrid[gridRow][gridColumn + 1]) {
                            addTelegramConcaveCorner(drawingTarget, cellTop, cellLeft,
                                moduleSize, 1, fill);
                            rectangleCount++;
                        }
                        if (visibleGrid[gridRow + 1][gridColumn + 1] &&
                                visibleGrid[gridRow + 1][gridColumn] &&
                                visibleGrid[gridRow][gridColumn + 1]) {
                            addTelegramConcaveCorner(drawingTarget, cellTop, cellLeft,
                                moduleSize, 2, fill);
                            rectangleCount++;
                        }
                        if (visibleGrid[gridRow + 1][gridColumn - 1] &&
                                visibleGrid[gridRow + 1][gridColumn] &&
                                visibleGrid[gridRow][gridColumn - 1]) {
                            addTelegramConcaveCorner(drawingTarget, cellTop, cellLeft,
                                moduleSize, 3, fill);
                            rectangleCount++;
                        }
                    }
                }
                rectangleCount += addRoundedFinder(
                    drawingTarget,
                    top - quietZone * moduleSize,
                    left + quietZone * moduleSize,
                    moduleSize,
                    fill,
                    includeBackground
                );
                rectangleCount += addRoundedFinder(
                    drawingTarget,
                    top - quietZone * moduleSize,
                    left + (quietZone + matrix.length - 7) * moduleSize,
                    moduleSize,
                    fill,
                    includeBackground
                );
                rectangleCount += addRoundedFinder(
                    drawingTarget,
                    top - (quietZone + matrix.length - 7) * moduleSize,
                    left + quietZone * moduleSize,
                    moduleSize,
                    fill,
                    includeBackground
                );
                rectangleCount += addTelegramBadge(
                    drawingTarget,
                    left + sizePoints / 2,
                    top - sizePoints / 2,
                    moduleSize,
                    matrix.length,
                    fill
                );
            } else {
                for (var row = 0, rowLen = matrix.length; row < rowLen; row++) {
                    column = 0;
                    while (column < matrix.length) {
                        if (!matrix[row][column]) {
                            column++;
                            continue;
                        }
                        var runStart = column;
                        while (column < matrix.length && matrix[row][column]) column++;
                        var runLength = column - runStart;
                        var rectangle = drawingTarget.pathItems.rectangle(
                            top - (row + quietZone) * moduleSize,
                            left + (runStart + quietZone) * moduleSize,
                            runLength * moduleSize,
                            moduleSize
                        );
                        rectangle.stroked = false;
                        rectangle.filled = true;
                        rectangle.fillColor = fill;
                        rectangleCount++;
                    }
                }
            }
            group = layer.groupItems.add();
            group.name = isShareCard ?
                ("Telegram QR Card - " + (telegramOptions ? (telegramOptions.handle || telegramOptions.title) : "Card")) :
                ("Telegram QR Code v" + encoded.version);
            group.locked = false;
            group.hidden = false;
            for (var moveIndex = createdPaths.length - 1; moveIndex >= 0; moveIndex--) {
                try {
                    createdPaths[moveIndex].move(group, ElementPlacement.PLACEATEND);
                } catch (eMove) {}
            }
            if (background && !isShareCard) {
                try { background.zOrder(ZOrderMethod.SENDTOBACK); } catch (eBg) {}
            }
            doc.selection = null;
            group.selected = true;
            app.redraw();
            return {group: group, rectangles: rectangleCount, modules: matrix.length};
        } catch (error) {
            if (group) {
                try { group.remove(); } catch (ignoreGroupRemoval) {}
            }
            if (compound) {
                try { compound.remove(); } catch (ignoreCompoundRemoval) {}
            }
            for (var cleanupIndex = createdPaths.length - 1; cleanupIndex >= 0; cleanupIndex--) {
                try { createdPaths[cleanupIndex].remove(); } catch (ignorePathRemoval) {}
            }
            if (createdLayer) {
                try { createdLayer.remove(); } catch (ignoreLayerRemoval) {}
            }
            try {
                if (previousActiveLayer) {
                    doc.activeLayer = previousActiveLayer;
                }
            } catch (ignoreActiveLayerRestore) {}
            throw error;
        }
    }

    // Check for Headless Dock Execution
    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        var p = __ozoHeadlessParams;
        var qrContent = p.content;
        if (!qrContent || qrContent.length === 0) {
            __ozoHeadlessResult = { status: "error", message: "Enter text, a URL, contact data, or other QR content." };
            return;
        }
        var qrSize = parsePositiveNumber(p.size);
        if (!isFinite(qrSize) || qrSize <= 0) {
            __ozoHeadlessResult = { status: "error", message: "Enter a finished size greater than zero." };
            return;
        }
        var qrQuietZone = parsePositiveNumber(p.quietZone != null ? p.quietZone : 4);
        if (!isFinite(qrQuietZone) || qrQuietZone < 0) qrQuietZone = 4;

        var qrUnit = p.unit || "mm";
        var qrSizeMillimeters = qrSize * unitToMillimeters(qrUnit);
        var qrOutputStyle = p.style || "Normal";
        var isTg = (qrOutputStyle.indexOf("Telegram") !== -1);
        var qrLevel = isTg ? "M" : (p.level || "M");

        var tgOptions = {
            isCard: (qrOutputStyle === "Telegram 2026 (Share Card)"),
            theme: p.telegramTheme || "Official Telegram Blue",
            title: p.telegramTitle || "Telegram",
            handle: p.telegramHandle || "@telegram"
        };

        try {
            var encoded = encodeQr(qrContent, qrLevel);
            var output = addVectorQr(
                encoded,
                qrSizeMillimeters * POINTS_PER_MM,
                qrQuietZone,
                p.background !== false,
                p.newLayer === true,
                qrOutputStyle,
                tgOptions
            );
            __ozoHeadlessResult = {
                status: "success",
                message: "QR code generated successfully.",
                version: encoded.version,
                modules: output.modules,
                style: qrOutputStyle,
                size: formatMeasurement(qrSize) + " " + qrUnit
            };
        } catch (err) {
            __ozoHeadlessResult = { status: "error", message: errorMessage(err) };
        }
        return;
    }

    var dialog = new Window("dialog", SCRIPT_NAME);
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 12;
    dialog.margins = 16;
    dialog.minimumSize = [500, 620];

    OZO.addDialogHeader(dialog, OZO.tr("Generate QR Code"), "v2.2 \u2022 Offline Vector QR Generator");

    var contentPanel = dialog.add("panel", undefined, OZO.tr("QR Content"));
    contentPanel.orientation = "column";
    contentPanel.alignChildren = ["fill", "top"];
    contentPanel.margins = [14, 20, 14, 12];
    var contentInput = contentPanel.add("edittext", undefined, "https://", {
        multiline: true,
        scrolling: true
    });
    contentInput._ozoNoSave = true;
    contentInput.preferredSize = [430, 90];
    var templateRow = contentPanel.add("group");
    templateRow.add("statictext", undefined, "Content template:");
    var templateList = templateRow.add("dropdownlist", undefined,
        ["URL", "Wi-Fi", "Email", "Phone", "Contact card"]);
    templateList.selection = 0;
    templateList.preferredSize.width = 150;
    var templateButton = templateRow.add("button", undefined, "Insert Template");
    var importRow = contentPanel.add("group");
    importRow.orientation = "row";
    importRow.alignChildren = ["left", "center"];
    var importQrButton = importRow.add("button", undefined, "Import Old QR Image...");
    var importStatus = importRow.add("statictext", undefined, "PNG, JPG, BMP, GIF, or TIFF");
    importStatus.characters = 28;

    importQrButton.onClick = function () {
        var filter = Folder.fs === "Windows" ?
            "QR images:*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.tif;*.tiff" :
            function (file) {
                if (file instanceof Folder) return true;
                return /\.(png|jpe?g|bmp|gif|tiff?)$/i.test(file.name);
            };
        var imageFile = File.openDialog(
            OZO.isKhmer() ? "\u1787\u17d2\u179a\u17be\u179f\u179a\u17bc\u1794\u1797\u17b6\u1796\u1780\u17bc\u178a QR \u1785\u17b6\u179f\u17cb" : "Choose an old QR code image",
            filter,
            false
        );
        if (!imageFile) {
            return;
        }
        importQrButton.enabled = false;
        importStatus.text = (OZO.isKhmer() ? "\u1780\u17c6\u1796\u17bb\u1784\u17a2\u17b6\u1793 " : "Reading ") +
            File.decode(imageFile.name) + "...";
        dialog.update();
        try {
            var importedContent = decodeQrImage(imageFile);
            contentInput.text = importedContent;
            contentInput.active = true;
            updateQrSummary();
            importStatus.text = (OZO.isKhmer() ? "\u1794\u17b6\u1793\u1795\u17d2\u1791\u17bb\u1780\u17d6 " : "Loaded: ") +
                File.decode(imageFile.name);
        } catch (decodeError) {
            importStatus.text = OZO.isKhmer() ? "\u1780\u17b6\u179a\u1793\u17b6\u17c6\u1785\u17bc\u179b\u1794\u179a\u17b6\u1787\u17d0\u1799" : "Import failed";
            alert((OZO.isKhmer() ? "\u1798\u17b7\u1793\u17a2\u17b6\u1785\u17a2\u17b6\u1793\u1780\u17bc\u178a QR \u1785\u17b6\u179f\u17cb\u1794\u17b6\u1793\u1791\u17c1\u17d4" :
                "Could not read the old QR code.") + "\n\n" + errorMessage(decodeError));
        }
        importQrButton.enabled = true;
    };

    var settingsPanel = dialog.add("panel", undefined, "Settings");
    settingsPanel.orientation = "column";
    settingsPanel.alignChildren = ["left", "center"];
    settingsPanel.margins = [14, 20, 14, 12];

    var sizeRow = settingsPanel.add("group");
    sizeRow.add("statictext", undefined, "Finished size:");
    var sizeInput = sizeRow.add("edittext", undefined, "");
    sizeInput.characters = 8;
    var restoringState = true;
    var unitList = sizeRow.add("dropdownlist", undefined, ["mm", "cm", "m", "in"]);
    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "m") defaultUnitIdx = 2;
    else if (defaultDocUnit === "in") defaultUnitIdx = 3;
    unitList.selection = defaultUnitIdx;
    sizeInput.text = formatMeasurement(DEFAULT_SIZE_MM / unitToMillimeters(
        unitList.selection ? unitList.selection.text : "mm"));
    var previousUnit = unitList.selection ? unitList.selection.text : "mm";
    var sizeSmoothOptions = sizeLimitsForUnit(previousUnit);
    unitList.onChange = function () {
        if (restoringState) return;
        if (!unitList.selection) return;
        var newUnit = unitList.selection.text;
        var currentValue = parsePositiveNumber(sizeInput.text);
        if (isFinite(currentValue)) {
            sizeInput.text = formatMeasurement(
                currentValue * unitToMillimeters(previousUnit) /
                    unitToMillimeters(newUnit)
            );
        }
        previousUnit = newUnit;
        var limits = sizeLimitsForUnit(newUnit);
        sizeSmoothOptions.step = limits.step;
        sizeSmoothOptions.min = limits.min;
        sizeSmoothOptions.max = limits.max;
        updateQrSummary();
    };

    var styleRow = settingsPanel.add("group");
    styleRow.add("statictext", undefined, "QR style:");
    var styleList = styleRow.add(
        "dropdownlist",
        undefined,
        ["Normal", "Telegram 2026 (Share Card)", "Telegram 2026 (QR Only)"]
    );
    styleList.selection = 1;

    var telegramPanel = settingsPanel.add("panel", undefined, OZO.tr("Telegram Style Options"));
    telegramPanel.orientation = "column";
    telegramPanel.alignChildren = ["left", "center"];
    telegramPanel.margins = [12, 14, 12, 10];

    var themeRow = telegramPanel.add("group");
    themeRow.add("statictext", undefined, OZO.tr("Color theme:"));
    var themeList = themeRow.add("dropdownlist", undefined, [
        "Official Telegram Blue",
        "Vibrant Cyan",
        "Midnight Dark",
        "Classic Black"
    ]);
    themeList.selection = 0;

    var cardDetailsGroup = telegramPanel.add("group");
    cardDetailsGroup.orientation = "column";
    cardDetailsGroup.alignChildren = ["left", "center"];

    var nameRow = cardDetailsGroup.add("group");
    nameRow.add("statictext", undefined, OZO.tr("Display name:"));
    var nameInput = nameRow.add("edittext", undefined, "Telegram");
    nameInput.characters = 22;
    nameInput._ozoNoSave = true;

    var handleRow = cardDetailsGroup.add("group");
    handleRow.add("statictext", undefined, OZO.tr("Username / link:"));
    var handleInput = handleRow.add("edittext", undefined, "@telegram");
    handleInput.characters = 22;
    handleInput._ozoNoSave = true;

    var userCustomizedName = false;
    var userCustomizedHandle = false;

    nameInput.onChanging = function () { userCustomizedName = true; };
    handleInput.onChanging = function () { userCustomizedHandle = true; };

    function updateTelegramFieldsFromContent() {
        if (!contentInput || !nameInput || !handleInput) return;
        var parsed = parseTelegramContent(contentInput.text);
        if (!userCustomizedName && parsed.title) {
            nameInput.text = parsed.title;
        }
        if (!userCustomizedHandle && parsed.handle) {
            handleInput.text = parsed.handle;
        }
    }

    var correctionRow = settingsPanel.add("group");
    correctionRow.add("statictext", undefined, OZO.tr("Error correction:"));
    var correctionList = correctionRow.add(
        "dropdownlist",
        undefined,
        ["L - 7%", "M - 15%", "Q - 25%", "H - 30%"]
    );
    correctionList.selection = 1;

    var quietRow = settingsPanel.add("group");
    quietRow.add("statictext", undefined, "Quiet zone:");
    var quietInput = quietRow.add("edittext", undefined, "4");
    quietInput.characters = 5;
    quietRow.add("statictext", undefined, "modules (4 recommended)");

    var optionsPanel = dialog.add("panel", undefined, "Vector Output");
    optionsPanel.orientation = "column";
    optionsPanel.alignChildren = ["left", "center"];
    optionsPanel.margins = [14, 20, 14, 12];
    var backgroundCheck = optionsPanel.add("checkbox", undefined, "Add white background / quiet zone");
    backgroundCheck.value = true;
    var newLayerCheck = optionsPanel.add("checkbox", undefined, "Create on a new QR Code layer");
    newLayerCheck.value = true;

    var qrSummary = dialog.add("statictext", undefined,
        "Enter QR content to calculate the version and matrix size.");
    qrSummary.preferredSize.width = 450;
    var qrWarning = dialog.add("statictext", undefined, "", {multiline: true});
    qrWarning.preferredSize = [450, 64];
    qrWarning._ozoSkipTranslate = true;

    var note = dialog.add(
        "statictext",
        undefined,
        "Import an old QR image or enter content manually, then create a fresh editable vector QR. No internet connection is used.",
        {multiline: true}
    );
    note.preferredSize = [430, 34];

    styleList.onChange = function () {
        var idx = styleList.selection ? styleList.selection.index : 0;
        var isNormal = idx === 0;
        var isShareCard = idx === 1;
        var isQrOnly = idx === 2;
        var isTelegram = isShareCard || isQrOnly;

        if (isTelegram) {
            correctionList.selection = 1;
        }
        correctionList.enabled = !isTelegram;

        telegramPanel.visible = isTelegram;
        cardDetailsGroup.visible = isShareCard;

        if (isTelegram) {
            updateTelegramFieldsFromContent();
        }

        var styleNote = isShareCard ?
            "Telegram 2026 (Share Card) generates the authentic Telegram card layout (rounded card, avatar badge, name, username, and Telegram Blue QR) exactly like saving from Telegram." :
            (isQrOnly ?
                "Telegram 2026 (QR Only) generates the standalone Telegram Blue vector QR code with connected rounded modules, squircle finders, and official paper-plane badge." :
                "Normal style creates editable square vector modules. No internet connection is used.");

        note._ozoEnglishText = styleNote;
        note.text = OZO.tr(styleNote);
        if (dialog.layout) {
            dialog.layout.layout(true);
        }
        updateQrSummary();
    };

    function updateQrSummary() {
        var value = contentInput.text;
        if (!value.length) {
            qrWarning.text = "";
            qrSummary.text = OZO.tr(
                "Enter QR content to calculate the version and matrix size.");
            return;
        }
        var sizeValue = parsePositiveNumber(sizeInput.text);
        if (!isFinite(sizeValue) || sizeValue <= 0) {
            qrWarning.text = "";
            qrSummary.text = OZO.tr("Not ready") + " | " +
                OZO.tr("Enter a finished size greater than zero.");
            return;
        }
        var quietValue = parsePositiveNumber(quietInput.text);
        if (!isFinite(quietValue) || quietValue < 0 ||
                quietValue !== Math.floor(quietValue) || quietValue > 20) {
            qrWarning.text = "";
            qrSummary.text = OZO.tr("Not ready") + " | " +
                OZO.tr("Enter a whole-number quiet zone from 0 to 20 modules.");
            return;
        }
        var styleIdx = styleList.selection ? styleList.selection.index : 0;
        var telegramStyle = styleIdx === 1 || styleIdx === 2;
        var level = telegramStyle ? "M" :
            ["L", "M", "Q", "H"][correctionList.selection ?
                correctionList.selection.index : 1];
        try {
            var previewEncoding = encodeQr(value, level);
            qrSummary.text = OZO.tr("Ready") + " | " + unicodeCharacterCount(value) + " " +
                OZO.tr("character(s)") + " | " + OZO.tr("Version") + " " +
                previewEncoding.version + " | " + previewEncoding.matrix.length + " x " +
                previewEncoding.matrix.length + " " + OZO.tr("modules") + " | " +
                OZO.tr("Level") + " " + level;
            var unit = unitList.selection ? unitList.selection.text : "mm";
            qrWarning.text = qrScanWarning(
                previewEncoding.matrix.length,
                sizeValue,
                unit,
                quietValue,
                backgroundCheck.value,
                telegramStyle
            );
        } catch (summaryError) {
            qrWarning.text = "";
            qrSummary.text = OZO.tr("Not ready") + " | " +
                OZO.tr(errorMessage(summaryError));
        }
    }

    function unicodeCharacterCount(value) {
        var count = 0;
        for (var index = 0, indexLen = value.length; index < indexLen; index++) {
            var code = value.charCodeAt(index);
            if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length) {
                var next = value.charCodeAt(index + 1);
                if (next >= 0xDC00 && next <= 0xDFFF) index++;
            }
            count++;
        }
        return count;
    }

    templateButton.onClick = function () {
        var templates = [
            "https://example.com",
            "WIFI:T:WPA;S:Network;P:Password;;",
            "mailto:name@example.com",
            "tel:+855",
            "BEGIN:VCARD\nVERSION:3.0\nFN:Name\nTEL:+855\nEND:VCARD"
        ];
        contentInput.text = templates[templateList.selection ?
            templateList.selection.index : 0];
        contentInput.active = true;
        updateQrSummary();
    };
    contentInput.onChanging = function () {
        updateQrSummary();
        updateTelegramFieldsFromContent();
    };
    sizeInput.onChanging = updateQrSummary;
    quietInput.onChanging = updateQrSummary;
    correctionList.onChange = updateQrSummary;
    backgroundCheck.onChange = updateQrSummary;

    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var cancelBtn = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var generateBtn = buttons.add("button", undefined, OZO.tr("Generate"), {name: "ok"});
    dialog.defaultElement = generateBtn;
    dialog.cancelElement = cancelBtn;

    OZO.addLanguageSelector(dialog, function () {
        styleList.onChange();
        updateQrSummary();
    });

    OZO.restoreWindowState(dialog, "generate_qr_code_v3");
    previousUnit = unitList.selection ? unitList.selection.text : "mm";
    var sizeLimits = sizeLimitsForUnit(previousUnit);
    sizeSmoothOptions.step = sizeLimits.step;
    sizeSmoothOptions.min = sizeLimits.min;
    sizeSmoothOptions.max = sizeLimits.max;
    OZO.makeNumericSmooth(sizeInput, sizeSmoothOptions);
    OZO.makeNumericSmooth(quietInput, {step: 1, min: 0, max: 20});
    restoringState = false;
    styleList.onChange();
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);
    updateQrSummary();
    contentInput.active = true;
    if (dialog.show() !== 1) {
        return;
    }

    var content = contentInput.text;
    if (content.length === 0) {
        alert(OZO.isKhmer() ? "\u179f\u17bc\u1798\u1794\u1789\u17d2\u1785\u17bc\u179b\u17a2\u178f\u17d2\u1790\u1794\u1791 URL \u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1791\u17c6\u1793\u17b6\u1780\u17cb\u1791\u17c6\u1793\u1784 \u17ac\u1798\u17b6\u178f\u17b7\u1780\u17b6 QR \u1795\u17d2\u179f\u17c1\u1784\u1791\u17c0\u178f\u17d4" :
            "Enter text, a URL, contact data, or other QR content.");
        return;
    }
    var size = parsePositiveNumber(sizeInput.text);
    if (!isFinite(size) || size <= 0) {
        alert(OZO.isKhmer() ? "\u179f\u17bc\u1798\u1794\u1789\u17d2\u1785\u17bc\u179b\u1791\u17c6\u17a0\u17c6\u1785\u17bb\u1784\u1780\u17d2\u179a\u17c4\u1799\u1792\u17c6\u1787\u17b6\u1784\u179f\u17bc\u1793\u17d2\u1799\u17d4" :
            "Enter a finished size greater than zero.");
        return;
    }
    var quietZone = parsePositiveNumber(quietInput.text);
    if (!isFinite(quietZone) || quietZone < 0 || quietZone !== Math.floor(quietZone) || quietZone > 20) {
        alert(OZO.isKhmer() ? "\u179f\u17bc\u1798\u1794\u1789\u17d2\u1785\u17bc\u179b\u178f\u17c6\u1794\u1793\u17cb\u1791\u17c6\u1793\u17c1\u179a\u1787\u17b6\u1785\u17c6\u1793\u17bd\u1793\u1782\u178f\u17cb\u1796\u17b8 0 \u178a\u179b\u17cb 20 \u1798\u17c9\u17bc\u178c\u17bb\u179b\u17d4" :
            "Enter a whole-number quiet zone from 0 to 20 modules.");
        return;
    }

    var unit = unitList.selection ? unitList.selection.text : "mm";
    var sizeMillimeters = size * unitToMillimeters(unit);
    var styleIdx = styleList.selection ? styleList.selection.index : 0;
    var outputStyle = styleIdx === 1 ? "Telegram 2026 (Share Card)" :
                      (styleIdx === 2 ? "Telegram 2026 (QR Only)" : "Normal");
    var isTelegram = styleIdx === 1 || styleIdx === 2;
    var level = isTelegram ?
        "M" : ["L", "M", "Q", "H"][correctionList.selection ? correctionList.selection.index : 1];

    var telegramOptions = {
        isCard: styleIdx === 1,
        theme: themeList.selection ? themeList.selection.text : "Official Telegram Blue",
        title: nameInput.text,
        handle: handleInput.text
    };

    try {
        var encoded = encodeQr(content, level);
        var output = addVectorQr(
            encoded,
            sizeMillimeters * POINTS_PER_MM,
            quietZone,
            backgroundCheck.value,
            newLayerCheck.value,
            outputStyle,
            telegramOptions
        );
        OZO.saveWindowState(dialog, "generate_qr_code_v3");
        var scanWarning = qrScanWarning(
            encoded.matrix.length,
            size,
            unit,
            quietZone,
            backgroundCheck.value,
            isTelegram
        );
        var successMessage = OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17bc\u178a QR\u17d4\n\n\u1787\u17c6\u1793\u17b6\u1793\u17cb\u17d6 " + encoded.version + "\n\u1798\u17c9\u17b6\u1791\u17d2\u179a\u17b8\u179f\u17d6 " +
                output.modules + " x " + output.modules + " \u1798\u17c9\u17bc\u178c\u17bb\u179b\n\u179a\u1785\u1793\u17b6\u1794\u17d0\u1791\u17d2\u1798\u17d6 " +
                outputStyle + "\n\u1795\u17d2\u179b\u17bc\u179c\u179c\u17c9\u17b7\u1785\u1791\u17d0\u179a\u17d6 " + output.rectangles +
                "\n\u1791\u17c6\u17a0\u17c6\u1785\u17bb\u1784\u1780\u17d2\u179a\u17c4\u1799\u17d6 " + formatMeasurement(size) + " " + unit :
            "QR code generated.\n\nVersion: " + encoded.version + "\nMatrix: " +
                output.modules + " x " + output.modules + " modules\nStyle: " +
                outputStyle + "\nVector runs: " + output.rectangles +
                "\nFinished size: " + formatMeasurement(size) + " " + unit;
        alert(successMessage + (scanWarning ? "\n\n" + scanWarning : ""));
    } catch (error) {
        alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17bc\u178a QR \u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : SCRIPT_NAME + " failed.") +
            "\n\n" + errorMessage(error));
    }
})();
