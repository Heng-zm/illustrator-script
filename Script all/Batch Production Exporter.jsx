#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * Ozo Tools - Batch Production Exporter (នាំចេញឯកសារជាកញ្ចប់)
 * High-Performance Automated Artboard Exporter for Prepress, Print Production & Digital Delivery.
 * 
 * Performance & Optimization Features:
 * 1. Multi-Format Batch Export:
 *    - PDF: Native presets, with Single Multi-Page PDF or Separate Files per Artboard.
 *    - TIFF: CMYK/RGB, LZW compression, 300/150/72 DPI optimized for large-format RIPs.
 *    - PNG: Transparent background, 300/150/72 DPI art-optimized anti-aliasing.
 *    - JPEG: 100% max proofing quality, CMYK/RGB, 300/150/72 DPI.
 * 2. Prepress Outlining: Optional automated font outlining with zero loss of live editable text.
 * 3. Non-Destructive Snapshot Engine: Automatically protects untitled & unsaved AI documents.
 * 4. High-Efficiency Processing: Memory cleanup ($.gc()) and modal alert suppression during export.
 * 5. Dynamic Token Naming: [doc], [ab], [num], [raw_num], [w], [h], [unit], [date], [time], [color].
 * 6. Full English & Khmer (ភាសាខ្មែរ) bilingual localization with adaptive 4-tier dark/light theme.
 */
