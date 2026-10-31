#target illustrator
#include "lib/OzoShared.jsxinc"

(function () {
    var SCRIPT_NAME = "Pathfinder";
    var PREVIEW_LAYER_NAME = "__Pathfinder Preview__";

    if (app.documents.length === 0) {
        alert(OZO.tr("Open a document and select artwork before running Pathfinder."));
        return;
    }

    var doc = app.activeDocument;
    var selectionValue = doc.selection;
    if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length < 2) {
        if (confirm(OZO.isKhmer() ?
            "Pathfinder \u178f\u17d2\u179a\u17bc\u179c\u1780\u17b6\u179a\u179c\u178f\u17d2\u1790\u1799\u17c9\u17b6\u1784\u17a0\u17c4\u1785\u178e\u17b6\u179f\u17cb \u17e2\u17d4 \u178f\u17be\u17a2\u17d2\u1793\u1780\u1785\u1784\u17cb\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u179c\u178f\u17d2\u1790\u1793\u17c4\u179b\u17be Artboard \u1793\u17c1\u17c7\u1791\u17b6\u17c6\u1784\u17a2\u179f\u17cb\u178a\u17c4\u1799\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u1791\u17c1?" :
            "Pathfinder requires at least 2 objects. Would you like to select all items on the active artboard automatically?")) {
            doc.selectObjectsOnActiveArtboard();
            selectionValue = doc.selection;
        }
        if (!selectionValue || selectionValue.typename === "TextRange" || selectionValue.length < 2) {
            return;
        }
    }

    var sourceItems = [];
    var sourceHidden = [];
    var sourceParents = [];
    var previewLayer = null;
    var previewActive = false;
    var previewSignature = null;
    var progressWindow = null;
    var progressBar = null;
    var progressText = null;
    var skippedUneditable = 0;
    var i;

    function isEffectivelyUneditable(item) {
        var current = item;
        while (current && current.typename !== "Document") {
            try {
                if (current.typename === "Layer") {
                    if (current.locked || !current.visible) return true;
                } else if (current.locked || current.hidden) {
                    return true;
                }
                current = current.parent;
            } catch (ignoreStateError) {
                return true;
            }
        }
        return false;
    }

    for (i = 0; i < selectionValue.length; i++) {
        try {
            if (isEffectivelyUneditable(selectionValue[i])) {
                skippedUneditable++;
                continue;
            }
            sourceItems.push(selectionValue[i]);
            sourceHidden.push(selectionValue[i].hidden);
            sourceParents.push(selectionValue[i].parent);
        } catch (ignoreUnsupportedItem) {}
    }

    if (sourceItems.length < 2) {
        alert(
            "The selection must contain at least two visible, unlocked artwork objects." +
            (skippedUneditable > 0 ?
                "\n\nSkipped " + skippedUneditable + " locked or hidden object(s)." : "")
        );
        return;
    }

    var operations = [
        {
            name: "Unite",
            command: "Live Pathfinder Add",
            multiResult: false,
            description: "Combine overlapping objects into one shape."
        },
        {
            name: "Minus Front",
            command: "Live Pathfinder Subtract",
            multiResult: false,
            supportsPairs: true,
            description: "Subtract the front objects from the back object."
        },
        {
            name: "Intersect",
            command: "Live Pathfinder Intersect",
            multiResult: false,
            description: "Keep only the area shared by all selected objects."
        },
        {
            name: "Exclude",
            command: "Live Pathfinder Exclude",
            multiResult: false,
            description: "Remove overlapping regions and keep non-overlapping areas."
        },
        {
            name: "Divide",
            command: "Live Pathfinder Divide",
            multiResult: true,
            description: "Split artwork wherever selected objects overlap."
        },
        {
            name: "Trim",
            command: "Live Pathfinder Trim",
            multiResult: true,
            description: "Remove hidden portions while preserving visible filled shapes."
        },
        {
            name: "Merge",
            command: "Live Pathfinder Merge",
            multiResult: true,
            description: "Merge adjoining objects with matching fills and trim overlaps."
        },
        {
            name: "Crop",
            command: "Live Pathfinder Crop",
            multiResult: true,
            description: "Crop the artwork to the boundary of the front object."
        },
        {
            name: "Outline",
            command: "Live Pathfinder Outline",
            multiResult: true,
            description: "Convert overlapping regions into outlined edge segments."
        },
        {
            name: "Minus Back",
            command: "Live Pathfinder Minus Back",
            multiResult: false,
            supportsPairs: true,
            description: "Subtract the back objects from the front object."
        }
    ];

    function errorMessage(error) {
        if (!error) {
            return "Unknown error.";
        }
        return error.message ? error.message : String(error);
    }

    function startProgress(title, total) {
        closeProgress();
        progressWindow = new Window("palette", SCRIPT_NAME + " - Working");
        progressWindow.orientation = "column";
        progressWindow.alignChildren = ["fill", "top"];
        progressWindow.margins = 14;
        progressText = progressWindow.add("statictext", undefined, title);
        progressBar = progressWindow.add("progressbar", undefined, 0, Math.max(1, total));
        progressBar.preferredSize = [360, 16];
        progressWindow.show();
        progressWindow.update();
    }

    function updateProgress(value, message) {
        if (!progressWindow) {
            return;
        }
        progressBar.value = value;
        if (message) {
            progressText.text = message;
        }
        if (value === 0 || value === progressBar.maxvalue || value % 10 === 0) {
            progressWindow.update();
        }
    }

    function closeProgress() {
        if (progressWindow) {
            try {
                progressWindow.close();
            } catch (ignoreCloseError) {}
        }
        progressWindow = null;
        progressBar = null;
        progressText = null;
    }

    function selectItems(items) {
        doc.selection = null;
        for (var index = 0; index < items.length; index++) {
            try {
                items[index].selected = true;
            } catch (ignoreSelectionError) {}
        }
    }

    function restoreSources() {
        for (var index = 0; index < sourceItems.length; index++) {
            try {
                sourceItems[index].hidden = sourceHidden[index];
            } catch (ignoreRestoreError) {}
        }
    }

    function cleanupPreview(skipRedraw) {
        doc.selection = null;
        if (previewLayer) {
            try {
                previewLayer.locked = false;
                previewLayer.visible = true;
                previewLayer.remove();
            } catch (ignoreRemoveError) {}
        }
        previewLayer = null;
        previewActive = false;
        previewSignature = null;
        restoreSources();
        selectItems(sourceItems);
        if (!skipRedraw) {
            app.redraw();
        }
    }

    function createWorkingCopies(layerName) {
        previewLayer = doc.layers.add();
        previewLayer.name = layerName;
        previewLayer.locked = false;
        previewLayer.visible = true;

        var duplicates = [];
        for (var index = 0; index < sourceItems.length; index++) {
            var duplicate = sourceItems[index].duplicate(
                previewLayer,
                ElementPlacement.PLACEATEND
            );
            duplicates.push(duplicate);
            sourceItems[index].hidden = true;
            updateProgress(
                index + 1,
                "Preparing object " + (index + 1) + " of " + sourceItems.length + "..."
            );
        }
        selectItems(duplicates);
        return duplicates;
    }

    function removeEmptyGroups(container) {
        var removed = 0;
        var groups = [];
        try {
            for (var index = 0; index < container.groupItems.length; index++) {
                groups.push(container.groupItems[index]);
            }
        } catch (ignoreCollection) {
            return removed;
        }

        for (var i = groups.length - 1; i >= 0; i--) {
            try {
                removed += removeEmptyGroups(groups[i]);
                if (groups[i].pageItems.length === 0) {
                    groups[i].remove();
                    removed++;
                }
            } catch (ignoreGroup) {}
        }
        return removed;
    }

    function ungroupSelection() {
        var passes = 0;
        while (passes < 20) {
            passes++;
            var currentSelection = doc.selection;
            if (!currentSelection || currentSelection.typename === "TextRange") {
                break;
            }
            var hasSelectedGroup = false;
            for (var index = 0; index < currentSelection.length; index++) {
                if (currentSelection[index].typename === "GroupItem") {
                    hasSelectedGroup = true;
                    break;
                }
            }
            if (!hasSelectedGroup) {
                break;
            }
            try {
                // Illustrator ungroups all selected groups in one command and
                // selects their children for the next pass.
                app.executeMenuCommand("ungroup");
            } catch (ignoreUngroup) {
                break;
            }
        }
    }

    function cleanSelectedGroups() {
        var currentSelection = doc.selection;
        if (!currentSelection || currentSelection.typename === "TextRange") {
            return;
        }
        var selectedGroups = [];
        for (var index = 0; index < currentSelection.length; index++) {
            if (currentSelection[index].typename === "GroupItem") {
                selectedGroups.push(currentSelection[index]);
            }
        }
        for (index = selectedGroups.length - 1; index >= 0; index--) {
            try {
                removeEmptyGroups(selectedGroups[index]);
                if (selectedGroups[index].pageItems.length === 0) {
                    selectedGroups[index].remove();
                }
            } catch (ignoreCleanError) {}
        }
    }

    function groupWorkingSelection() {
        var currentSelection = doc.selection;
        if (!currentSelection || currentSelection.typename === "TextRange" ||
                currentSelection.length === 0) {
            throw new Error("No working artwork is selected.");
        }
        if (currentSelection.length > 1) {
            app.executeMenuCommand("group");
        }
        currentSelection = doc.selection;
        if (!currentSelection || currentSelection.typename === "TextRange" ||
                currentSelection.length !== 1 ||
                currentSelection[0].typename !== "GroupItem") {
            throw new Error("Illustrator could not group the selected artwork for Pathfinder.");
        }
        return currentSelection[0];
    }

    function executeOperation(operation, expandResult, ungroupResult, cleanGroups) {
        // The executeMenuCommand identifiers invoke Effect > Pathfinder, not the
        // Pathfinder panel buttons. Illustrator requires a group for these live
        // effects; grouping also preserves the selected objects' stacking order.
        var workingGroup = groupWorkingSelection();
        app.executeMenuCommand(operation.command);
        app.redraw();
        if (expandResult) {
            var currentSelection = doc.selection;
            if (!currentSelection || currentSelection.typename === "TextRange" ||
                    currentSelection.length === 0) {
                workingGroup.selected = true;
            }
            app.executeMenuCommand("expandStyle");
        }
        if (expandResult && ungroupResult) {
            ungroupSelection();
        }
        if (cleanGroups) {
            cleanSelectedGroups();
        }
        app.redraw();
    }

    function selectedItemsSnapshot() {
        var currentSelection = doc.selection;
        var items = [];
        if (!currentSelection || currentSelection.typename === "TextRange") {
            return items;
        }
        for (var index = 0; index < currentSelection.length; index++) {
            items.push(currentSelection[index]);
        }
        return items;
    }

    function executePairwiseOperation(items, operation, expandResult, ungroupResult,
            cleanGroups) {
        var results = [];
        var pairCount = Math.floor(items.length / 2);
        var pairIndex;

        for (pairIndex = 0; pairIndex < pairCount; pairIndex++) {
            var firstIndex = pairIndex * 2;
            selectItems([items[firstIndex], items[firstIndex + 1]]);
            updateProgress(
                firstIndex + 2,
                "Processing pair " + (pairIndex + 1) + " of " + pairCount + "..."
            );
            executeOperation(
                operation,
                expandResult,
                ungroupResult,
                cleanGroups
            );

            var pairResults = selectedItemsSnapshot();
            for (var resultIndex = 0; resultIndex < pairResults.length; resultIndex++) {
                results.push(pairResults[resultIndex]);
            }
        }

        // Preserve an unmatched final object instead of discarding it.
        if (items.length % 2 !== 0) {
            results.push(items[items.length - 1]);
        }

        selectItems(results);
        app.redraw();
        return results;
    }

    function executeSelectedOperation(workingItems) {
        var operation = selectedOperation();
        if (operation.supportsPairs && pairwiseCheck.value) {
            return executePairwiseOperation(
                workingItems,
                operation,
                expandCheck.value,
                ungroupCheck.value,
                cleanCheck.value
            );
        }
        selectItems(workingItems);
        executeOperation(
            operation,
            expandCheck.value,
            ungroupCheck.value,
            cleanCheck.value
        );
        return selectedItemsSnapshot();
    }

    function currentSettingsSignature() {
        return [
            selectedOperationIndex,
            expandCheck.value ? 1 : 0,
            ungroupCheck.value ? 1 : 0,
            cleanCheck.value ? 1 : 0,
            pairwiseCheck.value ? 1 : 0
        ].join(":");
    }

    function commitWorkingResult() {
        var produced = selectedItemsSnapshot();
        var usableCount = 0;
        for (var producedIndex = 0; producedIndex < produced.length; producedIndex++) {
            var producedItem = produced[producedIndex];
            var isEmptyGroup = false;
            try {
                isEmptyGroup = producedItem.typename === "GroupItem" &&
                    producedItem.pageItems.length === 0;
            } catch (ignoreProducedItem) {}
            if (!isEmptyGroup) {
                usableCount++;
            }
        }
        if (usableCount === 0) {
            throw new Error(
                "The Pathfinder operation produced no result objects. " +
                "Your original artwork was left unchanged."
            );
        }
        startProgress("Committing Pathfinder result...", sourceItems.length);
        var backupLayer = null;
        var backupCopies = [];
        var deleted = [];
        var index;
        try {
            backupLayer = doc.layers.add();
            backupLayer.name = "__Pathfinder Rollback Backup__";
            backupLayer.locked = false;
            backupLayer.visible = true;
            for (index = 0; index < sourceItems.length; index++) {
                var backupCopy = sourceItems[index].duplicate(
                    backupLayer,
                    ElementPlacement.PLACEATEND
                );
                backupCopy.hidden = false;
                backupCopies.push(backupCopy);
                deleted.push(false);
            }
            backupLayer.visible = false;

            for (index = sourceItems.length - 1; index >= 0; index--) {
                sourceItems[index].remove();
                deleted[index] = true;
                updateProgress(
                    sourceItems.length - index,
                    "Committing object " + (sourceItems.length - index) +
                        " of " + sourceItems.length + "..."
                );
            }
            backupLayer.visible = true;
            backupLayer.remove();
        } catch (commitError) {
            var recoveryFailed = false;
            if (backupLayer) {
                try {
                    backupLayer.locked = false;
                    backupLayer.visible = true;
                } catch (ignoreBackupState) {}
                for (index = 0; index < deleted.length; index++) {
                    if (!deleted[index]) continue;
                    try {
                        backupCopies[index].move(
                            sourceParents[index],
                            ElementPlacement.PLACEATEND
                        );
                        backupCopies[index].hidden = sourceHidden[index];
                        sourceItems[index] = backupCopies[index];
                    } catch (restoreError) {
                        recoveryFailed = true;
                    }
                }
                if (!recoveryFailed) {
                    try { backupLayer.remove(); } catch (ignoreBackupRemoval) {}
                } else {
                    try {
                        backupLayer.name = "Pathfinder Recovery - DO NOT DELETE";
                    } catch (ignoreBackupRename) {}
                }
            }
            throw new Error(
                errorMessage(commitError) +
                (recoveryFailed ?
                    "\n\nSome originals could not be restored automatically. " +
                    "They remain in the Pathfinder Recovery layer." :
                    "\n\nThe original artwork was restored from rollback copies.")
            );
        }
        previewLayer.name = "Pathfinder Result";
        previewLayer = null;
        previewActive = false;
        previewSignature = null;
        closeProgress();
        var resultSelection = doc.selection;
        return resultSelection && resultSelection.typename !== "TextRange" ?
            resultSelection.length : 0;
    }

    function iconRectangle(graphics, left, top, right, bottom, brush, pen) {
        graphics.newPath();
        graphics.moveTo(left, top);
        graphics.lineTo(right, top);
        graphics.lineTo(right, bottom);
        graphics.lineTo(left, bottom);
        graphics.closePath();
        if (brush) {
            graphics.fillPath(brush);
        }
        if (pen) {
            graphics.strokePath(pen);
        }
    }

    function operationLabelLines(operationIndex) {
        if (OZO.getLanguage() === "km") {
            if (operationIndex === 1) return ["\u178a\u1780\u1798\u17bb\u1781"];
            if (operationIndex === 9) return ["\u178a\u1780\u1780\u17d2\u179a\u17c4\u1799"];
            return [OZO.tr(operations[operationIndex].name)];
        }
        if (operationIndex === 1) {
            return ["Minus", "Front"];
        }
        if (operationIndex === 9) {
            return ["Minus", "Back"];
        }
        return [operations[operationIndex].name];
    }

    function drawCenteredLabel(graphics, text, pen, y, buttonWidth, font) {
        var textWidth = text.length * 5;
        try {
            var measured = graphics.measureString(text, font);
            textWidth = measured.width || measured[0] || textWidth;
        } catch (ignoreMeasurement) {}
        try {
            graphics.drawString(
                text,
                pen,
                Math.max(4, (buttonWidth - textWidth) / 2),
                y,
                font
            );
        } catch (ignoreLabel) {}
    }

    function drawPathfinderIcon(control, operationIndex, selected) {
        var graphics = control.graphics;
        try {
            graphics.drawOSControl();
        } catch (ignoreBackground) {}

        var blueBrush = graphics.newBrush(
            graphics.BrushType.SOLID_COLOR,
            selected ? [0.10, 0.48, 0.86, 1] : [0.22, 0.55, 0.82, 1]
        );
        var paleBrush = graphics.newBrush(
            graphics.BrushType.SOLID_COLOR,
            [0.90, 0.92, 0.94, 1]
        );
        var darkPen = graphics.newPen(
            graphics.PenType.SOLID_COLOR,
            selected ? [0.05, 0.28, 0.58, 1] : [0.24, 0.27, 0.31, 1],
            selected ? 2 : 1
        );
        var lightPen = graphics.newPen(
            graphics.PenType.SOLID_COLOR,
            [0.72, 0.75, 0.79, 1],
            1
        );
        var labelPen = graphics.newPen(
            graphics.PenType.SOLID_COLOR,
            [0.12, 0.14, 0.17, 1],
            1
        );

        var buttonWidth = control.size.width || control.size[0] || 84;
        var buttonHeight = control.size.height || control.size[1] || 68;
        var first = [24, 8, 44, 26];
        var second = [36, 15, 56, 33];
        var overlap = [36, 15, 44, 26];

        if (operationIndex === 0) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], blueBrush, null);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], blueBrush, null);
        } else if (operationIndex === 1) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], blueBrush, darkPen);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], paleBrush, null);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], null, lightPen);
        } else if (operationIndex === 2) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], null, lightPen);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], null, lightPen);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], blueBrush, darkPen);
        } else if (operationIndex === 3) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], blueBrush, null);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], blueBrush, null);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], paleBrush, darkPen);
        } else if (operationIndex === 4) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], paleBrush, darkPen);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], paleBrush, darkPen);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], blueBrush, darkPen);
        } else if (operationIndex === 5) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], blueBrush, null);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], paleBrush, darkPen);
        } else if (operationIndex === 6) {
            iconRectangle(graphics, 24, 11, 56, 31, blueBrush, darkPen);
        } else if (operationIndex === 7) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], null, lightPen);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], null, darkPen);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], blueBrush, null);
        } else if (operationIndex === 8) {
            iconRectangle(graphics, first[0], first[1], first[2], first[3], null, darkPen);
            iconRectangle(graphics, second[0], second[1], second[2], second[3], null, darkPen);
        } else {
            iconRectangle(graphics, second[0], second[1], second[2], second[3], blueBrush, darkPen);
            iconRectangle(graphics, overlap[0], overlap[1], overlap[2], overlap[3], paleBrush, null);
            iconRectangle(graphics, first[0], first[1], first[2], first[3], null, lightPen);
        }

        if (selected) {
            iconRectangle(
                graphics,
                3,
                3,
                buttonWidth - 3,
                buttonHeight - 3,
                null,
                darkPen
            );
        }

        var labelFont = graphics.font;
        try {
            labelFont = ScriptUI.newFont(graphics.font.name, "REGULAR", 9);
        } catch (ignoreFont) {}
        var labelLines = operationLabelLines(operationIndex);
        if (labelLines.length === 1) {
            drawCenteredLabel(graphics, labelLines[0], labelPen, 43, buttonWidth, labelFont);
        } else {
            drawCenteredLabel(graphics, labelLines[0], labelPen, 39, buttonWidth, labelFont);
            drawCenteredLabel(graphics, labelLines[1], labelPen, 50, buttonWidth, labelFont);
        }
    }

    var dialog = new Window("dialog", OZO.tr(SCRIPT_NAME));
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.spacing = 10;
    dialog.margins = 14;

    OZO.addDialogHeader(dialog, OZO.tr("Pathfinder"), "v2.0 • Live Boolean & Shape Operations");

    var operationPanel = dialog.add("panel", undefined, "Operation");
    operationPanel.orientation = "column";
    operationPanel.alignChildren = ["fill", "top"];
    operationPanel.margins = [14, 20, 14, 12];

    var selectedOperationIndex = 0;
    var operationButtons = [];
    var operationRows = [];
    operationRows.push(operationPanel.add("group"));
    operationRows.push(operationPanel.add("group"));
    operationRows[0].spacing = 6;
    operationRows[1].spacing = 6;

    for (i = 0; i < operations.length; i++) {
        var operationButton = operationRows[Math.floor(i / 5)].add(
            "button",
            undefined,
            ""
        );
        operationButton.preferredSize = [84, 68];
        operationButton.operationIndex = i;
        operationButton.helpTip = operations[i].name + " - " + operations[i].description;
        operationButton.onDraw = function () {
            drawPathfinderIcon(
                this,
                this.operationIndex,
                this.operationIndex === selectedOperationIndex
            );
        };
        operationButton.onClick = function () {
            selectedOperationIndex = this.operationIndex;
            ungroupCheck.value = expandCheck.value &&
                operations[selectedOperationIndex].multiResult;
            pairwiseCheck.value = !!operations[selectedOperationIndex].supportsPairs;
            refreshOperationIcons();
            updateDescription();
        };
        operationButtons.push(operationButton);
    }

    var descriptionText = operationPanel.add(
        "statictext",
        undefined,
        operations[0].description,
        {multiline: true}
    );
    descriptionText.preferredSize = [430, 38];
    var selectionCountText = operationPanel.add(
        "statictext",
        undefined,
        sourceItems.length + (sourceItems.length === 1 ? " selected object" : " selected objects")
    );
    var resultBehaviorText = operationPanel.add(
        "statictext",
        undefined,
        "Expected result: one combined object"
    );

    var optionsPanel = dialog.add("panel", undefined, "Result");
    optionsPanel.orientation = "column";
    optionsPanel.alignChildren = ["left", "center"];
    optionsPanel.margins = [14, 20, 14, 12];

    var expandCheck = optionsPanel.add("checkbox", undefined, "[+] Expand the Pathfinder result");
    expandCheck.value = true;
    var ungroupCheck = optionsPanel.add(
        "checkbox",
        undefined,
        "[#] Return individual result objects"
    );
    var cleanCheck = optionsPanel.add("checkbox", undefined, "[-] Remove empty result groups");
    cleanCheck.value = true;
    var pairwiseCheck = optionsPanel.add(
        "checkbox",
        undefined,
        "[2] Process Minus operations in pairs"
    );
    pairwiseCheck.value = false;

    var previewNote = dialog.add(
        "statictext",
        undefined,
        "[<] Safe preview uses temporary duplicates. Original artwork is restored before Apply, Cancel, or preview failure.",
        {multiline: true}
    );
    previewNote.preferredSize = [430, 34];

    var statusText = dialog.add("statictext", undefined, "Ready to preview Unite.");

    var buttons = dialog.add("group");
    buttons.alignment = ["right", "top"];
    var previewButton = buttons.add("button", undefined, "[>] Update Preview");
    var cancelButton = buttons.add("button", undefined, "[X] Cancel", {name: "cancel"});
    var applyButton = buttons.add("button", undefined, "[OK] Apply", {name: "ok"});
    dialog.defaultElement = applyButton;
    dialog.cancelElement = cancelButton;

    OZO.addLanguageSelector(dialog, function () {
        updateDescription();
        refreshOperationIcons();
    });

    function selectedOperation() {
        return operations[selectedOperationIndex];
    }

    function refreshOperationIcons() {
        for (var index = 0; index < operationButtons.length; index++) {
            try {
                operationButtons[index].notify("onDraw");
            } catch (ignoreNotify) {}
        }
    }

    function updateDescription() {
        var operation = selectedOperation();
        ungroupCheck.enabled = expandCheck.value;
        pairwiseCheck.enabled = !!operation.supportsPairs;
        if (!expandCheck.value) {
            ungroupCheck.value = false;
        }
        if (!operation.supportsPairs) {
            pairwiseCheck.value = false;
        }
        descriptionText._ozoEnglishText = operation.description;
        descriptionText.text = OZO.tr(operation.description);
        if (operation.supportsPairs && pairwiseCheck.value) {
            resultBehaviorText.text = OZO.isKhmer() ?
                "\u179b\u1791\u17d2\u1792\u1795\u179b\u179a\u17c6\u1796\u17b9\u1784\u1791\u17bb\u1780\u17d6 " + Math.ceil(sourceItems.length / 2) + " \u179c\u178f\u17d2\u1790\u17bb\u1787\u17b6\u1782\u17bc" :
                "Expected result: " + Math.ceil(sourceItems.length / 2) + " paired result objects";
        } else {
            resultBehaviorText.text = OZO.isKhmer() ?
                (operation.multiResult ? "\u179b\u1791\u17d2\u1792\u1795\u179b\u179a\u17c6\u1796\u17b9\u1784\u1791\u17bb\u1780\u17d6 \u179c\u178f\u17d2\u1790\u17bb\u178a\u17b6\u1785\u17cb\u178a\u17c4\u1799\u17a1\u17c2\u1780\u1785\u17d2\u179a\u17be\u1793" :
                    "\u179b\u1791\u17d2\u1792\u1795\u179b\u179a\u17c6\u1796\u17b9\u1784\u1791\u17bb\u1780\u17d6 \u179c\u178f\u17d2\u1790\u17bb\u1795\u17d2\u179f\u17c6\u1798\u17bd\u1799") :
                (operation.multiResult ? "Expected result: multiple individual objects" :
                    "Expected result: one combined object");
        }
        statusText.text = OZO.isKhmer() ?
            (previewActive ? "\u1780\u17b6\u179a\u1780\u17c6\u178e\u178f\u17cb\u1794\u17b6\u1793\u1795\u17d2\u179b\u17b6\u179f\u17cb\u1794\u17d2\u178a\u17bc\u179a\u17d4 \u179f\u17bc\u1798\u1792\u17d2\u179c\u17be\u1794\u1785\u17d2\u1785\u17bb\u1794\u17d2\u1794\u1793\u17d2\u1793\u1797\u17b6\u1796\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u17d4" :
                "\u179a\u17bd\u1785\u179a\u17b6\u179b\u17cb\u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u1798\u17be\u179b " + OZO.tr(operation.name) + " \u1787\u17b6\u1798\u17bb\u1793\u17d4") :
            (previewActive ? "Settings changed. Update the preview." :
                "Ready to preview " + operation.name + ".");
    }

    expandCheck.onClick = function () {
        if (expandCheck.value && selectedOperation().multiResult) {
            ungroupCheck.value = true;
        }
        updateDescription();
    };
    ungroupCheck.onClick = updateDescription;
    cleanCheck.onClick = updateDescription;
    pairwiseCheck.onClick = updateDescription;
    OZO.restoreWindowState(dialog, "pathfinder");
    var savedOperationIndex = Number(OZO.getValue("pathfinder", "operation", "0"));
    if (isFinite(savedOperationIndex) && savedOperationIndex >= 0 &&
            savedOperationIndex < operations.length) {
        selectedOperationIndex = Math.floor(savedOperationIndex);
    }
    updateDescription();
    refreshOperationIcons();
    OZO.translateWindow(dialog, OZO.getLanguage());
    OZO.applyTheme(dialog);

    previewButton.onClick = function () {
        previewButton.enabled = false;
        applyButton.enabled = false;
        statusText.text = OZO.isKhmer() ? "\u1780\u17c6\u1796\u17bb\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793..." : "Building preview...";
        dialog.update();

        try {
            cleanupPreview(true);
            startProgress("Preparing Pathfinder preview...", sourceItems.length);
            var previewCopies = createWorkingCopies(PREVIEW_LAYER_NAME);
            updateProgress(
                sourceItems.length,
                "Running " + selectedOperation().name + " on " +
                    sourceItems.length + " objects..."
            );
            executeSelectedOperation(previewCopies);
            previewActive = true;
            previewSignature = currentSettingsSignature();
            statusText.text = OZO.isKhmer() ?
                "\u1780\u17c6\u1796\u17bb\u1784\u1798\u17be\u179b " + OZO.tr(selectedOperation().name) + " \u1787\u17b6\u1798\u17bb\u1793\u17d4" :
                "Previewing " + selectedOperation().name + ".";
        } catch (error) {
            cleanupPreview();
            statusText.text = OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b\u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : "Preview failed.";
            alert((OZO.isKhmer() ? "\u1780\u17b6\u179a\u1798\u17be\u179b Pathfinder \u1787\u17b6\u1798\u17bb\u1793\u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" :
                SCRIPT_NAME + " preview failed.") + "\n\n" + errorMessage(error));
        }

        closeProgress();

        previewButton.enabled = true;
        applyButton.enabled = true;
    };

    applyButton.active = true;
    var dialogResult = dialog.show();
    if (dialogResult !== 1) {
        cleanupPreview();
        return;
    }

    try {
        var canReusePreview = previewActive && previewLayer &&
            previewSignature === currentSettingsSignature();
        if (!canReusePreview) {
            cleanupPreview(true);
            startProgress("Preparing Pathfinder result...", sourceItems.length);
            var resultCopies = createWorkingCopies("Pathfinder Result");
            updateProgress(
                sourceItems.length,
                "Running " + selectedOperation().name + " on " +
                    sourceItems.length + " objects..."
            );
            executeSelectedOperation(resultCopies);
        }
        var resultCount = commitWorkingResult();
        OZO.saveWindowState(dialog, "pathfinder", {
            operation: selectedOperationIndex
        });
        alert(OZO.isKhmer() ?
            "\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb " + OZO.tr(selectedOperation().name) + "\u17d4\n\n\u1794\u17b6\u1793\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a " +
                sourceItems.length + " \u179c\u178f\u17d2\u1790\u17bb\u178a\u17be\u1798\u17d4\n\u1794\u17b6\u1793\u178f\u17d2\u179a\u17a1\u1794\u17cb " + resultCount +
                " \u179c\u178f\u17d2\u1790\u17bb\u179b\u1791\u17d2\u1792\u1795\u179b\u178a\u17c2\u179b\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u17d4" :
            selectedOperation().name + " completed.\n\nProcessed " + sourceItems.length +
                " input objects.\nReturned " + resultCount +
                (resultCount === 1 ? " selected result object." : " selected result objects."));
    } catch (error) {
        closeProgress();
        cleanupPreview();
        alert((OZO.isKhmer() ? "Pathfinder \u1794\u179a\u17b6\u1787\u17d0\u1799\u17d4" : SCRIPT_NAME + " failed.") +
            "\n\n" + errorMessage(error));
    }
})();
