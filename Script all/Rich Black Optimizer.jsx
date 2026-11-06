#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * Rich Black Optimizer PRO
 * Commercial Prepress automation for Adobe Illustrator.
 * Upgrades dull flat black (K:100% / RGB 0,0,0) to deep, lustrous Rich Black
 * with intelligent small-text protection and auto-overprint.
 */
(function () {
    var SCRIPT_NAME = "Rich Black Optimizer";
    var SCRIPT_VERSION = "1.1";

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("Open an Illustrator document before running Rich Black Optimizer."));
        return;
    }

    var doc = app.activeDocument;
    var isDocCmyk = (doc.documentColorSpace === DocumentColorSpace.CMYK);

    // Standard Prepress Profiles
    var PRESETS = [
        { id: "standard", name: "Standard Prepress (C60 M40 Y40 K100)", c: 60, m: 40, y: 40, k: 100, tic: 240, desc: "Universal neutral rich black, safe for all offset and digital presses." },
        { id: "cool",     name: "Cool Rich Black (C60 M0 Y0 K100)",     c: 60, m: 0,  y: 0,  k: 100, tic: 160, desc: "High-contrast cool undertone for modern signage and tech artwork." },
        { id: "warm",     name: "Warm Rich Black (C30 M60 Y60 K100)",   c: 30, m: 60, y: 60, k: 100, tic: 250, desc: "Rich chocolate undertone, ideal for skin tones and food photos." },
        { id: "backlit",  name: "Backlit & Signage (C70 M50 Y30 K100)", c: 70, m: 50, y: 30, k: 100, tic: 250, desc: "Dense light-blocking black for lightbox, film, and vinyl banners." },
        { id: "custom",   name: "Custom CMYK Mix",                      c: 60, m: 40, y: 40, k: 100, tic: 240, desc: "Custom cyan, magenta, yellow, and black percentages." }
    ];

    function makeRichBlackColor(c, m, y, k) {
        if (isDocCmyk) {
            var col = new CMYKColor();
            col.cyan = Math.max(0, Math.min(100, c));
            col.magenta = Math.max(0, Math.min(100, m));
            col.yellow = Math.max(0, Math.min(100, y));
            col.black = Math.max(0, Math.min(100, k));
            return col;
        }
        // RGB Fallback if document is in RGB mode
        var rgbCol = new RGBColor();
        rgbCol.red = 0;
        rgbCol.green = 0;
        rgbCol.blue = 0;
        return rgbCol;
    }

    function isPureOrFlatBlack(color) {
        if (!color) return false;
        try {
            var t = color.typename;
            if (t === "CMYKColor") {
                return (color.cyan <= 8 && color.magenta <= 8 && color.yellow <= 8 && color.black >= 88);
            }
            if (t === "RGBColor") {
                return (color.red <= 20 && color.green <= 20 && color.blue <= 20);
            }
            if (t === "GrayColor") {
                return (color.gray >= 88);
            }
            if (t === "SpotColor") {
                if (color.spot && (/black/i.test(color.spot.name)) && color.tint >= 88) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function executeOptimization(opts) {
        var targetC = parseInt(opts.c, 10);
        var targetM = parseInt(opts.m, 10);
        var targetY = parseInt(opts.y, 10);
        var targetK = parseInt(opts.k, 10);
        if (isNaN(targetC)) targetC = 60;
        if (isNaN(targetM)) targetM = 40;
        if (isNaN(targetY)) targetY = 40;
        if (isNaN(targetK)) targetK = 100;

        var richBlackColor = makeRichBlackColor(targetC, targetM, targetY, targetK);

        var targetFills = opts.targetFills !== false;
        var targetStrokes = opts.targetStrokes === true;
        var protectSmallText = opts.protectSmallText !== false;
        var textThreshold = parseFloat(opts.textThreshold) || 24;
        var autoOverprint = opts.autoOverprint !== false;
        var scope = opts.scope || "selection";

        var items = [];
        if (scope === "selection") {
            var rawSel = doc.selection;
            if (!rawSel || rawSel.typename === "TextRange") {
                return {
                    status: "error",
                    message: "No artwork selected. Please select objects or choose 'Entire Document'."
                };
            }
            if (rawSel instanceof Array || rawSel.typename === "Array" || Object.prototype.toString.call(rawSel) === "[object Array]") {
                if (rawSel.length === 0) {
                    return {
                        status: "error",
                        message: "No artwork selected. Please select objects or choose 'Entire Document'."
                    };
                }
                items = rawSel;
            } else {
                items = [rawSel];
            }
        } else {
            // Collect top-level items across visible, unlocked layers to avoid duplicate multi-pass traversal
            items = [];
            for (var li = 0, numLayers = doc.layers.length; li < numLayers; li++) {
                var layer = doc.layers[li];
                try {
                    if (layer.locked || !layer.visible) continue;
                    var layerItems = layer.pageItems;
                    for (var lpi = 0, numLpi = layerItems.length; lpi < numLpi; lpi++) {
                        items.push(layerItems[lpi]);
                    }
                } catch (eLayer) {}
            }
        }

        var stats = {
            convertedFills: 0,
            convertedStrokes: 0,
            protectedTextFrames: 0,
            overprintedTextFrames: 0
        };

        function processItem(item) {
            if (!item) return;

            // Safe guard: skip locked or hidden items to prevent runtime exceptions
            try {
                if (item.locked || item.hidden) return;
            } catch (eLock) {
                return;
            }

            // 1. Group recursion
            if (item.typename === "GroupItem") {
                try {
                    var grpItems = item.pageItems;
                    for (var gi = 0, gLen = grpItems.length; gi < gLen; gi++) {
                        processItem(grpItems[gi]);
                    }
                } catch (eGrp) {}
                return;
            }

            // 2. Compound path
            if (item.typename === "CompoundPathItem") {
                try {
                    var compPaths = item.pathItems;
                    for (var ci = 0, cLen = compPaths.length; ci < cLen; ci++) {
                        processItem(compPaths[ci]);
                    }
                } catch (eComp) {}
                return;
            }

            // 3. Text frames (Special Prepress Handling)
            if (item.typename === "TextFrame") {
                try {
                    var tr = item.textRange;
                    if (!tr || tr.length === 0) return;

                    var maxFontSize = 12;
                    try {
                        // Fast path: uniform font size
                        maxFontSize = tr.characterAttributes.size;
                    } catch (eMultiSize) {
                        // Fallback: mixed font sizes, check paragraphs
                        try {
                            var paras = item.paragraphs;
                            for (var pi = 0, pLen = paras.length; pi < pLen; pi++) {
                                var ps = paras[pi].characterAttributes.size;
                                if (ps > maxFontSize) maxFontSize = ps;
                            }
                        } catch (eP) {
                            maxFontSize = 12;
                        }
                    }

                    if (protectSmallText && maxFontSize <= textThreshold) {
                        // Keep text as pure 100% K to avoid colored fringe halos on press
                        if (autoOverprint) {
                            try {
                                tr.characterAttributes.overprintFill = true;
                                stats.overprintedTextFrames++;
                            } catch (eOv) {}
                        }
                        stats.protectedTextFrames++;
                        return;
                    }

                    // For large display headlines, convert black to rich black
                    if (targetFills) {
                        try {
                            // Uniform color fast-path
                            if (isPureOrFlatBlack(tr.characterAttributes.fillColor)) {
                                tr.characterAttributes.fillColor = richBlackColor;
                                stats.convertedFills++;
                            }
                        } catch (eMultiColor) {
                            // Mixed colors: only convert words that are actually black
                            try {
                                var words = item.words;
                                for (var wi = 0, wLen = words.length; wi < wLen; wi++) {
                                    var wRange = words[wi];
                                    if (isPureOrFlatBlack(wRange.characterAttributes.fillColor)) {
                                        wRange.characterAttributes.fillColor = richBlackColor;
                                        stats.convertedFills++;
                                    }
                                }
                            } catch (eW) {}
                        }
                    }
                } catch (eText) {}
                return;
            }

            // 4. Regular Vector Paths
            if (item.typename === "PathItem") {
                // Fills
                if (targetFills && item.filled) {
                    try {
                        if (isPureOrFlatBlack(item.fillColor)) {
                            item.fillColor = richBlackColor;
                            stats.convertedFills++;
                        }
                    } catch (ePf) {}
                }

                // Strokes
                if (targetStrokes && item.stroked) {
                    try {
                        if (isPureOrFlatBlack(item.strokeColor)) {
                            item.strokeColor = richBlackColor;
                            stats.convertedStrokes++;
                        }
                    } catch (ePs) {}
                }
            }
        }

        for (var i = 0, itemLen = items.length; i < itemLen; i++) {
            processItem(items[i]);
        }
        try { app.redraw(); } catch (eRedraw) {}

        var totalConverted = stats.convertedFills + stats.convertedStrokes;
        var modeNote = isDocCmyk ? "" : " (Note: Document is in RGB mode; CMYK is recommended for press)";
        return {
            status: "success",
            totalConverted: totalConverted,
            convertedFills: stats.convertedFills,
            convertedStrokes: stats.convertedStrokes,
            protectedTextFrames: stats.protectedTextFrames,
            overprintedTextFrames: stats.overprintedTextFrames,
            c: targetC,
            m: targetM,
            y: targetY,
            k: targetK,
            tic: (targetC + targetM + targetY + targetK),
            message: "Converted " + totalConverted + " objects to Rich Black (C:" + targetC + " M:" + targetM + " Y:" + targetY + " K:" + targetK + ")." +
                (stats.protectedTextFrames > 0 ? " (" + stats.protectedTextFrames + " small text frames protected as 100% K)" : "") + modeNote
        };
    }

    // -------------------------------------------------------------
    // Headless Bridge Invocation (From CEP Panel)
    // -------------------------------------------------------------
    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams !== null) {
        var params = __ozoHeadlessParams;
        var res = executeOptimization(params);
        __ozoHeadlessResult = res;
        return;
    }

    // -------------------------------------------------------------
    // Standalone ScriptUI Dialog (When run directly from Scripts menu)
    // -------------------------------------------------------------
    var dlg = new Window("dialog", SCRIPT_NAME + " v" + SCRIPT_VERSION);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = 16;

    // 1. Preset Selector
    var pnlPreset = dlg.add("panel", undefined, OZO.tr("Prepress Rich Black Profile"));
    pnlPreset.orientation = "column";
    pnlPreset.alignChildren = ["fill", "top"];
    pnlPreset.margins = 12;

    var ddlPreset = pnlPreset.add("dropdownlist", undefined, [
        PRESETS[0].name,
        PRESETS[1].name,
        PRESETS[2].name,
        PRESETS[3].name,
        PRESETS[4].name
    ]);
    ddlPreset.selection = 0;

    var descText = pnlPreset.add("statictext", undefined, PRESETS[0].desc, { multiline: true });
    descText.preferredSize.height = 36;

    // CMYK Sliders / Inputs
    var grpCmyk = pnlPreset.add("group");
    grpCmyk.orientation = "row";
    grpCmyk.alignChildren = ["center", "center"];
    grpCmyk.spacing = 8;

    function addColorControl(parent, label, defVal) {
        var g = parent.add("group");
        g.orientation = "column";
        g.spacing = 2;
        g.add("statictext", undefined, label);
        var inp = g.add("edittext", undefined, String(defVal));
        inp.characters = 4;
        return inp;
    }

    var inpC = addColorControl(grpCmyk, "C %", PRESETS[0].c);
    var inpM = addColorControl(grpCmyk, "M %", PRESETS[0].m);
    var inpY = addColorControl(grpCmyk, "Y %", PRESETS[0].y);
    var inpK = addColorControl(grpCmyk, "K %", PRESETS[0].k);

    var lblTic = pnlPreset.add("statictext", undefined, "Total Ink Coverage (TIC): " + PRESETS[0].tic + "% (Safe for Press)");

    function updateCmykFieldsFromPreset() {
        var idx = ddlPreset.selection ? ddlPreset.selection.index : 0;
        var p = PRESETS[idx];
        descText.text = p.desc;
        if (idx !== 4) {
            inpC.text = String(p.c);
            inpM.text = String(p.m);
            inpY.text = String(p.y);
            inpK.text = String(p.k);
            inpC.enabled = false;
            inpM.enabled = false;
            inpY.enabled = false;
            inpK.enabled = false;
        } else {
            inpC.enabled = true;
            inpM.enabled = true;
            inpY.enabled = true;
            inpK.enabled = true;
        }
        recalcTic();
    }

    function recalcTic() {
        var c = parseInt(inpC.text, 10) || 0;
        var m = parseInt(inpM.text, 10) || 0;
        var y = parseInt(inpY.text, 10) || 0;
        var k = parseInt(inpK.text, 10) || 0;
        var tic = c + m + y + k;
        var status = tic <= 260 ? "Safe for Press" : (tic <= 300 ? "Heavy Ink (Allow Extra Dry Time)" : "Warning: Over 300% May Smudge");
        lblTic.text = "Total Ink Coverage (TIC): " + tic + "% (" + status + ")";
    }

    ddlPreset.onChange = updateCmykFieldsFromPreset;
    inpC.onChanging = recalcTic;
    inpM.onChanging = recalcTic;
    inpY.onChanging = recalcTic;
    inpK.onChanging = recalcTic;

    // 2. Options Panel
    var pnlOpts = dlg.add("panel", undefined, OZO.tr("Prepress Protection & Scope"));
    pnlOpts.orientation = "column";
    pnlOpts.alignChildren = ["fill", "top"];
    pnlOpts.margins = 12;

    var grpScope = pnlOpts.add("group");
    grpScope.orientation = "row";
    var rbSelection = grpScope.add("radiobutton", undefined, OZO.tr("Selected Objects Only"));
    var rbDocument = grpScope.add("radiobutton", undefined, OZO.tr("Entire Document"));
    rbSelection.value = (doc.selection && doc.selection.length > 0);
    rbDocument.value = !rbSelection.value;

    var chkFills = pnlOpts.add("checkbox", undefined, OZO.tr("Convert Fill Colors"));
    chkFills.value = true;
    var chkStrokes = pnlOpts.add("checkbox", undefined, OZO.tr("Convert Stroke Colors (Outlines)"));
    chkStrokes.value = false;

    var chkProtectText = pnlOpts.add("checkbox", undefined, OZO.tr("Protect Small Text (Keep K:100% to avoid registration blur)"));
    chkProtectText.value = true;

    var chkOverprint = pnlOpts.add("checkbox", undefined, OZO.tr("Auto-Overprint pure black text (overprintFill = true)"));
    chkOverprint.value = true;

    // 3. Action Buttons
    var grpBtns = dlg.add("group");
    grpBtns.orientation = "row";
    grpBtns.alignment = ["right", "bottom"];

    var btnCancel = grpBtns.add("button", undefined, OZO.tr("Cancel"), { name: "cancel" });
    var btnOk = grpBtns.add("button", undefined, OZO.tr("Apply Rich Black"), { name: "ok" });

    btnCancel.onClick = function () { dlg.close(0); };
    btnOk.onClick = function () {
        var options = {
            c: parseInt(inpC.text, 10) || 60,
            m: parseInt(inpM.text, 10) || 40,
            y: parseInt(inpY.text, 10) || 40,
            k: parseInt(inpK.text, 10) || 100,
            targetFills: chkFills.value,
            targetStrokes: chkStrokes.value,
            protectSmallText: chkProtectText.value,
            textThreshold: 24,
            autoOverprint: chkOverprint.value,
            scope: rbSelection.value ? "selection" : "document"
        };
        var outcome = executeOptimization(options);
        if (outcome.status === "error") {
            alert(outcome.message);
            return;
        }
        alert(outcome.message);
        dlg.close(1);
    };

    updateCmykFieldsFromPreset();
    dlg.show();
})();
