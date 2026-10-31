#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Object Repeat";
    var STATE_NAMESPACE = "object_repeat_v6";
    var MM_TO_PT = 72 / 25.4;
    var UNIT_FACTORS = [MM_TO_PT, 72 / 2.54, 72, 1, 1];
    var MAX_REPEAT_COPIES = 10000;

    if (app.documents.length === 0) {
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var originalLayer = doc.activeLayer;
    var originalArtboardIndex = doc.artboards.getActiveArtboardIndex();
    var originalSelection = [];
    var selectionValue = doc.selection;
    if (selectionValue && selectionValue.typename !== "TextRange") {
        for (var originalIndex = 0; originalIndex < selectionValue.length; originalIndex++) {
            originalSelection.push(selectionValue[originalIndex]);
        }
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
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
        var factor = UNIT_FACTORS[unitIndex];
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

    var activeRect = copyRect(doc.artboards[originalArtboardIndex].artboardRect);
    var activeWidthPoints = Math.abs(activeRect[2] - activeRect[0]);
    var activeHeightPoints = Math.abs(activeRect[1] - activeRect[3]);

    var dialog = new Window("dialog", SCRIPT_NAME);
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 16;
    dialog.minimumSize = [560, 500];

    OZO.addDialogHeader(dialog, OZO.tr("Object Repeat"), "v2.0 • Step & Repeat Grid / Pattern Automation");

    var unitRow = dialog.add("group");
    unitRow.add("statictext", undefined, OZO.tr("Dimension unit:"));
    var unitList = unitRow.add("dropdownlist", undefined,
        ["Millimeters (mm)", "Centimeters (cm)", "Inches (in)",
            "Points (pt)", "Pixels (px)"]);
    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "in") defaultUnitIdx = 2;
    else if (defaultDocUnit === "pt") defaultUnitIdx = 3;
    else if (defaultDocUnit === "px") defaultUnitIdx = 4;
    unitList.selection = defaultUnitIdx;
    unitList.preferredSize.width = 165;
    var unitHint = unitRow.add("statictext", undefined,
        "Illustrator treats 1 px as 1 pt in scripts.");
    var sourcePanel = dialog.add("panel", undefined, "Source Artwork");
    sourcePanel.orientation = "column";
    sourcePanel.alignChildren = ["fill", "top"];
    sourcePanel.margins = [12, 18, 12, 10];
    var sourceRow = sourcePanel.add("group");
    sourceRow.add("statictext", undefined, "Repeat:");
    var sourceList = sourceRow.add("dropdownlist", undefined,
        ["Selected objects", "Top-level objects in active layer"]);
    sourceList.selection = originalSelection.length ? 0 : 1;
    sourceList.preferredSize.width = 245;
    sourceRow.add("statictext", undefined, "Scale (%):");
    var scaleInput = sourceRow.add("edittext", undefined, "100");
    scaleInput.characters = 7;
    var sourceSummary = sourcePanel.add("statictext", undefined, "");

    var artboardPanel = dialog.add("panel", undefined, "Target Artboard");
    artboardPanel.orientation = "column";
    artboardPanel.alignChildren = ["fill", "top"];
    artboardPanel.margins = [12, 18, 12, 10];
    var artboardModeRow = artboardPanel.add("group");
    artboardModeRow.add("statictext", undefined, "Mode:");
    var artboardModeList = artboardModeRow.add("dropdownlist", undefined,
        ["Create a new artboard", "Use active artboard", "Resize active artboard"]);
    artboardModeList.selection = 0;
    artboardModeList.preferredSize.width = 245;
    var sizeRow = artboardPanel.add("group");
    sizeRow.add("statictext", undefined, "Width:");
    var widthInput = sizeRow.add("edittext", undefined,
        formatDimension(activeWidthPoints / UNIT_FACTORS[defaultUnitIdx]));
    widthInput.characters = 9;
    sizeRow.add("statictext", undefined, "Height:");
    var heightInput = sizeRow.add("edittext", undefined,
        formatDimension(activeHeightPoints / UNIT_FACTORS[defaultUnitIdx]));
    heightInput.characters = 9;
    var swapButton = sizeRow.add("button", undefined, "Swap");
    var placementRow = artboardPanel.add("group");
    placementRow.add("statictext", undefined, "New artboard position:");
    var placementList = placementRow.add("dropdownlist", undefined,
        ["Right of active", "Below active"]);
    placementList.selection = 0;
    placementList.preferredSize.width = 140;
    placementRow.add("statictext", undefined, "Gap:");
    var artboardGapInput = placementRow.add("edittext", undefined,
        formatDimension(20 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    artboardGapInput.characters = 7;

    var layoutPanel = dialog.add("panel", undefined, "Repeat Layout");
    layoutPanel.orientation = "column";
    layoutPanel.alignChildren = ["fill", "top"];
    layoutPanel.margins = [12, 18, 12, 10];
    var spacingRow = layoutPanel.add("group");
    spacingRow.add("statictext", undefined, "Horizontal space:");
    var horizontalGapInput = spacingRow.add("edittext", undefined,
        formatDimension(5 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    horizontalGapInput.characters = 7;
    spacingRow.add("statictext", undefined, "Vertical space:");
    var verticalGapInput = spacingRow.add("edittext", undefined,
        formatDimension(5 * MM_TO_PT / UNIT_FACTORS[defaultUnitIdx]));
    verticalGapInput.characters = 7;
    var patternRow = layoutPanel.add("group");
    patternRow.add("statictext", undefined, "Pattern:");
    var patternList = patternRow.add("dropdownlist", undefined,
        ["Grid", "Brick rows", "Brick columns"]);
    patternList.selection = 0;
    patternList.preferredSize.width = 130;
    patternRow.add("statictext", undefined, "Stagger (%):");
    var staggerInput = patternRow.add("edittext", undefined, "50");
    staggerInput.characters = 6;
    var optionsRow = layoutPanel.add("group");
    var centerCheck = optionsRow.add("checkbox", undefined, "Center complete pattern");
    centerCheck.value = true;
    var autoFitCheck = layoutPanel.add("checkbox", undefined,
        "Auto-fit oversized artwork to the available area");
    autoFitCheck.value = true;

    var outputPanel = dialog.add("panel", undefined, "Output and Safety");
    outputPanel.orientation = "column";
    outputPanel.alignChildren = ["fill", "top"];
    outputPanel.margins = [12, 18, 12, 10];
    var outputRow = outputPanel.add("group");
    outputRow.add("statictext", undefined, "Layer name:");
    var layerNameInput = outputRow.add("edittext", undefined, "Object Repeat");
    layerNameInput.characters = 20;
    var selectResultCheck = outputPanel.add("checkbox", undefined, "Select repeated artwork");
    selectResultCheck.value = true;
    var clipCheck = outputPanel.add("checkbox", undefined, "Clip output to artboard bounds");
    clipCheck.value = false;

    var statusText = dialog.add("statictext", undefined, "Ready.");
    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var repeatButton = buttons.add("button", undefined, OZO.tr("Create Repeat"), {name: "ok"});
    dialog.defaultElement = repeatButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog, function () {
        updateSourceSummary();
        updateDimensionUnit();
        statusText.text = OZO.tr("Ready.");
    });
    OZO.addDonateRow(dialog, SCRIPT_NAME);

    function updateSourceSummary() {
        var items = sourceItemsFor(sourceList.selection ? sourceList.selection.index : 0);
        sourceSummary.text = items.length + " " +
            OZO.tr("source object(s). Active layer:") + " " + originalLayer.name;
        repeatButton.enabled = items.length > 0;
    }

    function updateArtboardControls() {
        var editable = !artboardModeList.selection || artboardModeList.selection.index !== 1;
        var creating = !artboardModeList.selection || artboardModeList.selection.index === 0;
        widthInput.enabled = editable;
        heightInput.enabled = editable;
        swapButton.enabled = editable;
        placementList.enabled = creating;
        artboardGapInput.enabled = creating;
    }

    function updatePatternControls() {
        staggerInput.enabled = !!patternList.selection && patternList.selection.index !== 0;
    }

    var dimensionControls = [widthInput, heightInput, artboardGapInput,
        horizontalGapInput, verticalGapInput];
    var currentUnitIndex = 0;
    var restoringState = true;

    function updateDimensionUnit() {
        var newUnitIndex = unitList.selection ? unitList.selection.index : 0;
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
        unitHint.text = newUnitIndex === 4 ?
            OZO.tr("Illustrator treats 1 px as 1 pt in scripts.") :
            OZO.tr("Dimension values convert automatically.");
    }

    function sanitizeRestoredDimensions() {
        var factor = UNIT_FACTORS[currentUnitIndex];
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
    artboardModeList.onChange = updateArtboardControls;
    patternList.onChange = updatePatternControls;
    unitList.onChange = updateDimensionUnit;
    swapButton.onClick = function () {
        var oldWidth = widthInput.text;
        widthInput.text = heightInput.text;
        heightInput.text = oldWidth;
    };
    updateSourceSummary();
    updateArtboardControls();
    updatePatternControls();
    updateDimensionUnit();

    OZO.makeNumericSmooth(horizontalGapInput, {step: 1, min: 0, max: 10000});
    OZO.makeNumericSmooth(verticalGapInput, {step: 1, min: 0, max: 10000});
    OZO.makeNumericSmooth(scaleInput, {step: 5, min: 1, max: 10000});
    OZO.makeNumericSmooth(staggerInput, {step: 5, min: 0, max: 100});

    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    currentUnitIndex = unitList.selection ? unitList.selection.index : 0;
    sanitizeRestoredDimensions();
    restoringState = false;
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);
    updateSourceSummary();
    updateArtboardControls();
    updatePatternControls();
    updateDimensionUnit();
    dialog.center();
    horizontalGapInput.active = true;
    if (dialog.show() !== 1) return;

    var settings;
    try {
        var modeIndex = artboardModeList.selection ? artboardModeList.selection.index : 0;
        var unitIndex = unitList.selection ? unitList.selection.index : 0;
        var patternIndex = patternList.selection ? patternList.selection.index : 0;
        settings = {
            sourceIndex: sourceList.selection ? sourceList.selection.index : 0,
            scale: numberValue(scaleInput, "Scale", 0.1, 10000),
            modeIndex: modeIndex,
            placementIndex: placementList.selection ? placementList.selection.index : 0,
            artboardGap: modeIndex === 0 ? dimensionValue(artboardGapInput,
                "Artboard gap", 0, 100000, unitIndex) : 0,
            artboardWidth: modeIndex === 1 ? Math.abs(activeRect[2] - activeRect[0]) :
                dimensionValue(widthInput, "Artboard width", 1, 100000, unitIndex),
            artboardHeight: modeIndex === 1 ? Math.abs(activeRect[1] - activeRect[3]) :
                dimensionValue(heightInput, "Artboard height", 1, 100000, unitIndex),
            horizontalGap: dimensionValue(horizontalGapInput,
                "Horizontal spacing", 0, 100000, unitIndex),
            verticalGap: dimensionValue(verticalGapInput,
                "Vertical spacing", 0, 100000, unitIndex),
            patternIndex: patternIndex,
            stagger: patternIndex === 0 ? 0 :
                numberValue(staggerInput, "Stagger", 0, 100) / 100,
            center: centerCheck.value,
            autoFit: autoFitCheck.value,
            layerName: trim(layerNameInput.text) || "Object Repeat",
            selectResult: selectResultCheck.value,
            clip: clipCheck.value
        };
    } catch (settingsError) {
        alert(OZO.tr(SCRIPT_NAME) + "\n\n" +
            (settingsError && settingsError.message ? settingsError.message : String(settingsError)));
        return;
    }

    var sourceItems = sourceItemsFor(settings.sourceIndex);
    if (!sourceItems.length) {
        alert(OZO.tr(SCRIPT_NAME) + "\n\n" + OZO.tr("No usable source artwork was found."));
        return;
    }

    var outputLayer = null;
    var outputGroup = null;
    var createdArtboard = null;
    var resizedArtboard = null;
    var resizedOriginalRect = null;
    var progress = null;
    try {
        var targetRect;
        if (settings.modeIndex === 0) {
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
        } else if (settings.modeIndex === 2) {
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

        var availableWidth = Math.abs(targetRect[2] - targetRect[0]);
        var availableHeight = Math.abs(targetRect[1] - targetRect[3]);
        if (!(availableWidth > 0) || !(availableHeight > 0)) {
            throw new Error(OZO.tr("The target artboard has invalid dimensions."));
        }

        outputLayer = doc.layers.add();
        outputLayer.name = uniqueLayerName(settings.layerName);
        doc.activeLayer = outputLayer;
        outputGroup = outputLayer.groupItems.add();
        outputGroup.name = settings.layerName + " Pattern";
        var template = outputGroup.groupItems.add();
        template.name = "Repeat Source";
        for (var sourceIndex = 0; sourceIndex < sourceItems.length; sourceIndex++) {
            sourceItems[sourceIndex].duplicate(template, ElementPlacement.PLACEATEND);
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
        if (artworkWidth > availableWidth || artworkHeight > availableHeight) {
            if (!settings.autoFit) {
                throw new Error(OZO.tr(
                    "The scaled artwork does not fit inside the artboard bounds."));
            }
            var oversizedFit = Math.min(availableWidth / artworkWidth,
                availableHeight / artworkHeight) * 0.999;
            template.resize(oversizedFit * 100, oversizedFit * 100,
                true, true, true, true, oversizedFit * 100, Transformation.CENTER);
            templateBounds = template.visibleBounds;
            artworkWidth = templateBounds[2] - templateBounds[0];
            artworkHeight = templateBounds[1] - templateBounds[3];
        }
        var stepX = artworkWidth + settings.horizontalGap;
        var stepY = artworkHeight + settings.verticalGap;
        var staggerX = stepX * settings.stagger;
        var staggerY = stepY * settings.stagger;
        var baseColumns = Math.floor((availableWidth + settings.horizontalGap) / stepX);
        var baseRows = Math.floor((availableHeight + settings.verticalGap) / stepY);
        var columns = baseColumns;
        var rows = baseRows;
        if (settings.patternIndex === 1 && rows > 1) {
            columns = Math.floor((availableWidth - staggerX +
                settings.horizontalGap) / stepX);
            if (columns < 1) {
                columns = baseColumns;
                rows = 1;
            }
        }
        if (settings.patternIndex === 2 && columns > 1) {
            rows = Math.floor((availableHeight - staggerY +
                settings.verticalGap) / stepY);
            if (rows < 1) {
                rows = baseRows;
                columns = 1;
            }
        }
        if (columns < 1 || rows < 1) {
            throw new Error(OZO.tr(
                "The scaled artwork does not fit inside the artboard bounds."));
        }
        var totalAttempts = columns * rows;
        if (totalAttempts > MAX_REPEAT_COPIES) {
            throw new Error(OZO.tr("The layout would create") + " " + totalAttempts + " " +
                OZO.tr("copies, which exceeds the limit of") + " " +
                MAX_REPEAT_COPIES + ". " + OZO.tr(
                    "Increase the spacing or reduce the target artboard size."));
        }
        progress = new Window("palette", OZO.tr(SCRIPT_NAME));
        progress.orientation = "column";
        progress.alignChildren = ["fill", "top"];
        progress.margins = 14;
        var progressText = progress.add("statictext", undefined,
            OZO.tr("Creating repeat pattern..."));
        progressText.preferredSize.width = 360;
        var progressBar = progress.add("progressbar", undefined, 0, totalAttempts);
        progressBar.preferredSize = [360, 18];
        progress.show();
        progress.update();

        var patternWidth = artworkWidth + (columns - 1) * stepX;
        var patternHeight = artworkHeight + (rows - 1) * stepY;
        if (settings.patternIndex === 1 && rows > 1) patternWidth += staggerX;
        if (settings.patternIndex === 2 && columns > 1) patternHeight += staggerY;
        var originLeft = settings.center ?
            targetRect[0] + (Math.abs(targetRect[2] - targetRect[0]) - patternWidth) / 2 :
            targetRect[0];
        var originTop = settings.center ?
            targetRect[1] - (Math.abs(targetRect[1] - targetRect[3]) - patternHeight) / 2 :
            targetRect[1];
        var safeLeft = targetRect[0];
        var safeRight = targetRect[2];
        var safeTop = targetRect[1];
        var safeBottom = targetRect[3];
        var placedCount = 0;
        var tolerance = 0.01;
        var templateLeft = templateBounds[0];
        var templateTop = templateBounds[1];
        var progressInterval = Math.max(25, Math.floor(totalAttempts / 20));
        doc.selection = null;

        for (var row = 0; row < rows; row++) {
            var rowOffsetX = settings.patternIndex === 1 && row % 2 === 1 ? staggerX : 0;
            var rowLeft = originLeft + rowOffsetX;
            var rowTop = originTop - row * stepY;
            for (var column = 0; column < columns; column++) {
                var offsetY = settings.patternIndex === 2 && column % 2 === 1 ? staggerY : 0;
                var left = rowLeft + column * stepX;
                var top = rowTop - offsetY;
                var outsideArtboard = left < safeLeft - tolerance ||
                    left + artworkWidth > safeRight + tolerance ||
                    top > safeTop + tolerance ||
                    top - artworkHeight < safeBottom - tolerance;
                if (!outsideArtboard) {
                    var repeatedItem = template.duplicate(
                        outputGroup, ElementPlacement.PLACEATEND);
                    repeatedItem.translate(left - templateLeft, top - templateTop);
                    repeatedItem.name = "Repeat " + (placedCount + 1);
                    placedCount++;
                }
                var attemptedCount = row * columns + column + 1;
                if (attemptedCount % progressInterval === 0 ||
                        attemptedCount === totalAttempts) {
                    progressText.text = OZO.tr("Creating copy") + " " + placedCount + " " +
                        OZO.tr("of up to") + " " + totalAttempts + "...";
                    progressBar.value = attemptedCount;
                    progress.update();
                }
            }
        }
        template.remove();
        if (!placedCount) {
            throw new Error(OZO.tr("No copies fit within the selected layout."));
        }

        if (settings.clip) {
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

        progressBar.value = totalAttempts;
        progress.close();
        progress = null;

        doc.selection = null;
        if (settings.selectResult) outputGroup.selected = true;
        else restoreSelection();
        OZO.saveWindowState(dialog, STATE_NAMESPACE);
        app.redraw();
        alert(OZO.tr(SCRIPT_NAME) + "\n\n" + OZO.tr("Created") + " " + placedCount + " " +
            OZO.tr("repeated object(s) on layer") + " \"" + outputLayer.name + "\".");
    } catch (error) {
        try { if (progress) progress.close(); } catch (ignoreProgress) {}
        try { if (outputLayer) outputLayer.remove(); } catch (ignoreLayerRemoval) {}
        try {
            if (createdArtboard) createdArtboard.remove();
        } catch (ignoreArtboardRemoval) {}
        try {
            if (resizedArtboard && resizedOriginalRect) {
                resizedArtboard.artboardRect = resizedOriginalRect;
            }
        } catch (ignoreArtboardRestore) {}
        try { doc.artboards.setActiveArtboardIndex(originalArtboardIndex); } catch (ignoreIndex) {}
        try { doc.activeLayer = originalLayer; } catch (ignoreLayer) {}
        restoreSelection();
        alert(OZO.tr(SCRIPT_NAME) + " " + OZO.tr("failed.") + "\n\n" +
            (error && error.message ? error.message : String(error)));
    }
})();
