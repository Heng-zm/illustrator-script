#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * CutContour / Die-Line Generator PRO V2
 * Professional cutline, kiss-cut, perf-cut, and die-line automation for Adobe Illustrator.
 * Production-ready for Roland VersaWorks, Mimaki RasterLink, Summa, Graphtec, Onyx, Caldera.
 */
(function () {
    var SCRIPT_NAME = "CutContour / Die-Line Generator PRO";
    var SCRIPT_VERSION = "2.2";
    var STATE_NAMESPACE = "cutcontour_pro_v2";
    var PREVIEW_LAYER_NAME = "__CutContour_Preview__";

    if (app.documents.length === 0) {
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var selectionValue = doc.selection;
    if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length === 0) {
        if (confirm(OZO.isKhmer() ?
            "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f Artwork \u1791\u17c1\u17d4 \u178f\u17be\u17a2\u17d2\u1793\u1780\u1785\u1784\u17cb\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u179c\u178f\u17d2\u1790\u1793\u17c4\u179b\u17be Artboard \u1793\u17c1\u17c7\u1791\u17b6\u17c6\u1784\u17a2\u179f\u17cb\u178a\u17c4\u1799\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u1791\u17c1?" :
            "No artwork is selected. Would you like to select all items on the active artboard automatically?")) {
            doc.selectObjectsOnActiveArtboard();
            selectionValue = doc.selection;
        }
        if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length === 0) {
            return;
        }
    }

    var sourceItems = [];
    for (var s = 0; s < selectionValue.length; s++) {
        sourceItems.push(selectionValue[s]);
    }
    var originalActiveLayer = doc.activeLayer;
    var previewLayer = null;
    var previewGroup = null;

    // -------------------------------------------------------------
    // Utility & Unit Conversion
    // -------------------------------------------------------------
    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function unitFactor(unit) {
        return OZO.toPoints(1, unit);
    }

    function numberValue(control, name, allowZero) {
        var text = (control && typeof control.text !== "undefined") ? control.text : control;
        var value = (typeof OZO !== "undefined" && OZO.parseNumber) ?
            OZO.parseNumber(text, NaN) :
            Number(trim(String(text || "").replace(/,/g, ".").replace(/[a-zA-Z%]+$/, "")));
        if (!isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
            throw new Error(name + " " + (allowZero ? "must be zero or greater." : "must be greater than zero."));
        }
        return value;
    }

    function validBounds(bounds) {
        return bounds && bounds.length === 4 &&
            isFinite(bounds[0]) && isFinite(bounds[1]) &&
            isFinite(bounds[2]) && isFinite(bounds[3]) &&
            bounds[2] >= bounds[0] && bounds[1] >= bounds[3];
    }

    function getSelectionBounds(items) {
        var combined = null;
        for (var i = 0; i < items.length; i++) {
            var b = null;
            try { b = items[i].geometricBounds; } catch (eGeo) {
                try { b = items[i].visibleBounds; } catch (eVis) {}
            }
            if (!validBounds(b)) continue;
            if (!combined) {
                combined = [b[0], b[1], b[2], b[3]];
            } else {
                combined[0] = Math.min(combined[0], b[0]);
                combined[1] = Math.max(combined[1], b[1]);
                combined[2] = Math.max(combined[2], b[2]);
                combined[3] = Math.min(combined[3], b[3]);
            }
        }
        if (!combined) throw new Error("Could not determine selection bounds.");
        return combined;
    }

    // -------------------------------------------------------------
    // Machine RIP Presets
    // -------------------------------------------------------------
    var MACHINE_PRESETS = [
        {
            name: "Roland VersaWorks",
            kissName: "CutContour",
            kissCmyk: [0, 100, 0, 0], // 100% Magenta
            perfName: "PerfCutContour",
            perfCmyk: [100, 0, 0, 0], // 100% Cyan
            strokePt: 0.25,
            overprint: true,
            layerName: "CUTTING"
        },
        {
            name: "Mimaki RasterLink",
            kissName: "CutContour",
            kissCmyk: [0, 100, 0, 0],
            perfName: "HalfCutContour",
            perfCmyk: [100, 0, 0, 0],
            strokePt: 0.30,
            overprint: true,
            layerName: "CutContour"
        },
        {
            name: "Summa / WinPlot",
            kissName: "OPOS",
            kissCmyk: [0, 100, 100, 0], // Red/Orange
            perfName: "FlexCut",
            perfCmyk: [100, 0, 100, 0], // Green
            strokePt: 0.25,
            overprint: true,
            layerName: "CUT_DATA"
        },
        {
            name: "Graphtec",
            kissName: "FC_CUT",
            kissCmyk: [0, 100, 0, 0],
            perfName: "FC_PERF",
            perfCmyk: [100, 100, 0, 0], // Blue
            strokePt: 0.25,
            overprint: true,
            layerName: "CUT"
        },
        {
            name: "Onyx Graphics",
            kissName: "CutContour",
            kissCmyk: [0, 100, 0, 0],
            perfName: "CutContour1",
            perfCmyk: [100, 0, 0, 0],
            strokePt: 0.25,
            overprint: true,
            layerName: "CutPaths"
        },
        {
            name: "Caldera RIP",
            kissName: "CutContour",
            kissCmyk: [0, 100, 0, 0],
            perfName: "VisualCut",
            perfCmyk: [100, 0, 100, 0],
            strokePt: 0.25,
            overprint: true,
            layerName: "CutContour"
        },
        {
            name: "Custom DieLine",
            kissName: "DieLine",
            kissCmyk: [0, 100, 0, 0],
            perfName: "Crease",
            perfCmyk: [100, 0, 0, 0],
            strokePt: 0.50,
            overprint: true,
            layerName: "DIE_LINE"
        }
    ];

    // -------------------------------------------------------------
    // Spot Color Management
    // -------------------------------------------------------------
    function getOrCreateSpotColor(targetDoc, spotName, cmykValues) {
        var existingSpot = null;
        for (var i = 0; i < targetDoc.spots.length; i++) {
            if (targetDoc.spots[i].name === spotName) {
                existingSpot = targetDoc.spots[i];
                break;
            }
        }
        if (!existingSpot) {
            existingSpot = targetDoc.spots.add();
            existingSpot.name = spotName;
            existingSpot.colorType = ColorModel.SPOT;
            if (targetDoc.documentColorSpace === DocumentColorSpace.RGB) {
                var rgb = new RGBColor();
                if (cmykValues[1] > 50 && cmykValues[0] < 50) {
                    rgb.red = 255; rgb.green = 0; rgb.blue = 255; // Magenta
                } else if (cmykValues[0] > 50 && cmykValues[1] < 50) {
                    rgb.red = 0; rgb.green = 255; rgb.blue = 255; // Cyan
                } else if (cmykValues[2] > 50 && cmykValues[0] > 50) {
                    rgb.red = 0; rgb.green = 255; rgb.blue = 0;   // Green
                } else {
                    rgb.red = 255; rgb.green = 0; rgb.blue = 255;
                }
                existingSpot.color = rgb;
            } else {
                var cmyk = new CMYKColor();
                cmyk.cyan = cmykValues[0];
                cmyk.magenta = cmykValues[1];
                cmyk.yellow = cmykValues[2];
                cmyk.black = cmykValues[3];
                existingSpot.color = cmyk;
            }
        }
        var spotColor = new SpotColor();
        spotColor.spot = existingSpot;
        spotColor.tint = 100;
        return spotColor;
    }

    function styleCutPath(item, spotColor, settings) {
        if (!item) return;
        try {
            if (item.typename === "GroupItem") {
                for (var g = 0; g < item.pageItems.length; g++) {
                    styleCutPath(item.pageItems[g], spotColor, settings);
                }
                return;
            }
            if (item.typename === "CompoundPathItem") {
                for (var cp = 0; cp < item.pathItems.length; cp++) {
                    styleCutPath(item.pathItems[cp], spotColor, settings);
                }
                return;
            }
            if (item.typename === "PathItem") {
                item.stroked = true;
                item.filled = false;
                item.strokeColor = spotColor;
                item.strokeWidth = settings.strokeWeight;
                try { item.strokeOverprint = settings.overprint; } catch (eOver) {}
            }
        } catch (ignoreStyle) {}
    }

    // -------------------------------------------------------------
    // Selection Analysis & AUTO Recommendation
    // -------------------------------------------------------------
    function analyzeSelection(items) {
        var stats = {
            total: items.length,
            paths: 0,
            compounds: 0,
            groups: 0,
            texts: 0,
            rasters: 0,
            hasHoles: false,
            bounds: getSelectionBounds(items)
        };

        function inspectItem(item) {
            if (!item) return;
            var type = item.typename;
            if (type === "PathItem") stats.paths++;
            else if (type === "CompoundPathItem") {
                stats.compounds++;
                stats.hasHoles = true;
            } else if (type === "GroupItem") {
                stats.groups++;
                if (item.clipped) stats.compounds++;
                for (var g = 0; g < item.pageItems.length; g++) {
                    inspectItem(item.pageItems[g]);
                }
            } else if (type === "TextFrame") stats.texts++;
            else if (type === "RasterItem" || type === "PlacedItem") stats.rasters++;
        }

        for (var i = 0; i < items.length; i++) {
            inspectItem(items[i]);
        }

        var w = stats.bounds[2] - stats.bounds[0];
        var h = stats.bounds[1] - stats.bounds[3];
        var aspectRatio = Math.max(w, h) / Math.max(0.001, Math.min(w, h));

        // Intelligent recommendation
        var recMode = 0; // Rounded Rect
        var recOffset = 2.0; // mm
        var recHole = 0; // Keep

        if (stats.paths > 4 || stats.compounds > 0 || stats.rasters > 0) {
            recMode = 4; // Tight Contour
        } else if (Math.abs(w - h) < 5) {
            recMode = 2; // Circle / Square
        } else if (aspectRatio > 2.5) {
            recMode = 3; // Capsule
        }

        stats.recommendation = {
            mode: recMode,
            offsetMm: recOffset,
            holeMode: recHole
        };
        return stats;
    }

    // -------------------------------------------------------------
    // Path Optimization Engine
    // -------------------------------------------------------------
    function optimizePathItem(item, tolerancePt) {
        if (!item) return;
        try {
            if (item.typename === "CompoundPathItem") {
                for (var cp = 0; cp < item.pathItems.length; cp++) {
                    optimizePathItem(item.pathItems[cp], tolerancePt);
                }
                return;
            }
            if (item.typename === "PathItem" && !item.closed && item.pathPoints && item.pathPoints.length > 2) {
                var first = item.pathPoints[0].anchor;
                var last = item.pathPoints[item.pathPoints.length - 1].anchor;
                var dx = Math.abs(first[0] - last[0]);
                var dy = Math.abs(first[1] - last[1]);
                if (dx < 1.0 && dy < 1.0) {
                    item.closed = true;
                }
            }
        } catch (ignoreOpt) {}
    }

    // -------------------------------------------------------------
    // Geometry Generation Engines
    // -------------------------------------------------------------
    function createPolygon(targetContainer, cx, cy, radius, sides, rotationDeg) {
        var angleStep = (Math.PI * 2) / sides;
        var startAngle = (rotationDeg || 0) * (Math.PI / 180);
        var points = [];
        for (var i = 0; i < sides; i++) {
            var a = startAngle + i * angleStep;
            points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
        }
        var path = targetContainer.pathItems.add();
        path.setEntirePath(points);
        path.closed = true;
        return path;
    }

    function createShapeGeometry(targetContainer, bounds, offsetPt, settings) {
        var shape = settings.shapeIndex;
        var l = bounds[0] - offsetPt;
        var t = bounds[1] + offsetPt;
        var r = bounds[2] + offsetPt;
        var b = bounds[3] - offsetPt;
        var w = r - l;
        var h = t - b;
        if (w <= 0.1 || h <= 0.1) {
            throw new Error(OZO.isKhmer() ?
                "គម្លាតកាត់ (Offset) ដកធំពេកសម្រាប់ទំហំរូបភាពដែលបានជ្រើសរើស។" :
                "Offset is too large in the negative direction for the selected artwork size.");
        }
        var cx = (l + r) / 2;
        var cy = (t + b) / 2;

        if (settings.perfectSquare && (shape === 1 || shape === 2)) {
            var maxDim = Math.max(w, h);
            l = cx - maxDim / 2;
            r = cx + maxDim / 2;
            t = cy + maxDim / 2;
            b = cy - maxDim / 2;
            w = maxDim;
            h = maxDim;
        }

        var pathItem = null;
        if (shape === 0) {
            // Rounded Rectangle
            var rad = Math.min(settings.radiusPt, Math.min(w, h) / 2);
            pathItem = targetContainer.pathItems.roundedRectangle(t, l, w, h, rad, rad);
        } else if (shape === 1) {
            // Rectangle
            pathItem = targetContainer.pathItems.rectangle(t, l, w, h);
        } else if (shape === 2) {
            // Circle / Ellipse
            pathItem = targetContainer.pathItems.ellipse(t, l, w, h);
        } else if (shape === 3) {
            // Capsule / Stadium
            var capRad = Math.min(w, h) / 2;
            pathItem = targetContainer.pathItems.roundedRectangle(t, l, w, h, capRad, capRad);
        } else if (shape === 4) {
            // Tight Contour / Silhouette:
            // Uses pure ExtendScript DOM duplication without calling app.executeMenuCommand
            // to guarantee complete stability and prevent modal dialog crashes on Windows.
            try {
                var contourGroup = targetContainer.groupItems.add();
                contourGroup.name = "Tight Contour Group";
                for (var i = 0; i < sourceItems.length; i++) {
                    try {
                        sourceItems[i].duplicate(contourGroup, ElementPlacement.PLACEATEND);
                    } catch (eDup) {}
                }

                // Ensure all items inside contourGroup are converted to vector paths
                function ensureVectorOnly(container) {
                    var items = container.pageItems;
                    for (var it = items.length - 1; it >= 0; it--) {
                        var curItem = items[it];
                        try {
                            if (curItem.typename === "GroupItem") {
                                ensureVectorOnly(curItem);
                            } else if (curItem.typename === "TextFrame") {
                                try {
                                    curItem.createOutline();
                                } catch (eTfOut) {
                                    var tb = curItem.geometricBounds;
                                    container.pathItems.rectangle(tb[1], tb[0], tb[2] - tb[0], tb[1] - tb[3]);
                                    curItem.remove();
                                }
                            } else if (curItem.typename === "RasterItem" || curItem.typename === "PlacedItem" ||
                                       curItem.typename === "MeshItem" || curItem.typename === "PluginItem") {
                                var rb = curItem.geometricBounds;
                                container.pathItems.rectangle(rb[1], rb[0], rb[2] - rb[0], rb[1] - rb[3]);
                                curItem.remove();
                            }
                        } catch (eClean) {}
                    }
                }
                ensureVectorOnly(contourGroup);

                if (offsetPt !== 0 && contourGroup.pageItems.length > 0) {
                    try {
                        var gBounds = contourGroup.geometricBounds;
                        var gW = gBounds[2] - gBounds[0];
                        var gH = gBounds[1] - gBounds[3];
                        if (gW > 0 && gH > 0 && (gW + offsetPt * 2 > 0) && (gH + offsetPt * 2 > 0)) {
                            var scaleX = ((gW + offsetPt * 2) / gW) * 100;
                            var scaleY = ((gH + offsetPt * 2) / gH) * 100;
                            contourGroup.resize(scaleX, scaleY, true, true, true, true, 100, Transformation.CENTER);
                        }
                    } catch (eScale) {}
                }
                pathItem = contourGroup;
            } catch (eSil) {
                pathItem = targetContainer.pathItems.roundedRectangle(t, l, w, h, 2, 2);
            }
        } else if (shape === 5) {
            // Hexagon: Mathematically exact circumscription so artwork corners never poke outside
            var hexRadius = OZO.math.circumscribedPolygonRadius(w, h, 6);
            pathItem = createPolygon(targetContainer, cx, cy, hexRadius, 6, 0);
        } else if (shape === 6) {
            // Octagon: Mathematically exact circumscription so artwork corners never poke outside
            var octRadius = OZO.math.circumscribedPolygonRadius(w, h, 8);
            pathItem = createPolygon(targetContainer, cx, cy, octRadius, 8, 22.5);
        }

        if (pathItem && settings.optimizePath) {
            optimizePathItem(pathItem, 0.5);
        }
        return pathItem;
    }

    // Optional Production Registration Marks
    function addRegistrationMarks(container, bounds, offsetPt) {
        var pad = offsetPt + 14; // 14pt margin outside cutline
        var l = bounds[0] - pad;
        var t = bounds[1] + pad;
        var r = bounds[2] + pad;
        var b = bounds[3] - pad;
        var corners = [[l, t], [r, t], [r, b], [l, b]];
        var markSize = 10;

        var markColor;
        if (doc && doc.documentColorSpace === DocumentColorSpace.RGB) {
            markColor = new RGBColor();
            markColor.red = 0;
            markColor.green = 0;
            markColor.blue = 0;
        } else {
            markColor = new CMYKColor();
            markColor.cyan = 0;
            markColor.magenta = 0;
            markColor.yellow = 0;
            markColor.black = 100;
        }

        for (var c = 0; c < corners.length; c++) {
            var pt = corners[c];
            // Crosshair
            var hLine = container.pathItems.add();
            hLine.setEntirePath([[pt[0] - markSize, pt[1]], [pt[0] + markSize, pt[1]]]);
            hLine.stroked = true;
            hLine.filled = false;
            hLine.strokeColor = markColor;
            hLine.strokeWidth = 0.5;

            var vLine = container.pathItems.add();
            vLine.setEntirePath([[pt[0], pt[1] - markSize], [pt[0], pt[1] + markSize]]);
            vLine.stroked = true;
            vLine.filled = false;
            vLine.strokeColor = markColor;
            vLine.strokeWidth = 0.5;

            // Small circle
            var circle = container.pathItems.ellipse(pt[1] + markSize / 2, pt[0] - markSize / 2, markSize, markSize);
            circle.stroked = true;
            circle.filled = false;
            circle.strokeColor = markColor;
            circle.strokeWidth = 0.5;
        }
    }

    // -------------------------------------------------------------
    // Live Preview Management
    // -------------------------------------------------------------
    function cleanupPreview(keepDocClean) {
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (ignoreRemove) {}
        }
        previewLayer = null;
        previewGroup = null;
        if (keepDocClean && originalActiveLayer) {
            try { doc.activeLayer = originalActiveLayer; } catch (ignoreLayer) {}
        }
    }

    function restoreSelection() {
        try {
            doc.selection = null;
            for (var i = 0; i < sourceItems.length; i++) {
                sourceItems[i].selected = true;
            }
        } catch (ignoreSel) {}
    }

    function generatePreview(settings) {
        if (!previewLayer) {
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

        var bounds = getSelectionBounds(sourceItems);
        previewGroup = previewLayer.groupItems.add();
        previewGroup.name = "CutContour Output";

        var primarySpot = getOrCreateSpotColor(doc, settings.kissName, settings.kissCmyk);

        // 1. Kiss-Cut Path
        if (settings.kissEnabled) {
            var cutPath = createShapeGeometry(previewGroup, bounds, settings.kissOffsetPt, settings);
            if (cutPath) {
                styleCutPath(cutPath, primarySpot, settings);
                cutPath.name = settings.kissName;
            }
        }

        // 2. Dual Outer Perf-Cut Path
        if (settings.perfEnabled && settings.perfOffsetPt >= 0) {
            var perfSpot = getOrCreateSpotColor(doc, settings.perfName, settings.perfCmyk);
            var perfSettings = {
                shapeIndex: settings.shapeIndex,
                radiusPt: settings.radiusPt + (settings.perfOffsetPt - settings.kissOffsetPt),
                perfectSquare: settings.perfectSquare,
                strokeWeight: settings.strokeWeight,
                overprint: settings.overprint,
                holeMode: 2, // Perf-cut is outer backing card
                optimizePath: settings.optimizePath
            };
            var perfPath = createShapeGeometry(previewGroup, bounds, settings.perfOffsetPt, perfSettings);
            if (perfPath) {
                styleCutPath(perfPath, perfSpot, perfSettings);
                perfPath.name = settings.perfName;
            }
        }

        // 3. Registration Marks
        if (settings.addRegMarks) {
            var maxOff = Math.max(settings.kissOffsetPt, settings.perfOffsetPt);
            addRegistrationMarks(previewGroup, bounds, maxOff);
        }

        app.redraw();
        return previewGroup;
    }

    // -------------------------------------------------------------
    // Pre-flight Validator
    // -------------------------------------------------------------
    function runPreflight(settings) {
        var issues = [];
        var status = "PASS";

        if (!doc) return {status: "ERROR", message: "No document open."};
        if (!sourceItems.length) return {status: "ERROR", message: "No artwork selected."};

        if (!settings.kissEnabled && !settings.perfEnabled) {
            issues.push(OZO.isKhmer() ?
                "ត្រូវតែជ្រើសរើសយ៉ាងហោចណាស់ Kiss-Cut ឬ Die-Cut មួយ។" :
                "At least one cutline (Kiss-Cut or Die-Cut) must be enabled.");
            status = "ERROR";
        }
        if (settings.kissEnabled && !settings.kissName) {
            issues.push("Kiss-Cut spot name cannot be empty.");
            status = "ERROR";
        }
        if (settings.perfEnabled && !settings.perfName) {
            issues.push("Perf-Cut spot name cannot be empty.");
            status = "ERROR";
        }
        if (settings.strokeWeight > 0.5) {
            issues.push("Stroke weight is greater than 0.5 pt (may not register as hairline).");
            if (status !== "ERROR") status = "WARNING";
        }
        if (!settings.overprint) {
            issues.push("Overprint stroke is disabled (risk of knock-out in print RIP).");
            if (status !== "ERROR") status = "WARNING";
        }
        if (settings.perfEnabled && settings.perfOffsetPt <= settings.kissOffsetPt) {
            issues.push("Die-cut offset is not larger than Kiss-cut offset.");
            if (status !== "ERROR") status = "WARNING";
        }

        if (status === "PASS") {
            return {status: "PASS", message: "✓ Ready for Production: Hairline spots, overprint active, closed paths."};
        }
        return {status: status, message: (status === "WARNING" ? "⚠ WARNING: " : "✕ ERROR: ") + issues.join(" | ")};
    }

    // Initial analysis
    var initialStats = analyzeSelection(sourceItems);

    // -------------------------------------------------------------
    // User Interface Construction
    // -------------------------------------------------------------
    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = [16, 14, 16, 14];
    dialog.minimumSize = [510, 560];

    // Standardized Studio Header Banner
    OZO.addDialogHeader(
        dialog,
        OZO.tr("CutContour Generator"),
        "v" + SCRIPT_VERSION + " \u2022 " + OZO.tr("Die-Cut & Kiss-Cut Studio")
    );

    // Quick Preset Mode Segment (Segmented style card buttons)
    var quickGroup = dialog.add("group");
    quickGroup.orientation = "row";
    quickGroup.alignment = ["fill", "top"];
    quickGroup.alignChildren = ["fill", "center"];
    quickGroup.spacing = 6;

    var autoBtn = quickGroup.add("button", undefined, "\u26a1 " + OZO.tr("Auto Fit"));
    var tightBtn = quickGroup.add("button", undefined, "\u2702 " + OZO.tr("Tight Silhouette"));
    var shapeBtn = quickGroup.add("button", undefined, "\u25a2 " + OZO.tr("Shape Card"));
    var dualBtn = quickGroup.add("button", undefined, "\u29c9 " + OZO.tr("Dual (Kiss+Die)"));
    autoBtn.preferredSize = [105, 26];
    tightBtn.preferredSize = [125, 26];
    shapeBtn.preferredSize = [110, 26];
    dualBtn.preferredSize = [130, 26];
    autoBtn.helpTip = "Intelligently select recommended shape and offset based on artwork geometry";
    tightBtn.helpTip = "Create tight boundary contour hugging the artwork silhouette";
    shapeBtn.helpTip = "Surround artwork with rounded card boundary";
    dualBtn.helpTip = "Enable both inner Kiss-Cut and outer backing card Die-Cut lines";

    // Mode Toggle (Simple vs Pro) & Machine Preset Bar
    var modePresetRow = dialog.add("group");
    modePresetRow.orientation = "row";
    modePresetRow.alignment = ["fill", "center"];
    modePresetRow.alignChildren = ["left", "center"];

    var modeSegment = modePresetRow.add("group");
    modeSegment.orientation = "row";
    modeSegment.alignChildren = ["left", "center"];
    var simpleModeRadio = modeSegment.add("radiobutton", undefined, OZO.tr("Simple Mode"));
    var proModeRadio = modeSegment.add("radiobutton", undefined, OZO.tr("Pro Mode"));
    proModeRadio.value = true;

    var presetSubGrp = modePresetRow.add("group");
    presetSubGrp.alignment = ["right", "center"];
    presetSubGrp.alignChildren = ["right", "center"];
    presetSubGrp.add("statictext", undefined, OZO.tr("Machine / RIP Preset:"));
    var presetList = presetSubGrp.add("dropdownlist", undefined, []);
    presetList.preferredSize.width = 200;
    for (var p = 0; p < MACHINE_PRESETS.length; p++) {
        presetList.add("item", MACHINE_PRESETS[p].name);
    }
    presetList.selection = 0;

    // Panel 1: Geometry & Cutline Settings
    var configPanel = dialog.add("panel", undefined, OZO.tr("Geometry & Cutline Settings"));
    configPanel.orientation = "column";
    configPanel.alignChildren = ["fill", "top"];
    configPanel.margins = [14, 16, 14, 12];
    configPanel.spacing = 8;

    // Row 1: Geometry & Units
    var geomRow = configPanel.add("group");
    geomRow.orientation = "row";
    geomRow.alignChildren = ["left", "center"];
    var geomLbl = geomRow.add("statictext", undefined, OZO.tr("Geometry:"));
    geomLbl.preferredSize.width = 90;
    var shapeList = geomRow.add("dropdownlist", undefined, [
        OZO.tr("Rounded Rectangle"),
        OZO.tr("Rectangle"),
        OZO.tr("Circle / Ellipse"),
        OZO.tr("Capsule / Stadium"),
        OZO.tr("Tight Contour (Silhouette)"),
        OZO.tr("Hexagon"),
        OZO.tr("Octagon")
    ]);
    shapeList.selection = initialStats.recommendation.mode;
    shapeList.preferredSize.width = 190;

    var unitSubGrp = geomRow.add("group");
    unitSubGrp.alignment = ["right", "center"];
    unitSubGrp.add("statictext", undefined, OZO.tr("Units:"));
    var unitList = unitSubGrp.add("dropdownlist", undefined, ["mm", "cm", "pt", "in"]);
    var defaultDocUnit = OZO.getDocDefaultUnit(doc);
    var defaultUnitIdx = 0;
    if (defaultDocUnit === "cm") defaultUnitIdx = 1;
    else if (defaultDocUnit === "pt") defaultUnitIdx = 2;
    else if (defaultDocUnit === "in") defaultUnitIdx = 3;
    unitList.selection = defaultUnitIdx;
    unitList.preferredSize.width = 65;

    var initialUnit = ["mm", "cm", "pt", "in"][defaultUnitIdx] || "mm";
    var previousUnit = initialUnit;

    function currentUnit() {
        return (unitList.selection && unitList.selection.text) ?
            unitList.selection.text : "mm";
    }

    function formatQuantity(value) {
        return String(Math.round(value * 1000) / 1000);
    }

    function mmToUnit(mm) {
        var pt = OZO.toPoints(mm, "mm");
        return formatQuantity(OZO.fromPoints(pt, currentUnit()));
    }

    // Row 2: Offsets & Dimensions Row
    var paramRow = configPanel.add("group");
    paramRow.orientation = "row";
    paramRow.alignChildren = ["left", "center"];

    var offsetLbl = paramRow.add("statictext", undefined, OZO.tr("Offset / Bleed") + ":");
    offsetLbl.preferredSize.width = 90;
    var offsetInput = paramRow.add("edittext", undefined, mmToUnit(initialStats.recommendation.offsetMm));
    offsetInput.characters = 5;
    var offsetUnitLbl = paramRow.add("statictext", undefined, initialUnit);
    offsetUnitLbl.preferredSize.width = 30;

    var radiusLabel = paramRow.add("statictext", undefined, OZO.tr("Corner Radius") + ":");
    var radiusInput = paramRow.add("edittext", undefined, mmToUnit(3));
    radiusInput.characters = 5;
    var radiusUnitLbl = paramRow.add("statictext", undefined, initialUnit);
    radiusUnitLbl.preferredSize.width = 30;

    var perfectSquareCheck = configPanel.add("checkbox", undefined, OZO.tr("Equal width & height (Circle / Square)"));
    perfectSquareCheck.value = false;

    // Row 3: Hole Management
    var holeGroup = configPanel.add("group");
    holeGroup.orientation = "row";
    holeGroup.alignChildren = ["left", "center"];
    var holeLbl = holeGroup.add("statictext", undefined, OZO.tr("Inner Holes:"));
    holeLbl.preferredSize.width = 90;
    var holeList = holeGroup.add("dropdownlist", undefined, [
        OZO.tr("Keep Holes"),
        OZO.tr("Remove Small Holes"),
        OZO.tr("Remove All Holes")
    ]);
    holeList.selection = initialStats.recommendation.holeMode;
    holeList.preferredSize.width = 220;

    // Sub-Panel: Dual Cutline (Kiss-Cut + Perf-Cut)
    var dualPanel = configPanel.add("panel", undefined, OZO.tr("Cut Types & Spot Layers"));
    dualPanel.orientation = "column";
    dualPanel.alignChildren = ["fill", "top"];
    dualPanel.margins = [12, 14, 12, 10];
    dualPanel.spacing = 8;

    var kissRow = dualPanel.add("group");
    kissRow.orientation = "row";
    kissRow.alignChildren = ["left", "center"];
    var kissCheck = kissRow.add("checkbox", undefined, OZO.tr("Kiss-Cut") + " (Inner):");
    kissCheck.value = true;
    kissCheck.preferredSize.width = 135;
    var kissNameInput = kissRow.add("edittext", undefined, "CutContour");
    kissNameInput.characters = 12;
    kissRow.add("statictext", undefined, OZO.tr("Offset") + ":");
    var kissOffsetInput = kissRow.add("edittext", undefined, mmToUnit(2));
    kissOffsetInput.characters = 4;
    var kissUnitLbl = kissRow.add("statictext", undefined, initialUnit);
    kissUnitLbl.preferredSize.width = 30;

    var perfRow = dualPanel.add("group");
    perfRow.orientation = "row";
    perfRow.alignChildren = ["left", "center"];
    var perfCheck = perfRow.add("checkbox", undefined, OZO.tr("Die-Cut") + " (Outer):");
    perfCheck.value = false;
    perfCheck.preferredSize.width = 135;
    var perfNameInput = perfRow.add("edittext", undefined, "PerfCutContour");
    perfNameInput.characters = 12;
    perfRow.add("statictext", undefined, OZO.tr("Offset") + ":");
    var perfOffsetInput = perfRow.add("edittext", undefined, mmToUnit(5));
    perfOffsetInput.characters = 4;
    var perfUnitLbl = perfRow.add("statictext", undefined, initialUnit);
    perfUnitLbl.preferredSize.width = 30;

    // Panel 2: Pro Options Panel (Collapsible via Simple/Pro mode)
    var proPanel = dialog.add("panel", undefined, OZO.tr("Prepress & Optimization (Pro)"));
    proPanel.orientation = "column";
    proPanel.alignChildren = ["fill", "top"];
    proPanel.margins = [14, 16, 14, 12];
    proPanel.spacing = 8;

    var strokeRow = proPanel.add("group");
    strokeRow.orientation = "row";
    strokeRow.alignChildren = ["left", "center"];
    var strokeLbl = strokeRow.add("statictext", undefined, OZO.tr("Stroke Weight:"));
    strokeLbl.preferredSize.width = 95;
    var strokeList = strokeRow.add("dropdownlist", undefined, ["0.25 pt (Hairline)", "0.30 pt", "0.50 pt", "0.75 pt"]);
    strokeList.selection = 0;
    strokeList.preferredSize.width = 140;
    var overprintCheck = strokeRow.add("checkbox", undefined, OZO.tr("Overprint Stroke"));
    overprintCheck.value = true;

    var optRow = proPanel.add("group");
    optRow.orientation = "row";
    optRow.alignChildren = ["left", "center"];
    var optPathCheck = optRow.add("checkbox", undefined, OZO.tr("Optimize Cut Path"));
    optPathCheck.value = true;
    var regMarksCheck = optRow.add("checkbox", undefined, OZO.tr("Registration Marks"));
    regMarksCheck.value = false;

    // Validation Card
    var validationBox = dialog.add("panel");
    validationBox.orientation = "row";
    validationBox.alignChildren = ["left", "center"];
    validationBox.margins = [12, 8, 12, 8];
    var validationLabel = validationBox.add("statictext", undefined, "Validation: Ready");
    validationLabel.preferredSize.width = 440;

    // Pre-flight updater
    function updateValidationUI() {
        try {
            var currentSettings = readSettings();
            var check = runPreflight(currentSettings);
            validationLabel.text = check.message;
        } catch (eValid) {
            validationLabel.text = "Validation: " + eValid.message;
        }
    }

    // Dynamic UI Updates
    function updateVisibility() {
        var isPro = proModeRadio.value;
        proPanel.visible = isPro;
        var shapeIdx = (shapeList.selection && shapeList.selection.index >= 0) ? shapeList.selection.index : 0;
        radiusLabel.visible = (shapeIdx === 0);
        radiusInput.visible = (shapeIdx === 0);
        radiusUnitLbl.visible = (shapeIdx === 0);
        perfectSquareCheck.visible = (shapeIdx === 1 || shapeIdx === 2);
        dialog.layout.layout(true);
        updateValidationUI();
    }

    shapeList.onChange = updateVisibility;
    proModeRadio.onClick = updateVisibility;
    simpleModeRadio.onClick = updateVisibility;

    function formatDim(pt, u) {
        return formatQuantity(OZO.fromPoints(pt, u)) + " " + u;
    }

    function updateStatsFooter() {
        var u = currentUnit();
        var wPt = Math.abs(initialStats.bounds[2] - initialStats.bounds[0]);
        var hPt = Math.abs(initialStats.bounds[1] - initialStats.bounds[3]);
        statusStats.text = OZO.tr("Selected items") + ": " + initialStats.total +
            "  |  " + OZO.tr("Paths") + ": " + initialStats.paths +
            "  |  " + OZO.tr("Dimensions:") + " " + formatDim(wPt, u) + " x " + formatDim(hPt, u);
    }

    unitList.onChange = function () {
        var u = currentUnit();
        if (u !== previousUnit) {
            var ratio = unitFactor(previousUnit) / unitFactor(u);
            var fields = [offsetInput, radiusInput, kissOffsetInput, perfOffsetInput];
            for (var fi = 0; fi < fields.length; fi++) {
                var raw = (typeof OZO !== "undefined" && OZO.parseNumber) ?
                    OZO.parseNumber(fields[fi].text, NaN) : Number(fields[fi].text);
                if (isFinite(raw)) {
                    fields[fi].text = formatQuantity(raw * ratio);
                }
            }
            previousUnit = u;
        }
        offsetUnitLbl.text = u;
        radiusUnitLbl.text = u;
        kissUnitLbl.text = u;
        perfUnitLbl.text = u;
        updateStatsFooter();
        updateValidationUI();
    };

    presetList.onChange = function () {
        if (!presetList.selection) return;
        var pIdx = presetList.selection.index >= 0 ? presetList.selection.index : 0;
        var preset = MACHINE_PRESETS[pIdx];
        kissNameInput.text = preset.kissName;
        perfNameInput.text = preset.perfName;
        overprintCheck.value = preset.overprint;
        if (preset.strokePt <= 0.25) strokeList.selection = 0;
        else if (preset.strokePt <= 0.30) strokeList.selection = 1;
        else strokeList.selection = 2;
        updateValidationUI();
    };

    // Mode Buttons Click Handlers
    autoBtn.onClick = function () {
        shapeList.selection = initialStats.recommendation.mode;
        offsetInput.text = mmToUnit(initialStats.recommendation.offsetMm);
        holeList.selection = initialStats.recommendation.holeMode;
        kissCheck.value = true;
        perfCheck.value = false;
        updateVisibility();
    };
    tightBtn.onClick = function () {
        shapeList.selection = 4; // Tight
        kissCheck.value = true;
        updateVisibility();
    };
    shapeBtn.onClick = function () {
        shapeList.selection = 0; // Rounded Rect
        updateVisibility();
    };
    dualBtn.onClick = function () {
        kissCheck.value = true;
        perfCheck.value = true;
        updateVisibility();
    };

    // Status / Artwork Details Footer
    var footerGroup = dialog.add("group");
    footerGroup.orientation = "row";
    footerGroup.alignChildren = ["left", "center"];
    var statusStats = footerGroup.add("statictext", undefined, "");
    statusStats.preferredSize.width = 460;
    updateStatsFooter();

    // Action Buttons
    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var previewButton = buttons.add("button", undefined, OZO.tr("Update Preview"));
    previewButton.preferredSize = [120, 30];
    var cancelButton = buttons.add("button", undefined, OZO.tr("Cancel"), {name: "cancel"});
    cancelButton.preferredSize = [85, 30];
    var applyButton = buttons.add("button", undefined, OZO.tr("Generate CutContour"), {name: "ok"});
    applyButton.preferredSize = [160, 30];
    dialog.defaultElement = applyButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog, function () {
        updateStatsFooter();
        updateValidationUI();
    });

    function readSettings() {
        var unit = (unitList.selection && unitList.selection.text) ? unitList.selection.text : "mm";
        var factor = unitFactor(unit);
        var baseOffsetPt = numberValue(offsetInput, "Offset / Bleed", true) * factor;
        var radiusPt = numberValue(radiusInput, "Corner Radius", true) * factor;

        var kissOffsetPt = kissCheck.value ?
            numberValue(kissOffsetInput, "Kiss-Cut Offset", true) * factor : baseOffsetPt;
        var perfOffsetPt = perfCheck.value ?
            numberValue(perfOffsetInput, "Die-Cut Offset", true) * factor : 0;

        var strokeIdx = (strokeList.selection && strokeList.selection.index >= 0) ? strokeList.selection.index : 0;
        var weightPt = 0.25;
        if (strokeIdx === 1) weightPt = 0.30;
        else if (strokeIdx === 2) weightPt = 0.50;
        else if (strokeIdx === 3) weightPt = 0.75;

        var pIdx = (presetList.selection && presetList.selection.index >= 0) ? presetList.selection.index : 0;
        var preset = MACHINE_PRESETS[pIdx];
        var kissName = trim(kissNameInput.text) || "CutContour";
        var perfName = trim(perfNameInput.text) || "PerfCutContour";

        var shapeIdx = (shapeList.selection && shapeList.selection.index >= 0) ? shapeList.selection.index : 0;
        var holeIdx = (holeList.selection && holeList.selection.index >= 0) ? holeList.selection.index : 0;

        return {
            shapeIndex: shapeIdx,
            radiusPt: radiusPt,
            perfectSquare: perfectSquareCheck.value,
            holeMode: holeIdx,
            kissEnabled: kissCheck.value,
            kissName: kissName,
            kissCmyk: preset.kissCmyk,
            kissOffsetPt: kissOffsetPt,
            perfEnabled: perfCheck.value,
            perfName: perfName,
            perfCmyk: preset.perfCmyk,
            perfOffsetPt: perfOffsetPt,
            strokeWeight: weightPt,
            overprint: overprintCheck.value,
            optimizePath: optPathCheck.value,
            addRegMarks: regMarksCheck.value,
            layerName: preset.layerName || "CUTTING"
        };
    }

    previewButton.onClick = function () {
        previewButton.enabled = false;
        try {
            var settings = readSettings();
            if (!settings.kissEnabled && !settings.perfEnabled) {
                throw new Error(OZO.isKhmer() ?
                    "ត្រូវតែជ្រើសរើសយ៉ាងហោចណាស់ Kiss-Cut ឬ Die-Cut មួយ។" :
                    "Please enable at least Kiss-Cut or Die-Cut before generating.");
            }
            generatePreview(settings);
            updateValidationUI();
        } catch (error) {
            cleanupPreview(true);
            alert(SCRIPT_NAME + " preview failed.\n\n" + error.message);
        }
        previewButton.enabled = true;
    };

    // Smooth Up/Down arrow stepping for native CC feel
    OZO.makeNumericSmooth(offsetInput, {step: 0.5, min: 0, max: 999});
    OZO.makeNumericSmooth(radiusInput, {step: 0.5, min: 0, max: 999});
    OZO.makeNumericSmooth(kissOffsetInput, {step: 0.5, min: 0, max: 999});
    OZO.makeNumericSmooth(perfOffsetInput, {step: 0.5, min: 0, max: 999});

    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    previousUnit = currentUnit();
    offsetUnitLbl.text = previousUnit;
    radiusUnitLbl.text = previousUnit;
    kissUnitLbl.text = previousUnit;
    perfUnitLbl.text = previousUnit;
    updateVisibility();
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    offsetInput.active = true;

    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview(true);
        restoreSelection();
        return;
    }

    try {
        var finalSettings = readSettings();
        if (!finalSettings.kissEnabled && !finalSettings.perfEnabled) {
            throw new Error(OZO.isKhmer() ?
                "ត្រូវតែជ្រើសរើសយ៉ាងហោចណាស់ Kiss-Cut ឬ Die-Cut មួយ។" :
                "Please enable at least Kiss-Cut or Die-Cut before generating.");
        }
        generatePreview(finalSettings);

        // Move previewGroup to destination production layer
        var finalLayer = null;
        for (var lIdx = 0; lIdx < doc.layers.length; lIdx++) {
            if (doc.layers[lIdx].name === finalSettings.layerName && doc.layers[lIdx] !== previewLayer) {
                finalLayer = doc.layers[lIdx];
                break;
            }
        }
        if (!finalLayer) {
            finalLayer = doc.layers.add();
            finalLayer.name = finalSettings.layerName;
        }
        finalLayer.locked = false;
        finalLayer.visible = true;
        finalLayer.zOrder(ZOrderMethod.BRINGTOFRONT);

        var finalGroup = previewGroup;
        if (previewGroup) {
            previewGroup.move(finalLayer, ElementPlacement.PLACEATEND);
        }
        cleanupPreview(false);

        doc.selection = null;
        if (finalGroup) {
            try { finalGroup.selected = true; } catch (ignoreSel) {}
        }

        OZO.saveWindowState(dialog, STATE_NAMESPACE);
        app.redraw();
        alert(OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f\u1794\u1793\u17d2\u1791\u17b6\u178f\u17cb\u1780\u17b6\u178f\u17cb CutContour \u178a\u17c4\u1799\u1787\u17c4\u1782\u1787\u17d0\u1799\u179b\u17be\u179f\u17d2\u179a\u1791\u17b6\u1794\u17cb " + finalSettings.layerName + "\u17d4\n\n" + OZO.credit() :
            "CutContour PRO generated successfully on layer " + finalSettings.layerName + ".\n\n" + OZO.credit());
    } catch (error) {
        cleanupPreview(true);
        restoreSelection();
        alert(SCRIPT_NAME + " failed.\n\n" + error.message);
    }
})();
