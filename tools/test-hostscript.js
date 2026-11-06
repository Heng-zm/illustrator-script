#!/usr/bin/env node
/*
 * Ozo Tools - host bridge & unit test suite.
 *
 * Runs jsx/hostscript.jsx and OzoShared.jsxinc inside a Node VM with an
 * Illustrator DOM stub so the pure bridge logic (JSON parsing/serialisation,
 * document status, unit conversion, naming templates, version consistency)
 * is verified without launching Illustrator.
 *
 * Usage: node tools/test-hostscript.js
 */

"use strict";

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");
var childProcess = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var HOST_SCRIPT = path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "jsx", "hostscript.jsx");
var SHARED_INC = path.join(ROOT, "lib", "OzoShared.jsxinc");
var MAIN_JS = path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "js", "main.js");
var EXPORTER_SCRIPT = path.join(ROOT, "Script all", "Batch Production Exporter.jsx");

var tests = 0;
var failures = 0;

function test(name, fn) {
    tests++;
    try {
        fn();
        console.log("OK   " + name);
    } catch (error) {
        failures++;
        console.error("FAIL " + name + "\n     " + error.message);
    }
}

// ------------------------------------------------------------------
// Illustrator stubs
// ------------------------------------------------------------------
var RulerUnits = {
    Unknown: 0,
    Points: 1,
    Picas: 2,
    Inches: 3,
    Millimeters: 4,
    Centimeters: 5,
    Meters: 6
};

function FakeFile(filePath) {
    var normalized = String(filePath).replace(/\\/g, "/");
    var parts = normalized.split("/");
    this.fsName = normalized;
    this.name = parts[parts.length - 1];
    this.exists = false;
    this.length = 0;
    this.modified = new Date();
    this.parent = { fsName: parts.slice(0, -1).join("/"), parent: { fsName: parts.slice(0, -2).join("/") } };
}
function FakeFolder(folderPath) {
    this.fsName = String(folderPath);
    this.exists = false;
    this.name = path.basename(String(folderPath));
    this.current = "/tmp";
    this.getFiles = function () { return []; };
}

function makeFile(filePath) {
    return new FakeFile(filePath);
}

