#!/usr/bin/env node
/*
 * Ozo Tools - pre-release validation.
 *
 * 1. Parses every ExtendScript file with #include expanded and directives
 *    stripped, so a broken string/escape/block is caught before packaging.
 * 2. Parses the CEP panel JavaScript.
 * 3. Verifies that the generated copies under plugin/.../scripts and
 *    Script all/lib are byte-identical to their sources, and that no stale
 *    scripts remain in the packaged folder.
 *
 * Usage: node tools/check-syntax.js
 */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var crypto = require("crypto");

var ROOT = path.resolve(__dirname, "..");
var SOURCE_DIR = path.join(ROOT, "Script all");
var LIB_DIR = path.join(ROOT, "lib");
var PLUGIN_DIR = path.join(ROOT, "plugin", "com.ozo.illustrator.tools");
var PLUGIN_SCRIPTS = path.join(PLUGIN_DIR, "scripts");
var PLUGIN_JS = path.join(PLUGIN_DIR, "js");
var LAUNCHER = "Script Launcher.jsx";

var failures = [];

function fail(message) {
    failures.push(message);
    console.error("FAIL " + message);
}

function ok(message) {
    console.log("OK   " + message);
}

function read(file) {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function parse(name, code) {
    try {
        new vm.Script(code, { filename: name });
        ok(name);
    } catch (error) {
        fail(name + ": " + error.message);
    }
}

// Catches \u escapes with fewer than four hex digits (the bug class that
// shipped in v2.6.1). A doubled backslash is a literal "\u" and is ignored.
var BAD_ESCAPE = /(?<!\\)\\u(?![0-9a-fA-F]{4})/;

function checkEscapes(name, code) {
    var lines = code.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        if (BAD_ESCAPE.test(lines[i])) {
            fail(name + ":" + (i + 1) + " invalid Unicode escape sequence");
            return;
        }
    }
}