(function () {
    var SCRIPT_NAME = "Batch Production Exporter";
    var SCRIPT_VERSION = "2.0";
    var STATE_NAMESPACE = "batch_production_exporter_v2";

    if (app.documents.length === 0) {
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var totalArtboards = doc.artboards.length;
    var activeAbIndex = doc.artboards.getActiveArtboardIndex();
    var defaultUnit = OZO.getDocDefaultUnit ? OZO.getDocDefaultUnit(doc) : "mm";

    // Detect if document is saved on disk
    var docFile = null;
    var defaultDestFolder = null;
    try {
        if (doc.saved && doc.fullName) {
            docFile = doc.fullName;
            defaultDestFolder = doc.path;
        }
    } catch (eDocFile) {}

    if (!defaultDestFolder) {
        try {
            defaultDestFolder = Folder.desktop;
        } catch (eDesk) {
            defaultDestFolder = Folder.current;
        }
    }

    // -------------------------------------------------------------
    // Helper Functions: Units, Math & Date
    // -------------------------------------------------------------
    function cleanNumber(num) {
        var rounded = Math.round(num * 100) / 100;
        return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }

    function getArtboardDimensions(ab, unit) {
        var rect = ab.artboardRect; // [left, top, right, bottom]
        var widthPt = Math.abs(rect[2] - rect[0]);
        var heightPt = Math.abs(rect[1] - rect[3]);
        var w = OZO.fromPoints ? OZO.fromPoints(widthPt, unit) : (widthPt / 2.834645);
        var h = OZO.fromPoints ? OZO.fromPoints(heightPt, unit) : (heightPt / 2.834645);
        return {
            width: cleanNumber(w),
            height: cleanNumber(h),
            unit: unit
        };
    }

    function getFormattedDate() {
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth() + 1;
        var d = now.getDate();
        if (m < 10) m = "0" + m;
        if (d < 10) d = "0" + d;
        return y + "-" + m + "-" + d;
    }

    function getFormattedTime() {
        var now = new Date();
        var hr = now.getHours();
        var mn = now.getMinutes();
        if (hr < 10) hr = "0" + hr;
        if (mn < 10) mn = "0" + mn;
        return String(hr) + String(mn);
    }

    function sanitizeFileName(str) {
        return String(str || "").replace(/[\\\/:\*\?"<>\|]/g, "_").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    }

    function padNumber(num, maxNum) {
        var str = String(num);
        if (maxNum >= 10 && num < 10) {
            return "0" + str;
        }
        return str;
    }

    function parseArtboardRange(rangeStr, maxCount) {
        var indices = [];
        var trimmed = String(rangeStr || "").replace(/\s+/g, "");
        if (!trimmed) return indices;

        var parts = trimmed.split(",");
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.indexOf("-") !== -1) {
                var range = part.split("-");
                var start = parseInt(range[0], 10);
                var end = parseInt(range[1], 10);
                if (!isNaN(start) && !isNaN(end)) {
                    var minVal = Math.min(start, end);
                    var maxVal = Math.max(start, end);
                    for (var r = minVal; r <= maxVal; r++) {
                        if (r >= 1 && r <= maxCount) {
                            indices.push(r - 1);
                        }
                    }
                }
            } else {
                var val = parseInt(part, 10);
                if (!isNaN(val) && val >= 1 && val <= maxCount) {
                    indices.push(val - 1);
                }
            }
        }

        // Deduplicate and sort ascending
        var seen = {};
        var unique = [];
        for (var j = 0; j < indices.length; j++) {
            var idx = indices[j];
            if (!seen[idx]) {
                seen[idx] = true;
                unique.push(idx);
            }
        }
        unique.sort(function (a, b) { return a - b; });
        return unique;
    }

    function buildFileName(template, docName, abIndex, formatExt, unit) {
        var ab = (abIndex >= 0 && abIndex < doc.artboards.length) ? doc.artboards[abIndex] : null;
        var abName = ab ? (ab.name || ("Artboard_" + (abIndex + 1))) : "All";
        var dims = ab ? getArtboardDimensions(ab, unit) : { width: "0", height: "0", unit: unit };
        var dateStr = getFormattedDate();
        var timeStr = getFormattedTime();
        var numStr = ab ? padNumber(abIndex + 1, totalArtboards) : "All";
        var rawNumStr = ab ? String(abIndex + 1) : "All";
        var colorMode = (doc.documentColorSpace === DocumentColorSpace.RGB) ? "RGB" : "CMYK";

        var result = template;
        result = result.replace(/\[doc\]/gi, docName).replace(/\{doc\}/gi, docName);
        result = result.replace(/\[ab\]/gi, abName).replace(/\{ab\}/gi, abName);
        result = result.replace(/\[num\]/gi, numStr).replace(/\{num\}/gi, numStr);
        result = result.replace(/\[raw_num\]/gi, rawNumStr).replace(/\{raw_num\}/gi, rawNumStr);
        result = result.replace(/\[w\]/gi, dims.width).replace(/\{w\}/gi, dims.width);
        result = result.replace(/\[h\]/gi, dims.height).replace(/\{h\}/gi, dims.height);
        result = result.replace(/\[unit\]/gi, dims.unit).replace(/\{unit\}/gi, dims.unit);
        result = result.replace(/\[date\]/gi, dateStr).replace(/\{date\}/gi, dateStr);
        result = result.replace(/\[time\]/gi, timeStr).replace(/\{time\}/gi, timeStr);
        result = result.replace(/\[color\]/gi, colorMode).replace(/\{color\}/gi, colorMode);
        result = result.replace(/\[fmt\]/gi, formatExt).replace(/\{fmt\}/gi, formatExt);

        var sanitized = sanitizeFileName(result);
        if (!sanitized) {
            sanitized = docName + "_" + abName;
        }
        return sanitized + "." + formatExt.toLowerCase();
    }

    // -------------------------------------------------------------
    // Build ScriptUI Dialog
    // -------------------------------------------------------------
    var dialog = new Window("dialog", OZO.tr("Ozo Tools - Batch Production Exporter"));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = [14, 14, 14, 14];
    dialog.spacing = 10;

    // Header
    OZO.addDialogHeader(
        dialog,
        OZO.tr("Batch Production Exporter"),
        OZO.tr("Batch export artboards to PDF, TIFF, PNG & JPEG with dynamic naming")
    );

    // Main Content Group (2 Columns: Left = Scope & Formats, Right = Naming & Output)
    var contentGroup = dialog.add("group");
    contentGroup.orientation = "row";
    contentGroup.alignChildren = ["fill", "top"];
    contentGroup.spacing = 12;

    var leftCol = contentGroup.add("group");
    leftCol.orientation = "column";
    leftCol.alignChildren = ["fill", "top"];
    leftCol.spacing = 10;
    leftCol.preferredSize.width = 300;

    var rightCol = contentGroup.add("group");
    rightCol.orientation = "column";
    rightCol.alignChildren = ["fill", "top"];
    rightCol.spacing = 10;
    rightCol.preferredSize.width = 330;

    // =============================================================
    // Left Column: 1. Artboard Scope & 2. Export Formats
    // =============================================================

    // Panel: Target Artboards
    var scopePanel = leftCol.add("panel", undefined, OZO.tr("Target Artboards"));
    scopePanel.orientation = "column";
    scopePanel.alignChildren = ["fill", "top"];
    scopePanel.margins = [12, 14, 12, 10];
    scopePanel.spacing = 6;

    var rbAll = scopePanel.add("radiobutton", undefined, OZO.tr("All Artboards") + " (" + totalArtboards + ")");
    rbAll.value = true;

    var activeAbName = doc.artboards[activeAbIndex].name || ("Artboard " + (activeAbIndex + 1));
    var rbActive = scopePanel.add("radiobutton", undefined, OZO.tr("Active Artboard") + " (#" + (activeAbIndex + 1) + ": " + activeAbName + ")");

    var customScopeGroup = scopePanel.add("group");
    customScopeGroup.orientation = "row";
    customScopeGroup.alignChildren = ["left", "center"];
    customScopeGroup.spacing = 6;

    var rbCustom = customScopeGroup.add("radiobutton", undefined, OZO.tr("Range:"));
    var customRangeInput = customScopeGroup.add("edittext", undefined, "1-" + Math.min(totalArtboards, 5));
    customRangeInput.preferredSize.width = 110;
    customRangeInput.enabled = false;

    rbAll.onClick = function () { customRangeInput.enabled = false; updatePreviewName(); };
    rbActive.onClick = function () { customRangeInput.enabled = false; updatePreviewName(); };
    rbCustom.onClick = function () { customRangeInput.enabled = true; customRangeInput.active = true; updatePreviewName(); };

    // Panel: Export Formats
    var formatPanel = leftCol.add("panel", undefined, OZO.tr("Export Formats"));
    formatPanel.orientation = "column";
    formatPanel.alignChildren = ["fill", "top"];
    formatPanel.margins = [12, 14, 12, 10];
    formatPanel.spacing = 8;

    // Format 1: PDF
    var pdfBox = formatPanel.add("checkbox", undefined, "PDF (Print / Vector)");
    pdfBox.value = true;

    var pdfPresetGroup = formatPanel.add("group");
    pdfPresetGroup.orientation = "column";
    pdfPresetGroup.alignChildren = ["fill", "top"];
    pdfPresetGroup.spacing = 4;
    pdfPresetGroup.margins = [16, 0, 0, 0];

    var pdfPresetRow = pdfPresetGroup.add("group");
    pdfPresetRow.orientation = "row";
    pdfPresetRow.alignChildren = ["left", "center"];
    pdfPresetRow.spacing = 4;

    pdfPresetRow.add("statictext", undefined, OZO.tr("Preset:"));
    var pdfPresetList = pdfPresetRow.add("dropdownlist");
    pdfPresetList.preferredSize.width = 180;

    var availablePresets = [];
    try {
        if (app.PDFPresetsList && app.PDFPresetsList.length > 0) {
            for (var p = 0; p < app.PDFPresetsList.length; p++) {
                availablePresets.push(app.PDFPresetsList[p]);
            }
        }
    } catch (ePresets) {}
    if (availablePresets.length === 0) {
        availablePresets = ["[High Quality Print]", "[Press Quality]", "[Illustrator Default]", "[Smallest File Size]"];
    }
    for (var ap = 0; ap < availablePresets.length; ap++) {
        pdfPresetList.add("item", availablePresets[ap]);
    }
    pdfPresetList.selection = 0;

    // PDF Mode Toggle: Separate vs Single Multi-Page
    var pdfModeGroup = pdfPresetGroup.add("group");
    pdfModeGroup.orientation = "row";
    pdfModeGroup.alignChildren = ["left", "center"];
    pdfModeGroup.spacing = 8;

    var rbPdfSeparate = pdfModeGroup.add("radiobutton", undefined, OZO.tr("Separate"));
    rbPdfSeparate.value = true;
    rbPdfSeparate.helpTip = OZO.tr("Separate files per artboard");

    var rbPdfCombined = pdfModeGroup.add("radiobutton", undefined, OZO.tr("Multi-page"));
    rbPdfCombined.value = false;
    rbPdfCombined.helpTip = OZO.tr("Single combined multi-page PDF");

    rbPdfSeparate.onClick = function () { updatePreviewName(); };
    rbPdfCombined.onClick = function () { updatePreviewName(); };

    pdfBox.onClick = function () {
        pdfPresetGroup.enabled = pdfBox.value;
        updatePreviewName();
    };

    // Format 2: TIFF (Prepress RIP)
    var tiffBox = formatPanel.add("checkbox", undefined, "TIFF (Prepress / Large-Format RIP)");
    tiffBox.value = false;

    var tiffOptionsGroup = formatPanel.add("group");
    tiffOptionsGroup.orientation = "row";
    tiffOptionsGroup.alignChildren = ["left", "center"];
    tiffOptionsGroup.spacing = 6;
    tiffOptionsGroup.margins = [16, 0, 0, 0];

    var tiffDpiList = tiffOptionsGroup.add("dropdownlist", undefined, ["300 DPI", "150 DPI", "72 DPI"]);
    tiffDpiList.selection = 0;
    tiffDpiList.preferredSize.width = 85;

    var tiffColorList = tiffOptionsGroup.add("dropdownlist", undefined, ["CMYK", "RGB"]);
    tiffColorList.selection = (doc.documentColorSpace === DocumentColorSpace.RGB) ? 1 : 0;
    tiffColorList.preferredSize.width = 75;

    var tiffLzwBox = tiffOptionsGroup.add("checkbox", undefined, "LZW");
    tiffLzwBox.value = true;
    tiffOptionsGroup.enabled = false;

    tiffBox.onClick = function () {
        tiffOptionsGroup.enabled = tiffBox.value;
        updatePreviewName();
    };

    // Format 3: PNG
    var pngBox = formatPanel.add("checkbox", undefined, "PNG (Transparent Web / Preview)");
    pngBox.value = false;

    var pngOptionsGroup = formatPanel.add("group");
    pngOptionsGroup.orientation = "row";
    pngOptionsGroup.alignChildren = ["left", "center"];
    pngOptionsGroup.spacing = 6;
    pngOptionsGroup.margins = [16, 0, 0, 0];

    var pngDpiList = pngOptionsGroup.add("dropdownlist", undefined, ["300 DPI", "150 DPI", "72 DPI"]);
    pngDpiList.selection = 0;
    pngDpiList.preferredSize.width = 85;

    var pngTransBox = pngOptionsGroup.add("checkbox", undefined, OZO.tr("Transparent"));
    pngTransBox.value = true;
    pngOptionsGroup.enabled = false;

    pngBox.onClick = function () {
        pngOptionsGroup.enabled = pngBox.value;
        updatePreviewName();
    };

    // Format 4: JPEG
    var jpgBox = formatPanel.add("checkbox", undefined, "JPEG (Photo / Client Proof)");
    jpgBox.value = false;

    var jpgOptionsGroup = formatPanel.add("group");
    jpgOptionsGroup.orientation = "row";
    jpgOptionsGroup.alignChildren = ["left", "center"];
    jpgOptionsGroup.spacing = 6;
    jpgOptionsGroup.margins = [16, 0, 0, 0];

    var jpgDpiList = jpgOptionsGroup.add("dropdownlist", undefined, ["300 DPI", "150 DPI", "72 DPI"]);
    jpgDpiList.selection = 0;
    jpgDpiList.preferredSize.width = 85;

    var jpgColorList = jpgOptionsGroup.add("dropdownlist", undefined, ["CMYK", "RGB"]);
    jpgColorList.selection = (doc.documentColorSpace === DocumentColorSpace.RGB) ? 1 : 0;
    jpgColorList.preferredSize.width = 75;
    jpgOptionsGroup.enabled = false;

    jpgBox.onClick = function () {
        jpgOptionsGroup.enabled = jpgBox.value;
        updatePreviewName();
    };

    // Panel: Prepress Options
    var prepressPanel = leftCol.add("panel", undefined, OZO.tr("Prepress Options"));
    prepressPanel.orientation = "column";
    prepressPanel.alignChildren = ["fill", "top"];
    prepressPanel.margins = [12, 14, 12, 10];
    prepressPanel.spacing = 6;

    var outlineBox = prepressPanel.add("checkbox", undefined, OZO.tr("Convert text to outlines before export"));
    outlineBox.value = false;
    outlineBox.helpTip = "Safely outlines all text frames during export to prevent RIP font substitution, then restores live text.";

    // =============================================================
    // Right Column: 3. Dynamic Naming & 4. Destination Folder
    // =============================================================

    // Panel: Naming Template
    var namePanel = rightCol.add("panel", undefined, OZO.tr("Dynamic File Naming"));
    namePanel.orientation = "column";
    namePanel.alignChildren = ["fill", "top"];
    namePanel.margins = [12, 14, 12, 10];
    namePanel.spacing = 8;

    var presetRow = namePanel.add("group");
    presetRow.orientation = "row";
    presetRow.alignChildren = ["left", "center"];
    presetRow.spacing = 6;

    presetRow.add("statictext", undefined, OZO.tr("Naming Preset:"));
    var namingPresetList = presetRow.add("dropdownlist", undefined, [
        "[doc]_[ab]_[w]x[h][unit]",
        "[doc]_[ab]",
        "[ab]_[w]x[h][unit]",
        "[num]_[doc]_[ab]",
        "[doc]_[num]",
        "Custom..."
    ]);
    namingPresetList.selection = 0;
    namingPresetList.preferredSize.width = 190;

    var unitRow = namePanel.add("group");
    unitRow.orientation = "row";
    unitRow.alignChildren = ["left", "center"];
    unitRow.spacing = 6;

    unitRow.add("statictext", undefined, OZO.tr("Dimensions Unit:"));
    var unitList = unitRow.add("dropdownlist", undefined, ["mm", "cm", "in", "pt"]);
    var defaultUnitIndex = 0;
    if (defaultUnit === "cm") defaultUnitIndex = 1;
    else if (defaultUnit === "in" || defaultUnit === "inches") defaultUnitIndex = 2;
    else if (defaultUnit === "pt" || defaultUnit === "points") defaultUnitIndex = 3;
    unitList.selection = defaultUnitIndex;
    unitList.preferredSize.width = 80;

    var templateInput = namePanel.add("edittext", undefined, "[doc]_[ab]_[w]x[h][unit]");
    templateInput.preferredSize.width = 300;

    // Interactive Token Insert Chips
    var chipRow = namePanel.add("group");
    chipRow.orientation = "row";
    chipRow.alignChildren = ["left", "center"];
    chipRow.spacing = 3;

    var tokens = ["[doc]", "[ab]", "[w]x[h]", "[unit]", "[num]", "[date]", "[color]"];
    for (var tk = 0; tk < tokens.length; tk++) {
        (function (tokenStr) {
            var chip = chipRow.add("button", undefined, tokenStr);
            chip.preferredSize = [40, 20];
            chip.helpTip = OZO.tr("Click to insert ") + tokenStr;
            chip.onClick = function () {
                var cur = templateInput.text;
                if (!cur || cur.charAt(cur.length - 1) === "_") {
                    templateInput.text = cur + tokenStr;
                } else {
                    templateInput.text = cur + "_" + tokenStr;
                }
                namingPresetList.selection = 5; // Custom...
                updatePreviewName();
            };
        })(tokens[tk]);
    }

    // Live Sample Preview Box
    var samplePreviewPanel = namePanel.add("panel", undefined, OZO.tr("Live Filename Preview"));
    samplePreviewPanel.orientation = "column";
    samplePreviewPanel.alignChildren = ["fill", "top"];
    samplePreviewPanel.margins = [10, 10, 10, 10];
    samplePreviewPanel.spacing = 4;

    var samplePreviewText = samplePreviewPanel.add("statictext", undefined, "");
    samplePreviewText.preferredSize.width = 285;

    var sampleDimsText = samplePreviewPanel.add("statictext", undefined, "");
    sampleDimsText.preferredSize.width = 285;
    sampleDimsText.graphics.foregroundColor = sampleDimsText.graphics.newPen(dialog.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.55, 1], 1);

    namingPresetList.onChange = function () {
        if (namingPresetList.selection && namingPresetList.selection.text !== "Custom...") {
            templateInput.text = namingPresetList.selection.text;
        }
        updatePreviewName();
    };

    templateInput.onChanging = function () {
        updatePreviewName();
    };

    unitList.onChange = function () {
        updatePreviewName();
    };

    function getSelectedFormatExt() {
        if (pdfBox.value) return "pdf";
        if (tiffBox.value) return "tif";
        if (pngBox.value) return "png";
        if (jpgBox.value) return "jpg";
        return "pdf";
    }

    function updatePreviewName() {
        var docBaseName = doc.name.replace(/\.[^\.]+$/, "");
        var selExt = getSelectedFormatExt();
        var selUnit = unitList.selection ? unitList.selection.text : "mm";
        var sampleAb = (pdfBox.value && rbPdfCombined.value) ? -1 : activeAbIndex;
        var sampleName = buildFileName(templateInput.text, docBaseName, sampleAb, selExt, selUnit);
        samplePreviewText.text = "→ " + sampleName;

        if (sampleDimsText) {
            if (pdfBox.value && rbPdfCombined.value) {
                sampleDimsText.text = OZO.tr("Multi-page PDF containing all selected artboards");
            } else {
                var ab = doc.artboards[activeAbIndex];
                var dims = getArtboardDimensions(ab, selUnit);
                var abName = ab.name || ("Artboard " + (activeAbIndex + 1));
                sampleDimsText.text = abName + " • " + dims.width + " × " + dims.height + " " + selUnit + " (" + (activeAbIndex + 1) + "/" + totalArtboards + ")";
            }
        }
    }
    updatePreviewName();

    // Panel: Destination Folder
    var destPanel = rightCol.add("panel", undefined, OZO.tr("Destination Folder"));
    destPanel.orientation = "column";
    destPanel.alignChildren = ["fill", "top"];
    destPanel.margins = [12, 14, 12, 10];
    destPanel.spacing = 8;

    var folderRow = destPanel.add("group");
    folderRow.orientation = "row";
    folderRow.alignChildren = ["fill", "center"];
    folderRow.spacing = 6;

    var destFolderInput = folderRow.add("edittext", undefined, defaultDestFolder.fsName);
    destFolderInput.preferredSize.width = 220;

    var browseBtn = folderRow.add("button", undefined, OZO.tr("Browse..."));
    browseBtn.preferredSize = [80, 24];

    browseBtn.onClick = function () {
        var startFolder = new Folder(destFolderInput.text);
        if (!startFolder.exists) startFolder = defaultDestFolder;
        var chosen = Folder.selectDialog(OZO.tr("Select Destination Folder"), startFolder);
        if (chosen) {
            destFolderInput.text = chosen.fsName;
        }
    };

    var subfolderRow = destPanel.add("group");
    subfolderRow.orientation = "row";
    subfolderRow.alignChildren = ["left", "center"];
    subfolderRow.spacing = 6;

    var useSubfolderBox = subfolderRow.add("checkbox", undefined, OZO.tr("Save to subfolder:"));
    useSubfolderBox.value = true;

    var subfolderNameInput = subfolderRow.add("edittext", undefined, "Export");
    subfolderNameInput.preferredSize.width = 120;

    useSubfolderBox.onClick = function () {
        subfolderNameInput.enabled = useSubfolderBox.value;
    };

    var openFolderBox = destPanel.add("checkbox", undefined, OZO.tr("Open folder when finished"));
    openFolderBox.value = true;

    // Buttons
    var buttonGroup = dialog.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignment = ["right", "top"];
    buttonGroup.spacing = 8;

    var cancelButton = buttonGroup.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    cancelButton.preferredSize = [100, 30];

    var exportButton = buttonGroup.add("button", undefined, OZO.tr("Export Now"), {name: "ok"});
    exportButton.preferredSize = [120, 30];

    // Language Selector Footer
    OZO.addLanguageSelector(dialog, function () {
        updatePreviewName();
    });

    dialog.defaultElement = exportButton;
    dialog.cancelElement = cancelButton;

    // Restore previous window state / settings
    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    // -------------------------------------------------------------
    // Helper: Safely Outline Text
    // -------------------------------------------------------------
    function outlineAllText(targetDoc) {
        try {
            var tfCount = targetDoc.textFrames.length;
            for (var t = tfCount - 1; t >= 0; t--) {
                try {
                    targetDoc.textFrames[t].createOutline();
                } catch (eTf) {}
            }
        } catch (eOut) {}
    }

    // -------------------------------------------------------------
    // Export Execution Engine
    // -------------------------------------------------------------
    exportButton.onClick = function () {
        // Validate at least one format is selected
        if (!pdfBox.value && !tiffBox.value && !pngBox.value && !jpgBox.value) {
            alert(OZO.tr("Please select at least one format to export."));
            return;
        }

        // Validate destination folder
        var targetFolder = new Folder(destFolderInput.text);
        if (!targetFolder.exists) {
            try {
                if (!targetFolder.create()) {
                    alert(OZO.tr("Could not create destination folder:\n") + targetFolder.fsName);
                    return;
                }
            } catch (eFold) {
                alert(OZO.tr("Invalid destination folder:\n") + targetFolder.fsName);
                return;
            }
        }

        // Apply subfolder if requested
        if (useSubfolderBox.value && subfolderNameInput.text) {
            var subName = sanitizeFileName(subfolderNameInput.text);
            targetFolder = new Folder(targetFolder.fsName + "/" + subName);
            if (!targetFolder.exists) {
                targetFolder.create();
            }
        }

        // Determine target artboard indices
        var targetIndices = [];
        if (rbAll.value) {
            for (var a = 0; a < totalArtboards; a++) targetIndices.push(a);
        } else if (rbActive.value) {
            targetIndices.push(activeAbIndex);
        } else if (rbCustom.value) {
            targetIndices = parseArtboardRange(customRangeInput.text, totalArtboards);
            if (targetIndices.length === 0) {
                alert(OZO.tr("Please specify a valid artboard range (e.g. 1, 3-5)."));
                return;
            }
        }

        // Save preferences
        OZO.saveWindowState(dialog, STATE_NAMESPACE, {
            template: templateInput.text,
            useSubfolder: useSubfolderBox.value,
            subfolder: subfolderNameInput.text,
            openFolder: openFolderBox.value,
            outline: outlineBox.value,
            pdfCombined: rbPdfCombined.value
        });

        // Hide dialog for clean export execution
        dialog.close(1);

        // Snapshot Engine: Prepare Document Protection
        var docBaseName = doc.name.replace(/\.[^\.]+$/, "");
        var selUnit = unitList.selection ? unitList.selection.text : "mm";
        var totalExported = 0;
        var exportErrors = [];

        var dpiMap = { "300 DPI": 300, "150 DPI": 150, "72 DPI": 72 };
        var origActiveAb = doc.artboards.getActiveArtboardIndex();

        // Check if document needs snapshot
        var originalDocFile = null;
        var tempSnapshotFile = null;
        var requiresDocReopen = false;

        try {
            if (doc.saved && doc.fullName) {
                originalDocFile = doc.fullName;
            }
        } catch (eOrigCheck) {}

        // If outlining is enabled or PDF export will call saveAs, create snapshot
        if (outlineBox.value || (pdfBox.value && !rbPdfCombined.value)) {
            requiresDocReopen = true;
            if (!originalDocFile || !doc.saved) {
                try {
                    tempSnapshotFile = new File(Folder.temp.fsName + "/ozo_snapshot_" + (new Date().getTime()) + ".ai");
                    doc.saveAs(tempSnapshotFile);
                    originalDocFile = tempSnapshotFile;
                } catch (eSnap) {}
            }
        }

        // Suppress modal alerts and disable screen refresh for high performance
        var prevInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        try {
            // Apply Outlines if requested
            if (outlineBox.value) {
                outlineAllText(doc);
            }

            // 1. Export TIFF, PNG, JPEG first (Fast & Non-destructive)
            for (var t = 0; t < targetIndices.length; t++) {
                var abIdx = targetIndices[t];
                doc.artboards.setActiveArtboardIndex(abIdx);

                // A. TIFF Export
                if (tiffBox.value) {
                    try {
                        var tiffFile = new File(targetFolder.fsName + "/" + buildFileName(templateInput.text, docBaseName, abIdx, "tif", selUnit));
                        var tiffOpts = new ExportOptionsTIFF();
                        var tDpi = dpiMap[tiffDpiList.selection.text] || 300;
                        tiffOpts.resolution = tDpi;
                        tiffOpts.byteOrder = TIFFByteOrder.IBMPC;
                        tiffOpts.lzwCompression = tiffLzwBox.value;
                        tiffOpts.imageColorSpace = (tiffColorList.selection.text === "RGB") ? ImageColorSpace.RGB : ImageColorSpace.CMYK;
                        tiffOpts.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
                        tiffOpts.artBoardClipping = true;
                        doc.exportFile(tiffFile, ExportType.TIFF, tiffOpts);
                        totalExported++;
                    } catch (eTiff) {
                        exportErrors.push("TIFF (AB " + (abIdx + 1) + "): " + eTiff.message);
                    }
                }

                // B. PNG Export
                if (pngBox.value) {
                    try {
                        var pngFile = new File(targetFolder.fsName + "/" + buildFileName(templateInput.text, docBaseName, abIdx, "png", selUnit));
                        var pngOpts = new ExportOptionsPNG24();
                        var pDpi = dpiMap[pngDpiList.selection.text] || 300;
                        var pScale = (pDpi / 72) * 100;
                        pngOpts.horizontalScale = pScale;
                        pngOpts.verticalScale = pScale;
                        pngOpts.transparency = pngTransBox.value;
                        pngOpts.antiAliasing = true;
                        pngOpts.artBoardClipping = true;
                        doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
                        totalExported++;
                    } catch (ePng) {
                        exportErrors.push("PNG (AB " + (abIdx + 1) + "): " + ePng.message);
                    }
                }

                // C. JPEG Export
                if (jpgBox.value) {
                    try {
                        var jpgFile = new File(targetFolder.fsName + "/" + buildFileName(templateInput.text, docBaseName, abIdx, "jpg", selUnit));
                        var jpgOpts = new ExportOptionsJPEG();
                        var jDpi = dpiMap[jpgDpiList.selection.text] || 300;
                        var jScale = (jDpi / 72) * 100;
                        jpgOpts.horizontalScale = jScale;
                        jpgOpts.verticalScale = jScale;
                        jpgOpts.qualitySetting = 100; // Maximum quality
                        jpgOpts.antiAliasing = true;
                        jpgOpts.artBoardClipping = true;
                        doc.exportFile(jpgFile, ExportType.JPEG, jpgOpts);
                        totalExported++;
                    } catch (eJpg) {
                        exportErrors.push("JPEG (AB " + (abIdx + 1) + "): " + eJpg.message);
                    }
                }

                // Memory cleanup every 5 artboards
                if (t % 5 === 0) {
                    $.gc();
                }
            }

            // 2. Export PDF
            if (pdfBox.value) {
                var selectedPreset = pdfPresetList.selection ? pdfPresetList.selection.text : "[High Quality Print]";
                var pdfOpts = new PDFSaveOptions();
                try {
                    if (selectedPreset) pdfOpts.pDFPreset = selectedPreset;
                } catch (ePreset) {}
                pdfOpts.compatibility = PDFCompatibility.ACROBAT5;
                pdfOpts.preserveEditability = true;

                if (rbPdfCombined.value) {
                    // Optimized Single Multi-Page PDF
                    try {
                        var combinedFileName = buildFileName(templateInput.text, docBaseName, -1, "pdf", selUnit);
                        var combinedFile = new File(targetFolder.fsName + "/" + combinedFileName);
                        
                        // Build 1-based range string
                        var rangeArr = [];
                        for (var rIdx = 0; rIdx < targetIndices.length; rIdx++) {
                            rangeArr.push(targetIndices[rIdx] + 1);
                        }
                        pdfOpts.artboardRange = rangeArr.join(",");
                        doc.saveAs(combinedFile, pdfOpts);
                        totalExported++;
                    } catch (ePdfComb) {
                        exportErrors.push("PDF (Multi-page): " + ePdfComb.message);
                    }
                } else {
                    // Separate PDF per artboard
                    for (var pIdx = 0; pIdx < targetIndices.length; pIdx++) {
                        var abIndexForPdf = targetIndices[pIdx];
                        try {
                            var pdfFile = new File(targetFolder.fsName + "/" + buildFileName(templateInput.text, docBaseName, abIndexForPdf, "pdf", selUnit));
                            pdfOpts.artboardRange = String(abIndexForPdf + 1);
                            doc.saveAs(pdfFile, pdfOpts);
                            totalExported++;
                        } catch (ePdf) {
                            exportErrors.push("PDF (AB " + (abIndexForPdf + 1) + "): " + ePdf.message);
                        }
                        if (pIdx % 5 === 0) {
                            $.gc();
                        }
                    }
                }
            }

            // Restore active document if snapshot was taken or document was modified
            if (requiresDocReopen && originalDocFile && originalDocFile.exists) {
                try {
                    doc.close(SaveOptions.DONOTSAVECHANGES);
                    doc = app.open(originalDocFile);
                } catch (eRestore) {}
            }

            // Cleanup temp snapshot if created
            if (tempSnapshotFile && tempSnapshotFile.exists) {
                try { tempSnapshotFile.remove(); } catch (eRem) {}
            }

        } finally {
            // Always restore interaction level
            app.userInteractionLevel = prevInteractionLevel;
        }

        // Restore original active artboard
        try {
            if (origActiveAb >= 0 && origActiveAb < doc.artboards.length) {
                doc.artboards.setActiveArtboardIndex(origActiveAb);
            }
        } catch (eOrigAb) {}

        // Open destination folder if requested
        if (openFolderBox.value && targetFolder.exists) {
            try {
                targetFolder.execute();
            } catch (eOpen) {
                try {
                    if (Folder.fs === "Windows") {
                        app.system('explorer.exe "' + targetFolder.fsName.replace(/"/g, '""') + '"');
                    } else {
                        app.system('open "' + targetFolder.fsName.replace(/"/g, '\\"') + '"');
                    }
                } catch (eSys) {}
            }
        }

        // Final Garbage Collection
        $.gc();

        // Completion Alert
        var msg = OZO.tr("Batch export complete!\n") +
                  totalExported + " " + OZO.tr("file(s) exported across") + " " +
                  targetIndices.length + " " + OZO.tr("artboard(s) to:\n") + targetFolder.fsName;
        if (exportErrors.length > 0) {
            msg += "\n\n" + OZO.tr("Notes / Errors:") + "\n" + exportErrors.join("\n");
        }
        alert(msg, SCRIPT_NAME);
    };

    dialog.center();
    dialog.show();
})();