function makeContext(options) {
    options = options || {};
    var app = {
        documents: [],
        activeDocument: null,
        PDFPresetsList: []
    };
    var sandbox = {
        app: app,
        $: { fileName: "/tmp/plugin/jsx/hostscript.jsx" },
        File: FakeFile,
        Folder: FakeFolder,
        RulerUnits: RulerUnits,
        DocumentColorSpace: { RGB: "DocumentColorSpace.RGB", CMYK: "DocumentColorSpace.CMYK" },
        alert: function () {},
        confirm: function () { return false; },
        console: console
    };
    sandbox.Folder.current = { fsName: "/tmp" };
    // Simulates a host without native JSON so the fallback serializer is used.
    if (options.noJson) sandbox.JSON = undefined;

    var source = fs.readFileSync(HOST_SCRIPT, "utf8")
        .replace(/^[ \t]*#target\b.*$/gm, "");
    var context = vm.createContext(sandbox);
    new vm.Script(source, { filename: "hostscript.jsx" }).runInContext(context);
    context.__app = app;
    return context;
}

function makeArtboardDoc(spec) {
    var widthPt = spec.widthPt;
    var heightPt = spec.heightPt;
    var rect = [0, heightPt, widthPt, 0];
    var artboards = [{ name: "Artboard 1", artboardRect: rect }];
    artboards.getActiveArtboardIndex = function () { return 0; };
    return {
        name: "Test.ai",
        documentColorSpace: "DocumentColorSpace.CMYK",
        rulerUnits: spec.rulerUnits,
        pageItems: { length: spec.pageItems || 0 },
        layers: spec.layers || [],
        selection: spec.selection === undefined ? null : spec.selection,
        artboards: artboards
    };
}

// ------------------------------------------------------------------
// JSON Bridge
// ------------------------------------------------------------------
var nativeJson = makeContext();
var fallbackJson = makeContext({ noJson: true });

test("JSON round-trips nested bridge payloads (native)", function () {
    var payload = {
        text: "លេខរៀង \"quoted\" \\ slash / tab\tnewline\n",
        values: [0, -1.5, 1e3, true, false, null],
        nested: { list: [1, 2, { deep: "ok" }] }
    };
    var raw = nativeJson.ozoJsonStringify(payload);
    assert.deepStrictEqual(JSON.parse(raw), payload);
    assert.strictEqual(JSON.stringify(nativeJson.ozoJsonParse(raw)), JSON.stringify(payload));
});

test("fallback serializer round-trips without native JSON", function () {
    var payload = { name: "Ozo", unicode: "ខ្មែរ", quote: 'a"b', backslash: "a\\b", list: [1, true, null, "x"] };
    var raw = fallbackJson.ozoJsonStringify(payload);
    assert.deepStrictEqual(JSON.parse(raw), payload);
    assert.strictEqual(JSON.stringify(fallbackJson.ozoJsonParse(raw)), JSON.stringify(payload));
});

test("parser decodes unicode escapes and surrogate pairs", function () {
    assert.strictEqual(fallbackJson.ozoJsonParse('"\\u179b\\u17c0\\u1784"'), "\u179b\u17c0\u1784");
    assert.strictEqual(fallbackJson.ozoJsonParse('"\\ud83d\\ude00"'), "\ud83d\ude00");
});

test("parser rejects malformed payloads", function () {
    var bad = ["{", "[1,]", "{a:1}", '{"a":}', "tru", '"\\u12"', "01", '{"a":1} trailing'];
    bad.forEach(function (input) {
        assert.throws(function () { fallbackJson.ozoJsonParse(input); }, /Invalid JSON/, "accepted: " + input);
    });
});

test("parser refuses prototype pollution keys", function () {
    var parsed = fallbackJson.ozoJsonParse('{"__proto__":{"polluted":true},"safe":1}');
    assert.strictEqual(parsed.safe, 1);
    assert.strictEqual(({}).polluted, undefined);
});

test("parser enforces a nesting limit", function () {
    var deep = new Array(70).join("[") + "1" + new Array(70).join("]");
    assert.throws(function () { fallbackJson.ozoJsonParse(deep); }, /nesting too deep/);
});

// ------------------------------------------------------------------
// OzoShared Library JSON
// ------------------------------------------------------------------
test("OzoShared provides eval-free JSON parser and serializer in ExtendScript", function () {
    var sharedCode = fs.readFileSync(SHARED_INC, "utf8");
    var sandbox = {
        app: { name: "Adobe Illustrator" },
        File: makeFile,
        Folder: function () { return { fsName: "/tmp" }; },
        JSON: undefined // Ensure ExtendScript environment without native JSON
    };
    var context = vm.createContext(sandbox);
    new vm.Script(sharedCode, { filename: "OzoShared.jsxinc" }).runInContext(context);
    var OZO = context.OZO;

    assert.ok(OZO, "OZO object defined");
    assert.strictEqual(typeof OZO.parseJson, "function", "OZO.parseJson function exists");
    assert.strictEqual(typeof OZO.jsonStringify, "function", "OZO.jsonStringify function exists");

    var sample = { tool: "Nesting", success: true, count: 42, tags: ["die-cut", "offset"] };
    var serialized = OZO.jsonStringify(sample);
    var deserialized = OZO.parseJson(serialized);
    assert.strictEqual(JSON.stringify(deserialized), JSON.stringify(sample));
});

// ------------------------------------------------------------------
// Document status
// ------------------------------------------------------------------
test("document status reports no document", function () {
    var context = makeContext();
    var status = JSON.parse(context.ozoGetDocumentStatus());
    assert.strictEqual(status.hasDoc, false);
    assert.strictEqual(status.selectedCount, 0);
    assert.strictEqual(status.itemCount, 0);
});

test("document status counts a single non-array selection as one", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 100,
        heightPt: 100,
        rulerUnits: RulerUnits.Centimeters,
        selection: { typename: "PathItem" },
        pageItems: 7
    });
    var status = JSON.parse(context.ozoGetDocumentStatus());
    assert.strictEqual(status.hasDoc, true);
    assert.strictEqual(status.selectedCount, 1);
    assert.strictEqual(status.itemCount, 7);
    assert.strictEqual(status.artboardsCount, 1);
    assert.strictEqual(status.colorSpace, "CMYK");
});