// ExtendScript is ES3: no native JSON and no eval-style Function constructor.
// Both hide failures until a user clicks a tool, so reject them at build time.
function lintExtendScript(name, code, allowNativeJsonGuard) {
    var lines = code.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.replace(/^\s+/, "");
        if (/^\/\//.test(trimmed) || /^\*/.test(trimmed) || /^\/\*/.test(trimmed)) continue;
        if (/\bnew\s+Function\s*\(/.test(line)) {
            fail(name + ":" + (i + 1) + " uses eval-style new Function(); parse JSON with ozoJsonParse/OZO.parseJson");
            return;
        }
        if (!allowNativeJsonGuard && /\bJSON\s*\./.test(line)) {
            fail(name + ":" + (i + 1) + " uses native JSON (ExtendScript has none); assign plain objects or use OZO.parseJson");
            return;
        }
    }
}

function prepareExtendScript(file) {
    var code = read(file);
    var sharedFile = path.join(LIB_DIR, "OzoShared.jsxinc");
    if (fs.existsSync(sharedFile)) {
        var shared = read(sharedFile);
        code = code.replace(/^[ \t]*#include\s+"lib\/OzoShared\.jsxinc"[ \t]*$/gm, function () {
            return shared;
        });
    }
    return code.replace(/^[ \t]*#(?:target|targetengine)\b.*$/gm, "");
}

function parseExtendScript(label, file, allowNativeJsonGuard) {
    var code = prepareExtendScript(file);
    checkEscapes(label, code);
    lintExtendScript(label, code, allowNativeJsonGuard);
    parse(label, code);
}

// ------------------------------------------------------------------
// 1. Source scripts
// ------------------------------------------------------------------
if (!fs.existsSync(SOURCE_DIR)) {
    fail("missing source directory: " + SOURCE_DIR);
} else {
    fs.readdirSync(SOURCE_DIR)
        .filter(function (name) { return /\.jsx$/i.test(name); })
        .sort()
        .forEach(function (name) {
            parseExtendScript("Script all/" + name, path.join(SOURCE_DIR, name));
        });
}

// ------------------------------------------------------------------
// 2. Root-level standalone scripts
// ------------------------------------------------------------------
fs.readdirSync(ROOT)
    .filter(function (name) { return /\.jsx$/i.test(name); })
    .sort()
    .forEach(function (name) {
        parseExtendScript(name, path.join(ROOT, name));
    });

// ------------------------------------------------------------------
// 2b. CEP host bridge (runs in Illustrator's ExtendScript engine)
// ------------------------------------------------------------------
var hostScript = path.join(PLUGIN_DIR, "jsx", "hostscript.jsx");
if (fs.existsSync(hostScript)) {
    // The bridge may use native JSON when the host provides it; its serializer
    // keeps a guarded fast path. The eval ban still applies.
    parseExtendScript("jsx/hostscript.jsx", hostScript, true);
} else {
    fail("missing host bridge: " + path.relative(ROOT, hostScript));
}

// ------------------------------------------------------------------
// 3. Panel JavaScript
// ------------------------------------------------------------------
["main.js", "CSInterface.js"].forEach(function (name) {
    var file = path.join(PLUGIN_JS, name);
    if (!fs.existsSync(file)) {
        fail("missing panel file: " + path.relative(ROOT, file));
        return;
    }
    var code = read(file);
    checkEscapes("js/" + name, code);
    parse("js/" + name, code);
});

// ------------------------------------------------------------------
// 4. Generated copies must match their sources
// ------------------------------------------------------------------
function digest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function compare(label, source, generated) {
    if (!fs.existsSync(source)) {
        fail(label + ": source missing (" + path.relative(ROOT, source) + ")");
        return;
    }
    if (!fs.existsSync(generated)) {
        fail(label + ": generated copy missing (" + path.relative(ROOT, generated) + ")");
        return;
    }
    if (digest(source) !== digest(generated)) {
        fail(label + ": generated copy is out of date (run build-release.ps1 / setup.bat update)");
        return;
    }
    ok(label);
}

var sourceScripts = fs.readdirSync(SOURCE_DIR).filter(function (name) {
    return /\.jsx$/i.test(name);
});

sourceScripts.forEach(function (name) {
    if (name === LAUNCHER) return; // root copy is authoritative, checked below
    compare("sync " + name,
        path.join(SOURCE_DIR, name),
        path.join(PLUGIN_SCRIPTS, name));
});

compare("sync " + LAUNCHER,
    path.join(ROOT, LAUNCHER),
    path.join(PLUGIN_SCRIPTS, LAUNCHER));

compare("sync " + LAUNCHER + " (Script all copy)",
    path.join(ROOT, LAUNCHER),
    path.join(SOURCE_DIR, LAUNCHER));

if (fs.existsSync(LIB_DIR)) {
    fs.readdirSync(LIB_DIR)
        .filter(function (name) { return !/^\./.test(name); })
        .sort()
        .forEach(function (name) {
            compare("sync lib/" + name,
                path.join(LIB_DIR, name),
                path.join(SOURCE_DIR, "lib", name));
            compare("sync lib/" + name + " (plugin)",
                path.join(LIB_DIR, name),
                path.join(PLUGIN_SCRIPTS, "lib", name));
        });
}

// Extra files in the packaged scripts folder are stale leftovers.
if (fs.existsSync(PLUGIN_SCRIPTS)) {
    var expected = {};
    sourceScripts.forEach(function (name) { expected[name] = true; });
    fs.readdirSync(PLUGIN_SCRIPTS).forEach(function (name) {
        if (name === "lib" || /^\./.test(name)) return;
        if (!expected[name]) fail("stale file in plugin scripts: " + name);
    });
} else {
    fail("missing packaged scripts folder: " + path.relative(ROOT, PLUGIN_SCRIPTS));
}

// ------------------------------------------------------------------
// Result
// ------------------------------------------------------------------
console.log("");
if (failures.length > 0) {
    console.error(failures.length + " validation error(s).");
    process.exit(1);
}
console.log("All ExtendScript/panel files parsed and generated copies are in sync.");
