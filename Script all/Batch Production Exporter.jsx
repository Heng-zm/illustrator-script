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
 *    - JPEG: 100% max proofing quality, 300/150/72 DPI (color follows the document).
 * 2. Prepress Outlining: Optional automated font outlining with safe document restore.
 * 3. Document Safety: PDF export and outlining require a saved .ai document; after export the
 *    original file is reopened so live text and the original document path are preserved.
 * 4. High-Efficiency Processing: Memory cleanup ($.gc()) and modal alert suppression during export.
 * 5. Dynamic Token Naming: [doc], [ab], [num], [raw_num], [w], [h], [unit], [date], [time], [color], [fmt].
 * 6. Full English & Khmer (ភាសាខ្មែរ) bilingual localization with adaptive 4-tier dark/light theme.
 */
(function () {
    var SCRIPT_NAME = "Batch Production Exporter";
    var SCRIPT_VERSION = "2.2";
    var STATE_NAMESPACE = "batch_production_exporter_v3";

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var totalArtboards = doc.artboards.length;
    var activeAbIndex = doc.artboards.getActiveArtboardIndex();
    var defaultUnit = OZO.getDocDefaultUnit ? OZO.getDocDefaultUnit(doc) : "mm";

    // Detect if document is saved on disk
    var defaultDestFolder = null;
    try {
        if (doc.fullName && doc.fullName.exists) {
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

    function sanitizeFolderName(str) {
        var name = sanitizeFileName(str).replace(/[\.\s]+$/, "");
        if (name === "." || name === "..") name = "";
        return name;
    }

    function padNumber(num, maxNum) {
        var str = String(num);
        var width = String(maxNum).length;
        while (str.length < width) {
            str = "0" + str;
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

    var abDimsCache = {};
    function buildFileName(template, docName, abIndex, formatExt, unit, abNameOverride, batchCtx) {
        var ab = (abIndex >= 0 && abIndex < doc.artboards.length) ? doc.artboards[abIndex] : doc.artboards[0];
        if (!ab) {
            ab = doc.artboards[0];
            abIndex = 0;
        }
        var isCombined = (abNameOverride !== undefined && abNameOverride !== null);
        var abName = isCombined ? abNameOverride : (ab.name || ("Artboard_" + (abIndex + 1)));
        var cacheKey = abIndex + "_" + unit;
        var dims = abDimsCache[cacheKey];
        if (!dims) {
            dims = getArtboardDimensions(ab, unit);
            abDimsCache[cacheKey] = dims;
        }
        var dateStr = (batchCtx && batchCtx.date) ? batchCtx.date : getFormattedDate();
        var timeStr = (batchCtx && batchCtx.time) ? batchCtx.time : getFormattedTime();
        var numStr = isCombined ? "All" : padNumber(abIndex + 1, totalArtboards);
        var rawNumStr = isCombined ? "All" : String(abIndex + 1);
        var colorMode = (batchCtx && batchCtx.color) ? batchCtx.color : ((doc.documentColorSpace === DocumentColorSpace.RGB) ? "RGB" : "CMYK");

        var result = String(template || "").replace(
            /\[(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\]|\{(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\}/gi,
            function (match, bracketToken, braceToken) {
                var token = String(bracketToken || braceToken || "").toLowerCase();
                switch (token) {
                    case "doc": return docName;
                    case "ab": return abName;
                    case "num": return numStr;
                    case "raw_num": return rawNumStr;
                    case "w": return dims.width;
                    case "h": return dims.height;
                    case "unit": return dims.unit;
                    case "date": return dateStr;
                    case "time": return timeStr;
                    case "color": return colorMode;
                    case "fmt": return formatExt;
                }
                return match;
            }
        );

        var sanitized = sanitizeFileName(result);
        if (!sanitized) {
            sanitized = sanitizeFileName(docName + "_" + abName);
        }
        if (!sanitized) {
            sanitized = "Artwork";
        }
        var ext = "." + formatExt.toLowerCase();
        if (sanitized.length >= ext.length && sanitized.substring(sanitized.length - ext.length).toLowerCase() === ext) {
            return sanitized;
        }
        return sanitized + ext;
    }

    function unlockAllForOutline(targetDoc) {
        try {
            var layers = targetDoc.layers;
            for (var i = 0, lLen = layers.length; i < lLen; i++) {
                try {
                    if (layers[i].locked) layers[i].locked = false;
                } catch (eL) {}
            }
            var textFrames = targetDoc.textFrames;
            for (var j = 0, tfLen = textFrames.length; j < tfLen; j++) {
                try {
                    var tf = textFrames[j];
                    if (tf.locked) tf.locked = false;
                    var parentNode = tf.parent;
                    while (parentNode && parentNode.typename !== "Document") {
                        if (parentNode.locked) parentNode.locked = false;
                        parentNode = parentNode.parent;
                    }
                } catch (eTf) {}
            }
        } catch (eUnlock) {}
    }

    function outlineAllText(targetDoc) {
        var failed = 0;
        try {
            unlockAllForOutline(targetDoc);
            var tfList = [];
            for (var i = 0; i < targetDoc.textFrames.length; i++) {
                tfList.push(targetDoc.textFrames[i]);
            }
            for (var t = tfList.length - 1; t >= 0; t--) {
                try {
                    tfList[t].createOutline();
                } catch (eTf) {
                    failed++;
                }
            }
        } catch (eOut) {
            return -1;
        }
        return failed;
    }

    function resolveTargetIndices(scope, rangeStr) {
        var indices = [];
        if (scope === "active") {
            indices.push(activeAbIndex);
        } else if (scope === "range" || scope === "custom") {
            indices = parseArtboardRange(rangeStr, totalArtboards);
        } else {
            for (var a = 0; a < totalArtboards; a++) indices.push(a);
        }
        return indices;
    }

    function executeExportCore(cfg) {
        var isHeadless = !!cfg.isHeadless;

        // 1. Validate formats
        var pdfEnabled = !!(cfg.formats && cfg.formats.pdf && cfg.formats.pdf.enabled);
        var tiffEnabled = !!(cfg.formats && cfg.formats.tiff && cfg.formats.tiff.enabled);
        var pngEnabled = !!(cfg.formats && cfg.formats.png && cfg.formats.png.enabled);
        var jpgEnabled = !!(cfg.formats && cfg.formats.jpg && cfg.formats.jpg.enabled);

        if (!pdfEnabled && !tiffEnabled && !pngEnabled && !jpgEnabled) {
            if (isHeadless) return { status: "error", message: "Please select at least one format to export." };
            alert(OZO.tr("Please select at least one format to export."));
            return null;
        }

        // 2. Validate destination folder
        var destPath = String(cfg.destFolder || "").replace(/^\s+|\s+$/g, "");
        if (!destPath) {
            if (isHeadless) return { status: "error", message: "Please choose a destination folder." };
            alert(OZO.tr("Please choose a destination folder."));
            return null;
        }
        var targetFolder = new Folder(destPath);
        if (!targetFolder.exists) {
            try {
                if (!targetFolder.create()) {
                    var errFold = "Could not create destination folder:\n" + targetFolder.fsName;
                    if (isHeadless) return { status: "error", message: errFold };
                    alert(OZO.tr("Could not create destination folder:\n") + targetFolder.fsName);
                    return null;
                }
            } catch (eFold) {
                var errFold2 = "Invalid destination folder:\n" + targetFolder.fsName;
                if (isHeadless) return { status: "error", message: errFold2 };
                alert(OZO.tr("Invalid destination folder:\n") + targetFolder.fsName);
                return null;
            }
        }

        // 3. Apply subfolder
        if (cfg.useSubfolder) {
            var subName = sanitizeFolderName(cfg.subfolderName);
            if (!subName) {
                if (isHeadless) return { status: "error", message: "Please enter a valid subfolder name." };
                alert(OZO.tr("Please enter a valid subfolder name."));
                return null;
            }
            targetFolder = new Folder(targetFolder.fsName + "/" + subName);
            if (!targetFolder.exists) {
                try {
                    if (!targetFolder.create()) {
                        var errSub = "Could not create destination folder:\n" + targetFolder.fsName;
                        if (isHeadless) return { status: "error", message: errSub };
                        alert(OZO.tr("Could not create destination folder:\n") + targetFolder.fsName);
                        return null;
                    }
                } catch (eSubFolder) {
                    var errSub2 = "Invalid destination folder:\n" + targetFolder.fsName;
                    if (isHeadless) return { status: "error", message: errSub2 };
                    alert(OZO.tr("Invalid destination folder:\n") + targetFolder.fsName);
                    return null;
                }
            }
        }

        // 4. Target artboards
        var targetIndices = resolveTargetIndices(cfg.scope, cfg.customRange);
        if (targetIndices.length === 0) {
            if (isHeadless) return { status: "error", message: "Please specify a valid artboard range (e.g. 1, 3-5)." };
            alert(OZO.tr("Please specify a valid artboard range (e.g. 1, 3-5)."));
            return null;
        }

        // 5. Document modification checks (PDF export & Outlining)
        var modifiesDocument = pdfEnabled || cfg.outline;
        var originalDocFile = null;

        if (modifiesDocument) {
            var savedDocFile = null;
            try {
                var candidateDocFile = doc.fullName;
                if (candidateDocFile && candidateDocFile.exists) savedDocFile = candidateDocFile;
            } catch (eSavedDoc) {}

            if (!savedDocFile) {
                if (isHeadless) {
                    return { status: "error", message: "PDF export and text outlining temporarily modify the document.\nPlease save the document as an .ai file first before exporting." };
                }
                var saveFirst = confirm(OZO.tr("PDF export and text outlining temporarily modify the document.\n\nSave the document before continuing?"));
                if (!saveFirst) return null;
                var saveFilePrompt = File.saveDialog(OZO.tr("Save Illustrator Document As"), "Adobe Illustrator:*.ai");
                if (!saveFilePrompt) return null;
                if (!/\.ai$/i.test(saveFilePrompt.name)) {
                    saveFilePrompt = new File(saveFilePrompt.fsName + ".ai");
                }
                try {
                    doc.saveAs(saveFilePrompt);
                    savedDocFile = saveFilePrompt;
                } catch (eSaveAsPrompt) {
                    alert(OZO.tr("Failed to save document:\n") + (eSaveAsPrompt && eSaveAsPrompt.message ? eSaveAsPrompt.message : String(eSaveAsPrompt)));
                    return null;
                }
            }

            var savedDocExt = "";
            try {
                var savedDocName = String(savedDocFile.name || "");
                var savedDocDot = savedDocName.lastIndexOf(".");
                if (savedDocDot >= 0) savedDocExt = savedDocName.substring(savedDocDot + 1).toLowerCase();
            } catch (eSavedDocExt) {}

            if (savedDocExt !== "ai") {
                var msgExt = "This document is not a saved .ai file. Save it as an .ai file before exporting PDF or outlining text.";
                if (isHeadless) return { status: "error", message: msgExt };
                alert(OZO.tr(msgExt));
                return null;
            }

            var savedFileIsCurrent = false;
            try {
                savedFileIsCurrent = !!(doc.saved && savedDocFile.exists);
            } catch (eSavedCheck) {}

            if (!savedFileIsCurrent) {
                if (isHeadless) {
                    try { doc.save(); } catch (eSaveH) {}
                } else {
                    var saveChanges = confirm(OZO.tr("PDF export and text outlining temporarily modify the document.\n\nSave your latest changes before continuing?"));
                    if (!saveChanges) return null;
                    try { doc.save(); } catch (eSaveChanges) {}
                }
                try {
                    savedFileIsCurrent = !!(doc.saved && savedDocFile.exists);
                } catch (eSavedCheck2) {}
                if (!savedFileIsCurrent) {
                    var msgCur = "The document must be saved before exporting PDF or outlining text.";
                    if (isHeadless) return { status: "error", message: msgCur };
                    alert(OZO.tr(msgCur));
                    return null;
                }
            }

            try { originalDocFile = doc.fullName; } catch (eOrigFile) {}
            if (!originalDocFile) {
                var msgOrig = "Could not determine the document path. Save the document and try again.";
                if (isHeadless) return { status: "error", message: msgOrig };
                alert(OZO.tr(msgOrig));
                return null;
            }
        }

        // Prepare export state
        var docBaseName = doc.name.replace(/\.[^\.]+$/, "");
        var selUnit = cfg.unit || "mm";
        var totalExported = 0;
        var exportErrors = [];
        var batchCtx = {
            date: getFormattedDate(),
            time: getFormattedTime(),
            color: (doc.documentColorSpace === DocumentColorSpace.RGB) ? "RGB" : "CMYK"
        };
        var origActiveAb = doc.artboards.getActiveArtboardIndex();

        var prevInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        var tempAiFile = null;

        try {
            // Apply Outlines if requested
            if (cfg.outline) {
                var outlineResult = outlineAllText(doc);
                if (outlineResult < 0) {
                    exportErrors.push("Outline: text outlining failed.");
                } else if (outlineResult > 0) {
                    exportErrors.push("Outline: " + outlineResult + " text frame(s) could not be outlined (locked or unsupported).");
                }
            }

            // Pre-allocate export options once outside the loop for maximum performance
            var tiffOpts = null;
            if (tiffEnabled) {
                var tiffCfg = cfg.formats.tiff;
                tiffOpts = new ExportOptionsTIFF();
                tiffOpts.resolution = tiffCfg.dpi || 300;
                tiffOpts.byteOrder = TIFFByteOrder.IBMPC;
                tiffOpts.lzwCompression = (tiffCfg.lzw !== false);
                tiffOpts.imageColorSpace = (tiffCfg.colorSpace === "RGB") ? ImageColorSpace.RGB : ImageColorSpace.CMYK;
                tiffOpts.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
                tiffOpts.artBoardClipping = true;
            }

            var pngOpts = null;
            if (pngEnabled) {
                var pngCfg = cfg.formats.png;
                pngOpts = new ExportOptionsPNG24();
                var pDpi = pngCfg.dpi || 300;
                var pScale = (pDpi / 72) * 100;
                pngOpts.horizontalScale = pScale;
                pngOpts.verticalScale = pScale;
                pngOpts.transparency = (pngCfg.transparency !== false);
                pngOpts.antiAliasing = true;
                pngOpts.artBoardClipping = true;
            }

            var jpgOpts = null;
            if (jpgEnabled) {
                var jpgCfg = cfg.formats.jpg;
                jpgOpts = new ExportOptionsJPEG();
                var jDpi = jpgCfg.dpi || 300;
                var jScale = (jDpi / 72) * 100;
                jpgOpts.horizontalScale = jScale;
                jpgOpts.verticalScale = jScale;
                jpgOpts.qualitySetting = 100;
                jpgOpts.antiAliasing = true;
                jpgOpts.artBoardClipping = true;
            }

            // Export TIFF, PNG, JPEG
            for (var t = 0; t < targetIndices.length; t++) {
                var abIdx = targetIndices[t];
                doc.artboards.setActiveArtboardIndex(abIdx);

                // A. TIFF
                if (tiffEnabled && tiffOpts) {
                    try {
                        var tiffFile = new File(targetFolder.fsName + "/" + buildFileName(cfg.template, docBaseName, abIdx, "tif", selUnit, null, batchCtx));
                        doc.exportFile(tiffFile, ExportType.TIFF, tiffOpts);
                        totalExported++;
                    } catch (eTiff) {
                        exportErrors.push("TIFF (AB " + (abIdx + 1) + "): " + eTiff.message);
                    }
                }

                // B. PNG
                if (pngEnabled && pngOpts) {
                    try {
                        var pngFile = new File(targetFolder.fsName + "/" + buildFileName(cfg.template, docBaseName, abIdx, "png", selUnit, null, batchCtx));
                        doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
                        totalExported++;
                    } catch (ePng) {
                        exportErrors.push("PNG (AB " + (abIdx + 1) + "): " + ePng.message);
                    }
                }

                // C. JPEG
                if (jpgEnabled && jpgOpts) {
                    try {
                        var jpgFile = new File(targetFolder.fsName + "/" + buildFileName(cfg.template, docBaseName, abIdx, "jpg", selUnit, null, batchCtx));
                        doc.exportFile(jpgFile, ExportType.JPEG, jpgOpts);
                        totalExported++;
                    } catch (eJpg) {
                        exportErrors.push("JPEG (AB " + (abIdx + 1) + "): " + eJpg.message);
                    }
                }

                if (t > 0 && t % 5 === 0) $.gc();
            }

            // Export PDF
            if (pdfEnabled) {
                var pdfCfg = cfg.formats.pdf;
                var selectedPreset = pdfCfg.preset || "[High Quality Print]";
                var pdfOpts = new PDFSaveOptions();
                try {
                    if (selectedPreset) pdfOpts.pDFPreset = selectedPreset;
                } catch (ePr) {}

                if (pdfCfg.combined) {
                    // Single Multi-page PDF
                    try {
                        var combinedIndex = targetIndices.length ? targetIndices[0] : activeAbIndex;
                        var combinedFileName = buildFileName(cfg.template, docBaseName, combinedIndex, "pdf", selUnit, "All", batchCtx);
                        var combinedFile = new File(targetFolder.fsName + "/" + combinedFileName);
                        var rangeArr = [];
                        for (var rIdx = 0; rIdx < targetIndices.length; rIdx++) {
                            rangeArr.push(targetIndices[rIdx] + 1);
                        }
                        pdfOpts.artboardRange = rangeArr.join(",");
                        doc.saveAs(combinedFile, pdfOpts);
                        totalExported++;
                    } catch (ePdfComb) {
                        exportErrors.push("PDF (Multi-page): " + (ePdfComb && ePdfComb.message ? ePdfComb.message : String(ePdfComb)));
                    }
                } else {
                    // Separate PDF per artboard
                    if (targetIndices.length > 1) {
                        try {
                            tempAiFile = new File(Folder.temp.fsName + "/ozo_temp_pdf_" + (new Date().getTime()) + ".ai");
                            var aiSaveOpts = new IllustratorSaveOptions();
                            aiSaveOpts.pdfCompatible = false;
                            aiSaveOpts.compressed = true;
                            doc.saveAs(tempAiFile, aiSaveOpts);
                        } catch (eTempAi) {
                            tempAiFile = null;
                        }
                    }

                    for (var pIdx = 0; pIdx < targetIndices.length; pIdx++) {
                        var abIndexForPdf = targetIndices[pIdx];
                        try {
                            var pdfFile = new File(targetFolder.fsName + "/" + buildFileName(cfg.template, docBaseName, abIndexForPdf, "pdf", selUnit, null, batchCtx));
                            pdfOpts.artboardRange = String(abIndexForPdf + 1);
                            doc.saveAs(pdfFile, pdfOpts);
                            totalExported++;
                        } catch (ePdf) {
                            exportErrors.push("PDF (AB " + (abIndexForPdf + 1) + "): " + (ePdf && ePdf.message ? ePdf.message : String(ePdf)));
                        }

                        if (tempAiFile && tempAiFile.exists && pIdx < targetIndices.length - 1) {
                            try {
                                doc.close(SaveOptions.DONOTSAVECHANGES);
                                doc = app.open(tempAiFile);
                            } catch (eReloadTemp) {
                                exportErrors.push("PDF Reload: " + (eReloadTemp && eReloadTemp.message ? eReloadTemp.message : String(eReloadTemp)));
                            }
                        }

                        if (pIdx > 0 && pIdx % 5 === 0) $.gc();
                    }

                    if (tempAiFile && tempAiFile.exists) {
                        try { tempAiFile.remove(); } catch (eRemTemp) {}
                    }
                }
            }

        } catch (eUnexpected) {
            exportErrors.push("Export: " + (eUnexpected && eUnexpected.message ? eUnexpected.message : String(eUnexpected)));
        } finally {
            app.userInteractionLevel = prevInteractionLevel;

            if (tempAiFile && tempAiFile.exists) {
                try { tempAiFile.remove(); } catch (eRemTempFin) {}
            }

            if (modifiesDocument && originalDocFile && originalDocFile.exists) {
                var docClosed = false;
                try {
                    doc.close(SaveOptions.DONOTSAVECHANGES);
                    docClosed = true;
                } catch (eCloseDoc) {
                    exportErrors.push("Restore (close): " + (eCloseDoc && eCloseDoc.message ? eCloseDoc.message : String(eCloseDoc)));
                }
                if (docClosed) {
                    try {
                        doc = app.open(originalDocFile);
                    } catch (eOpenDoc) {
                        exportErrors.push("Restore (open): " + (eOpenDoc && eOpenDoc.message ? eOpenDoc.message : String(eOpenDoc)));
                    }
                }
            }

            try {
                if (doc && doc.artboards && origActiveAb >= 0 && origActiveAb < doc.artboards.length) {
                    doc.artboards.setActiveArtboardIndex(origActiveAb);
                }
            } catch (eOrigAb) {}
        }

        // Open destination folder if requested
        if (cfg.openFolder && targetFolder && targetFolder.exists) {
            var opened = false;
            try { opened = targetFolder.execute(); } catch (eOpenF) {}
            if (!opened && typeof app.system === "function") {
                try {
                    if (Folder.fs === "Windows") {
                        app.system('explorer.exe "' + targetFolder.fsName.replace(/\//g, "\\").replace(/"/g, '""') + '"');
                    } else {
                        app.system('open "' + targetFolder.fsName.replace(/"/g, '\\"') + '"');
                    }
                } catch (eSysOpen) {}
            }
        }

        $.gc();

        if (isHeadless) {
            return {
                status: (exportErrors.length > 0 && totalExported === 0) ? "error" : "success",
                count: totalExported,
                artboardsCount: targetIndices.length,
                folder: targetFolder.fsName,
                errors: exportErrors
            };
        } else {
            var msg = OZO.tr("Batch export complete!\n") +
                      totalExported + " " + OZO.tr("file(s) exported across") + " " +
                      targetIndices.length + " " + OZO.tr("artboard(s) to:\n") + targetFolder.fsName;
            if (exportErrors.length > 0) {
                msg += "\n\n" + OZO.tr("Notes / Errors:") + "\n" + exportErrors.join("\n");
            }
            alert(msg, SCRIPT_NAME);
            return null;
        }
    }

    // Check for Headless Dock Execution
    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        __ozoHeadlessParams.isHeadless = true;
        __ozoHeadlessResult = executeExportCore(__ozoHeadlessParams);
        return;
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
        "v2.2 \u2022 " + OZO.tr("Batch export artboards to PDF, TIFF, PNG & JPEG with dynamic naming")
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
    leftCol.preferredSize.width = 305;

    var rightCol = contentGroup.add("group");
    rightCol.orientation = "column";
    rightCol.alignChildren = ["fill", "top"];
    rightCol.spacing = 10;
    rightCol.preferredSize.width = 345;

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

    // ScriptUI only auto-excludes radio buttons that share an immediate parent.
    // rbCustom lives inside customScopeGroup, so enforce the scope selection manually.
    rbAll.onClick = function () {
        rbActive.value = false;
        rbCustom.value = false;
        syncControlStates();
    };
    rbActive.onClick = function () {
        rbAll.value = false;
        rbCustom.value = false;
        syncControlStates();
    };
    rbCustom.onClick = function () {
        rbAll.value = false;
        rbActive.value = false;
        customRangeInput.active = true;
        syncControlStates();
    };
    customRangeInput.onChanging = function () {
        updatePreviewName();
    };

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

    rbPdfSeparate.onClick = function () {
        rbPdfCombined.value = false;
        syncControlStates();
    };
    rbPdfCombined.onClick = function () {
        rbPdfSeparate.value = false;
        syncControlStates();
    };

    pdfBox.onClick = function () {
        syncControlStates();
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
        syncControlStates();
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
        syncControlStates();
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
    jpgOptionsGroup.enabled = false;

    jpgBox.onClick = function () {
        syncControlStates();
    };

    // Prepress Option: Text Outlining
    var outlineGroup = formatPanel.add("group");
    outlineGroup.orientation = "column";
    outlineGroup.alignChildren = ["left", "top"];
    outlineGroup.margins = [0, 6, 0, 0];

    var outlineBox = outlineGroup.add("checkbox", undefined, OZO.tr("Convert text to outlines before export"));
    outlineBox.value = false;
    outlineBox.helpTip = "Outlines all text frames for export, then reopens the saved original so live text is preserved.";

    // =============================================================
    // Right Column: 3. Dynamic Naming & 4. Destination Folder
    // =============================================================

    // Panel: File Naming
    var namePanel = rightCol.add("panel", undefined, OZO.tr("File Naming"));
    namePanel.orientation = "column";
    namePanel.alignChildren = ["fill", "top"];
    namePanel.margins = [12, 14, 12, 10];
    namePanel.spacing = 8;

    // Presets Definition: Friendly Label -> Token Pattern
    var namingPresets = [
        { label: OZO.tr("Doc_Artboard_Size"), pattern: "[doc]_[ab]_[w]x[h][unit]" },
        { label: OZO.tr("Doc_Artboard"), pattern: "[doc]_[ab]" },
        { label: OZO.tr("Artboard_Size"), pattern: "[ab]_[w]x[h][unit]" },
        { label: OZO.tr("01_Doc_Artboard"), pattern: "[num]_[doc]_[ab]" },
        { label: OZO.tr("Doc_01"), pattern: "[doc]_[num]" },
        { label: OZO.tr("Artboard Only"), pattern: "[ab]" },
        { label: OZO.tr("Custom Pattern..."), pattern: "" }
    ];

    var presetUnitRow = namePanel.add("group");
    presetUnitRow.orientation = "row";
    presetUnitRow.alignChildren = ["left", "center"];
    presetUnitRow.spacing = 6;

    var presetLabel = presetUnitRow.add("statictext", undefined, OZO.tr("Preset:"));
    presetLabel.preferredSize.width = 46;

    var presetLabels = [];
    for (var pi = 0; pi < namingPresets.length; pi++) {
        presetLabels.push(namingPresets[pi].label);
    }
    var namingPresetList = presetUnitRow.add("dropdownlist", undefined, presetLabels);
    namingPresetList.selection = 0;
    namingPresetList.preferredSize.width = 168;

    presetUnitRow.add("statictext", undefined, OZO.tr("Unit:"));
    var unitList = presetUnitRow.add("dropdownlist", undefined, ["mm", "cm", "in", "pt"]);
    var defaultUnitIndex = 0;
    if (defaultUnit === "cm") defaultUnitIndex = 1;
    else if (defaultUnit === "in" || defaultUnit === "inches") defaultUnitIndex = 2;
    else if (defaultUnit === "pt" || defaultUnit === "points") defaultUnitIndex = 3;
    unitList.selection = defaultUnitIndex;
    unitList.preferredSize.width = 58;

    // Pattern Input & Tag Inserter Row
    var patternRow = namePanel.add("group");
    patternRow.orientation = "row";
    patternRow.alignChildren = ["left", "center"];
    patternRow.spacing = 6;

    var patternLabel = patternRow.add("statictext", undefined, OZO.tr("Pattern:"));
    patternLabel.preferredSize.width = 46;

    var templateInput = patternRow.add("edittext", undefined, namingPresets[0].pattern);
    templateInput.preferredSize.width = 168;
    templateInput.helpTip = "Tokens: [doc] [ab] [num] [raw_num] [w] [h] [unit] [date] [time] [color] [fmt]";

    var tagDropdown = patternRow.add("dropdownlist", undefined, [
        OZO.tr("+ Tag..."),
        OZO.tr("Document [doc]"),
        OZO.tr("Artboard [ab]"),
        OZO.tr("Size [w]x[h]"),
        OZO.tr("Width [w]"),
        OZO.tr("Height [h]"),
        OZO.tr("Unit [unit]"),
        OZO.tr("Number [num]"),
        OZO.tr("Date [date]"),
        OZO.tr("Time [time]"),
        OZO.tr("Color [color]")
    ]);
    tagDropdown.selection = 0;
    tagDropdown.preferredSize.width = 88;

    var tagTokens = ["", "[doc]", "[ab]", "[w]x[h]", "[w]", "[h]", "[unit]", "[num]", "[date]", "[time]", "[color]"];
    tagDropdown.onChange = function () {
        if (!tagDropdown.selection || tagDropdown.selection.index === 0) return;
        var tkn = tagTokens[tagDropdown.selection.index];
        if (tkn) {
            var cur = templateInput.text;
            if (!cur || cur.charAt(cur.length - 1) === "_") {
                templateInput.text = cur + tkn;
            } else {
                templateInput.text = cur + "_" + tkn;
            }
            selectCustomPreset();
            updatePreviewName();
        }
        tagDropdown.selection = 0;
    };

    function selectCustomPreset() {
        namingPresetList.selection = namingPresets.length - 1; // Custom Pattern...
    }

    function syncPresetToInput() {
        var txt = templateInput.text;
        for (var i = 0; i < namingPresets.length - 1; i++) {
            if (namingPresets[i].pattern === txt) {
                namingPresetList.selection = i;
                return;
            }
        }
        selectCustomPreset();
    }

    namingPresetList.onChange = function () {
        if (namingPresetList.selection && namingPresetList.selection.index < namingPresets.length - 1) {
            templateInput.text = namingPresets[namingPresetList.selection.index].pattern;
        }
        updatePreviewName();
    };

    templateInput.onChanging = function () {
        syncPresetToInput();
        updatePreviewName();
    };

    // Live Filename Preview (Clean borderless layout)
    var samplePreviewPanel = namePanel.add("group");
    samplePreviewPanel.orientation = "column";
    samplePreviewPanel.alignChildren = ["fill", "top"];
    samplePreviewPanel.margins = [2, 4, 2, 2];
    samplePreviewPanel.spacing = 3;

    var previewTitleRow = samplePreviewPanel.add("group");
    previewTitleRow.orientation = "row";
    previewTitleRow.alignChildren = ["left", "center"];
    var previewTitle = previewTitleRow.add("statictext", undefined, OZO.tr("Preview:"));
    try {
        previewTitle.graphics.font = ScriptUI.newFont(
            previewTitle.graphics.font ? previewTitle.graphics.font.name : "dialog",
            "BOLD",
            10
        );
    } catch (eBld) {}

    var samplePreviewText = samplePreviewPanel.add("statictext", undefined, "");
    samplePreviewText.preferredSize.width = 310;
    try {
        samplePreviewText.graphics.font = ScriptUI.newFont(
            samplePreviewText.graphics.font ? samplePreviewText.graphics.font.name : "dialog",
            "BOLD",
            11
        );
    } catch (eBold) {}

    var sampleDimsText = samplePreviewPanel.add("statictext", undefined, "");
    sampleDimsText.preferredSize.width = 310;
    sampleDimsText.graphics.foregroundColor = sampleDimsText.graphics.newPen(dialog.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

    var sampleSummaryText = samplePreviewPanel.add("statictext", undefined, "");
    sampleSummaryText.preferredSize.width = 310;
    sampleSummaryText.graphics.foregroundColor = sampleSummaryText.graphics.newPen(dialog.graphics.PenType.SOLID_COLOR, [0.18, 0.48, 0.98, 1], 1);

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

    function getTargetIndices() {
        var indices = [];
        if (rbAll.value) {
            for (var a = 0; a < totalArtboards; a++) indices.push(a);
        } else if (rbActive.value) {
            indices.push(activeAbIndex);
        } else if (rbCustom.value) {
            indices = parseArtboardRange(customRangeInput.text, totalArtboards);
        }
        return indices;
    }

    function syncControlStates() {
        pdfPresetGroup.enabled = pdfBox.value;
        tiffOptionsGroup.enabled = tiffBox.value;
        pngOptionsGroup.enabled = pngBox.value;
        jpgOptionsGroup.enabled = jpgBox.value;
        subfolderNameInput.enabled = useSubfolderBox.value;
        customRangeInput.enabled = rbCustom.value;
        updatePreviewName();
    }

    function updatePreviewName() {
        var docBaseName = doc.name.replace(/\.[^\.]+$/, "");
        var selExt = getSelectedFormatExt();
        var selUnit = unitList.selection ? unitList.selection.text : "mm";
        var isCombined = pdfBox.value && rbPdfCombined.value;
        var previewIndices = getTargetIndices();
        var previewAb = previewIndices.length ? previewIndices[0] : activeAbIndex;
        var sampleName = buildFileName(templateInput.text, docBaseName, previewAb, selExt, selUnit, isCombined ? "All" : null);
        samplePreviewText.text = "→ " + sampleName;

        if (sampleDimsText) {
            if (isCombined) {
                sampleDimsText.text = OZO.tr("Multi-page PDF containing all selected artboards");
            } else {
                var ab = doc.artboards[previewAb];
                var dims = getArtboardDimensions(ab, selUnit);
                var abName = ab.name || ("Artboard " + (previewAb + 1));
                sampleDimsText.text = abName + " • " + dims.width + " × " + dims.height + " " + selUnit + " (" + (previewAb + 1) + "/" + totalArtboards + ")";
            }
        }

        if (sampleSummaryText) {
            var targetCount = previewIndices.length;
            var fmtCount = (pdfBox.value ? 1 : 0) + (tiffBox.value ? 1 : 0) + (pngBox.value ? 1 : 0) + (jpgBox.value ? 1 : 0);
            if (fmtCount === 0) {
                sampleSummaryText.text = OZO.tr("Please select at least one format.");
                sampleSummaryText.graphics.foregroundColor = sampleSummaryText.graphics.newPen(dialog.graphics.PenType.SOLID_COLOR, [0.92, 0.42, 0.12, 1], 1);
            } else {
                var totalFiles = 0;
                if (pdfBox.value) totalFiles += isCombined ? 1 : targetCount;
                if (tiffBox.value) totalFiles += targetCount;
                if (pngBox.value) totalFiles += targetCount;
                if (jpgBox.value) totalFiles += targetCount;

                sampleSummaryText.text = OZO.tr("Planned output:") + " " + targetCount + " " + OZO.tr("artboard(s)") + " • " + fmtCount + " " + OZO.tr("format(s)") + " • " + totalFiles + " " + OZO.tr("file(s) total");
                sampleSummaryText.graphics.foregroundColor = sampleSummaryText.graphics.newPen(dialog.graphics.PenType.SOLID_COLOR, [0.18, 0.48, 0.98, 1], 1);
            }
        }
    }

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
    destFolderInput.preferredSize.width = 230;

    var browseBtn = folderRow.add("button", undefined, OZO.tr("Browse..."));
    browseBtn.preferredSize = [78, 24];

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
        syncControlStates();
    };

    var openFolderBox = destPanel.add("checkbox", undefined, OZO.tr("Open folder when finished"));
    openFolderBox.value = true;

    // Buttons
    var buttonGroup = dialog.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignment = ["fill", "top"];
    buttonGroup.alignChildren = ["right", "center"];
    buttonGroup.spacing = 10;
    buttonGroup.margins = [0, 4, 0, 2];

    var btnSpacer = buttonGroup.add("group");
    btnSpacer.alignment = ["fill", "center"];

    var cancelButton = buttonGroup.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    cancelButton.preferredSize = [105, 30];

    var exportButton = buttonGroup.add("button", undefined, OZO.tr("Export Now"), {name: "ok"});
    exportButton.preferredSize = [135, 30];

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

    // Older builds could restore multiple radio selections because the custom
    // scope radio is nested in its own group. Normalize to a single choice.
    if (rbAll.value) {
        rbActive.value = false;
        rbCustom.value = false;
    } else if (rbActive.value) {
        rbCustom.value = false;
    } else if (!rbCustom.value) {
        rbAll.value = true;
    }
    if (rbPdfCombined.value) {
        rbPdfSeparate.value = false;
    } else {
        rbPdfSeparate.value = true;
    }

    // Apply restored values to dependent controls and the filename preview.
    syncControlStates();

    // -------------------------------------------------------------
    // Export Button Handler
    // -------------------------------------------------------------
    exportButton.onClick = function () {
        var dpiMap = { "300 DPI": 300, "150 DPI": 150, "72 DPI": 72 };
        var cfg = {
            isHeadless: false,
            scope: rbAll.value ? "all" : (rbActive.value ? "active" : "range"),
            customRange: customRangeInput.text,
            formats: {
                pdf: {
                    enabled: pdfBox.value,
                    preset: (pdfPresetList.selection && pdfPresetList.selection.text) ? pdfPresetList.selection.text : "[High Quality Print]",
                    combined: rbPdfCombined.value
                },
                tiff: {
                    enabled: tiffBox.value,
                    dpi: (tiffDpiList.selection && dpiMap[tiffDpiList.selection.text]) ? dpiMap[tiffDpiList.selection.text] : 300,
                    colorSpace: (tiffColorList.selection && tiffColorList.selection.text === "RGB") ? "RGB" : "CMYK",
                    lzw: tiffLzwBox.value
                },
                png: {
                    enabled: pngBox.value,
                    dpi: (pngDpiList.selection && dpiMap[pngDpiList.selection.text]) ? dpiMap[pngDpiList.selection.text] : 300,
                    transparency: pngTransBox.value
                },
                jpg: {
                    enabled: jpgBox.value,
                    dpi: (jpgDpiList.selection && dpiMap[jpgDpiList.selection.text]) ? dpiMap[jpgDpiList.selection.text] : 300,
                    quality: 100
                }
            },
            template: templateInput.text,
            unit: unitList.selection ? unitList.selection.text : "mm",
            destFolder: destFolderInput.text,
            useSubfolder: useSubfolderBox.value,
            subfolderName: subfolderNameInput.text,
            openFolder: openFolderBox.value,
            outline: outlineBox.value
        };

        // Save preferences
        OZO.saveWindowState(dialog, STATE_NAMESPACE, {
            template: templateInput.text,
            useSubfolder: useSubfolderBox.value,
            subfolder: subfolderNameInput.text,
            openFolder: openFolderBox.value,
            outline: outlineBox.value,
            pdfCombined: rbPdfCombined.value
        });

        dialog.close(1);
        executeExportCore(cfg);
    };

    dialog.center();
    dialog.show();
})();