test("document status counts an array selection", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 100,
        heightPt: 100,
        rulerUnits: RulerUnits.Centimeters,
        selection: [{ typename: "PathItem" }, { typename: "PathItem" }, { typename: "TextFrame" }],
        pageItems: 3
    });
    var status = JSON.parse(context.ozoGetDocumentStatus());
    assert.strictEqual(status.selectedCount, 3);
});

// ------------------------------------------------------------------
// Print Job Info unit conversion
// ------------------------------------------------------------------
function printDefaults(context, rulerUnits, widthPt, heightPt) {
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: widthPt,
        heightPt: heightPt,
        rulerUnits: rulerUnits,
        pageItems: 0
    });
    return JSON.parse(context.ozoGetPrintJobDefaults());
}

function near(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) < 0.02, label + ": expected " + expected + ", got " + actual);
}

test("print defaults convert points for every supported unit", function () {
    var context = makeContext();
    var cm = printDefaults(context, RulerUnits.Centimeters, 283.4645669, 141.7322835);
    assert.strictEqual(cm.unit, "cm");
    near(cm.width, 10, "cm width");
    near(cm.height, 5, "cm height");

    var mm = printDefaults(context, RulerUnits.Millimeters, 283.4645669, 141.7322835);
    assert.strictEqual(mm.unit, "mm");
    near(mm.width, 100, "mm width");
    near(mm.height, 50, "mm height");

    var inches = printDefaults(context, RulerUnits.Inches, 288, 144);
    assert.strictEqual(inches.unit, "in");
    near(inches.width, 4, "in width");
    near(inches.height, 2, "in height");

    var points = printDefaults(context, RulerUnits.Points, 300, 200);
    assert.strictEqual(points.unit, "pt");
    near(points.width, 300, "pt width");
    near(points.height, 200, "pt height");

    var meters = printDefaults(context, RulerUnits.Meters, 2834.645669, 1417.322835);
    assert.strictEqual(meters.unit, "m");
    near(meters.width, 1, "m width");
    near(meters.height, 0.5, "m height");
});

test("print defaults report an error without a document", function () {
    var context = makeContext();
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "error");
});

test("print defaults measure selection when artwork is selected", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 1000,
        heightPt: 500,
        rulerUnits: RulerUnits.Centimeters,
        selection: {
            typename: "PathItem",
            geometricBounds: [0, 141.7322835, 283.4645669, 0]
        },
        pageItems: 1
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, false);
    near(defaults.width, 10, "selection cm width");
    near(defaults.height, 5, "selection cm height");
    assert.ok(defaults.artboardName.indexOf("Selection") !== -1, "artboardName mentions Selection");
});

test("print defaults ignore a previously generated print header", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 283.4645669,
        heightPt: 141.7322835,
        rulerUnits: RulerUnits.Centimeters,
        selection: [
            { typename: "GroupItem", layer: { name: "[Print Job Info]" }, geometricBounds: [-20, 360, 300, 260] },
            { typename: "PathItem", layer: { name: "Artwork" }, geometricBounds: [0, 141.7322835, 283.4645669, 0] }
        ],
        pageItems: 2
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, false, "still measures the user artwork");
    near(defaults.width, 10, "artwork cm width");
    near(defaults.height, 5, "artwork cm height");
});

test("print defaults fall back to the artboard when only the header is selected", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 283.4645669,
        heightPt: 141.7322835,
        rulerUnits: RulerUnits.Centimeters,
        selection: { typename: "GroupItem", layer: { name: "[Print Job Info]" }, geometricBounds: [-20, 360, 300, 260] },
        pageItems: 1
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, true, "ignores the generated header");
    near(defaults.width, 10, "artboard cm width");
    near(defaults.height, 5, "artboard cm height");
});

