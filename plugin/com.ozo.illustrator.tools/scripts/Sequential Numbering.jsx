#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Sequential Numbering";
    var PREVIEW_LAYER_NAME = "__Sequential Numbering Preview__";
    var RESULT_LAYER_NAME = "[Sequential Numbers]";

    if (app.documents.length === 0) {
        alert(OZO.tr("Open a document and select one template text frame."));
        return;
    }

    var doc = app.activeDocument;
    var currentSelection = doc.selection;
    if (!currentSelection || currentSelection.typename === "TextRange" ||
            currentSelection.length === 0) {
        alert(OZO.tr("Select one template text frame before running Sequential Numbering."));
        return;
    }

    var template = null;
    var selectedTextCount = 0;
    for (var selectionIndex = 0; selectionIndex < currentSelection.length; selectionIndex++) {
        if (currentSelection[selectionIndex].typename === "TextFrame") {
            template = currentSelection[selectionIndex];
            selectedTextCount++;
        }
    }
    if (selectedTextCount !== 1) {
        alert(OZO.isKhmer() ?
            "\u179f\u17bc\u1798\u1787\u17d2\u179a\u17be\u179f\u1794\u17d2\u179a\u17a2\u1794\u17cb\u17a2\u178f\u17d2\u1790\u1794\u1791\u1796\u17bb\u1798\u17d2\u1796\u178f\u17c2\u1798\u17bd\u1799\u17d4\n\n\u1794\u17d2\u179a\u17a2\u1794\u17cb\u178a\u17c2\u179b\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u1795\u17d2\u178a\u179b\u17cb\u1796\u17bb\u1798\u17d2\u1796\u17a2\u1780\u17d2\u179f\u179a \u1791\u17c6\u17a0\u17c6 \u1796\u178e\u17cc \u1780\u17b6\u179a\u178f\u1798\u17d2\u179a\u17b9\u1798 \u1793\u17b7\u1784\u179a\u1785\u1793\u17b6\u1794\u17d0\u1791\u17d2\u1798\u17d4" :
            "Select exactly one template text frame.\n\nThe selected frame supplies the font, size, color, alignment, and styling.");
        return;
    }

    var originalActiveLayer = doc.activeLayer;
    var originalTemplateHidden = template.hidden;
    var originalTemplateLocked = template.locked;
    var previewLayer = null;
    var previewItems = [];
    var previewSignature = null;
    var artboardCount = doc.artboards.length;
    var artboardRects = [];
    var artboardNames = [];
    for (var cachedArtboardIndex = 0; cachedArtboardIndex < artboardCount;
            cachedArtboardIndex++) {
        var cachedRect = doc.artboards[cachedArtboardIndex].artboardRect;
        artboardRects[cachedArtboardIndex] = [
            cachedRect[0], cachedRect[1], cachedRect[2], cachedRect[3]
        ];
        artboardNames[cachedArtboardIndex] = doc.artboards[cachedArtboardIndex].name;
    }

    function errorMessage(error) {
        return error && error.message ? error.message : String(error);
    }

    function normalizeEditingContext() {
        for (var pass = 0; pass < 12; pass++) {
            try { app.executeMenuCommand("exitFocus"); }
            catch (ignoreIsolation) { break; }
        }
        try { app.executeMenuCommand("Adobe Draw Normal"); }
        catch (ignoreDrawMode) {}
    }

    function unitFactor(unit) {
        return OZO.toPoints(1, unit);
    }

    function compactNumber(value, precision) {
        var text = value.toFixed(precision);
        return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    }

    function readInteger(control, name, minimum, maximum) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "").replace(/^\s+|\s+$/g, ""));
        if (!isFinite(value) || value !== Math.floor(value)) {
            throw new Error(name + " must be a whole number.");
        }
        if (value < minimum || value > maximum) {
            throw new Error(name + " must be from " + minimum + " to " + maximum + ".");
        }
        return value;
    }

    function readNumber(control, name, allowZero) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "").replace(/^\s+|\s+$/g, ""));
        if (!isFinite(value)) {
            throw new Error("Enter a valid number for " + name + ".");
        }
        if (allowZero ? value < 0 : value <= 0) {
            throw new Error(name + " must be " + (allowZero ? "zero or greater." : "greater than zero."));
        }
        return value;
    }

    function readCoordinate(control, name) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "").replace(/^\s+|\s+$/g, ""));
        if (!isFinite(value)) throw new Error("Enter a valid number for " + name + ".");
        return value;
    }

    function formatSequenceNumber(value, padding) {
        var sign = value < 0 ? "-" : "";
        var digits = String(Math.abs(value));
        while (digits.length < padding) digits = "0" + digits;
        return sign + digits;
    }

    function frameReferencePoint(frame) {
        try {
            if (frame.kind === TextType.POINTTEXT) {
                return [frame.anchor[0], frame.anchor[1]];
            }
        } catch (ignoreAnchor) {}
        return [frame.position[0], frame.position[1]];
    }

    function moveFrameReferenceTo(frame, targetPoint) {
        var currentPoint = frameReferencePoint(frame);
        frame.translate(targetPoint[0] - currentPoint[0], targetPoint[1] - currentPoint[1]);
    }

    function restoreTemplateState() {
        try { template.locked = false; } catch (ignoreUnlock) {}
        try { template.hidden = originalTemplateHidden; } catch (ignoreHidden) {}
        try { template.locked = originalTemplateLocked; } catch (ignoreLocked) {}
    }

    function restoreTemplateSelection() {
        try {
            doc.selection = null;
            if (!template.hidden && !template.locked) template.selected = true;
        } catch (ignoreSelection) {}
    }

    function cleanupPreview(skipRedraw) {
        restoreTemplateState();
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (ignoreRemoval) {}
        }
        previewLayer = null;
        previewItems = [];
        previewSignature = null;
        try { doc.activeLayer = originalActiveLayer; } catch (ignoreLayer) {}
        restoreTemplateSelection();
        if (!skipRedraw) {
            app.redraw();
        }
    }

    function uniqueResultLayerName() {
        var used = {};
        for (var i = 0; i < doc.layers.length; i++) used[doc.layers[i].name] = true;
        if (!used[RESULT_LAYER_NAME]) return RESULT_LAYER_NAME;
        var suffix = 2;
        while (used[RESULT_LAYER_NAME + " " + suffix]) suffix++;
        return RESULT_LAYER_NAME + " " + suffix;
    }

    function findTemplateArtboard() {
        var bounds;
        try { bounds = template.visibleBounds; }
        catch (ignoreBounds) { return doc.artboards.getActiveArtboardIndex(); }
        var centerX = (bounds[0] + bounds[2]) / 2;
        var centerY = (bounds[1] + bounds[3]) / 2;
        for (var i = 0; i < artboardCount; i++) {
            var rect = artboardRects[i];
            if (centerX >= rect[0] && centerX <= rect[2] &&
                    centerY <= rect[1] && centerY >= rect[3]) return i;
        }
        return doc.artboards.getActiveArtboardIndex();
    }

    function duplicateTemplate(targetLayer, fullText) {
        var duplicate = null;
        var hasKhmer = /[\u1780-\u17FF]/.test(fullText || "");
        if (hasKhmer) {
            var donor = OZO.findDonorTextFrame(doc);
            if (donor) {
                try {
                    duplicate = donor.duplicate(targetLayer, ElementPlacement.PLACEATEND);
                    duplicate.textRange.characterAttributes.size = template.textRange.characterAttributes.size;
                    duplicate.textRange.characterAttributes.fillColor = template.textRange.characterAttributes.fillColor;
                } catch (eDonorDup) {
                    duplicate = null;
                }
            }
        }
        if (!duplicate) {
            duplicate = template.duplicate(targetLayer, ElementPlacement.PLACEATEND);
        }
        if (duplicate && duplicate.typename === "TextRange") {
            var owner = duplicate.parent;
            if (owner && owner.typename === "TextFrame") {
                duplicate = owner;
            } else if (owner && owner.typename === "Story" && owner.textFrames.length > 0) {
                duplicate = owner.textFrames[0];
            }
        }
        if (!duplicate || duplicate.typename !== "TextFrame") {
            throw new Error("Illustrator did not return an editable text-frame duplicate.");
        }
        return duplicate;
    }

    function generatePreview(settings) {
        if (!previewLayer) {
            cleanupPreview(true);
            normalizeEditingContext();
            previewLayer = doc.layers.add();
            previewLayer.name = PREVIEW_LAYER_NAME;
            previewLayer.locked = false;
            previewLayer.visible = true;
        } else {
            for (var p = previewLayer.pageItems.length - 1; p >= 0; p--) {
                try { previewLayer.pageItems[p].remove(); } catch (ignoreP) {}
            }
            previewItems = [];
        }
        doc.activeLayer = previewLayer;

        var step = settings.end >= settings.start ? 1 : -1;
        var templatePoint = frameReferencePoint(template);
        var templateArtboardIndex = findTemplateArtboard();
        var templateArtboardRect = artboardRects[templateArtboardIndex];
        var relX = templatePoint[0] - templateArtboardRect[0];
        var relY = templatePoint[1] - templateArtboardRect[1];

        try {
            for (var index = 0; index < settings.count; index++) {
                var currentNumber = settings.start + index * step;
                var fullText = settings.prefix +
                    formatSequenceNumber(currentNumber, settings.padding) + settings.suffix;
                var targetPoint;

                if (settings.layout === 0) {
                    var columnIndex = index % settings.columns;
                    var rowIndex = Math.floor(index / settings.columns);
                    targetPoint = [
                        settings.startX + columnIndex * settings.horizontalStep,
                        settings.startY - rowIndex * settings.verticalStep
                    ];
                } else {
                    var artboardIndex = (settings.startArtboard + index) % artboardCount;
                    var targetRect = artboardRects[artboardIndex];
                    targetPoint = [
                        targetRect[0] + relX,
                        targetRect[1] + relY
                    ];
                }

                var numberFrame = duplicateTemplate(previewLayer, fullText);
                numberFrame.contents = fullText;
                moveFrameReferenceTo(numberFrame, targetPoint);
                numberFrame.name = "Sequential Number " + fullText;
                previewItems.push(numberFrame);
            }
            template.hidden = true;
        } catch (error) {
            cleanupPreview();
            throw error;
        }

        try {
            previewLayer.hasSelectedArtwork = true;
        } catch (ignoreLayerSelect) {
            doc.selection = null;
            for (var itemIndex = 0; itemIndex < previewItems.length; itemIndex++) {
                previewItems[itemIndex].selected = true;
            }
        }
        app.redraw();
        return previewItems.length;
    }

    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var templatePoint = frameReferencePoint(template);
    var detectedArtboard = findTemplateArtboard();
    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("Sequential Numbering"), "v2.0 • Ticket & Batch Numbering");

    var sequencePanel = dialog.add("panel", undefined, OZO.tr("Sequence"));
    sequencePanel.orientation = "column";
    sequencePanel.alignChildren = ["left", "center"];
    sequencePanel.margins = [14, 16, 14, 10];

    function labeledInput(parent, label, value, characters) {
        var row = parent.add("group");
        var labelControl = row.add("statictext", undefined, label);
        labelControl.preferredSize.width = 105;
        var input = row.add("edittext", undefined, value);
        input.characters = characters || 12;
        return input;
    }

    var rangeRow = sequencePanel.add("group");
    rangeRow.add("statictext", undefined, OZO.tr("Start:"));
    var startInput = rangeRow.add("edittext", undefined, "1");
    startInput.characters = 9;
    rangeRow.add("statictext", undefined, OZO.tr("End:"));
    var endInput = rangeRow.add("edittext", undefined, "100");
    endInput.characters = 9;
    rangeRow.add("statictext", undefined, OZO.tr("Padding:"));
    var paddingInput = rangeRow.add("edittext", undefined, "3");
    paddingInput.characters = 4;

    var prefixInput = labeledInput(sequencePanel, OZO.tr("Prefix"), "NO. ", 25);
    var suffixInput = labeledInput(sequencePanel, OZO.tr("Suffix"), "", 25);

    var layoutPanel = dialog.add("panel", undefined, OZO.tr("Layout"));
    layoutPanel.orientation = "column";
    layoutPanel.alignChildren = ["fill", "top"];
    layoutPanel.margins = [14, 16, 14, 10];

    var layoutRow = layoutPanel.add("group");
    layoutRow.add("statictext", undefined, OZO.tr("Mode:"));
    var layoutList = layoutRow.add("dropdownlist", undefined, [
        OZO.tr("N-up grid"), OZO.tr("Matching position across artboards")
    ]);
    layoutList.selection = 0;
    layoutList.preferredSize.width = 260;

    var unitRow = layoutPanel.add("group");
    unitRow.add("statictext", undefined, OZO.tr("Units:"));
    var unitList = unitRow.add("dropdownlist", undefined, ["mm", "cm", "m", "in", "pt"]);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "m") defaultUnitIdx = 2;
    else if (defaultDocUnit === "in") defaultUnitIdx = 3;
    else if (defaultDocUnit === "pt") defaultUnitIdx = 4;
    unitList.selection = defaultUnitIdx;
    var initialUnit = ["mm", "cm", "m", "in", "pt"][defaultUnitIdx] || "mm";
    var initialFactor = unitFactor(initialUnit);

    var gridGroup = layoutPanel.add("group");
    gridGroup.orientation = "column";
    gridGroup.alignChildren = ["left", "center"];
    var columnsInput = labeledInput(gridGroup, OZO.tr("Columns"), "5", 8);
    var horizontalInput = labeledInput(gridGroup, OZO.tr("Horizontal step"),
        compactNumber(OZO.toPoints(30, "mm") / initialFactor, 3), 10);
    var verticalInput = labeledInput(gridGroup, OZO.tr("Vertical step"),
        compactNumber(OZO.toPoints(12, "mm") / initialFactor, 3), 10);
    var startXInput = labeledInput(gridGroup, OZO.tr("Start X"),
        compactNumber(templatePoint[0] / initialFactor, 3), 10);
    var startYInput = labeledInput(gridGroup, OZO.tr("Start Y"),
        compactNumber(templatePoint[1] / initialFactor, 3), 10);

    var artboardGroup = layoutPanel.add("group");
    artboardGroup.orientation = "row";
    artboardGroup.add("statictext", undefined, OZO.tr("Reference/start artboard:"));
    var artboardList = artboardGroup.add("dropdownlist", undefined, []);
    artboardList.preferredSize.width = 250;
    for (var artboardIndex = 0; artboardIndex < artboardCount; artboardIndex++) {
        artboardList.add("item", (artboardIndex + 1) + " \u2014 " + artboardNames[artboardIndex]);
    }
    artboardList.selection = detectedArtboard;
    artboardGroup.visible = false;

    var optionsPanel = dialog.add("panel", undefined, OZO.tr("Template after Apply"));
    optionsPanel.orientation = "row";
    optionsPanel.alignChildren = ["left", "center"];
    optionsPanel.margins = [14, 16, 14, 10];
    optionsPanel.add("statictext", undefined, OZO.tr("Action:"));
    var templateActionList = optionsPanel.add("dropdownlist", undefined, [
        OZO.tr("Hide source template"), OZO.tr("Lock source template"), OZO.tr("Keep source template")
    ]);
    templateActionList.selection = 0;

    var statusText = dialog.add("statictext", undefined, "Ready to generate a reversible preview.");
    var noteText = dialog.add("statictext", undefined,
        "Artboard mode places one number per artboard at the template's relative position and wraps from the selected start artboard.",
        {multiline: true});
    noteText.preferredSize = [475, 36];
    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var previewButton = buttons.add("button", undefined, OZO.tr("Update Preview"));
    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var applyButton = buttons.add("button", undefined, OZO.tr("Apply"), {name: "ok"});
    dialog.defaultElement = applyButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog);

    function updateLayoutControls() {
        var isGrid = layoutList.selection.index === 0;
        gridGroup.visible = isGrid;
        artboardGroup.visible = !isGrid;
        unitRow.enabled = isGrid;
        dialog.layout.layout(true);
    }
    layoutList.onChange = updateLayoutControls;

    var restoringState = true;
    var previousUnit = "mm";
    unitList.onChange = function () {
        if (restoringState) return;
        var newUnit = unitList.selection ? unitList.selection.text : "mm";
        var controls = [horizontalInput, verticalInput, startXInput, startYInput];
        for (var i = 0; i < controls.length; i++) {
            var val = (typeof OZO !== "undefined" && OZO.parseNumber) ?
                OZO.parseNumber(controls[i].text, NaN) :
                parseFloat(String(controls[i].text).replace(/,/g, "."));
            if (isFinite(val)) {
                controls[i].text = compactNumber(
                    val * unitFactor(previousUnit) / unitFactor(newUnit), 5
                );
            }
        }
        previousUnit = newUnit;
    };

    function readSettings() {
        var start = readInteger(startInput, "Start number", -1000000000, 1000000000);
        var end = readInteger(endInput, "End number", -1000000000, 1000000000);
        var count = Math.abs(end - start) + 1;
        if (count > 10000) throw new Error("The sequence is limited to 10,000 numbers per run.");
        var layout = layoutList.selection.index;
        if (layout === 1 && count > artboardCount) {
            throw new Error("Artboard mode creates one number per artboard.\nThe sequence has " +
                count + " numbers, but the document has " + artboardCount + " artboards.");
        }
        var unit = unitList.selection.text;
        var factor = unitFactor(unit);
        return {
            start: start,
            end: end,
            count: count,
            prefix: prefixInput.text,
            suffix: suffixInput.text,
            padding: readInteger(paddingInput, "Padding", 0, 20),
            layout: layout,
            columns: layout === 0 ? readInteger(columnsInput, "Columns", 1, 1000) : 1,
            horizontalStep: layout === 0 ?
                readNumber(horizontalInput, "Horizontal step", false) * factor : 0,
            verticalStep: layout === 0 ?
                readNumber(verticalInput, "Vertical step", false) * factor : 0,
            startX: layout === 0 ? readCoordinate(startXInput, "Start X") * factor : 0,
            startY: layout === 0 ? readCoordinate(startYInput, "Start Y") * factor : 0,
            startArtboard: artboardList.selection.index,
            templateAction: templateActionList.selection.index
        };
    }

    function settingsSignature(settings) {
        return [settings.start, settings.end,
            settings.prefix.length + ":" + settings.prefix,
            settings.suffix.length + ":" + settings.suffix, settings.padding,
            settings.layout, settings.columns, settings.horizontalStep, settings.verticalStep,
            settings.startX, settings.startY, settings.startArtboard].join("|");
    }

    previewButton.onClick = function () {
        previewButton.enabled = false;
        statusText.text = OZO.isKhmer() ? "\u1780\u17c6\u1796\u17bb\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793..." : "Generating preview...";
        dialog.update();
        try {
            var settings = readSettings();
            var generated = generatePreview(settings);
            previewSignature = settingsSignature(settings);
            statusText.text = OZO.isKhmer() ?
                "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u179a\u17bd\u1785\u179a\u17b6\u179b\u17cb\u17d6 " + generated + " \u179b\u17c1\u1781\u17d4" :
                "Preview ready: " + generated + " number(s).";
        } catch (error) {
            cleanupPreview();
            statusText.text = OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : "Preview failed.";
            alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u179b\u17c1\u1781\u179a\u17c0\u1784\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" :
                SCRIPT_NAME + " preview failed.") + "\n\n" + errorMessage(error));
        }
        previewButton.enabled = true;
    };

    OZO.makeNumericSmooth(startInput, {step: 1});
    OZO.makeNumericSmooth(endInput, {step: 1});
    OZO.makeNumericSmooth(paddingInput, {step: 1, min: 1, max: 20});
    OZO.makeNumericSmooth(columnsInput, {step: 1, min: 1, max: 500});
    OZO.makeNumericSmooth(horizontalInput, {step: 1});
    OZO.makeNumericSmooth(verticalInput, {step: 1});

    OZO.restoreWindowState(dialog, "sequential_numbering");
    previousUnit = unitList.selection ? unitList.selection.text : "mm";
    restoringState = false;
    updateLayoutControls();
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    startInput.active = true;

    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview();
        return;
    }

    try {
        var finalSettings = readSettings();
        if (!previewLayer || previewSignature !== settingsSignature(finalSettings)) {
            generatePreview(finalSettings);
        }

        var finalLayerName = uniqueResultLayerName();
        previewLayer.name = finalLayerName;
        restoreTemplateState();
        if (finalSettings.templateAction === 0) {
            template.locked = false;
            template.hidden = true;
            template.locked = originalTemplateLocked;
        } else if (finalSettings.templateAction === 1) {
            template.hidden = originalTemplateHidden;
            template.locked = true;
        }

        try {
            previewLayer.hasSelectedArtwork = true;
        } catch (ignoreFinalSelect) {
            doc.selection = null;
            for (var finalIndex = 0; finalIndex < previewItems.length; finalIndex++) {
                previewItems[finalIndex].selected = true;
            }
        }
        OZO.saveWindowState(dialog, "sequential_numbering");
        app.redraw();
        alert((OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb\u179b\u17c1\u1781\u179a\u17c0\u1784\u17d4\n\n\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f " + previewItems.length +
                " \u179b\u17c1\u1781\u179b\u17be\u179f\u17d2\u179a\u1791\u17b6\u1794\u17cb " + finalLayerName + "\u17d4" :
            SCRIPT_NAME + " completed.\n\nGenerated " + previewItems.length +
                " number(s) on layer " + finalLayerName + ".") + "\n\n" + OZO.credit());
        previewLayer = null;
        previewItems = [];
        previewSignature = null;
    } catch (error) {
        cleanupPreview();
        alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1794\u1784\u17d2\u1780\u17be\u178f\u179b\u17c1\u1781\u179a\u17c0\u1784\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : SCRIPT_NAME + " failed.") +
            "\n\n" + errorMessage(error));
    }
})();
