#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Object Repeat";
    var STATE_NAMESPACE = "object_repeat_v7";
    var PREVIEW_LAYER_NAME = "__Object_Repeat_Preview__";
    var MM_TO_PT = 72 / 25.4;
    var UNIT_FACTORS = [MM_TO_PT, 72 / 2.54, 72, 1, 1]; // mm, cm, in, pt, px
    var MAX_REPEAT_COPIES = 10000;

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var originalLayer = doc.activeLayer;
    var originalArtboardIndex = doc.artboards.getActiveArtboardIndex();
    var originalSelection = [];
    var selectionValue = doc.selection;
    if (selectionValue && selectionValue.typename !== "TextRange") {
        if (selectionValue instanceof Array || selectionValue.typename === "Array" || Object.prototype.toString.call(selectionValue) === "[object Array]" || typeof selectionValue.length === "number") {
            for (var originalIndex = 0; originalIndex < selectionValue.length; originalIndex++) {
                originalSelection.push(selectionValue[originalIndex]);
            }
        } else {
            originalSelection.push(selectionValue);
        }
    }

    var previewLayer = null;
    var previewItems = [];
    var previewSignature = null;

    function trim(value) {
        return String(value || "").replace(/^\s+|\s+$/g, "");
    }

    function getSelectionIndex(control, defaultIndex) {
        if (!control) return typeof defaultIndex === "number" ? defaultIndex : 0;
        var sel = control.selection;
        if (sel === null || typeof sel === "undefined") {
            return typeof defaultIndex === "number" ? defaultIndex : 0;
        }
        if (typeof sel === "number") return Math.floor(sel);
        if (typeof sel.index === "number") return sel.index;
        return typeof defaultIndex === "number" ? defaultIndex : 0;
    }

    function getSelectionText(control, defaultText) {
        if (!control) return defaultText || "";
        var sel = control.selection;
        if (sel === null || typeof sel === "undefined") return defaultText || "";
        if (typeof sel.text !== "undefined") return String(sel.text);
        if (typeof sel === "string") return sel;
        if (typeof sel === "number" && control.items && control.items[sel]) {
            return String(control.items[sel].text || "");
        }
        return defaultText || "";
    }

    function numberValue(control, label, minimum, maximum) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(trim(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "")));
        if (!isFinite(value) || value < minimum || value > maximum) {
            throw new Error(OZO.tr(label) + " " + OZO.tr("must be between") + " " +
                minimum + " " + OZO.tr("and") + " " + maximum + ".");
        }
        return value;
    }

    function dimensionValue(control, label, minimum, maximum, unitIndex) {
        var factor = UNIT_FACTORS[unitIndex] || MM_TO_PT;
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var enteredValue = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(trim(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "")));
        var pointValue = enteredValue * factor;
        if (!isFinite(enteredValue) || !isFinite(pointValue) ||
                pointValue < minimum || pointValue > maximum) {
            throw new Error(OZO.tr(label) + " " + OZO.tr("must be between") + " " +
                formatDimension(minimum / factor) + " " + OZO.tr("and") + " " +
                formatDimension(maximum / factor) + ".");
        }
        return pointValue;
    }

    function formatDimension(value) {
        return String(Math.round(value * 10000) / 10000);
    }

    function copyRect(rect) {
        return [rect[0], rect[1], rect[2], rect[3]];
    }

    function restoreSelection() {
        try {
            doc.selection = null;
            for (var index = 0; index < originalSelection.length; index++) {
                try { originalSelection[index].selected = true; } catch (ignoreItem) {}
            }
        } catch (ignoreSelection) {}
    }

    function containsReference(items, target) {
        for (var index = 0; index < items.length; index++) {
            if (items[index] === target) return true;
        }
        return false;
    }

    function topLevelSelection() {
        var result = [];
        for (var index = 0; index < originalSelection.length; index++) {
            var item = originalSelection[index];
            var parent = item.parent;
            var nested = false;
            while (parent && parent !== doc && parent.typename !== "Layer") {
                if (containsReference(originalSelection, parent)) {
                    nested = true;
                    break;
                }
                parent = parent.parent;
            }
            if (!nested) result.push(item);
        }
        return result;
    }

    function activeLayerItems() {
        var result = [];
        var items = originalLayer.pageItems;
        for (var index = 0; index < items.length; index++) {
            if (items[index].parent === originalLayer && !items[index].hidden &&
                    !items[index].locked) {
                result.push(items[index]);
            }
        }
        return result;
    }

    function sourceItemsFor(index) {
        return index === 0 ? topLevelSelection() : activeLayerItems();
    }

    function uniqueLayerName(baseName) {
        var used = {};
        for (var index = 0; index < doc.layers.length; index++) {
            used[doc.layers[index].name] = true;
        }
        if (!used[baseName]) return baseName;
        var suffix = 2;
        while (used[baseName + " " + suffix]) suffix++;
        return baseName + " " + suffix;
    }

    function cleanupPreview(skipRedraw) {
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (ignoreRemoval) {}
            previewLayer = null;
        }
        previewItems = [];
        previewSignature = null;
        try { doc.artboards.setActiveArtboardIndex(originalArtboardIndex); } catch (eIdx) {}
        try { doc.activeLayer = originalLayer; } catch (eLay) {}
        restoreSelection();
        if (!skipRedraw) {
            try { app.redraw(); } catch (eRedraw) {}
        }
    }

    var activeRect = copyRect(doc.artboards[originalArtboardIndex].artboardRect);
    var activeWidthPoints = Math.abs(activeRect[2] - activeRect[0]);
    var activeHeightPoints = Math.abs(activeRect[1] - activeRect[3]);

    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 8;
    dialog.margins = 14;
    dialog.minimumSize = [570, 560];

    OZO.addDialogHeader(dialog, OZO.tr("Object Repeat"), "v2.2 • Step & Repeat, Grid & Radial Array Automation");

    // Top Source & Units Group
    var topPanel = dialog.add("panel", undefined, OZO.tr("Source Artwork"));
    topPanel.orientation = "column";
    topPanel.alignChildren = ["fill", "top"];
    topPanel.margins = [12, 14, 12, 8];

    var sourceRow = topPanel.add("group");
    sourceRow.add("statictext", undefined, OZO.tr("Repeat:"));
    var sourceList = sourceRow.add("dropdownlist", undefined, [
        OZO.tr("Selected objects"), OZO.tr("Top-level objects in active layer")
    ]);
    sourceList.selection = originalSelection.length ? 0 : 1;
    sourceList.preferredSize.width = 200;

    sourceRow.add("statictext", undefined, OZO.tr("Scale (%):"));
    var scaleInput = sourceRow.add("edittext", undefined, "100");
    scaleInput.characters = 6;

    sourceRow.add("statictext", undefined, OZO.tr("Dimension unit:"));
    var unitList = sourceRow.add("dropdownlist", undefined, [
        "mm", "cm", "in", "pt", "px"
    ]);
    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "in") defaultUnitIdx = 2;
    else if (defaultDocUnit === "pt") defaultUnitIdx = 3;
    else if (defaultDocUnit === "px") defaultUnitIdx = 4;
    unitList.selection = defaultUnitIdx;
    unitList.preferredSize.width = 65;

    var sourceSummary = topPanel.add("statictext", undefined, "");

    // Main Repeat Mode Panel
    var repeatPanel = dialog.add("panel", undefined, OZO.tr("Repeat Layout"));
    repeatPanel.orientation = "column";
    repeatPanel.alignChildren = ["fill", "top"];
    repeatPanel.margins = [12, 14, 12, 8];

    var modeRow = repeatPanel.add("group");
    modeRow.add("statictext", undefined, OZO.tr("Mode:"));
    var modeList = modeRow.add("dropdownlist", undefined, [
        OZO.tr("Grid (Fit Artboard)"),
        OZO.tr("Grid (Fixed Step & Repeat)"),
        OZO.tr("Radial (Circular Array)")
    ]);
    modeList.selection = 0;
    modeList.preferredSize.width = 240;

    // Subgroup: Grid Controls
    var gridGroup = repeatPanel.add("group");
    gridGroup.orientation = "column";
    gridGroup.alignChildren = ["fill", "top"];
    gridGroup.spacing = 6;

    var fixedCountsRow = gridGroup.add("group");
    fixedCountsRow.add("statictext", undefined, OZO.tr("Columns:"));
    var columnsInput = fixedCountsRow.add("edittext", undefined, "5");
    columnsInput.characters = 5;
    fixedCountsRow.add("statictext", undefined, OZO.tr("Rows:"));
    var rowsInput = fixedCountsRow.add("edittext", undefined, "4");
    rowsInput.characters = 5;
    var distributeCheck = fixedCountsRow.add("checkbox", undefined, OZO.tr("Distribute evenly across artboard"));
    distributeCheck.value = false;

    var spacingRow = gridGroup.add("group");
    spacingRow.add("statictext", undefined, OZO.tr("Horizontal space:"));
    var horizontalGapInput = spacingRow.add("edittext", undefined,
        formatDimension(5 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    horizontalGapInput.characters = 7;

    spacingRow.add("statictext", undefined, OZO.tr("Vertical space:"));
    var verticalGapInput = spacingRow.add("edittext", undefined,
        formatDimension(5 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    verticalGapInput.characters = 7;

    var patternRow = gridGroup.add("group");
    patternRow.add("statictext", undefined, OZO.tr("Pattern:"));
    var patternList = patternRow.add("dropdownlist", undefined, [
        OZO.tr("Grid"),
        OZO.tr("Brick rows"),
        OZO.tr("Brick columns"),
        OZO.tr("Honeycomb (Hexagonal)")
    ]);
    patternList.selection = 0;
    patternList.preferredSize.width = 170;

    var staggerLabel = patternRow.add("statictext", undefined, OZO.tr("Stagger (%):"));
    var staggerInput = patternRow.add("edittext", undefined, "50");
    staggerInput.characters = 5;

    var altRow = gridGroup.add("group");
    altRow.add("statictext", undefined, OZO.tr("Alternating:"));
    var altList = altRow.add("dropdownlist", undefined, [
        OZO.tr("None"),
        OZO.tr("Flip horizontal"),
        OZO.tr("Flip vertical"),
        OZO.tr("Rotate 180")
    ]);
    altList.selection = 0;
    altList.preferredSize.width = 170;

    var gridOptionsRow = gridGroup.add("group");
    var centerCheck = gridOptionsRow.add("checkbox", undefined, OZO.tr("Center complete pattern"));
    centerCheck.value = true;
    var autoFitCheck = gridOptionsRow.add("checkbox", undefined,
        OZO.tr("Auto-fit oversized artwork to the available area"));
    autoFitCheck.value = true;

    // Subgroup: Radial Controls
    var radialGroup = repeatPanel.add("group");
    radialGroup.orientation = "column";
    radialGroup.alignChildren = ["fill", "top"];
    radialGroup.spacing = 6;
    radialGroup.visible = false;

    var radialRow1 = radialGroup.add("group");
    radialRow1.add("statictext", undefined, OZO.tr("Copies:"));
    var radialCopiesInput = radialRow1.add("edittext", undefined, "12");
    radialCopiesInput.characters = 6;
    radialRow1.add("statictext", undefined, OZO.tr("Radius:"));
    var radialRadiusInput = radialRow1.add("edittext", undefined,
        formatDimension(50 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    radialRadiusInput.characters = 8;

    var radialRow2 = radialGroup.add("group");
    radialRow2.add("statictext", undefined, OZO.tr("Total Angle (°):"));
    var radialTotalAngleInput = radialRow2.add("edittext", undefined, "360");
    radialTotalAngleInput.characters = 6;
    radialRow2.add("statictext", undefined, OZO.tr("Start Angle (°):"));
    var radialStartAngleInput = radialRow2.add("edittext", undefined, "0");
    radialStartAngleInput.characters = 6;

    var radialRow3 = radialGroup.add("group");
    var radialRotateCheck = radialRow3.add("checkbox", undefined, OZO.tr("Rotate items along circle"));
    radialRotateCheck.value = true;
    radialRow3.add("statictext", undefined, OZO.tr("Circle Center:"));
    var radialCenterList = radialRow3.add("dropdownlist", undefined, [
        OZO.tr("Center of active artboard"),
        OZO.tr("Center of source artwork")
    ]);
    radialCenterList.selection = 0;

    // Target Artboard Panel (for Grid mode)
    var artboardPanel = dialog.add("panel", undefined, OZO.tr("Target Artboard"));
    artboardPanel.orientation = "column";
    artboardPanel.alignChildren = ["fill", "top"];
    artboardPanel.margins = [12, 14, 12, 8];

    var artboardModeRow = artboardPanel.add("group");
    artboardModeRow.add("statictext", undefined, OZO.tr("Mode:"));
    var artboardModeList = artboardModeRow.add("dropdownlist", undefined, [
        OZO.tr("Use active artboard"),
        OZO.tr("Create a new artboard"),
        OZO.tr("Resize active artboard")
    ]);
    artboardModeList.selection = 0;
    artboardModeList.preferredSize.width = 240;

    var sizeRow = artboardPanel.add("group");
    sizeRow.add("statictext", undefined, OZO.tr("Width:"));
    var widthInput = sizeRow.add("edittext", undefined,
        formatDimension(activeWidthPoints / UNIT_FACTORS[defaultUnitIdx]));
    widthInput.characters = 8;
    sizeRow.add("statictext", undefined, OZO.tr("Height:"));
    var heightInput = sizeRow.add("edittext", undefined,
        formatDimension(activeHeightPoints / UNIT_FACTORS[defaultUnitIdx]));
    heightInput.characters = 8;
    var swapButton = sizeRow.add("button", undefined, OZO.tr("Swap"));
    swapButton.preferredSize.width = 60;

    var placementRow = artboardPanel.add("group");
    placementRow.add("statictext", undefined, OZO.tr("New artboard position:"));
    var placementList = placementRow.add("dropdownlist", undefined, [
        OZO.tr("Right of active"), OZO.tr("Below active")
    ]);
    placementList.selection = 0;
    placementList.preferredSize.width = 140;
    placementRow.add("statictext", undefined, OZO.tr("Gap:"));
    var artboardGapInput = placementRow.add("edittext", undefined,
        formatDimension(20 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    artboardGapInput.characters = 6;

    // Output & Safety
    var outputPanel = dialog.add("panel", undefined, OZO.tr("Output and Safety"));
    outputPanel.orientation = "row";
    outputPanel.alignChildren = ["left", "center"];
    outputPanel.margins = [12, 10, 12, 8];

    outputPanel.add("statictext", undefined, OZO.tr("Layer name:"));
    var layerNameInput = outputPanel.add("edittext", undefined, "Object Repeat");
    layerNameInput.characters = 16;
    var selectResultCheck = outputPanel.add("checkbox", undefined, OZO.tr("Select repeated artwork"));
    selectResultCheck.value = true;
    var clipCheck = outputPanel.add("checkbox", undefined, OZO.tr("Clip output to artboard bounds"));
    clipCheck.value = false;

    // Status / Summary Label
    var statusText = dialog.add("statictext", undefined, OZO.tr("Ready."));
    statusText.preferredSize.width = 540;

    // Action Buttons
    var buttons = dialog.add("group");
    buttons.alignment = ["fill", "top"];
    buttons.alignChildren = ["fill", "center"];

    var previewButton = buttons.add("button", undefined, OZO.tr("Update Preview"));
    previewButton.preferredSize.width = 140;

    var btnSpacer = buttons.add("group");
    btnSpacer.alignment = ["fill", "fill"];

    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var repeatButton = buttons.add("button", undefined, OZO.tr("Create Repeat"), {name: "ok"});
    dialog.defaultElement = repeatButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog, function () {
        updateSourceSummary();
        updateDimensionUnit();
        updateModeControls();
        statusText.text = OZO.tr("Ready.");
    });

    function updateSourceSummary() {
        var srcIdx = getSelectionIndex(sourceList, 0);
        var items = sourceItemsFor(srcIdx);
        sourceSummary.text = items.length + " " +
            OZO.tr("source object(s). Active layer:") + " " + originalLayer.name;
        repeatButton.enabled = items.length > 0;
        previewButton.enabled = items.length > 0;
    }

    function updateModeControls() {
        var mode = getSelectionIndex(modeList, 0);
        var isGrid = (mode === 0 || mode === 1);
        var isFixed = (mode === 1);
        var isRadial = (mode === 2);

        gridGroup.visible = isGrid;
        fixedCountsRow.visible = isFixed;
        distributeCheck.enabled = isFixed;
        artboardPanel.visible = isGrid;
        radialGroup.visible = isRadial;

        var patternIdx = getSelectionIndex(patternList, 0);
        var hasStagger = (patternIdx === 1 || patternIdx === 2 || patternIdx === 3);
        staggerLabel.visible = hasStagger;
        staggerInput.visible = hasStagger;

        var abMode = getSelectionIndex(artboardModeList, 0);
        var editable = (abMode !== 0); // editable if New (1) or Resize (2)
        var creating = (abMode === 1); // creating new artboard
        widthInput.enabled = editable;
        heightInput.enabled = editable;
        swapButton.enabled = editable;
        placementList.enabled = creating;
        artboardGapInput.enabled = creating;

        dialog.layout.layout(true);
    }

    var dimensionControls = [widthInput, heightInput, artboardGapInput,
        horizontalGapInput, verticalGapInput, radialRadiusInput];
    var currentUnitIndex = defaultUnitIdx;
    var restoringState = true;

    function updateDimensionUnit() {
        var newUnitIndex = getSelectionIndex(unitList, defaultUnitIdx);
        if (!restoringState && newUnitIndex !== currentUnitIndex) {
            var conversion = UNIT_FACTORS[currentUnitIndex] / UNIT_FACTORS[newUnitIndex];
            for (var index = 0; index < dimensionControls.length; index++) {
                var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
                    OZO.parseNumber(dimensionControls[index].text, NaN) :
                    Number(trim(String(dimensionControls[index].text || "").replace(/,/g, ".").replace(/[a-zA-Z%"']+\s*$/, "")));
                if (isFinite(value)) {
                    dimensionControls[index].text = formatDimension(value * conversion);
                }
            }
        }
        currentUnitIndex = newUnitIndex;
    }

    function sanitizeRestoredDimensions() {
        var factor = UNIT_FACTORS[currentUnitIndex] || MM_TO_PT;
        var width = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(widthInput.text, NaN) : parseFloat(trim(widthInput.text));
        var height = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(heightInput.text, NaN) : parseFloat(trim(heightInput.text));
        if (!isFinite(width) || width <= 0) {
            widthInput.text = formatDimension(activeWidthPoints / factor);
        }
        if (!isFinite(height) || height <= 0) {
            heightInput.text = formatDimension(activeHeightPoints / factor);
        }
    }

    sourceList.onChange = updateSourceSummary;
    modeList.onChange = updateModeControls;
    patternList.onChange = updateModeControls;
    artboardModeList.onChange = updateModeControls;
    unitList.onChange = updateDimensionUnit;
    swapButton.onClick = function () {
        var oldWidth = widthInput.text;
        widthInput.text = heightInput.text;
        heightInput.text = oldWidth;
    };

    OZO.makeNumericSmooth(scaleInput, {step: 5, min: 1, max: 10000});
    OZO.makeNumericSmooth(columnsInput, {step: 1, min: 1, max: 1000});
    OZO.makeNumericSmooth(rowsInput, {step: 1, min: 1, max: 1000});
    OZO.makeNumericSmooth(horizontalGapInput, {step: 1, min: 0, max: 10000});
    OZO.makeNumericSmooth(verticalGapInput, {step: 1, min: 0, max: 10000});
    OZO.makeNumericSmooth(staggerInput, {step: 5, min: 0, max: 100});
    OZO.makeNumericSmooth(radialCopiesInput, {step: 1, min: 2, max: 1000});
    OZO.makeNumericSmooth(radialRadiusInput, {step: 5, min: 0, max: 100000});
    OZO.makeNumericSmooth(radialTotalAngleInput, {step: 15, min: 1, max: 360});
    OZO.makeNumericSmooth(radialStartAngleInput, {step: 15, min: -360, max: 360});

    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    currentUnitIndex = getSelectionIndex(unitList, defaultUnitIdx);
    sanitizeRestoredDimensions();
    restoringState = false;
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    updateSourceSummary();
    updateModeControls();
    updateDimensionUnit();

    function readSettings() {
        var unitIndex = getSelectionIndex(unitList, defaultUnitIdx);
        var mode = getSelectionIndex(modeList, 0);
        var abMode = getSelectionIndex(artboardModeList, 0);
        var pattern = getSelectionIndex(patternList, 0);

        return {
            mode: mode, // 0 = Grid Fit, 1 = Grid Fixed, 2 = Radial
            sourceIndex: getSelectionIndex(sourceList, 0),
            scale: numberValue(scaleInput, "Scale", 0.1, 10000),
            unitIndex: unitIndex,
            // Grid settings
            fixedCols: mode === 1 ? Math.floor(numberValue(columnsInput, "Columns", 1, 1000)) : 1,
            fixedRows: mode === 1 ? Math.floor(numberValue(rowsInput, "Rows", 1, 1000)) : 1,
            distributeEvenly: distributeCheck.value,
            horizontalGap: dimensionValue(horizontalGapInput, "Horizontal spacing", 0, 100000, unitIndex),
            verticalGap: dimensionValue(verticalGapInput, "Vertical spacing", 0, 100000, unitIndex),
            pattern: pattern,
            stagger: (pattern === 0) ? 0 : (pattern === 3 ? 0.5 : numberValue(staggerInput, "Stagger", 0, 100) / 100),
            alternating: getSelectionIndex(altList, 0), // 0: None, 1: Flip X, 2: Flip Y, 3: Rotate 180
            center: centerCheck.value,
            autoFit: autoFitCheck.value,
            // Radial settings
            radialCopies: Math.floor(numberValue(radialCopiesInput, "Copies", 2, 5000)),
            radialRadius: dimensionValue(radialRadiusInput, "Radius", 0, 100000, unitIndex),
            radialTotalAngle: numberValue(radialTotalAngleInput, "Total Angle", 1, 360),
            radialStartAngle: numberValue(radialStartAngleInput, "Start Angle", -360, 360),
            radialRotate: radialRotateCheck.value,
            radialCenter: getSelectionIndex(radialCenterList, 0),
            // Artboard & Output settings
            artboardMode: abMode, // 0: Use active, 1: New, 2: Resize
            placementIndex: getSelectionIndex(placementList, 0),
            artboardGap: abMode === 1 ? dimensionValue(artboardGapInput, "Artboard gap", 0, 100000, unitIndex) : 0,
            artboardWidth: abMode === 0 ? Math.abs(activeRect[2] - activeRect[0]) :
                dimensionValue(widthInput, "Artboard width", 1, 100000, unitIndex),
            artboardHeight: abMode === 0 ? Math.abs(activeRect[1] - activeRect[3]) :
                dimensionValue(heightInput, "Artboard height", 1, 100000, unitIndex),
            layerName: trim(layerNameInput.text) || "Object Repeat",
            selectResult: selectResultCheck.value,
            clip: clipCheck.value
        };
    }

    function settingsSignature(s) {
        return [
            s.mode, s.sourceIndex, s.scale, s.unitIndex,
            s.fixedCols, s.fixedRows, s.distributeEvenly,
            s.horizontalGap, s.verticalGap, s.pattern, s.stagger, s.alternating,
            s.center, s.autoFit,
            s.radialCopies, s.radialRadius, s.radialTotalAngle, s.radialStartAngle, s.radialRotate, s.radialCenter,
            s.artboardMode, s.artboardWidth, s.artboardHeight
        ].join("|");
    }

    function generateRepeat(settings, isPreview) {
        var sourceItems = sourceItemsFor(settings.sourceIndex);
        if (!sourceItems.length) {
            throw new Error(OZO.tr("No usable source artwork was found."));
        }

        var targetRect;
        var createdArtboard = null;
        var resizedArtboard = null;
        var resizedOriginalRect = null;

        if (!isPreview && settings.mode !== 2) {
            if (settings.artboardMode === 1) { // New artboard
                if (settings.placementIndex === 1) {
                    targetRect = [activeRect[0], activeRect[3] - settings.artboardGap,
                        activeRect[0] + settings.artboardWidth,
                        activeRect[3] - settings.artboardGap - settings.artboardHeight];
                } else {
                    targetRect = [activeRect[2] + settings.artboardGap, activeRect[1],
                        activeRect[2] + settings.artboardGap + settings.artboardWidth,
                        activeRect[1] - settings.artboardHeight];
                }
                createdArtboard = doc.artboards.add(targetRect);
                doc.artboards.setActiveArtboardIndex(doc.artboards.length - 1);
            } else if (settings.artboardMode === 2) { // Resize active
                resizedArtboard = doc.artboards[originalArtboardIndex];
                resizedOriginalRect = copyRect(resizedArtboard.artboardRect);
                targetRect = [activeRect[0], activeRect[1],
                    activeRect[0] + settings.artboardWidth,
                    activeRect[1] - settings.artboardHeight];
                resizedArtboard.artboardRect = targetRect;
                doc.artboards.setActiveArtboardIndex(originalArtboardIndex);
            } else {
                targetRect = copyRect(activeRect);
            }
        } else {
            targetRect = copyRect(activeRect);
        }

        var availableWidth = Math.abs(targetRect[2] - targetRect[0]);
        var availableHeight = Math.abs(targetRect[1] - targetRect[3]);
        if (!(availableWidth > 0) || !(availableHeight > 0)) {
            throw new Error(OZO.tr("The target artboard has invalid dimensions."));
        }

        var targetLayer = null;
        try {
            if (isPreview) {
                if (!previewLayer) {
                    previewLayer = doc.layers.add();
                    previewLayer.name = PREVIEW_LAYER_NAME;
                } else {
                    for (var p = previewLayer.pageItems.length - 1; p >= 0; p--) {
                        try { previewLayer.pageItems[p].remove(); } catch (eP) {}
                    }
                }
                targetLayer = previewLayer;
                targetLayer.locked = false;
                targetLayer.visible = true;
            } else {
                targetLayer = doc.layers.add();
                targetLayer.name = uniqueLayerName(settings.layerName);
            }
            doc.activeLayer = targetLayer;

            var outputGroup = targetLayer.groupItems.add();
            outputGroup.name = settings.layerName + (settings.mode === 2 ? " Radial" : " Pattern");

            var template = outputGroup.groupItems.add();
            template.name = "Repeat Source";
            for (var sIdx = 0; sIdx < sourceItems.length; sIdx++) {
                sourceItems[sIdx].duplicate(template, ElementPlacement.PLACEATEND);
            }
            if (!template.pageItems.length) {
                throw new Error(OZO.tr("The source artwork could not be duplicated."));
            }

            if (settings.scale !== 100) {
                template.resize(settings.scale, settings.scale, true, true, true, true,
                    settings.scale, Transformation.CENTER);
            }

            var templateBounds = template.visibleBounds;
            var artworkWidth = templateBounds[2] - templateBounds[0];
            var artworkHeight = templateBounds[1] - templateBounds[3];
            if (!(artworkWidth > 0) || !(artworkHeight > 0)) {
                throw new Error(OZO.tr("The source artwork has invalid dimensions."));
            }

            var placedCount = 0;

            if (settings.mode === 2) {
                // ----------------------------------------------------
                // RADIAL REPEAT MODE
                // ----------------------------------------------------
                var sourceCenterX = (templateBounds[0] + templateBounds[2]) / 2;
                var sourceCenterY = (templateBounds[1] + templateBounds[3]) / 2;
                var originX = (settings.radialCenter === 0) ?
                    (targetRect[0] + targetRect[2]) / 2 : sourceCenterX;
                var originY = (settings.radialCenter === 0) ?
                    (targetRect[1] + targetRect[3]) / 2 : sourceCenterY;

                var copies = settings.radialCopies;
                var radius = settings.radialRadius;
                var totalAngle = settings.radialTotalAngle;
                var startAngle = settings.radialStartAngle;

                for (var rIdx = 0; rIdx < copies; rIdx++) {
                    var angleDeg = startAngle + (Math.abs(totalAngle - 360) < 0.001 ?
                        (rIdx * 360 / copies) :
                        (copies > 1 ? rIdx * totalAngle / (copies - 1) : 0));
                    var angleRad = angleDeg * Math.PI / 180;
                    var targetCenterX = originX + radius * Math.cos(angleRad);
                    var targetCenterY = originY + radius * Math.sin(angleRad);

                    var radItem = template.duplicate(outputGroup, ElementPlacement.PLACEATEND);
                    radItem.translate(targetCenterX - sourceCenterX, targetCenterY - sourceCenterY);

                    if (settings.radialRotate) {
                        radItem.rotate(angleDeg - 90, true, true, true, true, Transformation.CENTER);
                    }
                    radItem.name = "Radial " + (rIdx + 1);
                    placedCount++;
                }
            } else {
                // ----------------------------------------------------
                // GRID REPEAT MODE (Fit Artboard or Fixed Count)
                // ----------------------------------------------------
                if (artworkWidth > availableWidth || artworkHeight > availableHeight) {
                    if (!settings.autoFit) {
                        throw new Error(OZO.tr("The scaled artwork does not fit inside the artboard bounds."));
                    }
                    var oversizedFit = Math.min(availableWidth / artworkWidth,
                        availableHeight / artworkHeight) * 0.999;
                    template.resize(oversizedFit * 100, oversizedFit * 100,
                        true, true, true, true, oversizedFit * 100, Transformation.CENTER);
                    templateBounds = template.visibleBounds;
                    artworkWidth = templateBounds[2] - templateBounds[0];
                    artworkHeight = templateBounds[1] - templateBounds[3];
                    if (!(artworkWidth > 0) || !(artworkHeight > 0)) {
                        throw new Error(OZO.tr("The scaled artwork has invalid dimensions."));
                    }
                }

                var stepX = Math.max(0.001, artworkWidth + settings.horizontalGap);
                var stepY = Math.max(0.001, artworkHeight + settings.verticalGap);
                if (settings.pattern === 3) { // Honeycomb (Hexagonal)
                    stepY = Math.max(0.001, (artworkHeight + settings.verticalGap) * 0.8660254);
                }

                var staggerX = stepX * settings.stagger;
                var staggerY = stepY * settings.stagger;
                var columns, rows;

                if (settings.mode === 1) { // Fixed Count
                    columns = settings.fixedCols;
                    rows = settings.fixedRows;
                    if (settings.distributeEvenly) {
                        if (columns > 1) {
                            stepX = (availableWidth - artworkWidth) / (columns - 1);
                        }
                        if (rows > 1) {
                            stepY = (availableHeight - artworkHeight) / (rows - 1);
                        }
                    }
                } else { // Auto-fit Artboard
                    var baseColumns = Math.floor((availableWidth + settings.horizontalGap) / stepX);
                    var baseRows = Math.floor((availableHeight + settings.verticalGap) / stepY);
                    columns = baseColumns;
                    rows = baseRows;

                    if ((settings.pattern === 1 || settings.pattern === 3) && rows > 1) {
                        columns = Math.floor((availableWidth - staggerX + settings.horizontalGap) / stepX);
                        if (columns < 1) { columns = baseColumns; rows = 1; }
                    }
                    if (settings.pattern === 2 && columns > 1) {
                        rows = Math.floor((availableHeight - staggerY + settings.verticalGap) / stepY);
                        if (rows < 1) { rows = baseRows; columns = 1; }
                    }
                }

                if (columns < 1 || rows < 1) {
                    throw new Error(OZO.tr("The scaled artwork does not fit inside the artboard bounds."));
                }

                var totalAttempts = columns * rows;
                if (totalAttempts > MAX_REPEAT_COPIES) {
                    throw new Error(OZO.tr("The layout would create") + " " + totalAttempts + " " +
                        OZO.tr("copies, which exceeds the limit of") + " " + MAX_REPEAT_COPIES + ".");
                }

                var patternWidth = artworkWidth + (columns - 1) * stepX;
                var patternHeight = artworkHeight + (rows - 1) * stepY;
                if ((settings.pattern === 1 || settings.pattern === 3) && rows > 1) patternWidth += staggerX;
                if (settings.pattern === 2 && columns > 1) patternHeight += staggerY;

                var originLeft = (settings.center && !settings.distributeEvenly) ?
                    targetRect[0] + (availableWidth - patternWidth) / 2 : targetRect[0];
                var originTop = (settings.center && !settings.distributeEvenly) ?
                    targetRect[1] - (availableHeight - patternHeight) / 2 : targetRect[1];

                var safeLeft = targetRect[0];
                var safeRight = targetRect[2];
                var safeTop = targetRect[1];
                var safeBottom = targetRect[3];
                var tolerance = 0.5;
                var templateLeft = templateBounds[0];
                var templateTop = templateBounds[1];

                for (var row = 0; row < rows; row++) {
                    var rowOffsetX = ((settings.pattern === 1 || settings.pattern === 3) && row % 2 === 1) ? staggerX : 0;
                    var rowLeft = originLeft + rowOffsetX;
                    var rowTop = originTop - row * stepY;

                    for (var column = 0; column < columns; column++) {
                        var offsetY = (settings.pattern === 2 && column % 2 === 1) ? staggerY : 0;
                        var left = rowLeft + column * stepX;
                        var top = rowTop - offsetY;

                        var outsideArtboard = false;
                        if (!settings.distributeEvenly && settings.mode === 0) {
                            outsideArtboard = left < safeLeft - tolerance ||
                                left + artworkWidth > safeRight + tolerance ||
                                top > safeTop + tolerance ||
                                top - artworkHeight < safeBottom - tolerance;
                        }

                        if (!outsideArtboard) {
                            var repeatedItem = template.duplicate(outputGroup, ElementPlacement.PLACEATEND);
                            repeatedItem.translate(left - templateLeft, top - templateTop);

                            // Alternation
                            if (settings.alternating === 1 && column % 2 === 1) { // Flip X
                                repeatedItem.resize(-100, 100, true, true, true, true, 100, Transformation.CENTER);
                            } else if (settings.alternating === 2 && row % 2 === 1) { // Flip Y
                                repeatedItem.resize(100, -100, true, true, true, true, 100, Transformation.CENTER);
                            } else if (settings.alternating === 3 && (row + column) % 2 === 1) { // Rotate 180
                                repeatedItem.rotate(180, true, true, true, true, Transformation.CENTER);
                            }

                            repeatedItem.name = "Repeat " + (placedCount + 1);
                            placedCount++;
                        }
                    }
                }

                if (settings.clip && !isPreview) {
                    var clipWidth = Math.abs(targetRect[2] - targetRect[0]);
                    var clipHeight = Math.abs(targetRect[1] - targetRect[3]);
                    var clippingPath = outputGroup.pathItems.rectangle(
                        targetRect[1], targetRect[0], clipWidth, clipHeight);
                    clippingPath.stroked = false;
                    clippingPath.filled = false;
                    clippingPath.clipping = true;
                    clippingPath.move(outputGroup, ElementPlacement.PLACEATBEGINNING);
                    outputGroup.clipped = true;
                }
            }

            try { template.remove(); } catch (eRem) {}

            if (!placedCount) {
                throw new Error(OZO.tr("No copies fit within the selected layout."));
            }

            return {
                count: placedCount,
                layer: targetLayer,
                group: outputGroup,
                createdArtboard: createdArtboard,
                resizedArtboard: resizedArtboard,
                resizedOriginalRect: resizedOriginalRect
            };
        } catch (eRepeat) {
            if (createdArtboard) {
                try { createdArtboard.remove(); } catch (eRemAb) {}
            }
            if (resizedArtboard && resizedOriginalRect) {
                try { resizedArtboard.artboardRect = resizedOriginalRect; } catch (eResAb) {}
            }
            if (targetLayer && !isPreview) {
                try { targetLayer.remove(); } catch (eRemLay) {}
            }
            throw eRepeat;
        }
    }

    previewButton.onClick = function () {
        previewButton.enabled = false;
        statusText.text = OZO.tr("Generating preview...");
        dialog.update();
        try {
            var settings = readSettings();
            var res = generateRepeat(settings, true);
            previewSignature = settingsSignature(settings);
            statusText.text = OZO.tr("Preview ready") + ": " + res.count + " " +
                OZO.tr("repeated object(s).");
            app.redraw();
        } catch (err) {
            cleanupPreview();
            statusText.text = OZO.tr("failed.");
            alert(OZO.tr(SCRIPT_NAME) + " preview failed.\n\n" +
                (err && err.message ? err.message : String(err)));
        }
        previewButton.enabled = true;
    };

    function executeRepeatCore(finalSettings) {
        cleanupPreview(true);
        var finalResult = generateRepeat(finalSettings, false);
        doc.selection = null;
        if (finalSettings.selectResult) {
            try { finalResult.group.selected = true; } catch (eSel) {}
        }
        app.redraw();
        return {
            status: "success",
            count: finalResult.count,
            layer: finalResult.layer.name
        };
    }

    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        try {
            var hp = __ozoHeadlessParams;
            var uIdx = typeof hp.unitIndex === "number" ? hp.unitIndex : 0;
            var factor = UNIT_FACTORS[uIdx] || MM_TO_PT;

            if (originalSelection.length === 0) {
                doc.selectObjectsOnActiveArtboard();
                var freshSel = doc.selection;
                if (freshSel && freshSel.typename !== "TextRange") {
                    if (freshSel instanceof Array || freshSel.typename === "Array" || Object.prototype.toString.call(freshSel) === "[object Array]" || typeof freshSel.length === "number") {
                        for (var fi = 0; fi < freshSel.length; fi++) originalSelection.push(freshSel[fi]);
                    } else {
                        originalSelection.push(freshSel);
                    }
                }
            }
            if (originalSelection.length === 0) {
                __ozoHeadlessResult = { status: "error", message: "Please select artwork in Illustrator to repeat." };
                return;
            }

            var abIdx = doc.artboards.getActiveArtboardIndex();
            var actAbRect = doc.artboards[abIdx].artboardRect;

            var headlessSettings = {
                mode: typeof hp.mode === "number" ? hp.mode : 0,
                sourceIndex: typeof hp.sourceIndex === "number" ? hp.sourceIndex : 0,
                scale: typeof hp.scale === "number" ? hp.scale : 100,
                unitIndex: uIdx,
                fixedCols: parseInt(hp.columns, 10) || 5,
                fixedRows: parseInt(hp.rows, 10) || 5,
                distributeEvenly: hp.distributeEvenly !== false,
                horizontalGap: (parseFloat(hp.horizontalGap) || 5) * factor,
                verticalGap: (parseFloat(hp.verticalGap) || 5) * factor,
                pattern: typeof hp.pattern === "number" ? hp.pattern : 0,
                stagger: typeof hp.stagger === "number" ? hp.stagger : 0,
                alternating: typeof hp.alternating === "number" ? hp.alternating : 0,
                center: hp.center !== false,
                autoFit: hp.autoFit !== false,

                radialCopies: parseInt(hp.radialCopies, 10) || 12,
                radialRadius: (parseFloat(hp.radialRadius) || 50) * factor,
                radialTotalAngle: parseFloat(hp.radialTotalAngle) || 360,
                radialStartAngle: parseFloat(hp.radialStartAngle) || 0,
                radialRotate: hp.radialRotate !== false,
                radialCenter: typeof hp.radialCenter === "number" ? hp.radialCenter : 0,

                artboardMode: 0,
                placementIndex: 0,
                artboardGap: 0,
                artboardWidth: Math.abs(actAbRect[2] - actAbRect[0]),
                artboardHeight: Math.abs(actAbRect[1] - actAbRect[3]),
                layerName: hp.layerName || "Object Repeat",
                selectResult: hp.selectResult !== false,
                clip: hp.clip === true
            };

            __ozoHeadlessResult = executeRepeatCore(headlessSettings);
            return;
        } catch (eRepHeadless) {
            cleanupPreview();
            __ozoHeadlessResult = {
                status: "error",
                message: eRepHeadless && eRepHeadless.message ? eRepHeadless.message : String(eRepHeadless)
            };
            return;
        }
    }

    dialog.center();
    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview();
        return;
    }

    try {
        var finalSettings = readSettings();
        var repRes = executeRepeatCore(finalSettings);
        OZO.saveWindowState(dialog, STATE_NAMESPACE);
        alert(OZO.tr(SCRIPT_NAME) + "\n\n" + OZO.tr("Created") + " " + repRes.count + " " +
            OZO.tr("repeated object(s) on layer") + " \"" + repRes.layer + "\".\n\n" +
            OZO.credit());
    } catch (error) {
        cleanupPreview();
        restoreSelection();
        alert(OZO.tr(SCRIPT_NAME) + " " + OZO.tr("failed.") + "\n\n" +
            (error && error.message ? error.message : String(error)));
    }
})();
