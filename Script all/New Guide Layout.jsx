#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * New Guide Layout for Adobe Illustrator
 * Recreates Photoshop's "New Guide Layout" dialog with mathematical precision.
 * Supports presets, columns, rows, gutters, margins, guide colors, centering,
 * live preview, and clear existing guides.
 */
(function () {
    var SCRIPT_NAME = "New guide layout";
    var SCRIPT_VERSION = "1.0";
    var STATE_NAMESPACE = "new_guide_layout";
    var PREVIEW_LAYER_NAME = "__GuideLayout_Preview__";

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var previewLayer = null;

    // -------------------------------------------------------------
    // Unit Detection & Parsing
    // -------------------------------------------------------------
    function getDocUnit() {
        try {
            return (typeof OZO !== "undefined" && OZO.getDocDefaultUnit) ?
                OZO.getDocDefaultUnit(doc) : "cm";
        } catch (e) {
            return "cm";
        }
    }

    var defaultDocUnit = getDocUnit();

    function trim(value) {
        return String(value || "").replace(/^\s+|\s+$/g, "");
    }

    function parseLength(str, defaultUnit) {
        str = trim(str).replace(/,/g, ".");
        if (str === "") return null;
        var match = str.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-zA-Z"']*)$/);
        if (!match) return null;
        var val = parseFloat(match[1]);
        if (isNaN(val)) return null;
        var unit = (match[2] || defaultUnit || "cm").toLowerCase();
        return OZO.toPoints(val, unit);
    }

    function formatLength(pt, unit) {
        if (pt === null || pt === undefined || isNaN(pt)) return "";
        unit = unit || defaultDocUnit;
        var val = OZO.fromPoints(pt, unit);
        return Math.round(val * 100) / 100 + " " + unit;
    }

    // -------------------------------------------------------------
    // Color Palette Definitions
    // -------------------------------------------------------------
    var COLOR_PRESETS = [
        { name: "Cyan", rgb: [0, 255, 255], norm: [0.0, 1.0, 1.0] },
        { name: "Light Blue", rgb: [77, 166, 255], norm: [0.3, 0.65, 1.0] },
        { name: "Magenta", rgb: [255, 0, 255], norm: [1.0, 0.0, 1.0] },
        { name: "Yellow", rgb: [255, 255, 0], norm: [1.0, 1.0, 0.0] },
        { name: "Green", rgb: [0, 255, 0], norm: [0.0, 1.0, 0.0] },
        { name: "Red", rgb: [255, 0, 0], norm: [1.0, 0.0, 0.0] },
        { name: "Light Gray", rgb: [160, 160, 160], norm: [0.63, 0.63, 0.63] }
    ];

    // -------------------------------------------------------------
    // Target Geometry Bounds
    // -------------------------------------------------------------
    function getTargetRects(targetMode) {
        var rects = [];
        if (targetMode === 0) {
            // Active Artboard (Canvas)
            var abIdx = doc.artboards.getActiveArtboardIndex();
            rects.push(doc.artboards[abIdx].artboardRect);
        } else if (targetMode === 1) {
            // All Artboards
            for (var a = 0; a < doc.artboards.length; a++) {
                rects.push(doc.artboards[a].artboardRect);
            }
        } else if (targetMode === 2) {
            // Selected Artwork
            var sel = doc.selection;
            var selItems = [];
            if (sel && sel.typename !== "TextRange") {
                if (sel instanceof Array || sel.typename === "Array" || Object.prototype.toString.call(sel) === "[object Array]" || typeof sel.length === "number") {
                    for (var si = 0; si < sel.length; si++) selItems.push(sel[si]);
                } else {
                    selItems.push(sel);
                }
            }
            if (selItems.length > 0) {
                var combined = null;
                for (var s = 0; s < selItems.length; s++) {
                    var b = selItems[s].geometricBounds;
                    if (!b) continue;
                    if (!combined) {
                        combined = [b[0], b[1], b[2], b[3]];
                    } else {
                        combined[0] = Math.min(combined[0], b[0]);
                        combined[1] = Math.max(combined[1], b[1]);
                        combined[2] = Math.max(combined[2], b[2]);
                        combined[3] = Math.min(combined[3], b[3]);
                    }
                }
                if (combined) rects.push(combined);
            }
            if (rects.length === 0) {
                // Fallback to active artboard if nothing selected
                rects.push(doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect);
            }
        }
        return rects;
    }

    // -------------------------------------------------------------
    // Guide Line Builder
    // -------------------------------------------------------------
    function createGuideLine(container, p1, p2, colorRgb, asNativeGuide) {
        try {
            var line = container.pathItems.add();
            line.setEntirePath([p1, p2]);
            if (asNativeGuide) {
                line.guides = true;
            } else {
                // For preview without locking into native guides
                line.guides = false;
                line.stroked = true;
                line.filled = false;
                line.strokeWidth = 0.5;
                if (doc.documentColorSpace === DocumentColorSpace.RGB) {
                    var rgb = new RGBColor();
                    rgb.red = colorRgb[0];
                    rgb.green = colorRgb[1];
                    rgb.blue = colorRgb[2];
                    line.strokeColor = rgb;
                } else {
                    var cmyk = new CMYKColor();
                    if (colorRgb[0] === 0 && colorRgb[1] === 255 && colorRgb[2] === 255) {
                        cmyk.cyan = 100; cmyk.magenta = 0; cmyk.yellow = 0; cmyk.black = 0;
                    } else if (colorRgb[0] === 255 && colorRgb[1] === 0 && colorRgb[2] === 255) {
                        cmyk.cyan = 0; cmyk.magenta = 100; cmyk.yellow = 0; cmyk.black = 0;
                    } else {
                        cmyk.cyan = 100; cmyk.magenta = 0; cmyk.yellow = 0; cmyk.black = 0;
                    }
                    line.strokeColor = cmyk;
                }
            }
            return line;
        } catch (eLine) {
            return null;
        }
    }

    // -------------------------------------------------------------
    // Layout Calculation Engine
    // -------------------------------------------------------------
    function generateGuidesForRect(container, rect, settings, asNativeGuide) {
        var left = rect[0];
        var top = rect[1];
        var right = rect[2];
        var bottom = rect[3];

        var createdV = [];
        var createdH = [];
        var createdGuideCount = 0;

        var EPSILON = 0.005; // 0.005 pt = 1.76 microns exact precision

        function addVGuide(x) {
            for (var i = 0; i < createdV.length; i++) {
                if (Math.abs(x - createdV[i]) < EPSILON) return;
            }
            createdV.push(x);
            if (createGuideLine(container, [x, top], [x, bottom], settings.colorRgb, asNativeGuide)) {
                createdGuideCount++;
            }
        }

        function addHGuide(y) {
            for (var j = 0; j < createdH.length; j++) {
                if (Math.abs(y - createdH[j]) < EPSILON) return;
            }
            createdH.push(y);
            if (createGuideLine(container, [left, y], [right, y], settings.colorRgb, asNativeGuide)) {
                createdGuideCount++;
            }
        }

        var mTop = 0;
        var mBottom = 0;
        var mLeft = 0;
        var mRight = 0;

        if (settings.useMargin) {
            mTop = settings.marginTop !== null ? settings.marginTop : 0;
            mBottom = settings.marginBottom !== null ? settings.marginBottom : 0;
            mLeft = settings.marginLeft !== null ? settings.marginLeft : 0;
            mRight = settings.marginRight !== null ? settings.marginRight : 0;

            // Draw 4 Margin Guides without duplicates
            if (mTop !== 0) addHGuide(top - mTop);
            if (mBottom !== 0) addHGuide(bottom + mBottom);
            if (mLeft !== 0) addVGuide(left + mLeft);
            if (mRight !== 0) addVGuide(right - mRight);
        }

        var innerLeft = left + mLeft;
        var innerRight = right - mRight;
        var innerTop = top - mTop;
        var innerBottom = bottom + mBottom;
        var innerW = innerRight - innerLeft;
        var innerH = innerTop - innerBottom;

        if (innerW <= 0 || innerH <= 0) return createdGuideCount;

        // 1. Columns
        if (settings.useColumns && settings.colCount > 0) {
            var nCols = settings.colCount;
            var colW = settings.colWidth;
            var colGutter = settings.colGutter !== null ? settings.colGutter : 0;

            if (colW === null) {
                // Auto-calculate column width from available width and gutter
                colW = (innerW - (nCols - 1) * colGutter) / nCols;
            } else if (settings.colGutter === null && nCols > 1) {
                // Auto-calculate gutter from fixed column width
                colGutter = (innerW - nCols * colW) / (nCols - 1);
            }

            var startX = innerLeft;
            var totalColsW = nCols * colW + (nCols - 1) * colGutter;
            if (settings.centerColumns && totalColsW < innerW) {
                startX = innerLeft + (innerW - totalColsW) / 2;
            }

            for (var c = 0; c < nCols; c++) {
                var cLeft = startX + c * (colW + colGutter);
                var cRight = cLeft + colW;
                // Mathematically exact boundary snapping on last column
                if (settings.colWidth === null && !settings.centerColumns && c === nCols - 1) {
                    cRight = innerRight;
                }

                // Guide on left edge of column
                addVGuide(cLeft);
                // Guide on right edge of column if gutter > 0
                if (colGutter > 0 || c === nCols - 1) {
                    addVGuide(cRight);
                }
            }
        }

        // 2. Rows
        if (settings.useRows && settings.rowCount > 0) {
            var nRows = settings.rowCount;
            var rowH = settings.rowHeight;
            var rowGutter = settings.rowGutter !== null ? settings.rowGutter : 0;

            if (rowH === null) {
                // Auto-calculate row height from available height and gutter
                rowH = (innerH - (nRows - 1) * rowGutter) / nRows;
            } else if (settings.rowGutter === null && nRows > 1) {
                // Auto-calculate gutter from fixed row height
                rowGutter = (innerH - nRows * rowH) / (nRows - 1);
            }

            var startY = innerTop;
            for (var r = 0; r < nRows; r++) {
                var rTop = startY - r * (rowH + rowGutter);
                var rBottom = rTop - rowH;
                // Mathematically exact boundary snapping on last row
                if (settings.rowHeight === null && r === nRows - 1) {
                    rBottom = innerBottom;
                }

                // Guide on top edge of row
                addHGuide(rTop);
                // Guide on bottom edge of row if gutter > 0
                if (rowGutter > 0 || r === nRows - 1) {
                    addHGuide(rBottom);
                }
            }
        }
        return createdGuideCount;
    }

    // -------------------------------------------------------------
    // Guide Cleanup Engine
    // -------------------------------------------------------------
    function clearExistingGuides(targetRects) {
        var removedCount = 0;
        for (var i = doc.pathItems.length - 1; i >= 0; i--) {
            try {
                var item = doc.pathItems[i];
                if (item.guides === true) {
                    var gb = item.geometricBounds;
                    var isVert = Math.abs(gb[0] - gb[2]) < 1;
                    var isHoriz = Math.abs(gb[1] - gb[3]) < 1;

                    for (var r = 0; r < targetRects.length; r++) {
                        var tr = targetRects[r];
                        var hit = false;
                        if (isVert) {
                            if (gb[0] >= tr[0] - 10 && gb[0] <= tr[2] + 10 &&
                                gb[1] >= tr[3] - 10 && gb[3] <= tr[1] + 10) {
                                hit = true;
                            }
                        } else if (isHoriz) {
                            if (gb[1] <= tr[1] + 10 && gb[1] >= tr[3] - 10 &&
                                gb[0] <= tr[2] + 10 && gb[2] >= tr[0] - 10) {
                                hit = true;
                            }
                        } else {
                            if (gb[0] >= tr[0] - 10 && gb[2] <= tr[2] + 10 &&
                                gb[1] <= tr[1] + 10 && gb[3] >= tr[3] - 10) {
                                hit = true;
                            }
                        }
                        if (hit) {
                            try {
                                if (item.layer && item.layer.locked) item.layer.locked = false;
                                item.locked = false;
                                item.remove();
                                removedCount++;
                                break;
                            } catch (eUnlock) {}
                        }
                    }
                }
            } catch (ignoreGuideRemove) {}
        }
        return removedCount;
    }

    function cleanupPreview() {
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (e) {}
        }
        previewLayer = null;
    }

    function renderPreview(settings) {
        if (!settings.previewActive) {
            cleanupPreview();
            app.redraw();
            return;
        }

        try {
            if (!previewLayer) {
                previewLayer = doc.layers.add();
                previewLayer.name = PREVIEW_LAYER_NAME;
                previewLayer.locked = false;
                previewLayer.visible = true;
            } else {
                // High-performance reuse: clear items without rebuilding layer hierarchy
                for (var p = previewLayer.pageItems.length - 1; p >= 0; p--) {
                    try { previewLayer.pageItems[p].remove(); } catch (ignoreRem) {}
                }
            }

            var targetRects = getTargetRects(settings.targetIndex);
            for (var i = 0; i < targetRects.length; i++) {
                generateGuidesForRect(previewLayer, targetRects[i], settings, false);
            }
            app.redraw();
        } catch (ePrev) {
            cleanupPreview();
        }
    }

    // -------------------------------------------------------------
    // Presets Library
    // -------------------------------------------------------------
    var PRESETS = [
        {
            name: "Custom",
            useCols: true, numCols: "2", colW: "", colG: "",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "3 cm", mLeft: "3 cm", mBottom: "3 cm", mRight: "3 cm",
            centerCols: false
        },
        {
            name: "12 Column (Web / Bootstrap)",
            useCols: true, numCols: "12", colW: "", colG: "20 px",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "3 cm", mLeft: "3 cm", mBottom: "3 cm", mRight: "3 cm",
            centerCols: true
        },
        {
            name: "8 Column",
            useCols: true, numCols: "8", colW: "", colG: "15 px",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "2 cm", mLeft: "2 cm", mBottom: "2 cm", mRight: "2 cm",
            centerCols: true
        },
        {
            name: "6 Column",
            useCols: true, numCols: "6", colW: "", colG: "15 px",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "2 cm", mLeft: "2 cm", mBottom: "2 cm", mRight: "2 cm",
            centerCols: true
        },
        {
            name: "4 Column",
            useCols: true, numCols: "4", colW: "", colG: "10 mm",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "2 cm", mLeft: "2 cm", mBottom: "2 cm", mRight: "2 cm",
            centerCols: true
        },
        {
            name: "3 Column (Tri-Fold)",
            useCols: true, numCols: "3", colW: "", colG: "0 mm",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: false, mTop: "0 cm", mLeft: "0 cm", mBottom: "0 cm", mRight: "0 cm",
            centerCols: false
        },
        {
            name: "2 Column (Half Split)",
            useCols: true, numCols: "2", colW: "", colG: "0 mm",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "3 cm", mLeft: "3 cm", mBottom: "3 cm", mRight: "3 cm",
            centerCols: false
        },
        {
            name: "Margins Only (3 cm)",
            useCols: false, numCols: "", colW: "", colG: "",
            useRows: false, numRows: "", rowH: "", rowG: "",
            useMargin: true, mTop: "3 cm", mLeft: "3 cm", mBottom: "3 cm", mRight: "3 cm",
            centerCols: false
        },
        {
            name: "Rule of Thirds (3x3)",
            useCols: true, numCols: "3", colW: "", colG: "0 mm",
            useRows: true, numRows: "3", rowH: "", rowG: "0 mm",
            useMargin: false, mTop: "0 cm", mLeft: "0 cm", mBottom: "0 cm", mRight: "0 cm",
            centerCols: false
        }
    ];

    // -------------------------------------------------------------
    // User Interface Construction (Matching Photoshop)
    // -------------------------------------------------------------
    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("New guide layout"), "v2.2 \u2022 Modular Guide System");

    // Top Area: Controls on Left, Buttons on Right
    var topArea = dialog.add("group");
    topArea.orientation = "row";
    topArea.alignChildren = ["fill", "top"];
    topArea.spacing = 14;

    var leftControls = topArea.add("group");
    leftControls.orientation = "column";
    leftControls.alignChildren = ["left", "center"];
    leftControls.spacing = 8;

    // Row 1: Preset
    var presetRow = leftControls.add("group");
    presetRow.orientation = "row";
    presetRow.alignChildren = ["left", "center"];
    var presetLbl = presetRow.add("statictext", undefined, OZO.tr("Preset:"));
    presetLbl.preferredSize.width = 55;
    var presetDropdown = presetRow.add("dropdownlist", undefined, []);
    presetDropdown.preferredSize.width = 240;
    for (var p = 0; p < PRESETS.length; p++) {
        presetDropdown.add("item", PRESETS[p].name);
    }
    presetDropdown.selection = 0;

    // Row 2: Target
    var targetRow = leftControls.add("group");
    targetRow.orientation = "row";
    targetRow.alignChildren = ["left", "center"];
    var targetLbl = targetRow.add("statictext", undefined, OZO.tr("Target:"));
    targetLbl.preferredSize.width = 55;
    var targetDropdown = targetRow.add("dropdownlist", undefined, [
        OZO.tr("Canvas"),
        OZO.tr("All Artboards"),
        OZO.tr("Selected Artwork")
    ]);
    targetDropdown.preferredSize.width = 240;
    targetDropdown.selection = 0;

    // Buttons on Right Side (OK, Cancel, Preview)
    var rightButtons = topArea.add("group");
    rightButtons.orientation = "column";
    rightButtons.alignChildren = ["fill", "top"];
    rightButtons.spacing = 8;
    rightButtons.preferredSize.width = 95;

    var okBtn = rightButtons.add("button", undefined, OZO.tr("Apply"), { name: "ok" });
    okBtn.preferredSize.height = 26;
    var cancelBtn = rightButtons.add("button", undefined, OZO.tr("Cancel"), { name: "cancel" });
    cancelBtn.preferredSize.height = 26;
    dialog.defaultElement = okBtn;
    dialog.cancelElement = cancelBtn;
    var previewCheck = rightButtons.add("checkbox", undefined, OZO.tr("Preview"));
    previewCheck.value = true;

    // Color Panel
    var colorPanel = dialog.add("panel", undefined, OZO.tr("Color"));
    colorPanel.orientation = "row";
    colorPanel.alignChildren = ["left", "center"];
    colorPanel.margins = [12, 10, 12, 8];
    colorPanel.spacing = 10;

    var colorLbl = colorPanel.add("statictext", undefined, OZO.tr("Color:"));
    colorLbl.preferredSize.width = 45;
    var colorDropdown = colorPanel.add("dropdownlist", undefined, []);
    colorDropdown.preferredSize.width = 180;
    for (var ci = 0; ci < COLOR_PRESETS.length; ci++) {
        colorDropdown.add("item", COLOR_PRESETS[ci].name);
    }
    colorDropdown.selection = 0;

    // Color Swatch Box
    var colorBox = colorPanel.add("panel");
    colorBox.preferredSize = [48, 22];

    colorBox.onDraw = function () {
        try {
            var cIdx = (colorDropdown.selection && colorDropdown.selection.index >= 0) ?
                colorDropdown.selection.index : 0;
            var norm = COLOR_PRESETS[cIdx].norm;
            var g = this.graphics;
            var brush = g.newBrush(g.BrushType.SOLID_COLOR, norm, 1);
            g.rectPath(0, 0, this.size[0], this.size[1]);
            g.fillPath(brush);
        } catch (eDraw) {}
    };

    function updateSwatchGraphic() {
        try {
            var cIdx = (colorDropdown.selection && colorDropdown.selection.index >= 0) ?
                colorDropdown.selection.index : 0;
            var norm = COLOR_PRESETS[cIdx].norm;
            colorBox.graphics.backgroundColor = colorBox.graphics.newBrush(
                colorBox.graphics.BrushType.SOLID_COLOR,
                norm, 1
            );
            colorBox.notify("onDraw");
        } catch (ignore) {}
    }

    colorDropdown.onChange = function () {
        updateSwatchGraphic();
        onSettingsChanged();
    };

    // Columns and Rows Panels (Side by Side)
    var gridRow = dialog.add("group");
    gridRow.orientation = "row";
    gridRow.alignChildren = ["fill", "fill"];
    gridRow.spacing = 10;

    // Left: Columns Panel
    var colPanel = gridRow.add("panel", undefined, undefined);
    colPanel.orientation = "column";
    colPanel.alignChildren = ["fill", "top"];
    colPanel.margins = [10, 10, 10, 8];
    colPanel.spacing = 6;
    colPanel.preferredSize.width = 200;

    var colHeader = colPanel.add("checkbox", undefined, OZO.tr("Columns"));
    colHeader.value = true;

    var colNumRow = colPanel.add("group");
    colNumRow.orientation = "row";
    var colNumLbl = colNumRow.add("statictext", undefined, OZO.tr("Number"));
    colNumLbl.preferredSize.width = 50;
    var colNumInput = colNumRow.add("edittext", undefined, "2");
    colNumInput.preferredSize.width = 110;

    var colWidthRow = colPanel.add("group");
    colWidthRow.orientation = "row";
    var colWidthLbl = colWidthRow.add("statictext", undefined, OZO.tr("Width"));
    colWidthLbl.preferredSize.width = 50;
    var colWidthInput = colWidthRow.add("edittext", undefined, "");
    colWidthInput.preferredSize.width = 110;

    var colGutterRow = colPanel.add("group");
    colGutterRow.orientation = "row";
    var colGutterLbl = colGutterRow.add("statictext", undefined, OZO.tr("Gutter"));
    colGutterLbl.preferredSize.width = 50;
    var colGutterInput = colGutterRow.add("edittext", undefined, "");
    colGutterInput.preferredSize.width = 110;

    // Right: Rows Panel
    var rowPanel = gridRow.add("panel", undefined, undefined);
    rowPanel.orientation = "column";
    rowPanel.alignChildren = ["fill", "top"];
    rowPanel.margins = [10, 10, 10, 8];
    rowPanel.spacing = 6;
    rowPanel.preferredSize.width = 200;

    var rowHeader = rowPanel.add("checkbox", undefined, OZO.tr("Rows"));
    rowHeader.value = false;

    var rowNumRow = rowPanel.add("group");
    rowNumRow.orientation = "row";
    var rowNumLbl = rowNumRow.add("statictext", undefined, OZO.tr("Number"));
    rowNumLbl.preferredSize.width = 50;
    var rowNumInput = rowNumRow.add("edittext", undefined, "");
    rowNumInput.preferredSize.width = 110;

    var rowHeightRow = rowPanel.add("group");
    rowHeightRow.orientation = "row";
    var rowHeightLbl = rowHeightRow.add("statictext", undefined, OZO.tr("Height"));
    rowHeightLbl.preferredSize.width = 50;
    var rowHeightInput = rowHeightRow.add("edittext", undefined, "");
    rowHeightInput.preferredSize.width = 110;

    var rowGutterRow = rowPanel.add("group");
    rowGutterRow.orientation = "row";
    var rowGutterLbl = rowGutterRow.add("statictext", undefined, OZO.tr("Gutter"));
    rowGutterLbl.preferredSize.width = 50;
    var rowGutterInput = rowGutterRow.add("edittext", undefined, "");
    rowGutterInput.preferredSize.width = 110;

    // Margin Panel
    var marginPanel = dialog.add("panel", undefined, undefined);
    marginPanel.orientation = "column";
    marginPanel.alignChildren = ["fill", "top"];
    marginPanel.margins = [10, 10, 10, 8];
    marginPanel.spacing = 6;

    var marginHeader = marginPanel.add("checkbox", undefined, OZO.tr("Margin"));
    marginHeader.value = true;

    var marginRow = marginPanel.add("group");
    marginRow.orientation = "row";
    marginRow.alignChildren = ["left", "center"];
    marginRow.spacing = 8;

    // Top
    var mTopGroup = marginRow.add("group");
    mTopGroup.orientation = "column";
    mTopGroup.alignChildren = ["left", "center"];
    mTopGroup.spacing = 2;
    mTopGroup.add("statictext", undefined, OZO.tr("Top:"));
    var mTopInput = mTopGroup.add("edittext", undefined, "3 cm");
    mTopInput.preferredSize.width = 85;

    // Left
    var mLeftGroup = marginRow.add("group");
    mLeftGroup.orientation = "column";
    mLeftGroup.alignChildren = ["left", "center"];
    mLeftGroup.spacing = 2;
    mLeftGroup.add("statictext", undefined, OZO.tr("Left:"));
    var mLeftInput = mLeftGroup.add("edittext", undefined, "3 cm");
    mLeftInput.preferredSize.width = 85;

    // Bottom
    var mBottomGroup = marginRow.add("group");
    mBottomGroup.orientation = "column";
    mBottomGroup.alignChildren = ["left", "center"];
    mBottomGroup.spacing = 2;
    mBottomGroup.add("statictext", undefined, OZO.tr("Bottom:"));
    var mBottomInput = mBottomGroup.add("edittext", undefined, "3 cm");
    mBottomInput.preferredSize.width = 85;

    // Right
    var mRightGroup = marginRow.add("group");
    mRightGroup.orientation = "column";
    mRightGroup.alignChildren = ["left", "center"];
    mRightGroup.spacing = 2;
    mRightGroup.add("statictext", undefined, OZO.tr("Right:"));
    var mRightInput = mRightGroup.add("edittext", undefined, "3 cm");
    mRightInput.preferredSize.width = 85;

    // Bottom Options
    var bottomOptions = dialog.add("group");
    bottomOptions.orientation = "row";
    bottomOptions.alignChildren = ["left", "center"];
    bottomOptions.spacing = 16;

    var centerColsCheck = bottomOptions.add("checkbox", undefined, OZO.tr("Center Columns"));
    centerColsCheck.value = false;

    var clearGuidesCheck = bottomOptions.add("checkbox", undefined, OZO.tr("Clear Existing Guides"));
    clearGuidesCheck.value = false;

    // Modern Footer Bar with Donate Coffee, Credits, and Language
    OZO.addLanguageSelector(dialog);

    // -------------------------------------------------------------
    // Event Handlers & State Management
    // -------------------------------------------------------------
    function updateControlsEnabled() {
        var colsOn = colHeader.value;
        colNumInput.enabled = colsOn;
        colWidthInput.enabled = colsOn;
        colGutterInput.enabled = colsOn;
        centerColsCheck.enabled = colsOn;

        var rowsOn = rowHeader.value;
        rowNumInput.enabled = rowsOn;
        rowHeightInput.enabled = rowsOn;
        rowGutterInput.enabled = rowsOn;

        var marginOn = marginHeader.value;
        mTopInput.enabled = marginOn;
        mLeftInput.enabled = marginOn;
        mBottomInput.enabled = marginOn;
        mRightInput.enabled = marginOn;
    }

    function readCurrentSettings() {
        var cIdx = (colorDropdown.selection && colorDropdown.selection.index >= 0) ?
            colorDropdown.selection.index : 0;
        var tIdx = (targetDropdown.selection && targetDropdown.selection.index >= 0) ?
            targetDropdown.selection.index : 0;

        var colCount = parseInt(colNumInput.text, 10);
        if (isNaN(colCount) || colCount < 1) colCount = 1;

        var rowCount = parseInt(rowNumInput.text, 10);
        if (isNaN(rowCount) || rowCount < 1) rowCount = 1;

        return {
            targetIndex: tIdx,
            colorRgb: COLOR_PRESETS[cIdx].rgb,
            useColumns: colHeader.value,
            colCount: colCount,
            colWidth: parseLength(colWidthInput.text, defaultDocUnit),
            colGutter: parseLength(colGutterInput.text, defaultDocUnit),
            useRows: rowHeader.value,
            rowCount: rowCount,
            rowHeight: parseLength(rowHeightInput.text, defaultDocUnit),
            rowGutter: parseLength(rowGutterInput.text, defaultDocUnit),
            useMargin: marginHeader.value,
            marginTop: parseLength(mTopInput.text, defaultDocUnit),
            marginLeft: parseLength(mLeftInput.text, defaultDocUnit),
            marginBottom: parseLength(mBottomInput.text, defaultDocUnit),
            marginRight: parseLength(mRightInput.text, defaultDocUnit),
            centerColumns: centerColsCheck.value,
            clearGuides: clearGuidesCheck.value,
            previewActive: previewCheck.value
        };
    }

    function onSettingsChanged() {
        updateControlsEnabled();
        if (previewCheck.value) {
            renderPreview(readCurrentSettings());
        } else {
            cleanupPreview();
            app.redraw();
        }
    }

    colHeader.onClick = onSettingsChanged;
    rowHeader.onClick = onSettingsChanged;
    marginHeader.onClick = onSettingsChanged;
    centerColsCheck.onClick = onSettingsChanged;
    previewCheck.onClick = onSettingsChanged;

    colNumInput.onChanging = onSettingsChanged;
    colWidthInput.onChanging = onSettingsChanged;
    colGutterInput.onChanging = onSettingsChanged;
    rowNumInput.onChanging = onSettingsChanged;
    rowHeightInput.onChanging = onSettingsChanged;
    rowGutterInput.onChanging = onSettingsChanged;
    mTopInput.onChanging = onSettingsChanged;
    mLeftInput.onChanging = onSettingsChanged;
    mBottomInput.onChanging = onSettingsChanged;
    mRightInput.onChanging = onSettingsChanged;

    // Smooth Up/Down arrow stepping for native CC feel
    OZO.makeNumericSmooth(colNumInput, {step: 1, min: 1, max: 100});
    OZO.makeNumericSmooth(colWidthInput, {step: 1, min: 0, max: 9999});
    OZO.makeNumericSmooth(colGutterInput, {step: 1, min: 0, max: 9999});
    OZO.makeNumericSmooth(rowNumInput, {step: 1, min: 1, max: 100});
    OZO.makeNumericSmooth(rowHeightInput, {step: 1, min: 0, max: 9999});
    OZO.makeNumericSmooth(rowGutterInput, {step: 1, min: 0, max: 9999});
    OZO.makeNumericSmooth(mTopInput, {step: 0.5, min: 0, max: 9999});
    OZO.makeNumericSmooth(mLeftInput, {step: 0.5, min: 0, max: 9999});
    OZO.makeNumericSmooth(mBottomInput, {step: 0.5, min: 0, max: 9999});
    OZO.makeNumericSmooth(mRightInput, {step: 0.5, min: 0, max: 9999});

    presetDropdown.onChange = function () {
        var idx = (presetDropdown.selection && presetDropdown.selection.index >= 0) ?
            presetDropdown.selection.index : 0;
        var p = PRESETS[idx];
        if (idx > 0) {
            colHeader.value = p.useCols;
            colNumInput.text = p.numCols;
            colWidthInput.text = p.colW;
            colGutterInput.text = p.colG;

            rowHeader.value = p.useRows;
            rowNumInput.text = p.numRows;
            rowHeightInput.text = p.rowH;
            rowGutterInput.text = p.rowG;

            marginHeader.value = p.useMargin;
            mTopInput.text = p.mTop;
            mLeftInput.text = p.mLeft;
            mBottomInput.text = p.mBottom;
            mRightInput.text = p.mRight;

            centerColsCheck.value = p.centerCols;
        }
        onSettingsChanged();
    };

    targetDropdown.onChange = onSettingsChanged;

    // Window Setup & Display
    OZO.restoreWindowState(dialog, STATE_NAMESPACE);
    updateControlsEnabled();
    updateSwatchGraphic();
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    // Initial Live Preview
    if (previewCheck.value) {
        renderPreview(readCurrentSettings());
    }

    function executeGuideLayoutCore(finalSettings) {
        cleanupPreview();
        var targets = getTargetRects(finalSettings.targetIndex);

        if (finalSettings.clearGuides) {
            clearExistingGuides(targets);
        }

        var targetLayer = doc.activeLayer;
        if (!targetLayer || targetLayer.locked || !targetLayer.visible) {
            targetLayer = null;
            for (var ly = 0; ly < doc.layers.length; ly++) {
                if (!doc.layers[ly].locked && doc.layers[ly].visible) {
                    targetLayer = doc.layers[ly];
                    break;
                }
            }
            if (!targetLayer) {
                targetLayer = doc.layers.add();
                targetLayer.name = "Guides";
            }
        }

        var createdGuides = 0;
        for (var t = 0; t < targets.length; t++) {
            createdGuides += generateGuidesForRect(targetLayer, targets[t], finalSettings, true);
        }

        app.redraw();
        return {
            status: "success",
            count: createdGuides,
            targetCount: targets.length
        };
    }

    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
        try {
            var hp = __ozoHeadlessParams;
            var u = hp.unit || defaultDocUnit;
            var factor = OZO.toPoints(1, u);
            var colorIdx = typeof hp.colorIndex === "number" ? hp.colorIndex : 0;
            var chosenColor = COLOR_PRESETS[colorIdx] || COLOR_PRESETS[0];

            var headlessSettings = {
                targetIndex: typeof hp.targetIndex === "number" ? hp.targetIndex : 0,
                useColumns: hp.useColumns !== false,
                colCount: parseInt(hp.colCount, 10) || 0,
                colWidth: hp.colWidth ? parseFloat(hp.colWidth) * factor : null,
                colGutter: hp.colGutter !== undefined ? parseFloat(hp.colGutter) * factor : 0,
                centerColumns: hp.centerColumns === true,

                useRows: hp.useRows === true,
                rowCount: parseInt(hp.rowCount, 10) || 0,
                rowHeight: hp.rowHeight ? parseFloat(hp.rowHeight) * factor : null,
                rowGutter: hp.rowGutter !== undefined ? parseFloat(hp.rowGutter) * factor : 0,
                centerRows: hp.centerRows === true,

                useMargin: hp.useMargin === true,
                marginTop: hp.marginTop !== undefined ? parseFloat(hp.marginTop) * factor : 0,
                marginLeft: hp.marginLeft !== undefined ? parseFloat(hp.marginLeft) * factor : 0,
                marginBottom: hp.marginBottom !== undefined ? parseFloat(hp.marginBottom) * factor : 0,
                marginRight: hp.marginRight !== undefined ? parseFloat(hp.marginRight) * factor : 0,

                clearGuides: hp.clearGuides === true,
                colorIndex: colorIdx,
                colorRgb: chosenColor.rgb,
                colorNorm: chosenColor.norm
            };

            __ozoHeadlessResult = executeGuideLayoutCore(headlessSettings);
            return;
        } catch (eGuidesHeadless) {
            cleanupPreview();
            __ozoHeadlessResult = {
                status: "error",
                message: eGuidesHeadless && eGuidesHeadless.message ? eGuidesHeadless.message : String(eGuidesHeadless)
            };
            return;
        }
    }

    colNumInput.active = true;

    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview();
        app.redraw();
        return;
    }

    // -------------------------------------------------------------
    // Apply Final Native Guides
    // -------------------------------------------------------------
    try {
        var finalSettings = readCurrentSettings();
        var guideRes = executeGuideLayoutCore(finalSettings);
        OZO.saveWindowState(dialog, STATE_NAMESPACE);

        if (guideRes.count === 0) {
            alert(SCRIPT_NAME + "\n\nNo guides were created. Check the margin, " +
                "column, and row settings." +
                (finalSettings.clearGuides ?
                    "\n\nExisting guides in the target area were cleared." : ""));
            return;
        }

        alert(OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f\u1794\u1793\u17d2\u1791\u17b6\u178f\u17cb\u178e\u17c2\u1793\u17b6\u17c6\u178a\u17c4\u1799\u1787\u17c4\u1782\u1787\u17d0\u1799\u17d4\n\n" + OZO.credit() :
            "New Guide Layout applied successfully.\n\n" + OZO.credit());
    } catch (error) {
        cleanupPreview();
        alert(SCRIPT_NAME + " failed.\n\n" + error.message);
    }
})();
