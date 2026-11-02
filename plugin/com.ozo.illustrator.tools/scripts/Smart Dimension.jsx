#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Smart Dimension";
    var PREVIEW_LAYER_NAME = "__Smart Dimension Preview__";

    if (app.documents.length === 0) {
        alert(OZO.tr("Open a document and select artwork to dimension."));
        return;
    }

    var doc = app.activeDocument;
    var selectionValue = doc.selection;
    if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length === 0) {
        if (confirm(OZO.isKhmer() ?
            "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f Artwork \u1791\u17c1\u17d4 \u178f\u17be\u17a2\u17d2\u1793\u1780\u1785\u1784\u17cb\u179c\u17b6\u179f\u17cb\u1794\u17d2\u179a\u179c\u17c2\u1784\u179c\u178f\u17d2\u1790\u1793\u17c4\u179b\u17be Artboard \u1793\u17c1\u17c7\u1791\u17b6\u17c6\u1784\u17a2\u179f\u17cb\u178a\u17c4\u1799\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u1791\u17c1?" :
            "No artwork is selected. Would you like to dimension all items on the active artboard automatically?")) {
            doc.selectObjectsOnActiveArtboard();
            selectionValue = doc.selection;
        }
        if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length === 0) {
            return;
        }
    }

    var sourceItems = [];
    for (var sourceIndex = 0; sourceIndex < selectionValue.length; sourceIndex++) {
        sourceItems.push(selectionValue[sourceIndex]);
    }
    var originalActiveLayer = doc.activeLayer;
    var previewLayer = null;
    var previewGroup = null;
    var previewSignature = null;
    var selectionBoundsCache = {};
    var sourceItemBoundsCache = {};

    function errorMessage(error) {
        return error && error.message ? error.message : String(error);
    }

    function validBounds(bounds) {
        return bounds && bounds.length === 4 &&
            isFinite(bounds[0]) && isFinite(bounds[1]) &&
            isFinite(bounds[2]) && isFinite(bounds[3]) &&
            bounds[2] >= bounds[0] && bounds[1] >= bounds[3] &&
            (bounds[2] > bounds[0] || bounds[1] > bounds[3]);
    }

    function itemBounds(item, propertyName) {
        try {
            var bounds = item[propertyName];
            return validBounds(bounds) ?
                [bounds[0], bounds[1], bounds[2], bounds[3]] : null;
        } catch (ignoreBounds) {
            return null;
        }
    }

    function cachedSourceItemBounds(index, propertyName) {
        var cacheKey = propertyName + ":" + index;
        if (!sourceItemBoundsCache.hasOwnProperty(cacheKey)) {
            sourceItemBoundsCache[cacheKey] = itemBounds(sourceItems[index], propertyName);
        }
        var bounds = sourceItemBoundsCache[cacheKey];
        return bounds ? bounds.slice(0) : null;
    }

    function selectionBounds(propertyName) {
        if (selectionBoundsCache.hasOwnProperty(propertyName)) {
            return selectionBoundsCache[propertyName].slice(0);
        }
        var combined = null;
        for (var i = 0; i < sourceItems.length; i++) {
            var bounds = cachedSourceItemBounds(i, propertyName);
            if (!bounds) continue;
            if (!combined) {
                combined = bounds;
            } else {
                combined[0] = Math.min(combined[0], bounds[0]);
                combined[1] = Math.max(combined[1], bounds[1]);
                combined[2] = Math.max(combined[2], bounds[2]);
                combined[3] = Math.min(combined[3], bounds[3]);
            }
        }
        if (!combined) throw new Error("The selection has no measurable artwork bounds.");
        selectionBoundsCache[propertyName] = combined.slice(0);
        return combined;
    }

    function numberValue(control, name, allowZero) {
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

    function unitFactor(unit) {
        return OZO.toPoints(1, unit);
    }

    function formatNumber(value, precision) {
        var power = Math.pow(10, precision);
        var rounded = Math.round(value * power) / power;
        if (Math.abs(rounded) < 1e-12) rounded = 0;
        var text = rounded.toFixed(precision);
        if (precision > 0) {
            text = text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
        }
        return text;
    }

    function blackColor() {
        if (doc && doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 100;
            return cmyk;
        }
        var color = new RGBColor();
        color.red = 0;
        color.green = 0;
        color.blue = 0;
        return color;
    }

    function whiteColor() {
        if (doc && doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var cmyk = new CMYKColor();
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 0;
            return cmyk;
        }
        var color = new RGBColor();
        color.red = 255;
        color.green = 255;
        color.blue = 255;
        return color;
    }

    function normalizeEditingContext() {
        for (var pass = 0; pass < 12; pass++) {
            try { app.executeMenuCommand("exitFocus"); }
            catch (ignoreIsolation) { break; }
        }
        try { app.executeMenuCommand("Adobe Draw Normal"); }
        catch (ignoreDrawMode) {}
    }

    function addPathPoint(path, anchor) {
        var point = path.pathPoints.add();
        point.anchor = anchor;
        point.leftDirection = anchor;
        point.rightDirection = anchor;
        point.pointType = PointType.CORNER;
    }

    function addLine(group, first, second, settings) {
        var path = group.pathItems.add();
        addPathPoint(path, first);
        addPathPoint(path, second);
        path.closed = false;
        path.filled = false;
        path.stroked = true;
        path.strokeColor = settings.color;
        path.strokeWidth = settings.stroke;
        return path;
    }

    function addTriangle(group, first, second, third, settings) {
        var path = group.pathItems.add();
        addPathPoint(path, first);
        addPathPoint(path, second);
        addPathPoint(path, third);
        path.closed = true;
        path.stroked = false;
        path.filled = true;
        path.fillColor = settings.color;
        return path;
    }

    function recordingContainer(layer, items) {
        function remember(item) {
            items.push(item);
            return item;
        }
        return {
            host: layer,
            remember: remember,
            pathItems: {
                add: function () {
                    return remember(layer.pathItems.add());
                },
                rectangle: function (top, left, width, height) {
                    return remember(layer.pathItems.rectangle(top, left, width, height));
                }
            },
            textFrames: {
                add: function () {
                    return remember(layer.textFrames.add());
                }
            }
        };
    }

    function centerText(textFrame, centerX, centerY) {
        app.redraw();
        var bounds = textFrame.visibleBounds;
        textFrame.translate(
            centerX - (bounds[0] + bounds[2]) / 2,
            centerY - (bounds[1] + bounds[3]) / 2
        );
    }

    function addLabel(group, value, centerX, centerY, rotation, settings) {
        var text = null;
        var donor = OZO.findDonorTextFrame(doc);
        if (donor) {
            try {
                text = donor.duplicate(group.host || group, ElementPlacement.PLACEATEND);
                if (typeof group.remember === "function") group.remember(text);
                text.hidden = false;
                text.locked = false;
                text.contents = value;
            } catch (eDup) {
                text = null;
            }
        }
        if (!text) {
            text = group.textFrames.add();
            text.contents = value;
        }

        if (settings.fontName && settings.fontName !== "Auto") {
            try {
                text.textRange.characterAttributes.textFont = app.textFonts.getByName(settings.fontName);
            } catch (eFont) {}
        }
        text.textRange.characterAttributes.size = settings.textSize;
        text.textRange.characterAttributes.fillColor = settings.color;
        text.position = [centerX, centerY];
        if (rotation) text.rotate(rotation);
        centerText(text, centerX, centerY);

        if (settings.labelBackground) {
            var bounds = text.visibleBounds;
            var padding = Math.max(1.5, settings.textSize * 0.18);
            var background = group.pathItems.rectangle(
                bounds[1] + padding,
                bounds[0] - padding,
                (bounds[2] - bounds[0]) + padding * 2,
                (bounds[1] - bounds[3]) + padding * 2
            );
            background.stroked = false;
            background.filled = true;
            background.fillColor = whiteColor();
            text.zOrder(ZOrderMethod.BRINGTOFRONT);
        }
        return text;
    }

    function dimensionLabel(points, settings, isHorizontal) {
        var converted = points / unitFactor(settings.unit) * settings.scale;
        var prefix = isHorizontal ? (settings.widthPrefix || "") : (settings.heightPrefix || "");
        var suffix = settings.suffix || "";
        return prefix + formatNumber(converted, settings.precision) +
            (settings.showUnit ? " " + settings.unit : "") + suffix;
    }

    function addHorizontalDimension(group, spec, settings) {
        var y = spec.y;
        var length = Math.abs(spec.x2 - spec.x1);
        var arrowsInside = length >= settings.arrow * 2.5;
        var overshoot = Math.max(2, settings.arrow * 0.35);
        addLine(group, [spec.x1, spec.refY1], [spec.x1, y - overshoot], settings);
        addLine(group, [spec.x2, spec.refY2], [spec.x2, y - overshoot], settings);
        addLine(group, [spec.x1, y], [spec.x2, y], settings);
        var half = settings.arrow * 0.42;
        var leftBase = spec.x1 + (arrowsInside ? settings.arrow : -settings.arrow);
        var rightBase = spec.x2 + (arrowsInside ? -settings.arrow : settings.arrow);
        addTriangle(group, [spec.x1, y], [leftBase, y + half],
            [leftBase, y - half], settings);
        addTriangle(group, [spec.x2, y], [rightBase, y + half],
            [rightBase, y - half], settings);
        addLabel(group, dimensionLabel(length, settings, true),
            (spec.x1 + spec.x2) / 2, y + settings.textSize * 0.55, 0, settings);
    }

    function addVerticalDimension(group, spec, settings) {
        var x = spec.x;
        var length = Math.abs(spec.y1 - spec.y2);
        var arrowsInside = length >= settings.arrow * 2.5;
        var overshoot = Math.max(2, settings.arrow * 0.35);
        addLine(group, [spec.refX1, spec.y1], [x + overshoot, spec.y1], settings);
        addLine(group, [spec.refX2, spec.y2], [x + overshoot, spec.y2], settings);
        addLine(group, [x, spec.y1], [x, spec.y2], settings);
        var half = settings.arrow * 0.42;
        var topBase = spec.y1 + (arrowsInside ? -settings.arrow : settings.arrow);
        var bottomBase = spec.y2 + (arrowsInside ? settings.arrow : -settings.arrow);
        addTriangle(group, [x, spec.y1], [x - half, topBase],
            [x + half, topBase], settings);
        addTriangle(group, [x, spec.y2], [x - half, bottomBase],
            [x + half, bottomBase], settings);
        addLabel(group, dimensionLabel(length, settings, false),
            x + settings.textSize * 0.65, (spec.y1 + spec.y2) / 2, 90, settings);
    }

    function buildDimensionSpecs(settings) {
        var bounds = selectionBounds(settings.boundsProperty);
        var horizontal = [];
        var vertical = [];
        var mode = settings.mode;

        // Smart mode uses edge gaps when exactly two objects are clearly
        // separated; otherwise it falls back to their combined overall size.
        if (mode === 0 && sourceItems.length === 2) {
            var autoFirst = cachedSourceItemBounds(0, settings.boundsProperty);
            var autoSecond = cachedSourceItemBounds(1, settings.boundsProperty);
            if (autoFirst && autoSecond) {
                var separatedHorizontally = autoFirst[2] < autoSecond[0] ||
                    autoSecond[2] < autoFirst[0];
                var separatedVertically = autoFirst[3] > autoSecond[1] ||
                    autoSecond[3] > autoFirst[1];
                if (separatedHorizontally && separatedVertically) mode = 6;
                else if (separatedHorizontally) mode = 4;
                else if (separatedVertically) mode = 5;
                else mode = 3;
            } else {
                mode = 3;
            }
        } else if (mode === 0) {
            mode = 3;
        }

        if (mode === 3) {
            horizontal.push({x1: bounds[0], x2: bounds[2],
                refY1: bounds[3], refY2: bounds[3], y: bounds[3] - settings.offset});
            vertical.push({y1: bounds[1], y2: bounds[3],
                refX1: bounds[2], refX2: bounds[2], x: bounds[2] + settings.offset});
        } else if (mode === 1) {
            horizontal.push({x1: bounds[0], x2: bounds[2],
                refY1: bounds[3], refY2: bounds[3], y: bounds[3] - settings.offset});
        } else if (mode === 2) {
            vertical.push({y1: bounds[1], y2: bounds[3],
                refX1: bounds[2], refX2: bounds[2], x: bounds[2] + settings.offset});
        } else {
            if (sourceItems.length !== 2) {
                throw new Error("Edge-gap dimensions require exactly two selected objects.");
            }
            var first = cachedSourceItemBounds(0, settings.boundsProperty);
            var second = cachedSourceItemBounds(1, settings.boundsProperty);
            if (!first || !second) throw new Error("Could not read both object bounds.");

            if (mode === 4 || mode === 6) {
                var leftItem = first[0] <= second[0] ? first : second;
                var rightItem = leftItem === first ? second : first;
                if (leftItem[2] > rightItem[0]) {
                    throw new Error("The selected objects overlap horizontally; no horizontal edge gap exists.");
                }
                horizontal.push({x1: leftItem[2], x2: rightItem[0],
                    refY1: leftItem[3], refY2: rightItem[3],
                    y: Math.min(first[3], second[3]) - settings.offset});
            }
            if (mode === 5 || mode === 6) {
                var topItem = first[1] >= second[1] ? first : second;
                var bottomItem = topItem === first ? second : first;
                if (topItem[3] < bottomItem[1]) {
                    throw new Error("The selected objects overlap vertically; no vertical edge gap exists.");
                }
                vertical.push({y1: topItem[3], y2: bottomItem[1],
                    refX1: topItem[2], refX2: bottomItem[2],
                    x: Math.max(first[2], second[2]) + settings.offset});
            }
        }
        return {horizontal: horizontal, vertical: vertical};
    }

    function restoreSelection() {
        try {
            doc.selection = null;
            for (var i = 0; i < sourceItems.length; i++) sourceItems[i].selected = true;
        } catch (ignoreSelection) {}
    }

    function cleanupPreview(skipRedraw) {
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (ignoreRemoval) {}
        }
        previewLayer = null;
        previewGroup = null;
        previewSignature = null;
        try { doc.activeLayer = originalActiveLayer; } catch (ignoreLayerRestore) {}
        restoreSelection();
        if (!skipRedraw) {
            app.redraw();
        }
    }

    function createDimensions(settings) {
        var specs = buildDimensionSpecs(settings);
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
        }
        doc.activeLayer = previewLayer;
        var createdItems = [];
        var drawingTarget = recordingContainer(previewLayer, createdItems);
        try {
            for (var i = 0; i < specs.horizontal.length; i++) {
                addHorizontalDimension(drawingTarget, specs.horizontal[i], settings);
            }
            for (i = 0; i < specs.vertical.length; i++) {
                addVerticalDimension(drawingTarget, specs.vertical[i], settings);
            }
            previewGroup = previewLayer.groupItems.add();
            previewGroup.name = "Smart Dimensions Preview";
            for (var moveIndex = createdItems.length - 1; moveIndex >= 0; moveIndex--) {
                try {
                    createdItems[moveIndex].move(previewGroup, ElementPlacement.PLACEATEND);
                } catch (ignoreMove) {}
            }
            // Reassert text stacking after the staged items enter the group.
            for (moveIndex = 0; moveIndex < createdItems.length; moveIndex++) {
                if (createdItems[moveIndex].typename === "TextFrame") {
                    try {
                        createdItems[moveIndex].zOrder(ZOrderMethod.BRINGTOFRONT);
                    } catch (ignoreZ) {}
                }
            }
        } catch (error) {
            cleanupPreview();
            throw error;
        }
        doc.selection = null;
        if (previewGroup) {
            try { previewGroup.selected = true; } catch (ignoreSel) {}
        }
        app.redraw();
        return specs.horizontal.length + specs.vertical.length;
    }

    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("Smart Dimension"), "v2.2 \u2022 Vector Technical Dimensioning");

    var measurePanel = dialog.add("panel", undefined, OZO.tr("Measurement"));
    measurePanel.orientation = "column";
    measurePanel.alignChildren = ["fill", "top"];
    measurePanel.margins = [14, 16, 14, 10];

    var modeRow = measurePanel.add("group");
    modeRow.add("statictext", undefined, OZO.tr("Dimension:"));
    var modeList = modeRow.add("dropdownlist", undefined, [
        OZO.tr("Smart auto (overall or gaps)"),
        OZO.tr("Overall width"),
        OZO.tr("Overall height"),
        OZO.tr("Overall width + height"),
        OZO.tr("Horizontal edge gap (2 objects)"),
        OZO.tr("Vertical edge gap (2 objects)"),
        OZO.tr("Both edge gaps (2 objects)")
    ]);
    modeList.selection = 0;
    modeList.preferredSize.width = 255;

    var boundsRow = measurePanel.add("group");
    boundsRow.add("statictext", undefined, OZO.tr("Use bounds:"));
    var boundsList = boundsRow.add("dropdownlist", undefined,
        [OZO.tr("Visible bounds (include strokes)"), OZO.tr("Geometric bounds")]);
    boundsList.selection = 0;

    var unitsPanel = dialog.add("panel", undefined, OZO.tr("Units and Scale"));
    unitsPanel.orientation = "column";
    unitsPanel.alignChildren = ["left", "center"];
    unitsPanel.margins = [14, 16, 14, 10];

    var unitRow = unitsPanel.add("group");
    unitRow.add("statictext", undefined, OZO.tr("Units:"));
    var unitList = unitRow.add("dropdownlist", undefined, ["mm", "cm", "m", "in", "pt"]);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "m") defaultUnitIdx = 2;
    else if (defaultDocUnit === "in") defaultUnitIdx = 3;
    else if (defaultDocUnit === "pt") defaultUnitIdx = 4;
    unitList.selection = defaultUnitIdx;

    unitRow.add("statictext", undefined, OZO.tr("Precision:"));
    var precisionList = unitRow.add("dropdownlist", undefined, ["0", "1", "2", "3"]);
    precisionList.selection = 2;
    var showUnitCheck = unitRow.add("checkbox", undefined, OZO.tr("Show unit"));
    showUnitCheck.value = true;

    var scaleRow = unitsPanel.add("group");
    scaleRow.add("statictext", undefined, OZO.tr("Drawing scale  1 :"));
    var scaleInput = scaleRow.add("edittext", undefined, "1");
    scaleInput.characters = 8;
    scaleRow.add("statictext", undefined, OZO.tr("(use 10 for a 1:10 drawing)"));

    var stylePanel = dialog.add("panel", undefined, OZO.tr("Dimension Style"));
    stylePanel.orientation = "column";
    stylePanel.alignChildren = ["left", "center"];
    stylePanel.margins = [14, 16, 14, 10];

    // Font selection row
    var fontRow = stylePanel.add("group");
    fontRow.orientation = "row";
    fontRow.alignChildren = ["left", "center"];
    var fontLabel = fontRow.add("statictext", undefined, OZO.tr("Font:"));
    fontLabel.preferredSize.width = 115;
    var popularFonts = [
        "Auto (Active Font)",
        "Kantumruy Pro Bold",
        "Kantumruy Pro Medium",
        "Khmer OS Siemreap",
        "Khmer OS Battambang",
        "Arial-BoldMT",
        "ArialMT",
        "MyriadPro-Bold"
    ];
    var fontList = fontRow.add("dropdownlist", undefined, popularFonts);
    fontList.selection = 0;
    fontList.preferredSize.width = 180;

    // Optional Prefixes (W / H)
    var prefixRow = stylePanel.add("group");
    prefixRow.orientation = "row";
    prefixRow.alignChildren = ["left", "center"];
    var prefixLabel = prefixRow.add("statictext", undefined, OZO.tr("Prefix:") + " W / H");
    prefixLabel.preferredSize.width = 115;
    var wPrefixInput = prefixRow.add("edittext", undefined, "");
    wPrefixInput.characters = 6;
    wPrefixInput.helpTip = "Width prefix (e.g. W: or ទទឹង )";
    var hPrefixInput = prefixRow.add("edittext", undefined, "");
    hPrefixInput.characters = 6;
    hPrefixInput.helpTip = "Height prefix (e.g. H: or កម្ពស់ )";

    function inputRow(parent, label, value, suffix) {
        var row = parent.add("group");
        var title = row.add("statictext", undefined, label);
        title.preferredSize.width = 115;
        var input = row.add("edittext", undefined, value);
        input.characters = 7;
        row.add("statictext", undefined, suffix);
        return input;
    }

    var offsetInput = inputRow(stylePanel, OZO.tr("Offset"), "10", OZO.tr("selected unit"));
    var textSizeInput = inputRow(stylePanel, OZO.tr("Text size"), "10", "pt");
    var arrowInput = inputRow(stylePanel, OZO.tr("Arrow size"), "6", "pt");
    var strokeInput = inputRow(stylePanel, OZO.tr("Line weight"), "0.75", "pt");
    var backgroundCheck = stylePanel.add("checkbox", undefined, OZO.tr("White background behind labels"));
    backgroundCheck.value = true;

    var statusText = dialog.add("statictext", undefined,
        sourceItems.length + " selected object(s). Ready for preview.");
    var note = dialog.add("statictext", undefined,
        OZO.tr("Creates editable vector dimensions on a new layer. Preview and Cancel do not modify the source artwork."),
        {multiline: true});
    note.preferredSize = [455, 34];
    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var previewButton = buttons.add("button", undefined, OZO.tr("Update Preview"));
    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var applyButton = buttons.add("button", undefined, OZO.tr("Apply"), {name: "ok"});
    dialog.defaultElement = applyButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog);

    function readSettings() {
        var unit = "mm";
        if (unitList.selection) {
            unit = (typeof unitList.selection.text !== "undefined") ? unitList.selection.text : String(unitList.selection);
        }
        var textSize = numberValue(textSizeInput, "Text size", false);
        var arrowSize = numberValue(arrowInput, "Arrow size", false);
        var stroke = numberValue(strokeInput, "Line weight", false);
        if (textSize > 1000 || arrowSize > 1000 || stroke > 100) {
            throw new Error("Dimension style values are too large.");
        }

        var selMode = 0;
        if (typeof modeList.selection === "number") selMode = modeList.selection;
        else if (modeList.selection && typeof modeList.selection.index === "number") selMode = modeList.selection.index;

        var boundsIdx = 0;
        if (typeof boundsList.selection === "number") boundsIdx = boundsList.selection;
        else if (boundsList.selection && typeof boundsList.selection.index === "number") boundsIdx = boundsList.selection.index;

        var precIdx = 2;
        if (typeof precisionList.selection === "number") precIdx = precisionList.selection;
        else if (precisionList.selection && typeof precisionList.selection.index === "number") precIdx = precisionList.selection.index;

        var fontName = "Auto";
        if (fontList.selection) {
            var fIdx = (typeof fontList.selection === "number") ? fontList.selection : fontList.selection.index;
            if (fIdx > 0) {
                fontName = (typeof fontList.selection.text !== "undefined") ? fontList.selection.text : popularFonts[fIdx];
            }
        }

        return {
            mode: selMode,
            boundsProperty: boundsIdx === 0 ? "visibleBounds" : "geometricBounds",
            unit: unit,
            precision: precIdx,
            showUnit: showUnitCheck.value,
            scale: numberValue(scaleInput, "Drawing scale", false),
            offset: numberValue(offsetInput, "Offset", true) * unitFactor(unit),
            textSize: textSize,
            arrow: arrowSize,
            stroke: stroke,
            labelBackground: backgroundCheck.value,
            fontName: fontName,
            widthPrefix: wPrefixInput.text,
            heightPrefix: hPrefixInput.text,
            color: blackColor()
        };
    }

    function settingsSignature(settings) {
        return [settings.mode, settings.boundsProperty, settings.unit, settings.precision,
            settings.showUnit, settings.scale, settings.offset, settings.textSize,
            settings.arrow, settings.stroke, settings.labelBackground,
            settings.fontName, settings.widthPrefix, settings.heightPrefix].join("|");
    }

    var restoringState = true;
    var previousUnit = "mm";
    unitList.onChange = function () {
        if (restoringState) return;
        var newUnit = unitList.selection ? unitList.selection.text : "mm";
        var normalized = String(offsetInput.text).replace(/,/g, ".")
            .replace(/^\s+|\s+$/g, "");
        if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
            offsetInput.text = formatNumber(
                Number(normalized) * unitFactor(previousUnit) / unitFactor(newUnit), 4
            );
        }
        previousUnit = newUnit;
    };

    previewButton.onClick = function () {
        previewButton.enabled = false;
        statusText.text = OZO.isKhmer() ? "\u1780\u17c6\u1796\u17bb\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17b6\u179a\u1798\u17be\u179b\u1791\u17c6\u17a0\u17c6\u1787\u17b6\u1798\u17bb\u1793..." :
            "Building dimension preview...";
        dialog.update();
        try {
            var settings = readSettings();
            var count = createDimensions(settings);
            previewSignature = settingsSignature(settings);
            statusText.text = OZO.isKhmer() ?
                "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u179a\u17bd\u1785\u179a\u17b6\u179b\u17cb\u17d6 " + count + " \u1791\u17c6\u17a0\u17c6\u17d4" :
                "Preview ready: " + count + " dimension(s).";
        } catch (error) {
            cleanupPreview();
            statusText.text = OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : "Preview failed.";
            alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1791\u17c6\u17a0\u17c6\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" :
                SCRIPT_NAME + " preview failed.") + "\n\n" + errorMessage(error));
        }
        previewButton.enabled = true;
    };

    OZO.makeNumericSmooth(textSizeInput, {step: 1, min: 1, max: 200});
    OZO.makeNumericSmooth(arrowInput, {step: 1, min: 1, max: 200});
    OZO.makeNumericSmooth(strokeInput, {step: 0.25, min: 0.1, max: 50});

    OZO.restoreWindowState(dialog, "smart_dimension");
    previousUnit = unitList.selection ? unitList.selection.text : "mm";
    restoringState = false;
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    textSizeInput.active = true;

    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview();
        return;
    }

    try {
        var finalSettings = readSettings();
        var signature = settingsSignature(finalSettings);
        var dimensionCount;
        if (!previewLayer || previewSignature !== signature) {
            dimensionCount = createDimensions(finalSettings);
        } else {
            var specs = buildDimensionSpecs(finalSettings);
            dimensionCount = specs.horizontal.length + specs.vertical.length;
        }
        if (previewLayer) {
            previewLayer.name = "Smart Dimensions";
        }
        if (previewGroup) {
            previewGroup.name = "Smart Dimensions";
            doc.selection = null;
            try { previewGroup.selected = true; } catch (ignoreSel2) {}
        }
        OZO.saveWindowState(dialog, "smart_dimension");
        alert((OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb\u1780\u17b6\u179a\u179c\u17b6\u179f\u17cb\u1791\u17c6\u17a0\u17c6\u1786\u17d2\u179b\u17b6\u178f\u179c\u17c3\u17d4\n\n\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f " + dimensionCount +
                " \u1791\u17c6\u17a0\u17c6\u179b\u17be\u179f\u17d2\u179a\u1791\u17b6\u1794\u17cb Smart Dimensions\u17d4" :
            "Smart Dimension completed.\n\nCreated " + dimensionCount +
                " dimension(s) on the Smart Dimensions layer.") + "\n\n" + OZO.credit());
        previewLayer = null;
        previewGroup = null;
    } catch (error) {
        cleanupPreview();
        alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u179c\u17b6\u179f\u17cb\u1791\u17c6\u17a0\u17c6\u1786\u17d2\u179b\u17b6\u178f\u179c\u17c3\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : SCRIPT_NAME + " failed.") +
            "\n\n" + errorMessage(error));
    }
})();