test("print defaults strip a previous header out of the artboard height", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 283.4645669,
        heightPt: 200, // artboard already expanded by an earlier header
        rulerUnits: RulerUnits.Centimeters,
        pageItems: 1,
        layers: [{
            name: "[Print Job Info]",
            pageItems: [{
                name: "Print Header Block",
                geometricBounds: [0, 200, 283.4645669, 141.7322835]
            }]
        }]
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, true);
    near(defaults.width, 10, "artboard cm width");
    near(defaults.height, 5, "original artwork cm height");
});

test("print defaults fall back to artboard when selection has degenerate 0-width bounds", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 500,
        heightPt: 250,
        rulerUnits: RulerUnits.Centimeters,
        selection: { typename: "PathItem", geometricBounds: [100, 100, 100, 100] },
        pageItems: 1
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, true, "falls back to artboard on degenerate bounds");
});

test("print defaults use the recorded header height without a dark box", function () {
    var context = makeContext();
    context.__app.documents = [{}];
    context.__app.activeDocument = makeArtboardDoc({
        widthPt: 283.4645669,
        heightPt: 201.7322835, // 141.73pt artwork + 60pt header
        rulerUnits: RulerUnits.Centimeters,
        pageItems: 1,
        layers: [{
            name: "[Print Job Info]",
            pageItems: [{
                name: "Print Header Block",
                note: "OZO_PRINT_JOB_HEADER|headerHeight=60",
                // Text-only group: its bottom edge sits inside the header band.
                geometricBounds: [0, 201.7322835, 283.4645669, 151.7322835],
                pageItems: []
            }]
        }]
    });
    var defaults = JSON.parse(context.ozoGetPrintJobDefaults());
    assert.strictEqual(defaults.status, "success");
    assert.strictEqual(defaults.isArtboard, true);
    near(defaults.width, 10, "artboard cm width");
    near(defaults.height, 5, "original artwork cm height");
});

