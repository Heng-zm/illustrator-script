#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * Print Job Info (ទំលាក់ File Print)
 * Automated Print Job Ticket & Material Header Generator for Adobe Illustrator.
 * Automatically generates production headers for wide-format plotters & RIPs:
 * - Line 1: Date (e.g. 29 10 2026)
 * - Line 2: Material / Media (e.g. Silk Light Box, Sticker, Banner, Slim LED)
 * - Line 3: Dimensions & Quantity (e.g. w160cm x h80cm =1pcs)
 * - Optional Line 4: Customer / Note
 */
(function () {
    var SCRIPT_NAME = "Print Job Info";
    var SCRIPT_VERSION = "2.2";
    var STATE_NAMESPACE = "print_job_info_v1";
    var PREVIEW_LAYER_NAME = "__PrintJobInfo_Preview__";
    var RESULT_LAYER_NAME = "[Print Job Info]";

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var originalActiveLayer = doc.activeLayer;
    var previewLayer = null;
    var previewGroup = null;
    var originalArtboardRect = null;
    var activeArtboardIndex = doc.artboards.getActiveArtboardIndex();
    if (activeArtboardIndex >= 0 && activeArtboardIndex < doc.artboards.length) {
        var ab = doc.artboards[activeArtboardIndex].artboardRect;
        originalArtboardRect = [ab[0], ab[1], ab[2], ab[3]];
    }

    var initialSelectedTextFrame = null;
    try {
        var initSel = doc.selection;
        if (initSel && initSel.length) {
            for (var is = 0; is < initSel.length; is++) {
                if (initSel[is].typename === "TextFrame") {
                    initialSelectedTextFrame = initSel[is];
                    break;
                }
            }
        }
    } catch (eInitSel) {}

    // -------------------------------------------------------------
    // Utility & Measurement Functions
    // -------------------------------------------------------------
    function trim(value) {
        return String(value || "").replace(/^\s+|\s+$/g, "");
    }

    function cleanNumber(num) {
        var rounded = Math.round(num * 100) / 100;
        return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }

    function unitToPoints(val, unit) {
        return OZO.toPoints(val, unit || "cm");
    }

    function pointsToUnit(pt, unit) {
        return OZO.fromPoints(pt, unit || "cm");
    }

    function getTodayFormatted() {
        var d = new Date();
        var day = d.getDate();
        if (day < 10) day = "0" + day;
        var month = d.getMonth() + 1;
        if (month < 10) month = "0" + month;
        var year = d.getFullYear();
        // Exact format as requested: "29 10 2026"
        return day + " " + month + " " + year;
    }

    function hasKhmerText(str) {
        return /[\u1780-\u17FF]/.test(String(str || ""));
    }

    function sanitizeKhmerText(str) {
        if (!str) return "";
        var s = String(str);
        if (!hasKhmerText(s)) return trim(s);

        // 1. Remove space/ZWS/NBSP between base consonant/vowel and combining vowels/diacritics
        s = s.replace(/([\u1780-\u17D3])[\s\u200B\u00A0\uFEFF]+([\u17B4-\u17D3])/g, "$1$2");
        // 2. Remove space right after Coeng (subscript generator) U+17D2
        s = s.replace(/\u17D2[\s\u200B\u00A0\uFEFF]+/g, "\u17D2");
        // 3. Fix duplicate Coeng: ្្ -> ្
        s = s.replace(/\u17D2{2,}/g, "\u17D2");
        // 4. Fix spaced out "ច ោ ះ" -> "ចោះ"
        s = s.replace(/\u1785[\s\u200B\u00A0]*\u17C4[\s\u200B\u00A0]*\u17C7/g, "\u1785\u17C4\u17C7");
        // 5. Fix "ចោះកង" / "ចោះ ក ង" / "ចោះ កង" -> "ចោះកុង" (Die-cut sticker in printing industry)
        s = s.replace(/(\u1785\u17C4\u17C7|\u1780\u17b6\u178f\u17cb)[\s\u200B\u00A0]*\u1780[\s\u200B\u00A0]*\u1784(?![\u17BB\u17CB])/g, "$1\u1780\u17BB\u1784");
        // 6. Normalize consecutive spaces
        s = s.replace(/[ ]{2,}/g, " ");
        return trim(s);
    }

    var fontCache = {};

    function getFontByExactNames(nameList) {
        for (var i = 0; i < nameList.length; i++) {
            var n = nameList[i];
            try {
                var f = app.textFonts.getByName(n);
                if (f) return f;
            } catch (eNotFound) {}
        }
        return null;
    }

    function findFontByKeywords(familyKeywords, styleKeywords) {
        var bestMatch = null;
        try {
            for (var i = 0; i < app.textFonts.length; i++) {
                var tf = app.textFonts[i];
                var fam = (tf.family || "").toLowerCase();
                var name = (tf.name || "").toLowerCase();
                var style = (tf.style || "").toLowerCase();

                var familyMatches = false;
                for (var fk = 0; fk < familyKeywords.length; fk++) {
                    if (fam.indexOf(familyKeywords[fk]) !== -1 || name.indexOf(familyKeywords[fk]) !== -1) {
                        familyMatches = true;
                        break;
                    }
                }
                if (familyMatches) {
                    if (!bestMatch) bestMatch = tf;
                    if (styleKeywords) {
                        for (var sk = 0; sk < styleKeywords.length; sk++) {
                            if (style.indexOf(styleKeywords[sk]) !== -1 || name.indexOf(styleKeywords[sk]) !== -1) {
                                return tf;
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return bestMatch;
    }

    function resolveBestFont(fontChoiceIndex, containsKhmer) {
        // Choice 0: "Use Active Illustrator Font" (DO NOT override, retain user's working active font & composer)
        if (fontChoiceIndex === 0) {
            return null;
        }
        if (fontCache[fontChoiceIndex]) {
            return fontCache[fontChoiceIndex];
        }

        var resolved = null;
        if (fontChoiceIndex === 1) { // Kantumruy Pro Bold
            resolved = getFontByExactNames([
                "KantumruyPro-Bold", "Kantumruy-Bold", "KantumruyProBold",
                "KantumruyPro-SemiBold", "KantumruyPro-Medium", "KantumruyPro-Regular", "KantumruyPro"
            ]);
            if (!resolved) resolved = findFontByKeywords(["kantumruy"], ["bold", "semibold", "medium"]);
        } else if (fontChoiceIndex === 2) { // Leelawadee UI Bold
            resolved = getFontByExactNames([
                "LeelawadeeUI-Bold", "Leelawadee-Bold", "LeelawadeeUIBold", "LeelawadeeBold",
                "LeelawadeeUI-SemiBold", "LeelawadeeUI", "Leelawadee"
            ]);
            if (!resolved) resolved = findFontByKeywords(["leelawadee"], ["bold", "semibold"]);
        } else if (fontChoiceIndex === 3) { // Khmer OS Battambang
            resolved = getFontByExactNames([
                "KhmerOSBattambang-Bold", "KhmerOSBattambang", "KhmerOS-Battambang",
                "Khmer OS Battambang", "KhmerOSBattambangBold"
            ]);
            if (!resolved) resolved = findFontByKeywords(["battambang"], ["bold", "regular"]);
        } else if (fontChoiceIndex === 4) { // Hanuman Bold
            resolved = getFontByExactNames([
                "Hanuman-Bold", "Hanuman", "HanumanUI-Bold", "HanumanBold"
            ]);
            if (!resolved) resolved = findFontByKeywords(["hanuman"], ["bold", "regular"]);
        } else if (fontChoiceIndex === 5) { // Arial Bold
            resolved = getFontByExactNames([
                "Arial-BoldMT", "Arial-Black", "ArialMT", "ArialBold"
            ]);
            if (!resolved) resolved = findFontByKeywords(["arial"], ["bold", "black"]);
        } else if (fontChoiceIndex === 6) { // Impact
            resolved = getFontByExactNames(["Impact"]);
        }

        if (resolved) {
            fontCache[fontChoiceIndex] = resolved;
        }
        return resolved;
    }

    function isUsableDonor(tf) {
        if (!tf) return false;
        try {
            var lName = tf.layer ? tf.layer.name : "";
            if (lName === PREVIEW_LAYER_NAME || lName === RESULT_LAYER_NAME) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function findDonorTextFrame() {
        // 1. Initial selection captured at script launch
        if (initialSelectedTextFrame && isUsableDonor(initialSelectedTextFrame)) {
            return initialSelectedTextFrame;
        }

        // 2. Active selection
        try {
            var sel = doc.selection;
            if (sel && sel.length) {
                for (var s = 0; s < sel.length; s++) {
                    if (sel[s].typename === "TextFrame" && isUsableDonor(sel[s])) {
                        return sel[s];
                    }
                }
            }
        } catch (eSel) {}

        // 3. Search document text frames (prioritizing PointText with Khmer)
        try {
            var khmerPointDonor = null;
            var khmerAnyDonor = null;
            var anyPointDonor = null;
            var anyDonor = null;

            for (var i = 0; i < doc.textFrames.length; i++) {
                var tf = doc.textFrames[i];
                if (!isUsableDonor(tf)) continue;

                var isPoint = false;
                try { isPoint = (tf.kind === TextType.POINTTEXT); } catch (eKind) {}
                var isKhmer = false;
                try { isKhmer = hasKhmerText(tf.contents); } catch (eKh) {}

                if (isKhmer && isPoint) return tf; // Best match: PointText with Khmer
                if (isKhmer && !khmerAnyDonor) khmerAnyDonor = tf;
                if (isPoint && !anyPointDonor) anyPointDonor = tf;
                if (!anyDonor) anyDonor = tf;
            }

            return khmerAnyDonor || anyPointDonor || anyDonor;
        } catch (eDocTf) {}

        return null;
    }

    function getEffectiveBounds() {
        var sel = doc.selection;
        if (sel && sel.typename !== "TextRange" && sel.length > 0) {
            var combined = null;
            for (var i = 0; i < sel.length; i++) {
                var b = null;
                try { b = sel[i].geometricBounds; } catch (eGeo) {
                    try { b = sel[i].visibleBounds; } catch (eVis) {}
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
                return {
                    bounds: combined,
                    isArtboard: false,
                    widthPt: combined[2] - combined[0],
                    heightPt: combined[1] - combined[3]
                };
            }
        }

        // Default to active artboard. Measure from the pre-preview rect so the
        // live preview's temporary artboard expansion does not feed back into
        // the header size calculation.
        var abIdx = doc.artboards.getActiveArtboardIndex();
        if (abIdx < 0 || abIdx >= doc.artboards.length) abIdx = 0;
        var rect = doc.artboards[abIdx].artboardRect;
        if (abIdx === activeArtboardIndex && originalArtboardRect) {
            rect = originalArtboardRect;
        }
        return {
            bounds: [rect[0], rect[1], rect[2], rect[3]],
            isArtboard: true,
            widthPt: Math.abs(rect[2] - rect[0]),
            heightPt: Math.abs(rect[1] - rect[3])
        };
    }

    function getDocDefaultUnit() {
        try {
            var ru = doc.rulerUnits;
            if (ru === RulerUnits.Millimeters) return "mm";
            if (ru === RulerUnits.Centimeters) return "cm";
            if (ru === RulerUnits.Inches) return "in";
            if (ru === RulerUnits.Meters) return "m";
        } catch (eRu) {}
        return "cm";
    }

    var initialTarget = getEffectiveBounds();
    var defaultUnit = getDocDefaultUnit();
    var initWidth = cleanNumber(pointsToUnit(initialTarget.widthPt, defaultUnit));
    var initHeight = cleanNumber(pointsToUnit(initialTarget.heightPt, defaultUnit));

    // -------------------------------------------------------------
    // Color Helpers
    // -------------------------------------------------------------
    function getDarkHeaderColor() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 75; // #404040 Dark Charcoal Grey
            return cmyk;
        }
        var rgb = new RGBColor();
        rgb.red = 60;
        rgb.green = 60;
        rgb.blue = 60;
        return rgb;
    }

    function getWhiteColor() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 0;
            return cmyk;
        }
        var rgb = new RGBColor();
        rgb.red = 255;
        rgb.green = 255;
        rgb.blue = 255;
        return rgb;
    }

    function getBlackColor() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 100;
            return cmyk;
        }
        var rgb = new RGBColor();
        rgb.red = 0;
        rgb.green = 0;
        rgb.blue = 0;
        return rgb;
    }

    function getYellowColor() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 100;
            cmyk.black = 0;
            return cmyk;
        }
        var rgb = new RGBColor();
        rgb.red = 255;
        rgb.green = 255;
        rgb.blue = 0;
        return rgb;
    }

    function getCyanColor() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 100;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 0;
            return cmyk;
        }
        var rgb = new RGBColor();
        rgb.red = 0;
        rgb.green = 210;
        rgb.blue = 255;
        return rgb;
    }

    // -------------------------------------------------------------
    // UI Dialog Construction
    // -------------------------------------------------------------
    var dialog = new Window("dialog", OZO.tr("Print Job Header"));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = [16, 14, 16, 14];
    dialog.minimumSize = [530, 520];

    // Top Header Banner
    OZO.addDialogHeader(dialog, OZO.tr("Print Job Info"), "v2.2 \u2022 " + OZO.tr("Wide-Format RIP Metadata & Banner Studio"));

    // Panel 1: Job Information
    var headerPanel = dialog.add("panel", undefined, OZO.tr("Job Information"));
    headerPanel.orientation = "column";
    headerPanel.alignChildren = ["fill", "top"];
    headerPanel.margins = [14, 16, 14, 12];
    headerPanel.spacing = 8;

    // Row 1: Material (ប្រភេត / ប្រភេទ media)
    var matRow = headerPanel.add("group");
    matRow.orientation = "row";
    matRow.alignChildren = ["left", "center"];
    var matLabel = matRow.add("statictext", undefined, OZO.tr("Material:"));
    matLabel.preferredSize.width = 95;
    var materialPresets = [
        "Silk Light Box",
        "Sticker \u1785\u17C4\u17C7\u1780\u17BB\u1784",
        "Sticker \u1792\u1798\u17d2\u1798\u178f\u17b6",
        "Sticker \u1790\u17d2\u179b\u17b6",
        "Sticker \u1786\u17d2\u179b\u17bb\u17c7",
        "Sticker \u179f\u17d2\u17a2\u17b7\u178f\u1781\u17d2\u179b\u17b6\u17c6\u1784",
        "Sticker Glossy",
        "Sticker Matte",
        "Sticker Clear",
        "Banner",
        "Banner Flex",
        "Slim LED",
        "Slim LED Light Box",
        "Backlit Film",
        "Canvas",
        "Standee / Roll-Up",
        "PP Paper",
        "One Way Vision",
        "Custom..."
    ];
    var materialList = matRow.add("dropdownlist", undefined, materialPresets);
    materialList.selection = 0;
    materialList.preferredSize.width = 160;
    var materialCustomInput = matRow.add("edittext", undefined, "Silk Light Box");
    materialCustomInput.alignment = ["fill", "center"];
    materialCustomInput.helpTip = "Material name to print on header";

    materialList.onChange = function () {
        if (!materialList.selection) return;
        var chosen = materialList.selection.text;
        if (chosen !== "Custom...") {
            materialCustomInput.text = chosen;
        } else {
            materialCustomInput.active = true;
        }
        if (hasKhmerText(materialCustomInput.text) && fontChoiceList.selection && fontChoiceList.selection.index === 0) {
            fontChoiceList.selection = 1;
        }
        triggerPreviewUpdate();
    };

    // Row 2: Date & Quantity (Side-by-side)
    var dateQtyRow = headerPanel.add("group");
    dateQtyRow.orientation = "row";
    dateQtyRow.alignChildren = ["fill", "center"];

    var dateGrp = dateQtyRow.add("group");
    dateGrp.orientation = "row";
    dateGrp.alignChildren = ["left", "center"];
    var dateLabel = dateGrp.add("statictext", undefined, OZO.tr("Date:"));
    dateLabel.preferredSize.width = 95;
    var dateInput = dateGrp.add("edittext", undefined, getTodayFormatted());
    dateInput.preferredSize.width = 110;
    dateInput.helpTip = "Format: DD MM YYYY (e.g. 29 10 2026)";
    dateInput._ozoNoSave = true;
    var dateTodayBtn = dateGrp.add("button", undefined, "Today");
    dateTodayBtn.preferredSize = [55, 24];
    dateTodayBtn.onClick = function () {
        dateInput.text = getTodayFormatted();
        triggerPreviewUpdate();
    };

    var qtyGrp = dateQtyRow.add("group");
    qtyGrp.alignment = ["right", "center"];
    qtyGrp.orientation = "row";
    qtyGrp.alignChildren = ["right", "center"];
    var qtyLabel = qtyGrp.add("statictext", undefined, OZO.tr("Quantity (pcs):"));
    var qtyMinusBtn = qtyGrp.add("button", undefined, "-");
    qtyMinusBtn.preferredSize = [26, 24];
    var qtyInput = qtyGrp.add("edittext", undefined, "1");
    qtyInput.preferredSize = [45, 24];
    qtyInput.characters = 4;
    qtyInput._ozoNoSave = true;
    var qtyPlusBtn = qtyGrp.add("button", undefined, "+");
    qtyPlusBtn.preferredSize = [26, 24];

    qtyMinusBtn.onClick = function () {
        var q = Math.max(1, (parseInt(qtyInput.text, 10) || 1) - 1);
        qtyInput.text = String(q);
        triggerPreviewUpdate();
    };
    qtyPlusBtn.onClick = function () {
        var q = Math.max(1, (parseInt(qtyInput.text, 10) || 1) + 1);
        qtyInput.text = String(q);
        triggerPreviewUpdate();
    };

    // Row 3: Dimensions & Unit
    var dimRow = headerPanel.add("group");
    dimRow.orientation = "row";
    dimRow.alignChildren = ["left", "center"];
    var dimLabel = dimRow.add("statictext", undefined, OZO.tr("Dimensions:"));
    dimLabel.preferredSize.width = 95;

    dimRow.add("statictext", undefined, "W:");
    var widthInput = dimRow.add("edittext", undefined, initWidth);
    widthInput.characters = 6;
    widthInput._ozoNoSave = true;
    dimRow.add("statictext", undefined, "H:");
    var heightInput = dimRow.add("edittext", undefined, initHeight);
    heightInput.characters = 6;
    heightInput._ozoNoSave = true;

    dimRow.add("statictext", undefined, OZO.tr("Unit:"));
    var unitList = dimRow.add("dropdownlist", undefined, ["cm", "mm", "m", "in"]);
    var defaultUnitIdx = 0;
    if (defaultUnit === "mm") defaultUnitIdx = 1;
    else if (defaultUnit === "m") defaultUnitIdx = 2;
    else if (defaultUnit === "in") defaultUnitIdx = 3;
    unitList.selection = defaultUnitIdx;
    unitList.preferredSize.width = 60;

    var refreshDimBtn = dimRow.add("button", undefined, "⟳");
    refreshDimBtn.preferredSize = [26, 24];
    refreshDimBtn.helpTip = "Recalculate from selection or active artboard";

    var sourceBadge = dimRow.add("statictext", undefined, initialTarget.isArtboard ? "(" + OZO.tr("Artboard") + ")" : "(" + OZO.tr("Selection") + ")");
    sourceBadge.helpTip = "Measured from " + (initialTarget.isArtboard ? "Active Artboard" : "Selected Artwork");
    sourceBadge.graphics.foregroundColor = sourceBadge.graphics.newPen(
        sourceBadge.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.55], 1
    );

    var previousUnit = defaultUnit;
    var restoringState = true;
    unitList.onChange = function () {
        if (restoringState || !unitList.selection) return;
        var newUnit = unitList.selection.text;
        var wVal = parseFloat(widthInput.text.replace(/,/g, "."));
        var hVal = parseFloat(heightInput.text.replace(/,/g, "."));
        if (isFinite(wVal) && isFinite(hVal)) {
            var ptW = unitToPoints(wVal, previousUnit);
            var ptH = unitToPoints(hVal, previousUnit);
            widthInput.text = cleanNumber(pointsToUnit(ptW, newUnit));
            heightInput.text = cleanNumber(pointsToUnit(ptH, newUnit));
        }
        previousUnit = newUnit;
        triggerPreviewUpdate();
    };

    refreshDimBtn.onClick = function () {
        var cur = getEffectiveBounds();
        sourceBadge.text = cur.isArtboard ? "(" + OZO.tr("Artboard") + ")" : "(" + OZO.tr("Selection") + ")";
        sourceBadge.helpTip = "Measured from " + (cur.isArtboard ? "Active Artboard" : "Selected Artwork");
        var curUnit = unitList.selection ? unitList.selection.text : defaultUnit;
        widthInput.text = cleanNumber(pointsToUnit(cur.widthPt, curUnit));
        heightInput.text = cleanNumber(pointsToUnit(cur.heightPt, curUnit));
        triggerPreviewUpdate();
    };

    // Row 4: Optional Customer Name or Note
    var noteRow = headerPanel.add("group");
    noteRow.orientation = "row";
    noteRow.alignChildren = ["left", "center"];
    var noteLabel = noteRow.add("statictext", undefined, OZO.tr("Customer / Note (optional):"));
    noteLabel.preferredSize.width = 160;
    var noteInput = noteRow.add("edittext", undefined, "");
    noteInput.alignment = ["fill", "center"];
    noteInput.helpTip = "Optional note or customer contact (e.g. Tel: 012 288 285 / ហាង...)";
    noteInput._ozoNoSave = true;

    // Panel 2: Style & Layout Panel
    var stylePanel = dialog.add("panel", undefined, OZO.tr("Header Layout & Styling"));
    stylePanel.orientation = "column";
    stylePanel.alignChildren = ["fill", "top"];
    stylePanel.margins = [14, 16, 14, 12];
    stylePanel.spacing = 8;

    // Checkboxes Row
    var checkRow = stylePanel.add("group");
    checkRow.orientation = "row";
    checkRow.alignChildren = ["left", "center"];
    var expandArtboardCheck = checkRow.add("checkbox", undefined,
        OZO.tr("Expand artboard at top to fit header"));
    expandArtboardCheck.value = true;
    expandArtboardCheck.helpTip = "Automatically increases artboard height so print header is included in final PDF/TIFF export";

    var darkBoxCheck = checkRow.add("checkbox", undefined,
        OZO.tr("Dark background box behind text"));
    darkBoxCheck.value = true;
    darkBoxCheck.helpTip = "Draws dark charcoal background block behind header text (matching sample photo)";

    // Typography Row 1: Font Selection & Fix Khmer Help
    var fontRow = stylePanel.add("group");
    fontRow.orientation = "row";
    fontRow.alignChildren = ["left", "center"];
    var fontLabel = fontRow.add("statictext", undefined, OZO.tr("Font:"));
    fontLabel.preferredSize.width = 65;
    var fontChoiceList = fontRow.add("dropdownlist", undefined, [
        OZO.tr("Use Active Illustrator Font"),
        "Kantumruy Pro Bold",
        "Leelawadee UI Bold",
        "Khmer OS Battambang",
        "Hanuman Bold",
        "Arial Bold",
        "Impact"
    ]);
    fontChoiceList.selection = 0;
    fontChoiceList.preferredSize.width = 220;

    var khmerHelpBtn = fontRow.add("button", undefined, "❓ " + (OZO.isKhmer() ? "\u1780\u17c2\u17a2\u1780\u17d2\u179f\u179a (+)" : "Fix Khmer (+)"));
    khmerHelpBtn.preferredSize = [105, 24];
    khmerHelpBtn.helpTip = "How to fix Khmer stacked subscript plus signs (+) in Illustrator";
    khmerHelpBtn.onClick = function () {
        alert(
            "==== \u179a\u1794\u17c0\u1794\u178a\u17c4\u17c7\u179f\u17d2\u179a\u17b6\u1799\u17a2\u1780\u17d2\u179f\u179a\u1781\u17d2\u1798\u17c2\u179a\u1785\u17c1\u1789\u179f\u1789\u17d2\u1789\u17b6\u1794\u17bc\u1780 (+) \u17ac\u179a\u1784\u17d2\u179c\u1784\u17cb\u1798\u17bc\u179b (\u25cc) ====\n\n" +
            "\u26a1 \u179c\u17b7\u1792\u17b8\u1791\u17b8 \u17e1 (\u179b\u17b7\u1780\u179b\u17be\u178a\u17c4\u17c7\u179f\u17d2\u179a\u17b6\u1799\u17a2\u179f\u17cb \u17e5 \u179c\u17b7\u1793\u17b6\u1791\u17b8 - \u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u179a\u17b6\u179b\u17cb\u17af\u1780\u179f\u17b6\u179a) \u26a1\n" +
            "\u17e1. \u1785\u17bb\u1785 Ctrl + Shift + A (\u178a\u17be\u1798\u17d2\u1794\u17b8 Deselect \u1780\u17bb\u17c6\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u17a2\u17d2\u179c\u17b8\u1791\u17b6\u17c6\u1784\u17a2\u179f\u17cb)\n" +
            "\u17e2. \u1785\u17bb\u1785\u1794\u17be\u1780\u1795\u17d2\u1791\u17b6\u17c6\u1784 Paragraph: Ctrl + Alt + T\n" +
            "\u17e3. \u1785\u17bb\u1785\u1798\u17c9\u17ba\u1793\u17bb\u1799\u178f\u17bc\u1785 \u2261 \u1793\u17c4\u1787\u17d2\u179a\u17bb\u1784\u179f\u17d2\u178a\u17b6\u17c6\u1781\u17b6\u1784\u179b\u17be\u1793\u17c3 Paragraph Panel\n" +
            "\u17e4. \u1787\u17d2\u179a\u17be\u179f\u1799\u1780 'Middle Eastern & South Asian Every-line Composer'\n" +
            "-> \u179a\u17bd\u1785\u179a\u17b6\u179b\u17cb! Illustrator \u1793\u17b9\u1784\u1780\u17c6\u178e\u178f\u17cb\u1787\u17b6\u179f\u17d2\u178f\u1784\u17cb\u178a\u17b6\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u17d4\n\n" +
            "--------------------------------------------------\n" +
            "\u26a1 \u179c\u17b7\u1792\u17b8\u1791\u17b8 \u17e2 (\u1780\u17b6\u179a\u1794\u17d2\u179a\u17be Text \u178a\u17c2\u179b\u1798\u17b6\u1793\u179f\u17d2\u179a\u17b6\u1794\u17cb\u179b\u17be Artboard) \u26a1\n" +
            "\u179f\u17bc\u1798 Select \u179b\u17be Text \u1781\u17d2\u1798\u17c2\u179a\u178e\u17b6\u1798\u17bd\u1799\u178a\u17c2\u179b\u1785\u17c1\u1789\u1787\u17be\u1784\u178f\u17d2\u179a\u17b9\u1798\u178f\u17d2\u179a\u17bc\u179c \u179a\u17bd\u1785\u1785\u17b6\u17c6\u1785\u17bb\u1785\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a Script \u1793\u17c1\u17c7 \u179c\u17b6\u1793\u17b9\u1784\u1785\u1798\u17d2\u179b\u1784 (Clone) \u1780\u17b6\u179a\u1780\u17c6\u178e\u178f\u17cb\u1787\u17be\u1784\u17a2\u1780\u17d2\u179f\u179a\u178f\u17b6\u1798\u178a\u17c4\u1799\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u17d4\n\n" +
            "--------------------------------------------------\n" +
            "\u26a1 Preferences \u26a1\n" +
            "\u1794\u17be\u1780 Ctrl + K > Type > \u1792\u17b8\u1780 [x] Show Indic Options"
        );
    };

    // Typography Row 2: Text Size, Color & Alignment
    var formatRow = stylePanel.add("group");
    formatRow.orientation = "row";
    formatRow.alignChildren = ["left", "center"];

    formatRow.add("statictext", undefined, OZO.tr("Text Size:"));
    var fontSizeList = formatRow.add("dropdownlist", undefined, [
        "Auto (Proportional ~5%)", "Small", "Medium", "Large", "Extra Large"
    ]);
    fontSizeList.selection = 0;
    fontSizeList.preferredSize.width = 150;

    formatRow.add("statictext", undefined, OZO.tr("Text color:"));
    var textColorList = formatRow.add("dropdownlist", undefined, ["White", "Yellow", "Cyan", "Black"]);
    textColorList.selection = 0; // Default White
    textColorList.preferredSize.width = 75;

    formatRow.add("statictext", undefined, OZO.tr("Alignment:"));
    var alignList = formatRow.add("dropdownlist", undefined, [OZO.tr("Left"), OZO.tr("Center"), OZO.tr("Right")]);
    alignList.selection = 0;
    alignList.preferredSize.width = 75;

    // Panel 3: Live Header Preview Card
    var previewCard = dialog.add("panel", undefined, OZO.tr("Live Header Preview"));
    previewCard.orientation = "column";
    previewCard.alignChildren = ["fill", "center"];
    previewCard.margins = [16, 12, 16, 12];
    previewCard.spacing = 3;

    var previewCardLine1 = previewCard.add("statictext", undefined, getTodayFormatted());
    var previewCardLine2 = previewCard.add("statictext", undefined, "Silk Light Box");
    var previewCardLine3 = previewCard.add("statictext", undefined, "w" + initWidth + defaultUnit + " x h" + initHeight + defaultUnit + " =1pcs");
    var previewCardLine4 = previewCard.add("statictext", undefined, "");
    previewCardLine4.visible = false;

    try {
        var cardFont = ScriptUI.newFont("dialog", "BOLD", 13);
        previewCardLine1.graphics.font = cardFont;
        previewCardLine2.graphics.font = cardFont;
        previewCardLine3.graphics.font = cardFont;
        previewCardLine4.graphics.font = cardFont;
    } catch (eCardFont) {}

    function updatePreviewCardColors(textColorIndex) {
        var col = [0.95, 0.95, 0.95]; // White
        if (textColorIndex === 1) col = [1, 0.9, 0.1]; // Yellow
        else if (textColorIndex === 2) col = [0, 0.85, 1]; // Cyan
        else if (textColorIndex === 3) col = [0.2, 0.2, 0.2]; // Black

        try {
            var pen = previewCard.graphics.newPen(previewCard.graphics.PenType.SOLID_COLOR, col, 1);
            previewCardLine1.graphics.foregroundColor = pen;
            previewCardLine2.graphics.foregroundColor = pen;
            previewCardLine3.graphics.foregroundColor = pen;
            previewCardLine4.graphics.foregroundColor = pen;
        } catch (ePen) {}
    }
    updatePreviewCardColors(0);

    // Status Message Row
    var statusText = dialog.add("statictext", undefined, "✓ " + OZO.tr("Ready"));
    statusText.graphics.foregroundColor = statusText.graphics.newPen(
        statusText.graphics.PenType.SOLID_COLOR, [0.25, 0.65, 0.35], 1
    );

    // Action Buttons
    var buttons = dialog.add("group");
    buttons.alignment = ["fill", "bottom"];
    buttons.spacing = 8;

    var previewBtn = buttons.add("button", undefined, OZO.tr("Update Preview"));
    previewBtn.preferredSize = [120, 30];

    var btnSpacer = buttons.add("group");
    btnSpacer.alignment = ["fill", "center"];

    var cancelBtn = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    cancelBtn.preferredSize = [90, 30];

    var applyBtn = buttons.add("button", undefined, "✓ " + OZO.tr("Generate Header"), {name: "ok"});
    applyBtn.preferredSize = [150, 32];

    dialog.defaultElement = applyBtn;
    dialog.cancelElement = cancelBtn;

    OZO.addLanguageSelector(dialog, function () {
        triggerPreviewUpdate();
    });

    // -------------------------------------------------------------
    // Core Generation Logic
    // -------------------------------------------------------------
    function readSettings() {
        var unit = unitList.selection ? unitList.selection.text : "cm";
        var w = parseFloat(String(widthInput.text).replace(/,/g, "."));
        var h = parseFloat(String(heightInput.text).replace(/,/g, "."));
        if (!isFinite(w) || w <= 0) throw new Error("Width must be greater than zero.");
        if (!isFinite(h) || h <= 0) throw new Error("Height must be greater than zero.");

        var q = parseInt(qtyInput.text, 10);
        if (!isFinite(q) || q <= 0) q = 1;

        return {
            material: sanitizeKhmerText(materialCustomInput.text) || "Silk Light Box",
            dateStr: trim(dateInput.text) || getTodayFormatted(),
            widthVal: cleanNumber(w),
            heightVal: cleanNumber(h),
            unit: unit,
            qty: q,
            note: sanitizeKhmerText(noteInput.text),
            expandArtboard: expandArtboardCheck.value,
            darkBox: darkBoxCheck.value,
            textColorIndex: textColorList.selection ? textColorList.selection.index : 0,
            alignmentIndex: alignList.selection ? alignList.selection.index : 0,
            fontSizeIndex: fontSizeList.selection ? fontSizeList.selection.index : 0,
            fontChoiceIndex: fontChoiceList.selection ? fontChoiceList.selection.index : 0
        };
    }

    function calculateHeaderGeometry(target, settings) {
        var artworkW = target.widthPt;
        var artworkH = target.heightPt;

        // Proportional text size calculation
        var baseFontSize;
        if (settings.fontSizeIndex === 0) {
            // Auto: ~4.5% of artwork height, clamped to reasonable sign sizes
            baseFontSize = Math.max(16, Math.min(240, artworkH * 0.045));
        } else if (settings.fontSizeIndex === 1) {
            baseFontSize = Math.max(12, artworkH * 0.025);
        } else if (settings.fontSizeIndex === 2) {
            baseFontSize = Math.max(18, artworkH * 0.045);
        } else if (settings.fontSizeIndex === 3) {
            baseFontSize = Math.max(24, artworkH * 0.07);
        } else {
            baseFontSize = Math.max(32, artworkH * 0.10);
        }

        var lineHeight = baseFontSize * 1.25;
        var lineCount = settings.note ? 4 : 3;
        var totalTextHeight = lineCount * lineHeight;
        var paddingY = baseFontSize * 0.8;
        var paddingX = baseFontSize * 0.8;
        var headerHeight = totalTextHeight + paddingY * 2;

        return {
            fontSize: baseFontSize,
            lineHeight: lineHeight,
            paddingX: paddingX,
            paddingY: paddingY,
            headerHeight: headerHeight,
            headerWidth: artworkW
        };
    }

    var currentArtboardExpandedHeight = 0;

    function cleanupPreview() {
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (eRemove) {}
        }
        previewLayer = null;
        previewGroup = null;

        // Restore artboard if expanded during preview
        if (currentArtboardExpandedHeight !== 0 && originalArtboardRect &&
                activeArtboardIndex >= 0 && activeArtboardIndex < doc.artboards.length) {
            try {
                doc.artboards[activeArtboardIndex].artboardRect = [
                    originalArtboardRect[0],
                    originalArtboardRect[1],
                    originalArtboardRect[2],
                    originalArtboardRect[3]
                ];
            } catch (eAb) {}
            currentArtboardExpandedHeight = 0;
        }
        if (originalActiveLayer) {
            try { doc.activeLayer = originalActiveLayer; } catch (eL) {}
        }
    }

    function renderHeaderGroup(container, target, settings, geom) {
        var grp = container.groupItems.add();
        grp.name = "Print Header Block";

        var targetBounds = target.bounds;
        var left = targetBounds[0];
        var top = targetBounds[1];
        var right = targetBounds[2];
        var headerBottom = top;
        var headerTop = top + geom.headerHeight;

        // 1. Dark Background Box (matching photo)
        if (settings.darkBox) {
            var bgRect = grp.pathItems.rectangle(headerTop, left, geom.headerWidth, geom.headerHeight);
            bgRect.stroked = false;
            bgRect.filled = true;
            bgRect.fillColor = getDarkHeaderColor();
            bgRect.name = "Header Background";
        }

        // 2. Format 3 Core Lines
        // Line 1: Date (e.g. 29 10 2026)
        // Line 2: Material (e.g. Silk Light Box)
        // Line 3: Dimensions & Quantity (e.g. w160cm x h80cm =1pcs)
        var dimQtyStr = "w" + settings.widthVal + settings.unit + " x h" +
            settings.heightVal + settings.unit + " =" + settings.qty + "pcs";

        var lines = [
            settings.dateStr,
            settings.material,
            dimQtyStr
        ];
        if (settings.note) {
            lines.push(settings.note);
        }

        var textContent = lines.join("\n");

        // 3. Text Frame Creation: clone from existing working text frame to preserve World-Ready Composer
        var donor = findDonorTextFrame();
        var txt = null;
        if (donor) {
            try {
                txt = donor.duplicate(grp, ElementPlacement.PLACEATEND);
                if (txt.kind === TextType.AREATEXT) {
                    try {
                        txt.width = Math.max(geom.headerWidth - (geom.paddingX * 2), 200);
                        txt.height = geom.headerHeight;
                    } catch (eDim) {}
                }
                txt.contents = textContent;
            } catch (eDup) {
                txt = null;
            }
        }
        if (!txt) {
            txt = grp.textFrames.add();
            txt.contents = textContent;
        }

        // 4. Character & Font styling
        var charAttr = txt.textRange.characterAttributes;
        charAttr.size = geom.fontSize;
        charAttr.leading = geom.lineHeight;
        charAttr.tracking = 0;
        charAttr.baselineShift = 0;
        charAttr.horizontalScale = 100;
        charAttr.verticalScale = 100;
        try { charAttr.capitalization = FontCapsOption.NORMAL; } catch (eNormCaps) {}

        // Color
        if (settings.textColorIndex === 0) {
            charAttr.fillColor = getWhiteColor();
        } else if (settings.textColorIndex === 1) {
            charAttr.fillColor = getYellowColor();
        } else if (settings.textColorIndex === 2) {
            charAttr.fillColor = getCyanColor();
        } else {
            charAttr.fillColor = getBlackColor();
        }

        // Resolve and apply font if specified by user (Option 0 retains active Illustrator / donor font)
        var containsKhmer = hasKhmerText(textContent);
        var chosenFont = resolveBestFont(settings.fontChoiceIndex, containsKhmer);
        if (chosenFont) {
            try {
                charAttr.textFont = chosenFont;
            } catch (eApplyFont) {}
        }

        // Disable hyphenation
        for (var pa = 0; pa < txt.paragraphs.length; pa++) {
            try {
                txt.paragraphs[pa].paragraphAttributes.hyphenation = false;
            } catch (eNoHyphen) {}
        }

        // 5. Text Position & Justification
        // Area text anchors at its frame's top-left, so justification must do
        // the aligning there; only point text is positioned at the anchor.
        var isAreaText = false;
        try { isAreaText = txt.kind === TextType.AREATEXT; } catch (eKind) {}
        var textLeft = left + geom.paddingX;
        if (settings.alignmentIndex === 1) {
            // Center
            for (var p1 = 0; p1 < txt.paragraphs.length; p1++) {
                try { txt.paragraphs[p1].paragraphAttributes.justification = Justification.CENTER; } catch (eJ1) {}
            }
            if (!isAreaText) textLeft = left + geom.headerWidth / 2;
        } else if (settings.alignmentIndex === 2) {
            // Right
            for (var p2 = 0; p2 < txt.paragraphs.length; p2++) {
                try { txt.paragraphs[p2].paragraphAttributes.justification = Justification.RIGHT; } catch (eJ2) {}
            }
            if (!isAreaText) textLeft = right - geom.paddingX;
        } else {
            // Left
            for (var p0 = 0; p0 < txt.paragraphs.length; p0++) {
                try { txt.paragraphs[p0].paragraphAttributes.justification = Justification.LEFT; } catch (eJ0) {}
            }
            textLeft = left + geom.paddingX;
        }

        var textTop = headerTop - geom.paddingY;
        txt.position = [textLeft, textTop];
        txt.zOrder(ZOrderMethod.BRINGTOFRONT);

        return {
            group: grp,
            textFrame: txt
        };
    }

    function generatePreview(settings) {
        var target = getEffectiveBounds();
        var geom = calculateHeaderGeometry(target, settings);

        // Expand/restore Artboard only when expansion height changes (prevents viewport redraw jitter)
        var neededExpandHeight = settings.expandArtboard ? geom.headerHeight : 0;
        if (neededExpandHeight !== currentArtboardExpandedHeight && originalArtboardRect &&
                activeArtboardIndex >= 0 && activeArtboardIndex < doc.artboards.length) {
            try {
                var ab = doc.artboards[activeArtboardIndex];
                ab.artboardRect = [
                    originalArtboardRect[0],
                    originalArtboardRect[1] + neededExpandHeight,
                    originalArtboardRect[2],
                    originalArtboardRect[3]
                ];
                currentArtboardExpandedHeight = neededExpandHeight;
            } catch (eAbExp) {}
        }

        // Reuse preview layer if already created for ultra-fast in-place preview
        if (!previewLayer) {
            for (var pl = 0; pl < doc.layers.length; pl++) {
                if (doc.layers[pl].name === PREVIEW_LAYER_NAME) {
                    previewLayer = doc.layers[pl];
                    break;
                }
            }
            if (!previewLayer) {
                previewLayer = doc.layers.add();
                previewLayer.name = PREVIEW_LAYER_NAME;
            }
        }

        previewLayer.locked = false;
        previewLayer.visible = true;

        if (previewGroup) {
            try { previewGroup.remove(); } catch (ePgRem) {}
            previewGroup = null;
        } else {
            try {
                while (previewLayer.pageItems.length > 0) {
                    previewLayer.pageItems[0].remove();
                }
            } catch (eCleanItems) {}
        }

        doc.activeLayer = previewLayer;
        var rendered = renderHeaderGroup(previewLayer, target, settings, geom);
        previewGroup = rendered.group;
        app.redraw();
        return previewGroup;
    }

    function triggerPreviewUpdate() {
        try {
            var st = readSettings();
            generatePreview(st);

            // Update in-dialog live ticket preview card
            if (typeof previewCardLine1 !== "undefined" && previewCardLine1) {
                previewCardLine1.text = st.dateStr;
                previewCardLine2.text = st.material;
                previewCardLine3.text = "w" + st.widthVal + st.unit + " x h" + st.heightVal + st.unit + " =" + st.qty + "pcs";
                if (st.note) {
                    previewCardLine4.text = st.note;
                    previewCardLine4.visible = true;
                } else {
                    previewCardLine4.text = "";
                    previewCardLine4.visible = false;
                }

                var just = "left";
                if (st.alignmentIndex === 1) just = "center";
                else if (st.alignmentIndex === 2) just = "right";
                previewCardLine1.alignment = [just, "center"];
                previewCardLine2.alignment = [just, "center"];
                previewCardLine3.alignment = [just, "center"];
                previewCardLine4.alignment = [just, "center"];

                if (typeof updatePreviewCardColors === "function") {
                    updatePreviewCardColors(st.textColorIndex);
                }
            }

            statusText.text = "✓ " + OZO.tr("Ready") + ": " + st.material + " | " + st.dateStr + " | w" +
                st.widthVal + st.unit + " x h" + st.heightVal + st.unit + " =" + st.qty + "pcs";
            statusText.graphics.foregroundColor = statusText.graphics.newPen(
                statusText.graphics.PenType.SOLID_COLOR, [0.25, 0.65, 0.35], 1
            );
        } catch (e) {
            statusText.text = "✕ " + e.message;
            statusText.graphics.foregroundColor = statusText.graphics.newPen(
                statusText.graphics.PenType.SOLID_COLOR, [0.85, 0.35, 0.2], 1
            );
        }
    }

    // Attach Live Events
    previewBtn.onClick = triggerPreviewUpdate;
    materialCustomInput.onChanging = function () {
        if (hasKhmerText(materialCustomInput.text) && fontChoiceList.selection && fontChoiceList.selection.index === 0) {
            fontChoiceList.selection = 1;
        }
        triggerPreviewUpdate();
    };
    dateInput.onChanging = triggerPreviewUpdate;
    widthInput.onChanging = triggerPreviewUpdate;
    heightInput.onChanging = triggerPreviewUpdate;
    qtyInput.onChanging = triggerPreviewUpdate;
    noteInput.onChanging = function () {
        if (hasKhmerText(noteInput.text) && fontChoiceList.selection && fontChoiceList.selection.index === 0) {
            fontChoiceList.selection = 1;
        }
        triggerPreviewUpdate();
    };
    expandArtboardCheck.onClick = triggerPreviewUpdate;
    darkBoxCheck.onClick = triggerPreviewUpdate;
    textColorList.onChange = triggerPreviewUpdate;
    alignList.onChange = triggerPreviewUpdate;
    fontSizeList.onChange = triggerPreviewUpdate;
    fontChoiceList.onChange = triggerPreviewUpdate;

    OZO.makeNumericSmooth(widthInput, {step: 1, min: 0.1, max: 99999});
    OZO.makeNumericSmooth(heightInput, {step: 1, min: 0.1, max: 99999});
    OZO.makeNumericSmooth(qtyInput, {step: 1, min: 1, max: 9999});

    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    var restoredUnit = unitList.selection ? unitList.selection.text : defaultUnit;
    previousUnit = restoredUnit;
    widthInput.text = cleanNumber(pointsToUnit(initialTarget.widthPt, restoredUnit));
    heightInput.text = cleanNumber(pointsToUnit(initialTarget.heightPt, restoredUnit));
    restoringState = false;

    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    function executePrintJobCore(finalSettings) {
        cleanupPreview();

        var finalTarget = getEffectiveBounds();
        var finalGeom = calculateHeaderGeometry(finalTarget, finalSettings);

        // Expand artboard permanently if chosen
        if (finalSettings.expandArtboard && activeArtboardIndex >= 0 &&
                activeArtboardIndex < doc.artboards.length) {
            var finalAb = doc.artboards[activeArtboardIndex];
            finalAb.artboardRect = [
                originalArtboardRect[0],
                originalArtboardRect[1] + finalGeom.headerHeight,
                originalArtboardRect[2],
                originalArtboardRect[3]
            ];
            currentArtboardExpandedHeight = finalGeom.headerHeight;
        }

        // Find or create result layer
        var destLayer = null;
        for (var li = 0; li < doc.layers.length; li++) {
            if (doc.layers[li].name === RESULT_LAYER_NAME) {
                destLayer = doc.layers[li];
                break;
            }
        }
        if (!destLayer) {
            destLayer = doc.layers.add();
            destLayer.name = RESULT_LAYER_NAME;
        }
        destLayer.locked = false;
        destLayer.visible = true;
        destLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
        doc.activeLayer = destLayer;

        for (var dli = destLayer.pageItems.length - 1; dli >= 0; dli--) {
            try {
                if (destLayer.pageItems[dli].name === "Print Header Block") {
                    destLayer.pageItems[dli].remove();
                }
            } catch (eOldItem) {}
        }

        var rendered = renderHeaderGroup(destLayer, finalTarget, finalSettings, finalGeom);
        var headerGroup = rendered.group;
        var headerTxt = rendered.textFrame;

        doc.selection = null;
        try {
            headerGroup.selected = true;
            headerTxt.selected = true;
        } catch (eSel) {}

        app.redraw();
        return {
            status: "success",
            material: finalSettings.material,
            date: finalSettings.dateStr,
            dimensions: "w" + finalSettings.widthVal + finalSettings.unit + " x h" + finalSettings.heightVal + finalSettings.unit + " =" + finalSettings.qty + "pcs",
            layer: RESULT_LAYER_NAME
        };
    }

    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        try {
            var hp = __ozoHeadlessParams;
            var w = parseFloat(String(hp.widthVal !== undefined ? hp.widthVal : initWidth).replace(/,/g, "."));
            var h = parseFloat(String(hp.heightVal !== undefined ? hp.heightVal : initHeight).replace(/,/g, "."));
            if (!isFinite(w) || w <= 0) w = parseFloat(initWidth) || 10;
            if (!isFinite(h) || h <= 0) h = parseFloat(initHeight) || 10;
            var headlessSettings = {
                material: sanitizeKhmerText(hp.material) || "Silk Light Box",
                dateStr: trim(hp.dateStr) || getTodayFormatted(),
                widthVal: cleanNumber(w),
                heightVal: cleanNumber(h),
                unit: hp.unit || defaultUnit,
                qty: parseInt(hp.qty, 10) || 1,
                note: sanitizeKhmerText(hp.note || ""),
                expandArtboard: hp.expandArtboard === true,
                darkBox: hp.darkBox === true,
                textColorIndex: typeof hp.textColorIndex === "number" ? hp.textColorIndex : 0,
                alignmentIndex: typeof hp.alignmentIndex === "number" ? hp.alignmentIndex : 0,
                fontSizeIndex: typeof hp.fontSizeIndex === "number" ? hp.fontSizeIndex : 0,
                fontChoiceIndex: typeof hp.fontChoiceIndex === "number" ? hp.fontChoiceIndex : 0
            };
            __ozoHeadlessResult = executePrintJobCore(headlessSettings);
            return;
        } catch (eHeadless) {
            cleanupPreview();
            __ozoHeadlessResult = {
                status: "error",
                message: eHeadless && eHeadless.message ? eHeadless.message : String(eHeadless)
            };
            return;
        }
    }

    // Initial Live Preview
    triggerPreviewUpdate();

    var result = dialog.show();
    if (result !== 1) {
        cleanupPreview();
        return;
    }

    // Final Application
    try {
        var finalSettings = readSettings();
        executePrintJobCore(finalSettings);
        OZO.saveWindowState(dialog, STATE_NAMESPACE);
        app.redraw();

        var containsKhmer = hasKhmerText(finalSettings.material + finalSettings.note);
        var successMsg = OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17d2\u1794\u17b6\u179b File Print \u178a\u17c4\u1799\u1787\u17c4\u1782\u1787\u17d0\u1799\u17d4\n\n" +
            finalSettings.dateStr + "\n" +
            finalSettings.material + "\n" +
            "w" + finalSettings.widthVal + finalSettings.unit + " x h" + finalSettings.heightVal + finalSettings.unit + " =" + finalSettings.qty + "pcs\n\n" +
            (containsKhmer ? "\u1782\u1793\u17d2\u179b\u17b9\u17c7\u17d6 \u1794\u17be\u1787\u17be\u1784\u17a2\u1780\u17d2\u179f\u179a\u1785\u17c1\u1789 (+) \u179f\u17bc\u1798\u1785\u17bb\u1785\u1794\u17be\u1780 Paragraph (Ctrl+Alt+T) > Menu \u2261 > Middle Eastern Composer\n\n" : "") +
            OZO.credit() :
            "Print Job Header created successfully!\n\n" +
            finalSettings.dateStr + "\n" +
            finalSettings.material + "\n" +
            "w" + finalSettings.widthVal + finalSettings.unit + " x h" + finalSettings.heightVal + finalSettings.unit + " =" + finalSettings.qty + "pcs\n\n" +
            (containsKhmer ? "Tip: If Khmer subscript shows (+), open Paragraph (Ctrl+Alt+T) > Menu \u2261 > Middle Eastern Composer\n\n" : "") +
            OZO.credit();

        alert(successMsg);
    } catch (err) {
        cleanupPreview();
        alert(SCRIPT_NAME + " failed.\n\n" + err.message);
    }
})();
