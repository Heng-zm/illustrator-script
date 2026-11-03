#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Nesting";
    var unitInputs = [];
    var unitLabels = [];

    if (app.documents.length === 0) {
        alert(OZO.tr("Open a document and select the artwork to nest."));
        return;
    }

    var doc = app.activeDocument;
    var selectionValue = doc.selection;
    if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length < 1) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            doc.selectObjectsOnActiveArtboard();
            selectionValue = doc.selection;
        } else if (confirm(OZO.isKhmer() ?
            "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f Artwork \u1791\u17c1\u17d4 \u178f\u17be\u17a2\u17d2\u1793\u1780\u1785\u1784\u17cb\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u179c\u178f\u17d2\u1790\u1793\u17c4\u179b\u17be Artboard \u1793\u17c1\u17c7\u178a\u17be\u1798\u17d2\u1794\u17b8\u179a\u17c0\u1794\u1785\u17c6 (Nest) \u178a\u17c4\u1799\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u1791\u17c1?" :
            "No artwork is selected. Would you like to select all items on the active artboard to nest automatically?")) {
            doc.selectObjectsOnActiveArtboard();
            selectionValue = doc.selection;
        }
        if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length < 1) {
            if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
                __ozoHeadlessResult = { success: false, message: "No artwork found on active artboard to nest." };
            }
            return;
        }
    }
    // Illustrator's selection is a live host collection. Keep a stable snapshot
    // because previews clear and rebuild the document selection.
    var initialSelection = [];
    for (var selectionIndex = 0; selectionIndex < selectionValue.length; selectionIndex++) {
        initialSelection.push(selectionValue[selectionIndex]);
    }
    var requestedContainerItem = initialSelection[initialSelection.length - 1];

    function errorMessage(error) {
        if (!error) {
            return "Unknown error.";
        }
        return error.message ? error.message : String(error);
    }

    function numberValue(input, label, allowZero) {
        var text = (input && typeof input.text !== "undefined") ? input.text : input;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "").replace(/^\s+|\s+$/g, ""));
        if (!isFinite(value) || value < 0 || (!allowZero && value === 0)) {
            throw new Error(label + " must be " + (allowZero ? "zero or greater." : "greater than zero."));
        }
        var uIdx = (unitList && unitList.selection && typeof unitList.selection.index === "number") ?
            unitList.selection.index : 0;
        return value * pointsPerUnit(uIdx);
    }

    function pointsPerUnit(index) {
        return OZO.toPoints(1, unitAbbreviation(index));
    }

    function unitAbbreviation(index) {
        return index === 1 ? "cm" : (index === 2 ? "m" : "mm");
    }

    function formatUnitValue(value) {
        var rounded = Math.round(value * 10000) / 10000;
        return String(rounded).replace(/\.0+$/, "");
    }

    function copyBounds(value) {
        return [value[0], value[1], value[2], value[3]];
    }

    function widthOf(bounds) {
        return bounds[2] - bounds[0];
    }

    function heightOf(bounds) {
        return bounds[1] - bounds[3];
    }

    function areaOf(bounds) {
        return Math.max(0, widthOf(bounds)) * Math.max(0, heightOf(bounds));
    }

    function validBounds(bounds) {
        return bounds && bounds.length === 4 &&
            isFinite(bounds[0]) && isFinite(bounds[1]) &&
            isFinite(bounds[2]) && isFinite(bounds[3]) &&
            widthOf(bounds) > 0 && heightOf(bounds) > 0;
    }

    function getBounds(item) {
        try {
            var bounds = item.visibleBounds;
            return validBounds(bounds) ? copyBounds(bounds) : null;
        } catch (ignore) {
            return null;
        }
    }

    function containsBounds(outer, inner) {
        return inner[0] >= outer[0] && inner[2] <= outer[2] &&
            inner[1] <= outer[1] && inner[3] >= outer[3];
    }

    function intersects(first, second, gap) {
        var eps = 0.0001;
        return !(first.r + gap <= second.l + eps || second.r + gap <= first.l + eps ||
            first.b - gap >= second.t - eps || second.b - gap >= first.t - eps);
    }

    function polygonArea(points) {
        var sum = 0;
        for (var i = 0; i < points.length; i++) {
            var next = points[(i + 1) % points.length];
            sum += points[i][0] * next[1] - next[0] * points[i][1];
        }
        return Math.abs(sum / 2);
    }

    function cubicPoint(first, firstHandle, secondHandle, second, amount) {
        var inverse = 1 - amount;
        return [
            inverse * inverse * inverse * first[0] + 3 * inverse * inverse * amount * firstHandle[0] +
                3 * inverse * amount * amount * secondHandle[0] + amount * amount * amount * second[0],
            inverse * inverse * inverse * first[1] + 3 * inverse * inverse * amount * firstHandle[1] +
                3 * inverse * amount * amount * secondHandle[1] + amount * amount * amount * second[1]
        ];
    }

    function pathPolygon(path, centerX, centerY) {
        try {
            if (!path.closed || path.pathPoints.length < 3) {
                return null;
            }
            var points = [];
            var count = path.pathPoints.length;
            for (var i = 0; i < count; i++) {
                var current = path.pathPoints[i];
                var next = path.pathPoints[(i + 1) % count];
                var anchor = current.anchor;
                var right = current.rightDirection;
                var left = next.leftDirection;
                var nextAnchor = next.anchor;
                if (i === 0) {
                    points.push([anchor[0] - centerX, anchor[1] - centerY]);
                }
                var curved = Math.abs(right[0] - anchor[0]) > 0.01 ||
                    Math.abs(right[1] - anchor[1]) > 0.01 ||
                    Math.abs(left[0] - nextAnchor[0]) > 0.01 ||
                    Math.abs(left[1] - nextAnchor[1]) > 0.01;
                var steps = curved ? (count > 50 ? 3 : (count > 20 ? 4 : 6)) : 1;
                for (var step = 1; step <= steps; step++) {
                    var point = cubicPoint(anchor, right, left, nextAnchor, step / steps);
                    points.push([point[0] - centerX, point[1] - centerY]);
                }
            }
            points.pop();
            return points.length >= 3 ? points : null;
        } catch (ignorePathGeometry) {
            return null;
        }
    }

    function contourGeometry(item, bounds) {
        var centerX = (bounds[0] + bounds[2]) / 2;
        var centerY = (bounds[1] + bounds[3]) / 2;
        var components = [];
        var complete = true;
        function collect(current) {
            try {
                if (current.typename === "PathItem") {
                    var polygon = pathPolygon(current, centerX, centerY);
                    if (polygon) {
                        components.push({contours: [polygon]});
                    } else {
                        complete = false;
                    }
                } else if (current.typename === "CompoundPathItem") {
                    var contours = [];
                    for (var p = 0; p < current.pathItems.length; p++) {
                        var compoundPolygon = pathPolygon(current.pathItems[p], centerX, centerY);
                        if (compoundPolygon) {
                            contours.push(compoundPolygon);
                        } else {
                            complete = false;
                        }
                    }
                    contours.sort(function (first, second) {
                        return polygonArea(second) - polygonArea(first);
                    });
                    if (contours.length) {
                        components.push({contours: contours});
                    }
                } else if (current.pageItems) {
                    if (current.pageItems.length === 0) {
                        complete = false;
                    }
                    for (var c = 0; c < current.pageItems.length; c++) {
                        collect(current.pageItems[c]);
                    }
                } else {
                    complete = false;
                }
            } catch (ignoreChildGeometry) {
                complete = false;
            }
        }
        collect(item);
        return complete && components.length ? components : null;
    }

    function transformGeometry(geometry, centerX, centerY, angle) {
        if (!geometry) {
            return null;
        }
        var radians = angle * Math.PI / 180;
        var cosine = Math.cos(radians);
        var sine = Math.sin(radians);
        var result = [];
        for (var c = 0; c < geometry.length; c++) {
            var contours = [];
            for (var p = 0; p < geometry[c].contours.length; p++) {
                var source = geometry[c].contours[p];
                var transformed = [];
                for (var i = 0; i < source.length; i++) {
                    transformed.push([centerX + source[i][0] * cosine - source[i][1] * sine,
                        centerY + source[i][0] * sine + source[i][1] * cosine]);
                }
                contours.push(transformed);
            }
            result.push({contours: contours});
        }
        return result;
    }

    function pointInPolygon(point, polygon) {
        if (!point || !polygon || polygon.length < 3) return false;
        var inside = false;
        for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            var first = polygon[i];
            var second = polygon[j];
            if (!first || !second) continue;
            if (((first[1] > point[1]) !== (second[1] > point[1])) &&
                    point[0] < (second[0] - first[0]) * (point[1] - first[1]) /
                    (second[1] - first[1]) + first[0]) {
                inside = !inside;
            }
        }
        return inside;
    }

    function pointInComponent(point, component) {
        if (!point || !component || !component.contours) return false;
        var inside = false;
        for (var i = 0; i < component.contours.length; i++) {
            if (pointInPolygon(point, component.contours[i])) {
                inside = !inside;
            }
        }
        return inside;
    }

    function orientation(first, second, third) {
        return (second[0] - first[0]) * (third[1] - first[1]) -
            (second[1] - first[1]) * (third[0] - first[0]);
    }

    function segmentsCross(a, b, c, d) {
        if (!a || !b || !c || !d) return false;
        var abC = orientation(a, b, c);
        var abD = orientation(a, b, d);
        var cdA = orientation(c, d, a);
        var cdB = orientation(c, d, b);
        return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
            ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
    }

    function pointSegmentDistance(point, first, second) {
        if (!point || !first || !second) return 999999;
        var dx = second[0] - first[0];
        var dy = second[1] - first[1];
        if (dx === 0 && dy === 0) {
            dx = point[0] - first[0];
            dy = point[1] - first[1];
            return Math.sqrt(dx * dx + dy * dy);
        }
        var amount = ((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) /
            (dx * dx + dy * dy);
        amount = Math.max(0, Math.min(1, amount));
        dx = point[0] - (first[0] + amount * dx);
        dy = point[1] - (first[1] + amount * dy);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function polygonEdgesNear(first, second, gap) {
        if (!first || !second || first.length < 2 || second.length < 2) return false;
        for (var i = 0; i < first.length; i++) {
            var firstNext = first[(i + 1) % first.length];
            for (var j = 0; j < second.length; j++) {
                var secondNext = second[(j + 1) % second.length];
                if (segmentsCross(first[i], firstNext, second[j], secondNext) ||
                        (gap > 0 && (pointSegmentDistance(first[i], second[j], secondNext) < gap ||
                        pointSegmentDistance(second[j], first[i], firstNext) < gap))) {
                    return true;
                }
            }
        }
        return false;
    }

    function geometriesIntersect(first, second, gap) {
        if (!first || !second) return false;
        if (!intersects(first, second, gap)) return false;
        if (!first.geometry || !second.geometry) {
            return true;
        }
        for (var a = 0; a < first.geometry.length; a++) {
            for (var b = 0; b < second.geometry.length; b++) {
                var firstComponent = first.geometry[a];
                var secondComponent = second.geometry[b];
                if (!firstComponent || !secondComponent || !firstComponent.contours || !secondComponent.contours) {
                    continue;
                }
                for (var p = 0; p < firstComponent.contours.length; p++) {
                    for (var q = 0; q < secondComponent.contours.length; q++) {
                        if (polygonEdgesNear(firstComponent.contours[p], secondComponent.contours[q], gap)) {
                            return true;
                        }
                    }
                }
                var ptA = (firstComponent.contours[0] && firstComponent.contours[0].length) ?
                    firstComponent.contours[0][0] : null;
                var ptB = (secondComponent.contours[0] && secondComponent.contours[0].length) ?
                    secondComponent.contours[0][0] : null;
                if ((ptA && pointInComponent(ptA, secondComponent)) ||
                    (ptB && pointInComponent(ptB, firstComponent))) {
                    return true;
                }
            }
        }
        return false;
    }

    function geometryPoints(geometry, maximum) {
        var all = [];
        if (!geometry) {
            return all;
        }
        for (var c = 0; c < geometry.length; c++) {
            for (var p = 0; p < geometry[c].contours.length; p++) {
                var contour = geometry[c].contours[p];
                var step = Math.max(1, Math.ceil(contour.length / maximum));
                for (var i = 0; i < contour.length; i += step) {
                    all.push(contour[i]);
                }
            }
        }
        return all;
    }

    function isEffectivelyHidden(item) {
        var current = item;
        while (current && current.typename !== "Document") {
            try {
                if (current.typename === "Layer") {
                    if (!current.visible) {
                        return true;
                    }
                } else if (current.hidden) {
                    return true;
                }
                current = current.parent;
            } catch (ignore) {
                break;
            }
        }
        return false;
    }

    function isEffectivelyLocked(item) {
        var current = item;
        while (current && current.typename !== "Document") {
            try {
                if (current.locked) {
                    return true;
                }
                current = current.parent;
            } catch (ignore) {
                break;
            }
        }
        return false;
    }

    function sameItem(first, second) {
        try {
            return first === second;
        } catch (ignore) {
            return false;
        }
    }

    function addInput(parent, label, value) {
        var group = parent.add("group");
        group.add("statictext", undefined, label).preferredSize.width = 76;
        var input = group.add("edittext", undefined, value);
        input.characters = 7;
        var unitLabel = group.add("statictext", undefined, "mm");
        unitInputs.push(input);
        unitLabels.push(unitLabel);
        return input;
    }

    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("Nesting"), "v2.2 \u2022 True-Shape Sheet Optimization");

    var topGroup = dialog.add("group");
    topGroup.alignChildren = ["fill", "top"];

    var sheetPanel = topGroup.add("panel", undefined, OZO.tr("Sheets / Containers"));
    sheetPanel.orientation = "column";
    sheetPanel.alignChildren = ["fill", "top"];
    sheetPanel.margins = [12, 18, 12, 10];

    var containerList = sheetPanel.add(
        "dropdownlist",
        undefined,
        [OZO.tr("Active artboard"), OZO.tr("All artboards"), OZO.tr("Last selected object")]
    );
    containerList.selection = 0;
    var unitGroup = sheetPanel.add("group");
    unitGroup.add("statictext", undefined, OZO.tr("Units"));
    var unitList = unitGroup.add(
        "dropdownlist",
        undefined,
        ["Millimeters (mm)", "Centimeters (cm)", "Meters (m)"]
    );
    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "m") defaultUnitIdx = 2;
    unitList.selection = defaultUnitIdx;
    var customSizeCheck = sheetPanel.add("checkbox", undefined, "Use custom active sheet size");
    var sizeGroup = sheetPanel.add("group");
    var widthInput = addInput(sizeGroup, "Width", "600");
    var heightInput = addInput(sizeGroup, "Height", "400");
    widthInput.parent.orientation = "row";
    heightInput.parent.orientation = "row";
    var resizeArtboardCheck = sheetPanel.add("checkbox", undefined, "Resize active artboard on Apply");
    resizeArtboardCheck.value = true;

    var marginPanel = topGroup.add("panel", undefined, "Margins");
    marginPanel.orientation = "column";
    marginPanel.alignChildren = ["fill", "top"];
    marginPanel.margins = [12, 18, 12, 10];
    var leftInput = addInput(marginPanel, "Left", "0");
    var rightInput = addInput(marginPanel, "Right", "0");
    var topInput = addInput(marginPanel, "Top", "0");
    var bottomInput = addInput(marginPanel, "Bottom", "0");

    var settingsGroup = dialog.add("group");
    settingsGroup.alignChildren = ["fill", "top"];

    var placementPanel = settingsGroup.add("panel", undefined, "Placement");
    placementPanel.orientation = "column";
    placementPanel.alignChildren = ["fill", "top"];
    placementPanel.margins = [12, 18, 12, 10];
    var spacingInput = addInput(placementPanel, "Min. distance", "2");
    var edgeInput = addInput(placementPanel, "Edge padding", "2");
    var allowInsideCheck = placementPanel.add("checkbox", undefined, "Allow inside compound-path holes");
    allowInsideCheck.value = true;
    var fixedCheck = placementPanel.add("checkbox", undefined, "Respect locked artwork as fixed obstacles");
    fixedCheck.value = true;

    var optimizePanel = settingsGroup.add("panel", undefined, "Optimization");
    optimizePanel.orientation = "column";
    optimizePanel.alignChildren = ["fill", "top"];
    optimizePanel.margins = [12, 18, 12, 10];
    optimizePanel.add("statictext", undefined, "Divide / ordering");
    var divideList = optimizePanel.add(
        "dropdownlist",
        undefined,
        [
            "No division",
            "Color - grouped",
            "Layer - grouped",
            "Color - separate sheets",
            "Layer - separate sheets"
        ]
    );
    divideList.selection = 0;
    optimizePanel.add("statictext", undefined, "Approximation quality");
    var qualityList = optimizePanel.add(
        "dropdownlist",
        undefined,
        ["Auto", "High", "Middle", "Low"]
    );
    qualityList.selection = 0;
    optimizePanel.add("statictext", undefined, "Rotation");
    var rotationList = optimizePanel.add(
        "dropdownlist",
        undefined,
        ["Free (15 degree steps)", "90 degree steps", "180 degree steps", "Do not rotate"]
    );
    rotationList.selection = 1;
    var bestCheck = optimizePanel.add("checkbox", undefined, "Search best result");
    bestCheck.value = true;
    var autoMultiSheetCheck = optimizePanel.add(
        "checkbox",
        undefined,
        "Auto-create additional sheets for unplaced items"
    );
    autoMultiSheetCheck.value = true;

    var note = dialog.add(
        "statictext",
        undefined,
        "Source paths must be free of self-intersections. Locked objects stay fixed. Use [NR] or [90] in an object name for rotation overrides.",
        {multiline: true}
    );
    note.preferredSize = [530, 34];

    var screenPreview = dialog.add("panel", undefined, "Screen Preview");
    screenPreview.preferredSize = [530, 190];
    screenPreview.minimumSize = [530, 190];
    var previewModel = null;
    screenPreview.onDraw = function () {
        try {
            drawScreenPreview(this);
        } catch (ignoreDraw) {}
    };

    var statusText = dialog.add("statictext", undefined, "Ready to preview.");
    statusText.preferredSize.width = 530;

    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var previewButton = buttons.add("button", undefined, OZO.tr("Update Preview"));
    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    var applyButton = buttons.add("button", undefined, OZO.tr("Apply"), {name: "ok"});

    OZO.addLanguageSelector(dialog);

    function updateSheetControls() {
        var cIdx = (containerList.selection && typeof containerList.selection.index === "number") ?
            containerList.selection.index : 0;
        var artboardMode = cIdx < 2;
        customSizeCheck.enabled = artboardMode && cIdx === 0;
        var custom = customSizeCheck.enabled && customSizeCheck.value;
        widthInput.enabled = custom;
        heightInput.enabled = custom;
        resizeArtboardCheck.enabled = custom;
    }
    var restoringState = true;
    var previousUnitIndex = 0;
    function updateUnits() {
        if (restoringState) return;
        var newIndex = (unitList.selection && typeof unitList.selection.index === "number") ?
            unitList.selection.index : 0;
        var oldFactor = pointsPerUnit(previousUnitIndex);
        var newFactor = pointsPerUnit(newIndex);
        for (var i = 0; i < unitInputs.length; i++) {
            var normalized = String(unitInputs[i].text)
                .replace(/,/g, ".")
                .replace(/^\s+|\s+$/g, "");
            var value = Number(normalized);
            if (normalized !== "" && isFinite(value)) {
                unitInputs[i].text = formatUnitValue(value * oldFactor / newFactor);
            }
            unitLabels[i].text = unitAbbreviation(newIndex);
        }
        previousUnitIndex = newIndex;
    }
    containerList.onChange = updateSheetControls;
    customSizeCheck.onClick = updateSheetControls;
    unitList.onChange = updateUnits;
    OZO.restoreWindowState(dialog, "nesting");
    previousUnitIndex = (unitList.selection && typeof unitList.selection.index === "number") ?
        unitList.selection.index : 0;
    restoringState = false;
    for (var restoredLabelIndex = 0; restoredLabelIndex < unitLabels.length; restoredLabelIndex++) {
        unitLabels[restoredLabelIndex].text = unitAbbreviation(previousUnitIndex);
    }
    updateSheetControls();
    OZO.translateWindow(dialog, OZO.getLanguage());

    var itemStates = [];
    for (var stateIndex = 0; stateIndex < initialSelection.length; stateIndex++) {
        var stateItem = initialSelection[stateIndex];
        var stateBounds = getBounds(stateItem);
        if (!stateBounds || isEffectivelyHidden(stateItem) || isEffectivelyLocked(stateItem)) {
            continue;
        }
        try {
            itemStates.push({
                id: stateIndex + 1,
                item: stateItem,
                originalPosition: [stateItem.position[0], stateItem.position[1]],
                bounds: stateBounds,
                width: widthOf(stateBounds),
                height: heightOf(stateBounds),
                geometry: contourGeometry(stateItem, stateBounds),
                appliedAngle: 0
            });
        } catch (ignoreUnsupportedItem) {}
    }

    if (itemStates.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { success: false, message: "The selection has no visible, unlocked artwork with measurable bounds." };
            return;
        }
        alert(OZO.isKhmer() ? "\u1787\u1798\u17d2\u179a\u17be\u179f\u1798\u17b7\u1793\u1798\u17b6\u1793\u1782\u17c6\u1793\u17bc\u179a\u178a\u17c2\u179b\u1798\u17be\u179b\u1783\u17be\u1789 \u1798\u17b7\u1793\u1785\u17b6\u1780\u17cb\u179f\u17c4 \u1793\u17b7\u1784\u17a2\u17b6\u1785\u179c\u17b6\u179f\u17cb\u1794\u17b6\u1793\u1791\u17c1\u17d4" :
            "The selection has no visible, unlocked artwork with measurable bounds.");
        return;
    }

    function restoreItems() {
        for (var i = 0; i < itemStates.length; i++) {
            var state = itemStates[i];
            try {
                if (state.appliedAngle !== 0) {
                    state.item.rotate(-state.appliedAngle);
                }
                state.item.position = [state.originalPosition[0], state.originalPosition[1]];
                state.appliedAngle = 0;
            } catch (ignore) {}
        }
        try {
            doc.selection = null;
            for (var selectionIndex = 0; selectionIndex < initialSelection.length; selectionIndex++) {
                initialSelection[selectionIndex].selected = true;
            }
        } catch (ignoreSelectionError) {}
        app.redraw();
    }

    function colorKey(item) {
        function key(color) {
            if (!color || !color.typename || color.typename === "NoColor") {
                return "none";
            }
            var values = [color.typename];
            var names = ["cyan", "magenta", "yellow", "black", "red", "green", "blue", "gray", "spot"];
            for (var n = 0; n < names.length; n++) {
                try {
                    if (names[n] === "spot") {
                        values.push(color.spot.name);
                    } else if (color[names[n]] !== undefined) {
                        values.push(Math.round(color[names[n]] * 100) / 100);
                    }
                } catch (ignore) {}
            }
            return values.join(":");
        }

        try {
            if (item.typename === "PathItem") {
                return item.filled ? key(item.fillColor) : key(item.strokeColor);
            }
            if (item.typename === "CompoundPathItem" && item.pathItems.length > 0) {
                return colorKey(item.pathItems[0]);
            }
            if (item.pageItems && item.pageItems.length > 0) {
                return colorKey(item.pageItems[0]);
            }
        } catch (ignoreItem) {}
        return "none";
    }

    function holeRatios(item, outerBounds) {
        var holes = [];
        if (item.typename !== "CompoundPathItem" || item.pathItems.length < 2) {
            return holes;
        }

        var largestIndex = 0;
        var largestArea = -1;
        var pathBounds = [];
        var polygons = [];
        var centerX = (outerBounds[0] + outerBounds[2]) / 2;
        var centerY = (outerBounds[1] + outerBounds[3]) / 2;
        for (var i = 0; i < item.pathItems.length; i++) {
            var bounds = getBounds(item.pathItems[i]);
            pathBounds.push(bounds);
            polygons.push(pathPolygon(item.pathItems[i], centerX, centerY));
            if (bounds && areaOf(bounds) > largestArea) {
                largestArea = areaOf(bounds);
                largestIndex = i;
            }
        }

        for (i = 0; i < pathBounds.length; i++) {
            var hole = pathBounds[i];
            if (i === largestIndex || !hole || !polygons[i] || !containsBounds(outerBounds, hole)) {
                continue;
            }
            holes.push({
                contour: polygons[i]
            });
        }
        return holes;
    }

    for (stateIndex = 0; stateIndex < itemStates.length; stateIndex++) {
        itemStates[stateIndex].color = colorKey(itemStates[stateIndex].item);
        try {
            itemStates[stateIndex].layer = itemStates[stateIndex].item.layer.name;
        } catch (ignoreLayer) {
            itemStates[stateIndex].layer = "Layer";
        }
        itemStates[stateIndex].holes = holeRatios(
            itemStates[stateIndex].item,
            itemStates[stateIndex].bounds
        );
    }

    function readSettings() {
        var activeIndex = doc.artboards.getActiveArtboardIndex();
        var activeBounds = doc.artboards[activeIndex].artboardRect;
        var custom = customSizeCheck.enabled && customSizeCheck.value;
        var sMode = (containerList.selection && typeof containerList.selection.index === "number") ?
            containerList.selection.index : 0;
        var sDivide = (divideList.selection && typeof divideList.selection.index === "number") ?
            divideList.selection.index : 0;
        var sQuality = (qualityList.selection && typeof qualityList.selection.index === "number") ?
            qualityList.selection.index : 0;
        var sRotation = (rotationList.selection && typeof rotationList.selection.index === "number") ?
            rotationList.selection.index : 0;

        return {
            mode: sMode,
            custom: custom,
            width: custom ? numberValue(widthInput, "Sheet width", false) : widthOf(activeBounds),
            height: custom ? numberValue(heightInput, "Sheet height", false) : heightOf(activeBounds),
            resizeArtboard: resizeArtboardCheck.value,
            left: numberValue(leftInput, "Left margin", true),
            right: numberValue(rightInput, "Right margin", true),
            top: numberValue(topInput, "Top margin", true),
            bottom: numberValue(bottomInput, "Bottom margin", true),
            spacing: numberValue(spacingInput, "Minimal distance", true),
            edge: numberValue(edgeInput, "Edge padding", true),
            allowInside: allowInsideCheck.value,
            fixed: fixedCheck.value,
            divide: sDivide,
            quality: sQuality,
            rotation: sRotation,
            best: bestCheck.value,
            autoMultiSheet: autoMultiSheetCheck.value
        };
    }

    function selectedContainer(settings) {
        if (settings.mode !== 2) {
            return null;
        }
        for (var i = 0; i < itemStates.length; i++) {
            if (sameItem(itemStates[i].item, requestedContainerItem)) {
                return itemStates[i];
            }
        }
        return null;
    }

    function buildContainers(settings) {
        var raw = [];
        var activeIndex = doc.artboards.getActiveArtboardIndex();
        var activeBounds = copyBounds(doc.artboards[activeIndex].artboardRect);
        var i;

        if (settings.mode === 2) {
            var containerState = selectedContainer(settings);
            if (!containerState) {
                throw new Error("Select a container as the last selected object.");
            }
            raw.push(copyBounds(containerState.bounds));
        } else if (settings.mode === 1) {
            for (i = 0; i < doc.artboards.length; i++) {
                raw.push(copyBounds(doc.artboards[i].artboardRect));
            }
        } else if (settings.custom) {
            raw.push([
                activeBounds[0],
                activeBounds[1],
                activeBounds[0] + settings.width,
                activeBounds[1] - settings.height
            ]);
        } else {
            raw.push(activeBounds);
        }

        var bins = [];
        for (i = 0; i < raw.length; i++) {
            var bounds = raw[i];
            var left = bounds[0] + settings.left + settings.edge;
            var top = bounds[1] - settings.top - settings.edge;
            var right = bounds[2] - settings.right - settings.edge;
            var bottom = bounds[3] + settings.bottom + settings.edge;
            if (right <= left || top <= bottom) {
                throw new Error("Margins and edge padding leave no usable sheet area.");
            }
            bins.push({
                l: left,
                t: top,
                r: right,
                b: bottom,
                base: bounds,
                placed: [],
                ownerId: 0,
                sheetIndex: i
            });
        }
        return bins;
    }

    function sourceDescriptors(settings) {
        var containerState = selectedContainer(settings);
        var result = [];
        for (var i = 0; i < itemStates.length; i++) {
            if (containerState && sameItem(itemStates[i].item, containerState.item)) {
                continue;
            }
            var state = itemStates[i];
            result.push({
                id: state.id,
                state: state,
                width: state.width,
                height: state.height,
                area: state.width * state.height,
                color: state.color,
                layer: state.layer,
                geometry: state.geometry,
                holes: state.holes
            });
        }
        if (result.length === 0) {
            throw new Error("The selected container leaves no source artwork to nest.");
        }
        return result;
    }

    function rectFromBounds(bounds, id) {
        return {l: bounds[0], t: bounds[1], r: bounds[2], b: bounds[3], id: id || -1};
    }

    function contourBounds(contour) {
        var bounds = [contour[0][0], contour[0][1], contour[0][0], contour[0][1]];
        for (var i = 1; i < contour.length; i++) {
            bounds[0] = Math.min(bounds[0], contour[i][0]);
            bounds[1] = Math.max(bounds[1], contour[i][1]);
            bounds[2] = Math.max(bounds[2], contour[i][0]);
            bounds[3] = Math.min(bounds[3], contour[i][1]);
        }
        return bounds;
    }

    function pushUniqueObstacle(out, item) {
        for (var index = 0; index < out.length; index++) {
            if (sameItem(out[index], item)) return;
        }
        out.push(item);
    }

    function collectLockedObstacles(container, sources, out, ancestorIsSource) {
        var items;
        try { items = container.pageItems; } catch (ignoreItems) { return; }
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var isSource = ancestorIsSource;
            if (!isSource) {
                for (var s = 0; s < sources.length; s++) {
                    if (sameItem(item, sources[s].state.item)) {
                        isSource = true;
                        break;
                    }
                }
            }
            if (!isSource && isEffectivelyLocked(item) && !isEffectivelyHidden(item)) {
                pushUniqueObstacle(out, item);
                continue;
            }
            var typeName = "";
            try { typeName = item.typename; } catch (ignoreType) {}
            if (typeName === "GroupItem") {
                collectLockedObstacles(item, sources, out, isSource);
            }
        }
    }

    function addFixedObstacles(bins, settings, sources) {
        if (!settings.fixed) {
            return 0;
        }
        var obstacles = [];
        collectLockedObstacles(doc, sources, obstacles, false);
        var count = 0;
        for (var i = 0; i < obstacles.length; i++) {
            var item = obstacles[i];
            var bounds = getBounds(item);
            if (!bounds) {
                continue;
            }
            var fixedRect = rectFromBounds(bounds, -(i + 1));
            fixedRect.geometry = transformGeometry(
                contourGeometry(item, bounds),
                (bounds[0] + bounds[2]) / 2,
                (bounds[1] + bounds[3]) / 2,
                0
            );
            for (var b = 0; b < bins.length; b++) {
                if (containsBounds(bins[b].base, bounds)) {
                    bins[b].placed.push(fixedRect);
                    count++;
                    break;
                }
            }
        }
        return count;
    }

    function angleChoices(descriptor, settings) {
        var name = "";
        try {
            name = descriptor.state.item.name || "";
        } catch (ignore) {}
        if (/\[NR\]/i.test(name) || settings.rotation === 3) {
            return [0];
        }
        if (/\[90\]/i.test(name) || settings.rotation === 1) {
            return [0, 90];
        }
        if (settings.rotation === 2) {
            return [0, 180];
        }

        var step = 15;
        if (settings.quality === 1) {
            step = 5;
        } else if (settings.quality === 2) {
            step = 15;
        } else if (settings.quality === 3) {
            step = 45;
        } else if (itemStates.length > 60) {
            step = 45;
        }

        var result = [];
        for (var angle = 0; angle < 180; angle += step) {
            result.push(angle);
        }
        return result;
    }

    function rotatedSize(descriptor, angle) {
        if (!descriptor._rotatedSizeCache) {
            descriptor._rotatedSizeCache = {};
        }
        var cacheKey = String(angle);
        if (descriptor._rotatedSizeCache.hasOwnProperty(cacheKey)) {
            return descriptor._rotatedSizeCache[cacheKey];
        }
        var radians = angle * Math.PI / 180;
        var cosine = Math.abs(Math.cos(radians));
        var sine = Math.abs(Math.sin(radians));
        descriptor._rotatedSizeCache[cacheKey] = {
            width: descriptor.width * cosine + descriptor.height * sine,
            height: descriptor.width * sine + descriptor.height * cosine
        };
        return descriptor._rotatedSizeCache[cacheKey];
    }

    function descriptorSamplePoints(descriptor, angle, maximum) {
        if (!descriptor._samplePointsCache) {
            descriptor._samplePointsCache = {};
        }
        var cacheKey = String(angle) + ":" + String(maximum);
        if (!descriptor._samplePointsCache.hasOwnProperty(cacheKey)) {
            descriptor._samplePointsCache[cacheKey] = geometryPoints(
                transformGeometry(descriptor.geometry, 0, 0, angle), maximum
            );
        }
        return descriptor._samplePointsCache[cacheKey];
    }

    function placedSamplePoints(rect, maximum) {
        if (!rect._samplePointsCache) {
            rect._samplePointsCache = {};
        }
        var cacheKey = String(maximum);
        if (!rect._samplePointsCache.hasOwnProperty(cacheKey)) {
            rect._samplePointsCache[cacheKey] = geometryPoints(rect.geometry, maximum);
        }
        return rect._samplePointsCache[cacheKey];
    }

    function cloneBins(source) {
        var result = [];
        for (var i = 0; i < source.length; i++) {
            var placed = [];
            for (var p = 0; p < source[i].placed.length; p++) {
                var rect = source[i].placed[p];
                placed.push({l: rect.l, t: rect.t, r: rect.r, b: rect.b,
                    id: rect.id, geometry: rect.geometry});
            }
            result.push({
                l: source[i].l,
                t: source[i].t,
                r: source[i].r,
                b: source[i].b,
                base: source[i].base,
                placed: placed,
                ownerId: 0,
                boundary: source[i].boundary || null,
                boundaryGap: source[i].boundaryGap || 0,
                generated: !!source[i].generated,
                sheetIndex: source[i].sheetIndex
            });
        }
        return result;
    }

    function groupKey(descriptor, divideMode) {
        if (divideMode === 1 || divideMode === 3) {
            return descriptor.color;
        }
        if (divideMode === 2 || divideMode === 4) {
            return descriptor.layer;
        }
        return "";
    }

    function orderedSources(sources, settings, trial) {
        var result = sources.slice(0);
        result.sort(function (first, second) {
            var firstKey = groupKey(first, settings.divide);
            var secondKey = groupKey(second, settings.divide);
            if (firstKey < secondKey) {
                return -1;
            }
            if (firstKey > secondKey) {
                return 1;
            }
            if (trial === 0) {
                return second.area - first.area;
            }
            var firstNoise = (first.id * 9301 + trial * 49297) % 233280;
            var secondNoise = (second.id * 9301 + trial * 49297) % 233280;
            return firstNoise - secondNoise;
        });
        return result;
    }

    function fitsCandidate(rect, bin, spacing) {
        var eps = 0.0001;
        if (rect.l < bin.l - eps || rect.r > bin.r + eps || rect.t > bin.t + eps || rect.b < bin.b - eps) {
            return false;
        }
        if (bin.boundary) {
            var candidateContours = [];
            if (rect.geometry) {
                for (var componentIndex = 0; componentIndex < rect.geometry.length; componentIndex++) {
                    candidateContours.push(rect.geometry[componentIndex].contours[0]);
                }
            } else {
                candidateContours.push([[rect.l, rect.t], [rect.r, rect.t],
                    [rect.r, rect.b], [rect.l, rect.b]]);
            }
            for (var contourIndex = 0; contourIndex < candidateContours.length; contourIndex++) {
                var contour = candidateContours[contourIndex];
                for (var pointIndex = 0; pointIndex < contour.length; pointIndex++) {
                    if (!pointInPolygon(contour[pointIndex], bin.boundary)) {
                        return false;
                    }
                }
                if (polygonEdgesNear(contour, bin.boundary, bin.boundaryGap)) {
                    return false;
                }
            }
        }
        for (var i = 0; i < bin.placed.length; i++) {
            if (bin.ownerId && bin.placed[i].id === bin.ownerId) {
                continue;
            }
            if (intersects(rect, bin.placed[i], spacing) &&
                    geometriesIntersect(rect, bin.placed[i], spacing)) {
                return false;
            }
        }
        return true;
    }

    function placeOne(descriptor, bins, settings) {
        var best = null;
        var angles = angleChoices(descriptor, settings);
        var candidateLimit = settings.quality === 1 ? 1200 :
            (settings.quality === 2 ? 500 : 220);

        for (var b = 0; b < bins.length; b++) {
            var bin = bins[b];
            var binArea = (bin.r - bin.l) * (bin.t - bin.b);
            var baseXs = [bin.l];
            var baseYs = [bin.t];
            for (var p = 0; p < bin.placed.length; p++) {
                baseXs.push(bin.placed[p].r + settings.spacing);
                baseYs.push(bin.placed[p].b - settings.spacing);
            }

            for (var a = 0; a < angles.length; a++) {
                // Apply the quality limit to each angle. A shared counter caused
                // dense jobs to exhaust the budget at 0 degrees and skip rotation.
                var tested = 0;
                var size = rotatedSize(descriptor, angles[a]);
                var xs = baseXs.slice(0);
                var ys = baseYs.slice(0);
                var paired = [];
                var sampleLimit = settings.quality === 1 ? 18 : 10;
                var localPoints = descriptorSamplePoints(descriptor, angles[a], sampleLimit);
                for (p = 0; p < bin.placed.length && localPoints.length; p++) {
                    var obstaclePoints = placedSamplePoints(bin.placed[p], sampleLimit);
                    for (var obstacleIndex = 0; obstacleIndex < obstaclePoints.length; obstacleIndex++) {
                        for (var localIndex = 0; localIndex < localPoints.length; localIndex++) {
                            var alignedX = obstaclePoints[obstacleIndex][0] -
                                localPoints[localIndex][0] - size.width / 2;
                            var alignedY = obstaclePoints[obstacleIndex][1] -
                                localPoints[localIndex][1] + size.height / 2;
                            xs.push(alignedX + settings.spacing);
                            xs.push(alignedX - settings.spacing);
                            ys.push(alignedY + settings.spacing);
                            ys.push(alignedY - settings.spacing);
                            paired.push([alignedX + settings.spacing, alignedY + settings.spacing]);
                            paired.push([alignedX + settings.spacing, alignedY - settings.spacing]);
                            paired.push([alignedX - settings.spacing, alignedY + settings.spacing]);
                            paired.push([alignedX - settings.spacing, alignedY - settings.spacing]);
                        }
                    }
                }

                function considerCandidate(candidateLeft, candidateTop) {
                    // Score only depends on the candidate rect and the bin, so
                    // skip the geometry transform and collision tests when this
                    // position cannot beat the current best.
                    var score = bin.sheetIndex * 1e12 + binArea * 1000 +
                        (bin.t - candidateTop) * (bin.r - bin.l) + (candidateLeft - bin.l);
                    if (best && score >= best.score) {
                        return;
                    }
                    var rect = {
                        l: candidateLeft,
                        t: candidateTop,
                        r: candidateLeft + size.width,
                        b: candidateTop - size.height,
                        id: descriptor.id
                    };
                    rect.geometry = transformGeometry(descriptor.geometry,
                        (rect.l + rect.r) / 2, (rect.t + rect.b) / 2, angles[a]);
                    if (!fitsCandidate(rect, bin, settings.spacing)) {
                        return;
                    }
                    best = {score: score, rect: rect, angle: angles[a], bin: bin};
                }

                var pairedLimit = Math.floor(candidateLimit * 0.65);
                for (var pairIndex = 0; pairIndex < paired.length &&
                        tested < pairedLimit; pairIndex++) {
                    tested++;
                    considerCandidate(paired[pairIndex][0], paired[pairIndex][1]);
                }
                for (var y = 0; y < ys.length && tested < candidateLimit; y++) {
                    for (var x = 0; x < xs.length && tested < candidateLimit; x++) {
                        tested++;
                        considerCandidate(xs[x], ys[y]);
                    }
                }
            }
        }

        if (best) {
            best.bin.placed.push(best.rect);
        }
        return best;
    }

    function addHoleBins(descriptor, placement, bins, settings) {
        if (!settings.allowInside || descriptor.holes.length === 0) {
            return;
        }
        var centerX = (placement.rect.l + placement.rect.r) / 2;
        var centerY = (placement.rect.t + placement.rect.b) / 2;

        for (var i = 0; i < descriptor.holes.length; i++) {
            var hole = descriptor.holes[i];
            var transformed = transformGeometry(
                [{contours: [hole.contour]}], centerX, centerY, placement.angle
            )[0].contours[0];
            var holeBounds = contourBounds(transformed);
            var left = holeBounds[0] + settings.edge;
            var top = holeBounds[1] - settings.edge;
            var right = holeBounds[2] - settings.edge;
            var bottom = holeBounds[3] + settings.edge;
            if (right <= left || top <= bottom) {
                continue;
            }
            bins.push({
                l: left,
                t: top,
                r: right,
                b: bottom,
                base: placement.bin.base,
                placed: placement.bin.placed,
                ownerId: descriptor.id,
                boundary: transformed,
                boundaryGap: settings.edge,
                sheetIndex: placement.bin.sheetIndex
            });
        }
    }

    function packSequence(order, bins, settings) {
        var plan = [];
        var unplaced = [];
        var totalScore = 0;

        for (var i = 0; i < order.length; i++) {
            var placement = placeOne(order[i], bins, settings);
            if (!placement) {
                unplaced.push(order[i]);
                continue;
            }
            placement.descriptor = order[i];
            plan.push(placement);
            totalScore += placement.score;
            addHoleBins(order[i], placement, bins, settings);
        }
        return {plan: plan, unplaced: unplaced, score: totalScore, bins: bins};
    }

    function addSeparatedSheet(bins, template, settings) {
        var sheetNumber = bins.length;
        var rightmost = template.base[2];
        for (var existingIndex = 0; existingIndex < bins.length; existingIndex++) {
            if (!bins[existingIndex].ownerId) {
                rightmost = Math.max(rightmost, bins[existingIndex].base[2]);
            }
        }
        var offset = rightmost + Math.max(36, settings.spacing + settings.edge * 2) -
            template.base[0];
        var base = [template.base[0] + offset, template.base[1],
            template.base[2] + offset, template.base[3]];
        bins.push({
            l: template.l + offset,
            t: template.t,
            r: template.r + offset,
            b: template.b,
            base: base,
            placed: [],
            ownerId: 0,
            boundary: null,
            boundaryGap: 0,
            generated: true,
            sheetIndex: sheetNumber
        });
    }

    function runTrial(sources, baseBins, settings, trial) {
        var order = orderedSources(sources, settings, trial);
        var bins = cloneBins(baseBins);
        var separate = settings.divide === 3 || settings.divide === 4;
        if (!separate) {
            return packSequence(order, bins, settings);
        }

        var groups = [];
        var groupNames = [];
        for (var i = 0; i < order.length; i++) {
            var key = groupKey(order[i], settings.divide);
            var groupIndex = -1;
            for (var g = 0; g < groupNames.length; g++) {
                if (groupNames[g] === key) {
                    groupIndex = g;
                    break;
                }
            }
            if (groupIndex < 0) {
                groupNames.push(key);
                groups.push([]);
                groupIndex = groups.length - 1;
            }
            groups[groupIndex].push(order[i]);
        }

        while (bins.length < groups.length) {
            addSeparatedSheet(bins, bins[0], settings);
        }

        var combined = {plan: [], unplaced: [], score: 0, bins: bins};
        for (g = 0; g < groups.length; g++) {
            // Remember which group owns this sheet so overflow objects never
            // land on another group's sheet.
            bins[g].groupKey = groupNames[g];
            var groupBins = [bins[g]];
            var groupResult = packSequence(groups[g], groupBins, settings);
            combined.plan = combined.plan.concat(groupResult.plan);
            combined.unplaced = combined.unplaced.concat(groupResult.unplaced);
            combined.score += groupResult.score;
        }
        return combined;
    }

    function findBestPlan(sources, bins, settings) {
        var trials = 1;
        if (settings.best) {
            trials = settings.quality === 1 ? 18 :
                (settings.quality === 2 ? 10 : (settings.quality === 3 ? 4 : 8));
        }
        var best = null;
        for (var trial = 0; trial < trials; trial++) {
            var result = runTrial(sources, bins, settings, trial);
            if (!best || result.plan.length > best.plan.length ||
                    (result.plan.length === best.plan.length && result.score < best.score)) {
                best = result;
            }
        }

        // Allocate additional sheets for unplaced items. Leftovers are first
        // retried in the existing bins because later placements may have opened
        // hole pockets that were unavailable when they were first packed. In
        // separate-sheet modes a leftover may only use sheets reserved for its
        // own color/layer group.
        if (best && settings.autoMultiSheet && best.unplaced.length > 0 &&
                best.bins && best.bins.length > 0) {
            var maxAdditionalSheets = 30;
            var sheetsAdded = 0;
            var separateSheets = settings.divide === 3 || settings.divide === 4;

            // Partition leftovers by group, preserving first-seen order.
            var groupsLeft = [];
            for (var leftoverIndex = 0; leftoverIndex < best.unplaced.length; leftoverIndex++) {
                var leftover = best.unplaced[leftoverIndex];
                var leftoverKey = separateSheets ? groupKey(leftover, settings.divide) : "";
                var groupSlot = null;
                for (var slotIndex = 0; slotIndex < groupsLeft.length; slotIndex++) {
                    if (groupsLeft[slotIndex].key === leftoverKey) {
                        groupSlot = groupsLeft[slotIndex];
                        break;
                    }
                }
                if (!groupSlot) {
                    groupSlot = {key: leftoverKey, items: []};
                    groupsLeft.push(groupSlot);
                }
                groupSlot.items.push(leftover);
            }

            var unplacedFinal = [];
            for (var groupIndex = 0; groupIndex < groupsLeft.length; groupIndex++) {
                var queue = groupsLeft[groupIndex].items;
                var queueKey = groupsLeft[groupIndex].key;

                var remaining = [];
                for (var u = 0; u < queue.length; u++) {
                    var allowed = [];
                    for (var binIndex = 0; binIndex < best.bins.length; binIndex++) {
                        if (!separateSheets || best.bins[binIndex].groupKey === queueKey) {
                            allowed.push(best.bins[binIndex]);
                        }
                    }
                    var placement = placeOne(queue[u], allowed, settings);
                    if (!placement) {
                        remaining.push(queue[u]);
                        continue;
                    }
                    placement.descriptor = queue[u];
                    best.plan.push(placement);
                    best.score += placement.score;
                    var holeStart = best.bins.length;
                    addHoleBins(queue[u], placement, best.bins, settings);
                    for (; holeStart < best.bins.length; holeStart++) {
                        best.bins[holeStart].groupKey = queueKey;
                    }
                }

                while (remaining.length > 0 && sheetsAdded < maxAdditionalSheets) {
                    addSeparatedSheet(best.bins, best.bins[0], settings);
                    sheetsAdded++;
                    var newBin = best.bins[best.bins.length - 1];
                    newBin.groupKey = queueKey;
                    var stillNeeded = [];
                    var placedOnSheet = 0;
                    for (u = 0; u < remaining.length; u++) {
                        placement = placeOne(remaining[u], [newBin], settings);
                        if (!placement) {
                            stillNeeded.push(remaining[u]);
                            continue;
                        }
                        placement.descriptor = remaining[u];
                        best.plan.push(placement);
                        best.score += placement.score;
                        addHoleBins(remaining[u], placement, [newBin], settings);
                        placedOnSheet++;
                    }
                    remaining = stillNeeded;
                    if (placedOnSheet === 0) {
                        // Nothing fit on the new sheet, so drop it instead of
                        // leaving an empty generated artboard behind.
                        best.bins.pop();
                        break;
                    }
                }

                for (u = 0; u < remaining.length; u++) {
                    unplacedFinal.push(remaining[u]);
                }
            }
            best.unplaced = unplacedFinal;
        }

        // Drop generated sheets that received nothing (for example a divide
        // group whose objects were all unplaceable) so they neither become
        // empty artboards nor inflate the reported sheet count.
        var usedBins = [];
        for (var binIndex = 0; binIndex < best.bins.length; binIndex++) {
            var usedBin = best.bins[binIndex];
            if (usedBin.generated && !usedBin.ownerId && usedBin.placed.length === 0) {
                continue;
            }
            usedBins.push(usedBin);
        }
        best.bins = usedBins;

        return best;
    }

    function applyPlan(plan) {
        doc.selection = null;
        for (var i = 0; i < plan.length; i++) {
            var placement = plan[i];
            var state = placement.descriptor.state;
            if (placement.angle !== 0) {
                state.item.rotate(placement.angle);
                state.appliedAngle = placement.angle;
            }
            var current = getBounds(state.item);
            if (!current) {
                throw new Error("Could not read bounds after rotating an object.");
            }
            state.item.translate(
                placement.rect.l - current[0],
                placement.rect.t - current[1]
            );
            state.item.selected = true;
        }
        app.redraw();
    }

    function previewPath(graphics, left, top, right, bottom) {
        graphics.newPath();
        graphics.moveTo(left, top);
        graphics.lineTo(right, top);
        graphics.lineTo(right, bottom);
        graphics.lineTo(left, bottom);
        graphics.closePath();
    }

    function drawScreenPreview(control) {
        try {
            if (!control || !control.graphics) return;
            var graphics = control.graphics;
            try {
                graphics.drawOSControl();
            } catch (ignoreBackground) {}

            var controlWidth = 530;
            var controlHeight = 190;
            try {
                if (control.size) {
                    controlWidth = control.size.width || control.size[0] || 530;
                    controlHeight = control.size.height || control.size[1] || 190;
                }
            } catch (ignoreSize) {}

            var paddingLeft = 12;
            var paddingTop = 24;
            var availableWidth = Math.max(10, controlWidth - 24);
            var availableHeight = Math.max(10, controlHeight - 36);
            var outlinePen = graphics.newPen(
                graphics.PenType.SOLID_COLOR,
                [0.22, 0.25, 0.29, 1],
                1
            );

            if (!previewModel || !previewModel.bins || previewModel.bins.length === 0) {
                try {
                    graphics.drawString(
                        "Click Update Preview to calculate the nesting layout.",
                        outlinePen,
                        paddingLeft,
                        paddingTop + 18
                    );
                } catch (ignoreMessage) {}
                return;
            }

            var left = previewModel.bins[0].base[0];
            var top = previewModel.bins[0].base[1];
            var right = previewModel.bins[0].base[2];
            var bottom = previewModel.bins[0].base[3];
            var i;
            for (i = 1; i < previewModel.bins.length; i++) {
                left = Math.min(left, previewModel.bins[i].base[0]);
                top = Math.max(top, previewModel.bins[i].base[1]);
                right = Math.max(right, previewModel.bins[i].base[2]);
                bottom = Math.min(bottom, previewModel.bins[i].base[3]);
            }

            var modelWidth = Math.max(1, right - left);
            var modelHeight = Math.max(1, top - bottom);
            var scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight);
            var offsetX = paddingLeft + (availableWidth - modelWidth * scale) / 2;
            var offsetY = paddingTop + (availableHeight - modelHeight * scale) / 2;

            function xPosition(value) {
                return offsetX + (value - left) * scale;
            }
            function yPosition(value) {
                return offsetY + (top - value) * scale;
            }
            function drawBounds(bounds, brush, pen) {
                if (!bounds) return;
                var bLeft = xPosition(bounds[0]);
                var bTop = yPosition(bounds[1]);
                var bRight = xPosition(bounds[2]);
                var bBottom = yPosition(bounds[3]);

                if (brush) {
                    previewPath(graphics, bLeft, bTop, bRight, bBottom);
                    try { graphics.fillPath(brush); } catch (eFill) {}
                }
                if (pen) {
                    previewPath(graphics, bLeft, bTop, bRight, bBottom);
                    try { graphics.strokePath(pen); } catch (eStroke) {}
                }
            }

            var sheetBrush = graphics.newBrush(
                graphics.BrushType.SOLID_COLOR,
                [0.94, 0.94, 0.92, 1]
            );
            var usablePen = graphics.newPen(
                graphics.PenType.SOLID_COLOR,
                [0.45, 0.48, 0.52, 1],
                1
            );
            var fixedBrush = graphics.newBrush(
                graphics.BrushType.SOLID_COLOR,
                [0.42, 0.44, 0.48, 1]
            );
            var placedBrush = graphics.newBrush(
                graphics.BrushType.SOLID_COLOR,
                [0.20, 0.58, 0.86, 0.88]
            );
            var placedPen = graphics.newPen(
                graphics.PenType.SOLID_COLOR,
                [0.08, 0.30, 0.55, 1],
                1
            );

            for (i = 0; i < previewModel.bins.length; i++) {
                var bin = previewModel.bins[i];
                drawBounds(bin.base, sheetBrush, outlinePen);
                drawBounds([bin.l, bin.t, bin.r, bin.b], null, usablePen);
                for (var f = 0; f < bin.placed.length; f++) {
                    var fixed = bin.placed[f];
                    drawBounds([fixed.l, fixed.t, fixed.r, fixed.b], fixedBrush, null);
                }
            }

            for (i = 0; i < previewModel.plan.length; i++) {
                var rect = previewModel.plan[i].rect;
                drawBounds([rect.l, rect.t, rect.r, rect.b], placedBrush, placedPen);
            }
        } catch (eFatalDraw) {}
    }

    function refreshScreenPreview() {
        try {
            screenPreview.notify("onDraw");
        } catch (ignoreNotify) {
            try {
                dialog.update();
            } catch (ignoreUpdate) {}
        }
    }

    function countSheets(bins) {
        if (!bins) {
            return 0;
        }
        // Interior "hole" pockets share their owner sheet and carry an
        // ownerId, so they must not be reported as extra sheets.
        var count = 0;
        for (var i = 0; i < bins.length; i++) {
            if (!bins[i].ownerId) {
                count++;
            }
        }
        return count;
    }

    function performNesting(resizeSheet, explicitSettings) {
        restoreItems();
        var settings = explicitSettings || readSettings();
        var bins = buildContainers(settings);
        var sources = sourceDescriptors(settings);
        var fixedCount = addFixedObstacles(bins, settings, sources);
        var result = findBestPlan(sources, bins, settings);
        var resultBins = result.bins || bins;

        applyPlan(result.plan);

        var resizedIndex = -1;
        var originalArtboardBounds = null;
        var createdArtboards = [];
        if (resizeSheet) {
            try {
                if (settings.mode === 0 && settings.custom && settings.resizeArtboard) {
                    resizedIndex = doc.artboards.getActiveArtboardIndex();
                    originalArtboardBounds = copyBounds(doc.artboards[resizedIndex].artboardRect);
                    doc.artboards[resizedIndex].artboardRect = copyBounds(bins[0].base);
                }
                for (var generatedIndex = 0; generatedIndex < resultBins.length; generatedIndex++) {
                    if (resultBins[generatedIndex].generated && !resultBins[generatedIndex].ownerId) {
                        createdArtboards.push(
                            doc.artboards.add(copyBounds(resultBins[generatedIndex].base))
                        );
                    }
                }
            } catch (artboardError) {
                for (var createdIndex = createdArtboards.length - 1; createdIndex >= 0; createdIndex--) {
                    try { createdArtboards[createdIndex].remove(); } catch (ignoreCreatedRemoval) {}
                }
                if (resizedIndex >= 0 && originalArtboardBounds) {
                    try {
                        doc.artboards[resizedIndex].artboardRect = originalArtboardBounds;
                    } catch (ignoreResizeRestore) {}
                }
                throw new Error("Could not create the separated sheets. " + errorMessage(artboardError));
            }
        }

        var sourceArea = 0;
        for (var i = 0; i < result.plan.length; i++) {
            sourceArea += result.plan[i].descriptor.area;
        }
        var sheetArea = 0;
        for (i = 0; i < resultBins.length; i++) {
            if (!resultBins[i].ownerId) {
                sheetArea += (resultBins[i].r - resultBins[i].l) *
                    (resultBins[i].t - resultBins[i].b);
            }
        }
        result.utilization = sheetArea > 0 ?
            Math.round(sourceArea / sheetArea * 1000) / 10 : 0;
        result.fixedCount = fixedCount;
        result.sourceCount = sources.length;
        result.bins = resultBins;
        return result;
    }

    // -------------------------------------------------------------
    // Headless In-Dock Execution Bridge
    // -------------------------------------------------------------
    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        var hp = null;
        try {
            hp = typeof __ozoHeadlessParams === "string" ? OZO.parseJson(__ozoHeadlessParams) : __ozoHeadlessParams;
        } catch (eJson) {
            __ozoHeadlessResult = { success: false, message: "Invalid JSON params: " + eJson.message };
            return;
        }

        var uFactor = OZO.toPoints(1, hp.unit || "mm");
        var activeIndex = doc.artboards.getActiveArtboardIndex();
        var activeBounds = doc.artboards[activeIndex].artboardRect;
        var custom = hp.custom === true;
        var sheetW = custom && hp.width ? Number(hp.width) * uFactor : widthOf(activeBounds);
        var sheetH = custom && hp.height ? Number(hp.height) * uFactor : heightOf(activeBounds);

        var headlessSettings = {
            mode: hp.mode !== undefined ? Number(hp.mode) : 0,
            custom: custom,
            width: sheetW,
            height: sheetH,
            resizeArtboard: hp.resizeArtboard === true,
            left: (hp.left !== undefined ? Number(hp.left) : 0) * uFactor,
            right: (hp.right !== undefined ? Number(hp.right) : 0) * uFactor,
            top: (hp.top !== undefined ? Number(hp.top) : 0) * uFactor,
            bottom: (hp.bottom !== undefined ? Number(hp.bottom) : 0) * uFactor,
            spacing: (hp.spacing !== undefined ? Number(hp.spacing) : 2) * uFactor,
            edge: (hp.edge !== undefined ? Number(hp.edge) : 2) * uFactor,
            allowInside: hp.allowInside !== false,
            fixed: hp.fixed !== false,
            divide: hp.divide !== undefined ? Number(hp.divide) : 0,
            quality: hp.quality !== undefined ? Number(hp.quality) : 0,
            rotation: hp.rotation !== undefined ? Number(hp.rotation) : 1,
            best: hp.best !== false,
            autoMultiSheet: hp.autoMultiSheet !== false
        };

        try {
            var finalResult = performNesting(true, headlessSettings);
            var sheetCount = countSheets(finalResult.bins) || 1;
            __ozoHeadlessResult = {
                success: true,
                placed: finalResult.plan.length,
                total: finalResult.sourceCount,
                unplaced: finalResult.unplaced ? finalResult.unplaced.length : 0,
                utilization: finalResult.utilization,
                sheets: sheetCount,
                fixed: finalResult.fixedCount
            };
            return;
        } catch (nestErr) {
            restoreItems();
            __ozoHeadlessResult = { success: false, message: errorMessage(nestErr) };
            return;
        }
    }

    previewButton.onClick = function () {
        previewButton.enabled = false;
        applyButton.enabled = false;
        statusText.text = OZO.isKhmer() ? "\u1780\u17c6\u1796\u17bb\u1784\u1782\u178e\u1793\u17b6\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793..." : "Calculating preview...";
        dialog.update();
        try {
            var result = performNesting(false);
            previewModel = result;
            refreshScreenPreview();
            var previewSheets = countSheets(result.bins);
            var sheetInfo = previewSheets > 1 ?
                (OZO.isKhmer() ? ", " + previewSheets + " \u179f\u1793\u17d2\u179b\u17b9\u1780" : ", " + previewSheets + " sheets") : "";
            statusText.text = OZO.isKhmer() ?
                "\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u17d6 \u1794\u17b6\u1793\u178a\u17b6\u1780\u17cb " + result.plan.length + " \u1780\u17d2\u1793\u17bb\u1784\u1785\u17c6\u178e\u17c4\u1798 " +
                    result.sourceCount + sheetInfo + ", \u1794\u17d2\u179a\u17be\u179f\u1793\u17d2\u179b\u17b9\u1780 " + result.utilization + "%" +
                    (result.fixedCount ? ", \u17a7\u1794\u179f\u1782\u17d2\u1782\u1790\u17c1\u179a " + result.fixedCount : "") + "\u17d4" :
                "Preview: " + result.plan.length + " of " + result.sourceCount +
                    " placed" + sheetInfo + ", " + result.utilization + "% sheet utilization" +
                    (result.fixedCount ? ", " + result.fixedCount + " fixed obstacle(s)" : "") + ".";
        } catch (error) {
            restoreItems();
            previewModel = null;
            refreshScreenPreview();
            statusText.text = OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : "Preview failed.";
            alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1780\u17b6\u179a\u179a\u17c0\u1794\u1785\u17c6\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" :
                SCRIPT_NAME + " preview failed.") + "\n\n" + errorMessage(error));
        }
        previewButton.enabled = true;
        applyButton.enabled = true;
    };

    OZO.makeNumericSmooth(spacingInput, {step: 1, min: 0, max: 1000});
    OZO.makeNumericSmooth(edgeInput, {step: 1, min: 0, max: 1000});
    OZO.makeNumericSmooth(widthInput, {step: 10, min: 1, max: 100000});
    OZO.makeNumericSmooth(heightInput, {step: 10, min: 1, max: 100000});

    dialog.defaultElement = applyButton;
    dialog.cancelElement = cancelButton;
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);
    spacingInput.active = true;

    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        restoreItems();
        return;
    }

    try {
        var finalResult = performNesting(true);
        OZO.saveWindowState(dialog, "nesting");
        var sheetCount = countSheets(finalResult.bins) || 1;
        var message = OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb\u1780\u17b6\u179a\u179a\u17c0\u1794\u1785\u17c6\u17d4\n\n\u1794\u17b6\u1793\u178a\u17b6\u1780\u17cb " + finalResult.plan.length +
                " \u1780\u17d2\u1793\u17bb\u1784\u1785\u17c6\u178e\u17c4\u1798 " + finalResult.sourceCount + " \u179c\u178f\u17d2\u1790\u17bb\u17d4\n\u1780\u17b6\u179a\u1794\u17d2\u179a\u17be\u179f\u1793\u17d2\u179b\u17b9\u1780\u17d6 " +
                finalResult.utilization + "%\u17d4" :
            "Nesting completed.\n\nPlaced " + finalResult.plan.length + " of " +
                finalResult.sourceCount + " object(s).\nSheet utilization: " +
                finalResult.utilization + "%.";
        if (sheetCount > 1) {
            message += OZO.isKhmer() ?
                "\n\u1785\u17c6\u1793\u17bd\u1793\u179f\u1793\u17d2\u179b\u17b9\u1780\u178a\u17c2\u179b\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f\u17d6 " + sheetCount + "\u17d4" :
                "\nSheets/artboards used: " + sheetCount + ".";
        }
        if (finalResult.fixedCount > 0) {
            message += OZO.isKhmer() ? "\n\u1794\u17b6\u1793\u1782\u17c4\u179a\u1796\u17a7\u1794\u179f\u1782\u17d2\u1782\u1790\u17c1\u179a " + finalResult.fixedCount + "\u17d4" :
                "\nRespected " + finalResult.fixedCount + " fixed obstacle(s).";
        }
        if (finalResult.unplaced.length > 0) {
            message += OZO.isKhmer() ?
                "\n\n\u179c\u178f\u17d2\u1790\u17bb " + finalResult.unplaced.length +
                    " \u1798\u17b7\u1793\u17a2\u17b6\u1785\u178a\u17b6\u1780\u17cb\u1794\u17b6\u1793 \u17a0\u17be\u1799\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u178f\u17d2\u179a\u17a1\u1794\u17cb\u1791\u17c5\u1791\u17b8\u178f\u17b6\u17c6\u1784\u178a\u17be\u1798\u17d4" :
                "\n\n" + finalResult.unplaced.length +
                    " object(s) did not fit and were returned to their original positions.";
        }
        alert(message);
    } catch (error) {
        restoreItems();
        alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u179a\u17c0\u1794\u1785\u17c6\u179f\u1798\u17d2\u1797\u17b6\u179a\u17c8\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : SCRIPT_NAME + " failed.") +
            "\n\n" + errorMessage(error));
    }
})();
