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
var path = require("path");
var vm = require("vm");

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

function makeFile(filePath) {
    var normalized = String(filePath).replace(/\\/g, "/");
    var parts = normalized.split("/");
    return {
        fsName: normalized,
        name: parts[parts.length - 1],
        exists: false,
        parent: { fsName: parts.slice(0, -1).join("/"), parent: { fsName: parts.slice(0, -2).join("/") } }
    };
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
        File: makeFile,
        Folder: function (folderPath) {
            return { fsName: String(folderPath), exists: false, current: "/tmp" };
        },
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
// Version Consistency Check
// ------------------------------------------------------------------
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