// ------------------------------------------------------------------
// Naming Template Preview vs Host Output Parity
// ------------------------------------------------------------------
test("naming-template preview generates identical filenames to host exporter", function () {
    // Extract buildPreviewSample from main.js
    var mainCode = fs.readFileSync(MAIN_JS, "utf8");
    var previewFnMatch = /function buildPreviewSample\([\s\S]*?\n    \}/.exec(mainCode);
    assert.ok(previewFnMatch, "buildPreviewSample found in main.js");

    var sandbox = {};
    vm.createContext(sandbox);
    new vm.Script(previewFnMatch[0]).runInContext(sandbox);
    var buildPreviewSample = sandbox.buildPreviewSample;

    // Build standalone buildFileName matching Batch Production Exporter.jsx logic
    function hostBuildFileName(template, docName, ab, formatExt, unit, isCombined) {
        var abName = isCombined ? "All" : (ab ? ab.name : "Artboard_1");
        var w = ab ? ab.width : "100";
        var h = ab ? ab.height : "100";
        var num = isCombined ? "All" : "01";
        var rawNum = isCombined ? "All" : "1";
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth() + 1; if (m < 10) m = "0" + m;
        var d = now.getDate(); if (d < 10) d = "0" + d;
        var dateStr = y + "-" + m + "-" + d;
        var hr = now.getHours(); if (hr < 10) hr = "0" + hr;
        var mn = now.getMinutes(); if (mn < 10) mn = "0" + mn;
        var timeStr = String(hr) + String(mn);
        var color = "CMYK";

        var result = String(template || "").replace(
            /\[(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\]|\{(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\}/gi,
            function (match, bracketToken, braceToken) {
                var token = String(bracketToken || braceToken || "").toLowerCase();
                switch (token) {
                    case "doc": return docName;
                    case "ab": return abName;
                    case "num": return num;
                    case "raw_num": return rawNum;
                    case "w": return w;
                    case "h": return h;
                    case "unit": return unit;
                    case "date": return dateStr;
                    case "time": return timeStr;
                    case "color": return color;
                    case "fmt": return formatExt;
                }
                return match;
            }
        );
        result = result.replace(/[\\\/:\*\?"<>\|]/g, "_").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        if (!result) result = docName + "_" + abName;
        return result + "." + formatExt;
    }

    var testTemplates = [
        "[doc]_[ab]_[w]x[h][unit]",
        "[doc]_[ab]",
        "[ab]_[w]x[h][unit]",
        "[num]_[doc]_[ab]",
        "{doc}_{fmt}_{date}",
        "[raw_num]_[ab]_[time]",
        "Special:Chars/Forbidden*Name"
    ];

    var dummyAb = { name: "Sticker_DieCut", width: "150", height: "75" };
    testTemplates.forEach(function (tpl) {
        var preview = buildPreviewSample(tpl, "Packaging_Job", dummyAb, "pdf", "mm", false);
        var host = hostBuildFileName(tpl, "Packaging_Job", dummyAb, "pdf", "mm", false);
        assert.strictEqual(preview, host, "Mismatch for template: " + tpl);
    });

    // Test combined multi-page PDF mode
    var combPreview = buildPreviewSample("[doc]_[ab]", "Catalogue", dummyAb, "pdf", "mm", true);
    var combHost = hostBuildFileName("[doc]_[ab]", "Catalogue", dummyAb, "pdf", "mm", true);
    assert.strictEqual(combPreview, "Catalogue_All.pdf");
    assert.strictEqual(combPreview, combHost);
});

// ------------------------------------------------------------------
// Updater script validation
// ------------------------------------------------------------------
// The Windows updater is generated as a PowerShell script. A stray brace or
// throw used to make it unparseable, so PowerShell exited without writing a
// status file and every update surfaced as "timed out". Parse the generated
// script with the real PowerShell parser to catch that class of bug.
if (process.platform === "win32") {
    test("generated Windows updater is a valid PowerShell script", function () {
        var src = fs.readFileSync(HOST_SCRIPT, "utf8");
        var start = src.indexOf("var psScript = [");
        var endMarker = "].join(\"\\r\\n\");";
        var end = src.indexOf(endMarker, start);
        assert.ok(start !== -1 && end !== -1, "psScript construction found in hostscript.jsx");

        var expr = src.slice(start + "var psScript = ".length, end + endMarker.length);
        var psScript = vm.runInNewContext(expr, {
            targetFsPath: "C:\\\\Temp\\\\plugin",
            resultFsPath: "C:\\\\Temp\\\\result.json",
            safeZipUrl: "https://example.com/update.zip",
            cleanTag: "v1.2.3"
        });
        assert.ok(psScript.indexOf("ConvertTo-Json") !== -1, "status output is built with ConvertTo-Json");

        var scriptPath = path.join(os.tmpdir(), "ozo_updater_selftest_" + process.pid + ".ps1");
        fs.writeFileSync(scriptPath, psScript, "utf8");
        try {
            childProcess.execFileSync("powershell.exe", [
                "-NoProfile",
                "-Command",
                "$e = $null; [System.Management.Automation.Language.Parser]::ParseFile('" +
                    scriptPath.replace(/'/g, "''") +
                    "', [ref]$null, [ref]$e) | Out-Null; if ($e) { $e | ForEach-Object { Write-Error $_.Message }; exit 1 }"
            ], { encoding: "utf8", windowsHide: true });
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) {}
        }
    });
}

// ------------------------------------------------------------------
// Version Consistency Check
// ------------------------------------------------------------------
// -------------------------------------------------------------
// Script Launcher File Extension & Dotfile Filtering
// -------------------------------------------------------------
test("ozoScanLauncherScripts rejects non-script files, dotfiles, and text files containing .js", function () {
    var ctx = makeContext();
    assert.strictEqual(typeof ctx.ozoScanLauncherScripts, "function");

    var tempDir = path.join(os.tmpdir(), "ozo_launcher_test_" + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    try {
        fs.writeFileSync(path.join(tempDir, "ValidScript.jsx"), "// jsx");
        fs.writeFileSync(path.join(tempDir, "AnotherScript.js"), "// js");
        fs.writeFileSync(path.join(tempDir, "CompiledScript.jsxbin"), "// jsxbin");
        fs.writeFileSync(path.join(tempDir, "readme.json"), "{}");
        fs.writeFileSync(path.join(tempDir, "notes.js.txt"), "notes");
        fs.writeFileSync(path.join(tempDir, "something.jsp"), "jsp");
        fs.writeFileSync(path.join(tempDir, ".hidden.jsx"), "hidden");

        var FakeFolder = ctx.Folder;
        var FakeFile = ctx.File;

        // Custom Folder getter for disk scan
        var scanFolder = new FakeFolder(tempDir);
        scanFolder.exists = true;
        scanFolder.getFiles = function () {
            var entries = fs.readdirSync(tempDir);
            return entries.map(function (entry) {
                var full = path.join(tempDir, entry);
                var stat = fs.statSync(full);
                if (stat.isDirectory()) {
                    var sub = new FakeFolder(full);
                    sub.exists = true;
                    return sub;
                }
                var fl = new FakeFile(full);
                fl.exists = true;
                fl.length = stat.size;
                fl.modified = stat.mtime;
                return fl;
            });
        };

        // Override Folder constructor in sandbox to return scanFolder when tempDir is accessed
        var originalFolder = ctx.Folder;
        ctx.Folder = function (dirPath) {
            if (path.resolve(String(dirPath)) === path.resolve(tempDir)) {
                return scanFolder;
            }
            return new originalFolder(dirPath);
        };
        ctx.Folder.prototype = originalFolder.prototype;

        var raw = ctx.ozoScanLauncherScripts(tempDir);
        var res = JSON.parse(raw);
        assert.strictEqual(res.status, "ok");
        var names = res.scripts.map(function (s) { return s.fileName; }).sort();
        assert.deepStrictEqual(names, ["AnotherScript.js", "CompiledScript.jsxbin", "ValidScript.jsx"]);
    } finally {
        try {
            var items = fs.readdirSync(tempDir);
            items.forEach(function (it) { fs.unlinkSync(path.join(tempDir, it)); });
            fs.rmdirSync(tempDir);
        } catch (eClean) {}
    }
});

// -------------------------------------------------------------
// Document Signature Artboard Tracking
// -------------------------------------------------------------
test("main.js docSignature changes when activeArtboardIndex changes", function () {
    var mainJs = fs.readFileSync(MAIN_JS, "utf8");
    var startIdx = mainJs.indexOf("function docSignature(info)");
    var endIdx = mainJs.indexOf("}", startIdx);
    var docSigFnCode = mainJs.substring(startIdx, endIdx + 1);
    var vmCtx = vm.createContext({});
    new vm.Script(docSigFnCode + "\nthis.docSignature = docSignature;").runInContext(vmCtx);

    var info1 = { hasDoc: true, name: "Test.ai", colorSpace: "CMYK", artboardsCount: 3, activeArtboardIndex: 0, selectedCount: 0 };
    var info2 = { hasDoc: true, name: "Test.ai", colorSpace: "CMYK", artboardsCount: 3, activeArtboardIndex: 1, selectedCount: 0 };

    var sig1 = vmCtx.docSignature(info1);
    var sig2 = vmCtx.docSignature(info2);
    assert.notStrictEqual(sig1, sig2, "Signatures must differ when active artboard changes");
    assert.strictEqual(sig1, "Test.ai|CMYK|3|0|0");
    assert.strictEqual(sig2, "Test.ai|CMYK|3|1|0");
});

// -------------------------------------------------------------
// Rich Black & ABA KHQR Host Bridges & Payload Tests
// -------------------------------------------------------------
test("host bridges exist for Rich Black Optimizer and ABA KHQR", function () {
    var ctx = makeContext();
    assert.strictEqual(typeof ctx.ozoExecuteRichBlack, "function");
    assert.strictEqual(typeof ctx.ozoExecuteKHQR, "function");

    // Both should gracefully return error if scriptFile not found in dummy context
    var resRb = JSON.parse(ctx.ozoExecuteRichBlack("{}"));
    assert.strictEqual(resRb.status, "error");

    var resKh = JSON.parse(ctx.ozoExecuteKHQR("{}"));
    assert.strictEqual(resKh.status, "error");
});

test("host bridge exposes Nesting and reports a missing script", function () {
    var ctx = makeContext();
    assert.strictEqual(typeof ctx.ozoExecuteNesting, "function");
    var res = JSON.parse(ctx.ozoExecuteNesting("{}"));
    assert.strictEqual(res.status, "error");
});

test("ABA KHQR EMVCo string payload and CRC16 checksum", function () {
    var khqrScript = fs.readFileSync(path.join(ROOT, "Script all", "ABA KHQR Generator.jsx"), "utf8");
    var vmCtx = vm.createContext({});
    var startIdx = khqrScript.indexOf("function formatTag");
    var endIdx = khqrScript.indexOf("// Compact Offline QR Code Matrix Generator");
    if (endIdx === -1) endIdx = khqrScript.indexOf("Compact Offline QR");
    var extractCode = khqrScript.substring(startIdx, endIdx);
    new vm.Script(extractCode + "\nthis.buildKHQRPayload = buildKHQRPayload; this.calculateCRC16 = calculateCRC16;").runInContext(vmCtx);

    var payload = vmCtx.buildKHQRPayload({
        bakongId: "heng_zm@abab",
        merchantName: "OZO PRINT SHOP",
        currency: "USD",
        amount: "5.00"
    });

    assert.ok(payload.indexOf("000201") === 0, "Starts with EMVCo format tag 00");
    assert.ok(payload.indexOf("bakong@cbrd") !== -1, "Contains Bakong CBRD identifier");
    assert.ok(payload.indexOf("heng_zm@abab") !== -1, "Contains account ID");
    assert.ok(payload.indexOf("5303840") !== -1, "Contains USD currency tag 53");
    assert.ok(payload.indexOf("54045.00") !== -1, "Contains amount tag 54");
    assert.ok(payload.indexOf("6304") !== -1, "Contains CRC tag 63");
    assert.strictEqual(payload.length, payload.indexOf("6304") + 8, "Has 4-character hex CRC checksum at end");
});

test("version.json matches all target files across the repository", function () {
    var versionJson = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
    var version = versionJson.version.trim().replace(/^v/i, "");
    assert.ok(/^\d+\.\d+\.\d+$/.test(version), "Semantic version format in version.json: " + version);

    // 1. Manifest
    var manifest = fs.readFileSync(path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "CSXS", "manifest.xml"), "utf8");
    assert.ok(manifest.indexOf('ExtensionBundleVersion="' + version + '"') !== -1, "manifest.xml bundle version");
    assert.ok(manifest.indexOf('Version="' + version + '"') !== -1, "manifest.xml extension version");

    // 2. index.html brand badge
    var indexHtml = fs.readFileSync(path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "index.html"), "utf8");
    assert.ok(new RegExp('id="brandBadge"[^>]*>v' + version + '<').test(indexHtml), "index.html brand badge");

    // 3. main.js
    var mainJs = fs.readFileSync(path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "js", "main.js"), "utf8");
    assert.ok(mainJs.indexOf('var CURRENT_VERSION = "' + version + '";') !== -1, "main.js CURRENT_VERSION");

    // 4. Install as Plugin.jsx
    var installer = fs.readFileSync(path.join(ROOT, "Install as Plugin.jsx"), "utf8");
    assert.ok(installer.indexOf('"v' + version + ' \\u2022 Suite Setup') !== -1 ||
              installer.indexOf('"v' + version + ' \u2022 Suite Setup') !== -1, "Install as Plugin.jsx version header");

    // 5. OzoShared.jsxinc (all 3 locations)
    [
        path.join(ROOT, "lib", "OzoShared.jsxinc"),
        path.join(ROOT, "Script all", "lib", "OzoShared.jsxinc"),
        path.join(ROOT, "plugin", "com.ozo.illustrator.tools", "scripts", "lib", "OzoShared.jsxinc")
    ].forEach(function (sharedFile) {
        var code = fs.readFileSync(sharedFile, "utf8");
        assert.ok(new RegExp('version:\\s*"' + version + '"').test(code), "OzoShared version in " + path.relative(ROOT, sharedFile));
    });
});

// ------------------------------------------------------------------
// Result
// ------------------------------------------------------------------
console.log("");
if (failures > 0) {
    console.error(failures + " of " + tests + " test(s) failed.");
    process.exit(1);
}
console.log("All " + tests + " test suite checks passed.");
