#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Count Items";

    if (app.documents.length === 0) {
        alert(OZO.tr("No Illustrator document is open."));
        return;
    }

    var doc = app.activeDocument;
    var activeLayer = doc.activeLayer;
    var selection = doc.selection;
    var defaultUnit = (typeof OZO !== "undefined" && OZO.getDocDefaultUnit) ?
        OZO.getDocDefaultUnit(doc) : "cm";

    // -----------------------------------
    // Count selected objects & measure dimensions
    // -----------------------------------
    var selectedCount = 0;
    var selBounds = null;

    function validBounds(b) {
        return b && b.length === 4 && isFinite(b[0]) && isFinite(b[1]) && isFinite(b[2]) && isFinite(b[3]) &&
            b[2] >= b[0] && b[1] >= b[3];
    }

    if (selection && selection.typename !== "TextRange" && selection.length) {
        selectedCount = selection.length;
        for (var s = 0; s < selection.length; s++) {
            var item = selection[s];
            var b = null;
            try { b = item.geometricBounds; } catch (eGeo) {
                try { b = item.visibleBounds; } catch (eVis) {}
            }
            if (!validBounds(b)) continue;
            if (!selBounds) {
                selBounds = [b[0], b[1], b[2], b[3]];
            } else {
                selBounds[0] = Math.min(selBounds[0], b[0]);
                selBounds[1] = Math.max(selBounds[1], b[1]);
                selBounds[2] = Math.max(selBounds[2], b[2]);
                selBounds[3] = Math.min(selBounds[3], b[3]);
            }
        }
    }

    // -----------------------------------
    // Count items in active layer and document (all nesting levels)
    // -----------------------------------
    function emptyTypeCounts() {
        return {total: 0, paths: 0, groups: 0, texts: 0,
            images: 0, compounds: 0, other: 0};
    }

    function countContainerItems(container, counters) {
        var items;
        try { items = container.pageItems; } catch (ignoreItems) { return; }
        for (var index = 0; index < items.length; index++) {
            var item = items[index];
            counters.total++;
            try {
                var itemType = item.typename;
                if (itemType === "PathItem") counters.paths++;
                else if (itemType === "GroupItem") counters.groups++;
                else if (itemType === "TextFrame") counters.texts++;
                else if (itemType === "CompoundPathItem") counters.compounds++;
                else if (itemType === "RasterItem" || itemType === "PlacedItem") counters.images++;
                else counters.other++;
            } catch (eType) {
                counters.other++;
            }
        }
    }

    var layerCount = emptyTypeCounts();
    countContainerItems(activeLayer, layerCount);
    var documentCount = emptyTypeCounts();
    countContainerItems(doc, documentCount);

    var layerItemCount = layerCount.total;
    var documentItemCount = documentCount.total;
    var totalLayers = doc.layers.length;
    var totalArtboards = doc.artboards.length;

    // -----------------------------------
    // Count object types in active layer
    // -----------------------------------
    var paths = layerCount.paths;
    var groups = layerCount.groups;
    var texts = layerCount.texts;
    var images = layerCount.images;
    var compounds = layerCount.compounds;
    var other = layerCount.other;

    // -----------------------------------
    // Result dialog
    // -----------------------------------
    var dialog = new Window("dialog", OZO.tr("Count Items"));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("Count Items"), "v2.2 \u2022 Document & Prepress Statistics");

    var activeLayerName = (activeLayer && activeLayer.name) ? activeLayer.name : "Layer 1";
    var activeLayerText = dialog.add("statictext", undefined, OZO.tr("Active layer: ") + activeLayerName);
    activeLayerText.graphics.foregroundColor = activeLayerText.graphics.newPen(
        activeLayerText.graphics.PenType.SOLID_COLOR, [0.65, 0.65, 0.65], 1
    );

    function addStatRow(parent, label, value) {
        var row = parent.add("group");
        row.orientation = "row";
        row.alignChildren = ["center", "center"];
        row.alignment = ["fill", "top"];

        var labelText = row.add("statictext", undefined, label);
        labelText.preferredSize.width = 175;

        var valueText = row.add("statictext", undefined, String(value));
        valueText.justify = "right";
        valueText.preferredSize.width = 75;
        try {
            if (valueText.graphics && valueText.graphics.font) {
                valueText.graphics.font = ScriptUI.newFont(
                    valueText.graphics.font.name,
                    "BOLD",
                    valueText.graphics.font.size || 12
                );
            }
        } catch (eValFont) {}
        return { labelText: labelText, valueText: valueText };
    }

    // Selection Size Panel (if something is selected)
    if (selBounds) {
        var widthPt = Math.abs(selBounds[2] - selBounds[0]);
        var heightPt = Math.abs(selBounds[1] - selBounds[3]);
        var wVal = Math.round(OZO.fromPoints(widthPt, defaultUnit) * 100) / 100;
        var hVal = Math.round(OZO.fromPoints(heightPt, defaultUnit) * 100) / 100;

        var selPanel = dialog.add("panel", undefined, OZO.tr("Selection Dimensions"));
        selPanel.orientation = "column";
        selPanel.alignChildren = ["fill", "top"];
        selPanel.margins = [14, 16, 14, 10];
        selPanel.spacing = 5;

        addStatRow(selPanel, OZO.tr("Width") + " (" + defaultUnit + ")", wVal + " " + defaultUnit);
        addStatRow(selPanel, OZO.tr("Height") + " (" + defaultUnit + ")", hVal + " " + defaultUnit);
    }

    var overviewPanel = dialog.add("panel", undefined, OZO.tr("Overview"));
    overviewPanel.orientation = "column";
    overviewPanel.alignChildren = ["fill", "top"];
    overviewPanel.margins = [14, 16, 14, 10];
    overviewPanel.spacing = 6;

    addStatRow(overviewPanel, OZO.tr("Selected items"), selectedCount);
    addStatRow(overviewPanel, OZO.tr("Items in active layer"), layerItemCount);
    addStatRow(overviewPanel, OZO.tr("Items in document"), documentItemCount);
    addStatRow(overviewPanel, OZO.tr("Document layers"), totalLayers);
    addStatRow(overviewPanel, OZO.tr("Artboards"), totalArtboards);

    var typesPanel = dialog.add("panel", undefined, OZO.tr("Item Types in Active Layer"));
    typesPanel.orientation = "column";
    typesPanel.alignChildren = ["fill", "top"];
    typesPanel.margins = [14, 16, 14, 10];
    typesPanel.spacing = 6;

    addStatRow(typesPanel, OZO.tr("Paths"), paths);
    addStatRow(typesPanel, OZO.tr("Groups"), groups);
    addStatRow(typesPanel, OZO.tr("Text"), texts);
    addStatRow(typesPanel, OZO.tr("Images"), images);
    addStatRow(typesPanel, OZO.tr("Compound paths"), compounds);
    addStatRow(typesPanel, OZO.tr("Other"), other);

    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var closeButton = buttons.add("button", undefined, OZO.tr("Close"), {name: "ok"});
    closeButton.preferredSize = [100, 28];

    OZO.addLanguageSelector(dialog, function () {
        activeLayerText.text = OZO.tr("Active layer: ") + activeLayerName;
    });

    dialog.defaultElement = closeButton;
    dialog.cancelElement = closeButton;
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);
    closeButton.active = true;
    dialog.center();
    dialog.show();

})();
