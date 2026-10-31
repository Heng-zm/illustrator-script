#target illustrator
#targetengine "illustratorScriptLauncher"

var __ozoLauncherFile = (function () {
    try {
        if (typeof $.fileName === "string" && $.fileName.length > 0) {
            return new File($.fileName);
        }
    } catch (ignoreName) {}
    try {
        if (Folder.current && Folder.current.exists) {
            return new File(Folder.current.fsName + "/Script Launcher.jsx");
        }
    } catch (ignoreCur) {}
    return null;
})();

var __ozoLauncherFolder = (__ozoLauncherFile && __ozoLauncherFile.parent && __ozoLauncherFile.parent.exists) ?
    __ozoLauncherFile.parent : Folder.current;

// Read previously saved custom scripts folder from preferences if available
var __ozoSavedScriptsFolder = (function () {
    try {
        var pFile = new File(Folder.userData.fsName + "/Ozo Illustrator Scripts/preferences.ini");
        if (pFile.exists && pFile.open("r")) {
            pFile.encoding = "UTF-8";
            while (!pFile.eof) {
                var l = pFile.readln();
                var s = l.indexOf("\t");
                if (s > 0) {
                    var k = decodeURIComponent(l.substring(0, s));
                    if (k === "script_launcher_v2.custom_scripts_folder") {
                        var v = decodeURIComponent(l.substring(s + 1));
                        pFile.close();
                        if (v) {
                            var f = new Folder(v);
                            if (f.exists) return f;
                        }
                        break;
                    }
                }
            }
            pFile.close();
        }
    } catch (ignorePref) {}
    return null;
})();

var __ozoSharedCandidates = [
    __ozoLauncherFolder.fsName + "/Script all/lib/OzoShared.jsxinc",
    __ozoLauncherFolder.fsName + "/lib/OzoShared.jsxinc",
    __ozoLauncherFolder.fsName + "/OzoShared.jsxinc"
];
if (__ozoLauncherFolder.parent && __ozoLauncherFolder.parent.exists) {
    __ozoSharedCandidates.push(__ozoLauncherFolder.parent.fsName + "/Script all/lib/OzoShared.jsxinc");
    __ozoSharedCandidates.push(__ozoLauncherFolder.parent.fsName + "/lib/OzoShared.jsxinc");
    __ozoSharedCandidates.push(__ozoLauncherFolder.parent.fsName + "/OzoShared.jsxinc");
}
if (__ozoSavedScriptsFolder && __ozoSavedScriptsFolder.exists) {
    __ozoSharedCandidates.push(__ozoSavedScriptsFolder.fsName + "/lib/OzoShared.jsxinc");
    __ozoSharedCandidates.push(__ozoSavedScriptsFolder.fsName + "/Script all/lib/OzoShared.jsxinc");
    __ozoSharedCandidates.push(__ozoSavedScriptsFolder.fsName + "/OzoShared.jsxinc");
}
try {
    if (Folder.myDocuments && Folder.myDocuments.exists) {
        __ozoSharedCandidates.push(Folder.myDocuments.fsName + "/Script all/lib/OzoShared.jsxinc");
        __ozoSharedCandidates.push(Folder.myDocuments.fsName + "/script/Script all/lib/OzoShared.jsxinc");
    }
    if (Folder.desktop && Folder.desktop.exists) {
        __ozoSharedCandidates.push(Folder.desktop.fsName + "/Script all/lib/OzoShared.jsxinc");
        __ozoSharedCandidates.push(Folder.desktop.fsName + "/script/Script all/lib/OzoShared.jsxinc");
    }
} catch (ignoreCommon) {}

var __ozoSharedFile = null;
if (typeof OZO === "undefined" || !OZO || !OZO.version) {
    for (var __cIdx = 0; __cIdx < __ozoSharedCandidates.length; __cIdx++) {
        if (__ozoSharedCandidates[__cIdx]) {
            var __cand = new File(__ozoSharedCandidates[__cIdx]);
            if (__cand.exists) {
                __ozoSharedFile = __cand;
                break;
            }
        }
    }

    if (!__ozoSharedFile) {
        try {
            var __promptFolder = Folder.selectDialog("Script Launcher: Please locate your 'Script all' or 'script' folder:");
            if (__promptFolder && __promptFolder.exists) {
                var __promptCandidates = [
                    __promptFolder.fsName + "/lib/OzoShared.jsxinc",
                    __promptFolder.fsName + "/Script all/lib/OzoShared.jsxinc",
                    __promptFolder.fsName + "/OzoShared.jsxinc"
                ];
                for (var __pIdx = 0; __pIdx < __promptCandidates.length; __pIdx++) {
                    var __pCand = new File(__promptCandidates[__pIdx]);
                    if (__pCand.exists) {
                        __ozoSharedFile = __pCand;
                        __ozoSavedScriptsFolder = __promptFolder;
                        break;
                    }
                }
            }
        } catch (ignoreDialog) {}
    }

    if (__ozoSharedFile && __ozoSharedFile.exists) {
        $.evalFile(__ozoSharedFile);
    }
}

(function () {
    if (typeof OZO === "undefined" || !OZO || !OZO.version) {
        alert(
            "Script Launcher support file (OzoShared.jsxinc) is missing or could not be loaded.\n\n" +
            (__ozoSharedFile ? __ozoSharedFile.fsName : "Please place 'OzoShared.jsxinc' in the 'lib' folder.")
        );
        return;
    }
    var globalKey = "__illustratorScriptLauncherWindow";

    if ($.global[globalKey]) {
        try {
            $.global[globalKey].close();
        } catch (ignore) {}
    }

    var launcherFile = __ozoLauncherFile;
    var scriptsFolder = null;
    if (__ozoSavedScriptsFolder && __ozoSavedScriptsFolder.exists) {
        scriptsFolder = __ozoSavedScriptsFolder;
    } else {
        var scriptAllFolder = new Folder(__ozoLauncherFolder.fsName + "/Script all");
        if (scriptAllFolder.exists) {
            scriptsFolder = scriptAllFolder;
        } else {
            scriptsFolder = __ozoLauncherFolder;
        }
    }
    var scripts = [];
    var visibleScripts = [];
    var relativeNameCache = {};
    var activeBridgeTalk = null;
    var windowAlive = true;
    var statusMode = "count";
    var statusFileName = "";
    var scanLimitReached = false;
    var MAX_SCAN_DEPTH = 24;
    var MAX_SCRIPT_COUNT = 2000;
    var isWindows = /windows/i.test($.os || "");

    var window = new Window("palette", "Illustrator Script Launcher", undefined, {
        resizeable: true
    });
    $.global[globalKey] = window;

    window.orientation = "column";
    window.alignChildren = ["fill", "fill"];
    window.spacing = 10;
    window.margins = 14;
    window.minimumSize = [600, 400];

    var header = window.add("group");
    header.orientation = "column";
    header.alignChildren = ["left", "center"];
    header.spacing = 2;

    var title = header.add("statictext", undefined, "All Scripts");
    title.graphics.font = ScriptUI.newFont(title.graphics.font.name, "BOLD", 16);

    function decodeName(value) {
        try {
            return File.decode(value);
        } catch (ignore) {
            return value;
        }
    }

    var folderRow = header.add("group");
    folderRow.orientation = "row";
    folderRow.alignChildren = ["left", "center"];
    folderRow.spacing = 8;
    var folderLabel = folderRow.add("statictext", undefined, decodeName(scriptsFolder.fsName));
    folderLabel.helpTip = decodeName(scriptsFolder.fsName);
    var browseHeaderBtn = folderRow.add("button", undefined, "Change Folder...");
    browseHeaderBtn.preferredSize = [115, 20];
    browseHeaderBtn.helpTip = "Choose where your scripts are located";
    browseHeaderBtn.onClick = function () {
        var chosen = Folder.selectDialog("Select Scripts Folder", scriptsFolder);
        if (chosen && chosen.exists) {
            scriptsFolder = chosen;
            folderLabel.text = decodeName(scriptsFolder.fsName);
            folderLabel.helpTip = decodeName(scriptsFolder.fsName);
            OZO.setValue("script_launcher_v2", "custom_scripts_folder", scriptsFolder.fsName);
            loadScripts();
        }
    };

    var filterGroup = window.add("group");
    filterGroup.orientation = "row";
    filterGroup.alignChildren = ["fill", "center"];
    filterGroup.add("statictext", undefined, "Search:");
    var searchInput = filterGroup.add("edittext", undefined, "");
    searchInput.alignment = ["fill", "center"];
    searchInput.helpTip = "Filter scripts by name or relative path";
    var clearButton = filterGroup.add("button", undefined, "Clear");
    clearButton.preferredSize = [62, 24];
    clearButton.helpTip = "Clear the search";
    var folderFilter = filterGroup.add("dropdownlist", undefined, ["All folders"]);
    folderFilter.preferredSize = [145, 24];
    folderFilter.selection = 0;
    folderFilter.helpTip = "Show scripts from one folder";
    var viewFilter = filterGroup.add("dropdownlist", undefined,
        ["All Scripts", "Favorites", "Recent"]);
    viewFilter.preferredSize = [105, 24];
    viewFilter.selection = 0;
    viewFilter.helpTip = "Show all scripts, favorites, or recently used scripts";

    var scriptList = window.add("listbox", undefined, [], {
        multiselect: false
    });
    scriptList.alignment = ["fill", "fill"];
    scriptList.preferredSize = [560, 280];

    var detailsPanel = window.add("panel", undefined, "Selected Script");
    detailsPanel.orientation = "column";
    detailsPanel.alignChildren = ["fill", "top"];
    detailsPanel.alignment = ["fill", "top"];
    detailsPanel.margins = [12, 18, 12, 10];

    var selectedPathText = detailsPanel.add("statictext", undefined, "No script selected");
    selectedPathText.helpTip = "Selected script path";

    var statusText = detailsPanel.add("statictext", undefined, "");
    var favoriteButton = detailsPanel.add("button", undefined, "Add Favorite");
    favoriteButton.alignment = ["left", "top"];
    favoriteButton.enabled = false;

    var buttons = window.add("group");
    buttons.orientation = "row";
    buttons.alignment = ["fill", "bottom"];

    var runButton = buttons.add("button", undefined, "Run");
    runButton.preferredSize = [90, 28];
    var folderButton = buttons.add("button", undefined, "Open Script Folder");
    var changeFolderBtn = buttons.add("button", undefined, "Change Folder...");
    changeFolderBtn.helpTip = "Select a custom folder containing scripts";
    changeFolderBtn.onClick = function () {
        var chosen = Folder.selectDialog("Select Scripts Folder", scriptsFolder);
        if (chosen && chosen.exists) {
            scriptsFolder = chosen;
            folderLabel.text = decodeName(scriptsFolder.fsName);
            folderLabel.helpTip = decodeName(scriptsFolder.fsName);
            OZO.setValue("script_launcher_v2", "custom_scripts_folder", scriptsFolder.fsName);
            loadScripts();
        }
    };
    var refreshButton = buttons.add("button", undefined, "Refresh");
    var spacer = buttons.add("group");
    spacer.alignment = ["fill", "fill"];
    var closeButton = buttons.add("button", undefined, "Close");

    OZO.addLanguageSelector(window, function () {
        if (folderFilter.items.length > 0) {
            folderFilter.items[0].text = OZO.tr("All folders");
        }
        updateSelectionDetails();
        updateStatusText();
    });

    folderFilter._ozoNoSave = true;
    folderFilter._ozoSkipTranslate = true;
    OZO.restoreWindowState(window, "script_launcher_v2");
    var savedFolderPreference = OZO.getValue("script_launcher_v2", "folder", "");
    var savedScriptPreference = OZO.getValue("script_launcher_v2", "script", "");
    var favoritePaths = OZO.getValue("script_launcher_v2", "favorites", "")
        .split("\n");
    var recentPaths = OZO.getValue("script_launcher_v2", "recent", "")
        .split("\n");
    var launcherPreferencesApplied = false;

    function cleanPathList(values, maximum) {
        var result = [];
        var known = {};
        for (var index = 0; index < values.length && result.length < maximum; index++) {
            var value = String(values[index]).replace(/^\s+|\s+$/g, "");
            var key = pathKey(value);
            if (value && !known[key]) {
                known[key] = true;
                result.push(value);
            }
        }
        return result;
    }

    favoritePaths = cleanPathList(favoritePaths, 200);
    recentPaths = cleanPathList(recentPaths, 20);

    function listHasPath(values, value) {
        for (var index = 0; index < values.length; index++) {
            if (pathKey(values[index]) === pathKey(value)) return true;
        }
        return false;
    }

    function saveLauncherLists() {
        OZO.setValue("script_launcher_v2", "favorites", favoritePaths.join("\n"));
        OZO.setValue("script_launcher_v2", "recent", recentPaths.join("\n"));
    }

    function rememberRecent(file) {
        var value = relativeName(file);
        var updated = [value];
        for (var index = 0; index < recentPaths.length; index++) {
            if (!samePath(recentPaths[index], value)) updated.push(recentPaths[index]);
        }
        recentPaths = cleanPathList(updated, 20);
        saveLauncherLists();
    }

    function pathKey(value) {
        var normalized = String(value || "")
            .replace(/\\/g, "/")
            .replace(/\/+$/, "");
        return isWindows ? normalized.toLowerCase() : normalized;
    }

    function samePath(first, second) {
        return pathKey(first) === pathKey(second);
    }

    function isInsideScriptsFolder(folder) {
        if (!folder || !folder.exists) return false;
        var root = pathKey(scriptsFolder.fsName);
        var candidate = pathKey(folder.fsName);
        if (candidate === root) {
            return true;
        }
        return candidate.indexOf(root + "/") === 0;
    }

    function isScriptFile(file) {
        return file instanceof File &&
            /\.(?:jsx|jsxbin|js)$/i.test(file.name) &&
            (!launcherFile || !samePath(file.fsName, launcherFile.fsName));
    }

    function relativeName(file) {
        var cacheKey = pathKey(file.fsName);
        if (relativeNameCache.hasOwnProperty(cacheKey)) {
            return relativeNameCache[cacheKey];
        }
        var rootNormalized = pathKey(scriptsFolder.fsName);
        var fileNormalized = String(file.fsName || "").replace(/\\/g, "/");
        var filePath = file.fsName;
        if (pathKey(filePath).indexOf(rootNormalized) === 0) {
            filePath = fileNormalized.substring(rootNormalized.length).replace(/^\/+/, "");
        }
        relativeNameCache[cacheKey] = decodeName(filePath).replace(/\\/g, "/");
        return relativeNameCache[cacheKey];
    }

    function relativeFolder(file) {
        var relativePath = relativeName(file);
        var slashIndex = relativePath.lastIndexOf("/");
        return slashIndex < 0 ? "(Root)" : relativePath.substring(0, slashIndex);
    }

    function collectScripts(folder, result, visitedFolders, depth) {
        if (scanLimitReached) {
            return;
        }
        if (depth > MAX_SCAN_DEPTH || result.length >= MAX_SCRIPT_COUNT) {
            scanLimitReached = true;
            return;
        }

        try {
            if (folder.alias) {
                var resolvedFolder = folder.resolve();
                if (!(resolvedFolder instanceof Folder) || !isInsideScriptsFolder(resolvedFolder)) {
                    return;
                }
                folder = resolvedFolder;
            }
        } catch (ignoreAlias) {
            return;
        }

        if (!isInsideScriptsFolder(folder)) {
            return;
        }

        var folderKey = pathKey(folder.fsName);
        if (visitedFolders[folderKey]) {
            return;
        }
        visitedFolders[folderKey] = true;

        var entries;
        try {
            entries = folder.getFiles();
        } catch (ignoreUnreadableFolder) {
            return;
        }
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry instanceof File) {
                if (isScriptFile(entry)) {
                    result.push(entry);
                    if (result.length >= MAX_SCRIPT_COUNT) {
                        scanLimitReached = true;
                        return;
                    }
                }
                continue;
            }
            if (entry instanceof Folder &&
                    !/^\./.test(entry.name) &&
                    !/^(?:node_modules|dist|build|cache|lib|\.git|\.gemini|temp|tmp)$/i.test(entry.name)) {
                collectScripts(entry, result, visitedFolders, depth + 1);
            }
        }
    }

    function sortFiles(a, b) {
        var first = relativeName(a).toLowerCase();
        var second = relativeName(b).toLowerCase();
        if (first < second) {
            return -1;
        }
        if (first > second) {
            return 1;
        }
        return 0;
    }

    function updateFolderFilter() {
        var previousWasAll = !folderFilter.selection || folderFilter.selection.index === 0;
        var previousFolder = previousWasAll ? "" : folderFilter.selection.text;
        var folderNames = [];
        var knownFolders = {};

        for (var index = 0; index < scripts.length; index++) {
            var folderName = relativeFolder(scripts[index]);
            var folderKey = pathKey(folderName);
            if (!knownFolders[folderKey]) {
                knownFolders[folderKey] = true;
                folderNames.push(folderName);
            }
        }
        folderNames.sort(function (a, b) {
            a = a.toLowerCase();
            b = b.toLowerCase();
            return a < b ? -1 : (a > b ? 1 : 0);
        });

        folderFilter.removeAll();
        folderFilter.add("item", OZO.tr("All folders"));
        for (index = 0; index < folderNames.length; index++) {
            folderFilter.add("item", folderNames[index]);
        }
        folderFilter.selection = 0;
        for (index = 1; !previousWasAll && index < folderFilter.items.length; index++) {
            if (pathKey(folderFilter.items[index].text) === pathKey(previousFolder)) {
                folderFilter.selection = folderFilter.items[index];
                break;
            }
        }
    }

    function loadScripts() {
        try {
            scripts = [];
            relativeNameCache = {};
            scanLimitReached = false;
            collectScripts(scriptsFolder, scripts, {}, 0);
            if (scripts.length === 0 && scriptsFolder && scriptsFolder.exists) {
                var candidateSub = new Folder(scriptsFolder.fsName + "/Script all");
                if (candidateSub.exists) {
                    scriptsFolder = candidateSub;
                    folderLabel.text = decodeName(scriptsFolder.fsName);
                    folderLabel.helpTip = decodeName(scriptsFolder.fsName);
                    collectScripts(scriptsFolder, scripts, {}, 0);
                }
            }
            scripts.sort(sortFiles);
            for (var sIdx = 0; sIdx < scripts.length; sIdx++) {
                var sFile = scripts[sIdx];
                sFile._rel = relativeName(sFile);
                sFile._pathKey = pathKey(sFile._rel);
                sFile._folder = relativeFolder(sFile);
                sFile._folderKey = pathKey(sFile._folder);
                sFile._display = sFile._rel.replace(/\.(?:jsx|jsxbin|js)$/i, "");
                sFile._lower = sFile._display.toLowerCase();
            }
            updateFolderFilter();
            if (!launcherPreferencesApplied && savedFolderPreference) {
                for (var folderIndex = 0; folderIndex < folderFilter.items.length; folderIndex++) {
                    if (pathKey(folderFilter.items[folderIndex].text) === pathKey(savedFolderPreference)) {
                        folderFilter.selection = folderIndex;
                        break;
                    }
                }
            }
            launcherPreferencesApplied = true;
            if (!activeBridgeTalk) {
                statusMode = "count";
            }
            updateList();
        } catch (error) {
            scripts = [];
            updateList();
            alert((OZO.isKhmer() ? "\u1798\u17b7\u1793\u17a2\u17b6\u1785\u17a2\u17b6\u1793\u1790\u178f\u179f\u17d2\u1782\u17d2\u179a\u17b8\u1794\u1794\u17b6\u1793\u1791\u17c1\u17d4" :
                "Could not read the scripts folder.") + "\n\n" + getErrorMessage(error));
        }
    }

    function updateList() {
        var layoutSuspended = false;
        try {
            if (window.layout && typeof window.layout.suspendLayout === "function") {
                window.layout.suspendLayout();
                layoutSuspended = true;
            }
        } catch (ignoreSuspend) {}

        try {
            var query = searchInput.text.toLowerCase();
            var allFoldersSelected = !folderFilter.selection || folderFilter.selection.index === 0;
            var selectedFolderKey = allFoldersSelected ? "" : pathKey(folderFilter.selection.text);
            var previousFile = null;
            if (scriptList.selection &&
                    visibleScripts[scriptList.selection.index]) {
                previousFile = visibleScripts[scriptList.selection.index].fsName;
            }
            scriptList.removeAll();
            visibleScripts = [];
            var selectionIndex = -1;
            var preferredFile = previousFile || savedScriptPreference;

            var favMap = {};
            for (var f = 0; f < favoritePaths.length; f++) favMap[pathKey(favoritePaths[f])] = true;
            var recentMap = {};
            for (var r = 0; r < recentPaths.length; r++) recentMap[pathKey(recentPaths[r])] = true;

            var filterMode = viewFilter.selection ? viewFilter.selection.index : 0;

            var orderedScripts = scripts;
            if (filterMode === 2) {
                orderedScripts = [];
                var scriptMap = {};
                for (var s = 0; s < scripts.length; s++) {
                    var k = scripts[s]._pathKey || pathKey(relativeName(scripts[s]));
                    scriptMap[k] = scripts[s];
                }
                for (var recentIndex = 0; recentIndex < recentPaths.length; recentIndex++) {
                    var recKey = pathKey(recentPaths[recentIndex]);
                    if (scriptMap[recKey]) {
                        orderedScripts.push(scriptMap[recKey]);
                    }
                }
            }

            for (var i = 0; i < orderedScripts.length; i++) {
                var scriptFile = orderedScripts[i];
                var pKey = scriptFile._pathKey || pathKey(relativeName(scriptFile));

                if (filterMode === 1 && !favMap[pKey]) continue;
                if (filterMode === 2 && !recentMap[pKey]) continue;
                if (!allFoldersSelected && (scriptFile._folderKey || pathKey(relativeFolder(scriptFile))) !== selectedFolderKey) {
                    continue;
                }
                var lower = scriptFile._lower || (scriptFile._display || relativeName(scriptFile)).toLowerCase();
                if (query && lower.indexOf(query) === -1) {
                    continue;
                }

                var displayName = scriptFile._display || relativeName(scriptFile).replace(/\.(?:jsx|jsxbin|js)$/i, "");
                scriptList.add("item", displayName);
                visibleScripts.push(scriptFile);
                if (preferredFile && samePath(scriptFile.fsName, preferredFile)) {
                    selectionIndex = visibleScripts.length - 1;
                }
            }

            if (scriptList.items.length > 0) {
                scriptList.selection = scriptList.items[
                    selectionIndex >= 0 ? selectionIndex : 0
                ];
            }

            updateSelectionDetails();
            updateStatusText();
            runButton.enabled = scriptList.items.length > 0 && !activeBridgeTalk;
        } finally {
            if (layoutSuspended) {
                try {
                    window.layout.resumeLayout(true);
                } catch (ignoreResume) {}
            }
        }
    }

    function updateStatusText() {
        var khmer = OZO.isKhmer();
        if (statusMode === "running") {
            statusText.text = (khmer ? "\u1780\u17c6\u1796\u17bb\u1784\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a " : "Running ") +
                statusFileName + "...";
            return;
        }
        if (statusMode === "finished") {
            statusText.text = (khmer ? "\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb " : "Finished ") + statusFileName;
            return;
        }
        if (statusMode === "error") {
            statusText.text = (khmer ? "\u1798\u17b7\u1793\u17a2\u17b6\u1785\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a " : "Could not run ") +
                statusFileName;
            return;
        }

        statusText.text = khmer ?
            scriptList.items.length + " \u1780\u17d2\u1793\u17bb\u1784\u1785\u17c6\u178e\u17c4\u1798 " + scripts.length + " \u179f\u17d2\u1782\u17d2\u179a\u17b8\u1794" :
            scriptList.items.length + " of " + scripts.length +
                (scripts.length === 1 ? " script" : " scripts");
        if (scanLimitReached) {
            statusText.text += khmer ? " (\u1794\u1789\u17d2\u1787\u17b8\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1780\u17c6\u178e\u178f\u17cb)" : " (scan limit reached)";
        }
    }

    function updateSelectionDetails() {
        if (!scriptList.selection ||
                !visibleScripts[scriptList.selection.index]) {
            selectedPathText.text = OZO.tr("No script selected");
            selectedPathText.helpTip = "Selected script path";
            folderButton.enabled = false;
            favoriteButton.enabled = false;
            favoriteButton.text = OZO.tr("Add Favorite");
            return;
        }
        var selectedFile = visibleScripts[scriptList.selection.index];
        selectedPathText.text = relativeName(selectedFile);
        selectedPathText.helpTip = decodeName(selectedFile.fsName);
        folderButton.enabled = true;
        favoriteButton.enabled = true;
        favoriteButton.text = listHasPath(favoritePaths, relativeName(selectedFile)) ?
            OZO.tr("Remove Favorite") : OZO.tr("Add Favorite");
    }

    function getErrorMessage(error) {
        if (!error) {
            return "Unknown error.";
        }
        var message = error.message ? error.message : String(error);
        return String(message)
            .replace(/(?:\r?\n)?\s*Line:\s*\d+\s*/gi, "\n")
            .replace(/^\s+|\s+$/g, "") || "Unknown error.";
    }

    function runSelectedScript() {
        if (!scriptList.selection || activeBridgeTalk) {
            return;
        }

        var selectedFile = visibleScripts[scriptList.selection.index];
        if (!selectedFile || !selectedFile.exists) {
            alert(OZO.isKhmer() ? "\u179f\u17d2\u1782\u17d2\u179a\u17b8\u1794\u178a\u17c2\u179b\u1794\u17b6\u1793\u1787\u17d2\u179a\u17be\u179f\u179b\u17c2\u1784\u1798\u17b6\u1793\u17d4 \u179f\u17bc\u1798\u1795\u17d2\u1791\u17bb\u1780\u1794\u1789\u17d2\u1787\u17b8\u17a1\u17be\u1784\u179c\u17b7\u1789\u17d4" :
                "The selected script no longer exists. Refresh the list.");
            return;
        }
        rememberRecent(selectedFile);

        function quoteForJavaScript(value) {
            return '"' + String(value)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
                .replace(/\u2028/g, "\\u2028")
                .replace(/\u2029/g, "\\u2029") + '"';
        }

        function executeDirectly() {
            try {
                if (selectedFile.parent && selectedFile.parent.exists) {
                    Folder.current = selectedFile.parent;
                }
            } catch (ignoreDir) {}
            $.evalFile(selectedFile);
            activeBridgeTalk = null;
            if (windowAlive) {
                runButton.enabled = !!scriptList.selection;
                statusMode = "finished";
                statusFileName = decodeName(selectedFile.name);
                updateStatusText();
            }
        }

        var targetSpec = (typeof BridgeTalk !== "undefined" && BridgeTalk.appSpecifier) ?
            BridgeTalk.appSpecifier : "illustrator";

        try {
            activeBridgeTalk = new BridgeTalk();
            activeBridgeTalk.target = targetSpec;
            var scriptDirFs = selectedFile.parent ? selectedFile.parent.fsName : "";
            activeBridgeTalk.body =
                "(function () {\n" +
                "    try { Folder.current = new Folder(" + quoteForJavaScript(scriptDirFs) + "); } catch (e) {}\n" +
                "    $.evalFile(new File(" + quoteForJavaScript(selectedFile.fsName) + "));\n" +
                "})();";

            runButton.enabled = false;
            statusMode = "running";
            statusFileName = decodeName(selectedFile.name);
            updateStatusText();

            activeBridgeTalk.onResult = function () {
                activeBridgeTalk = null;
                if (!windowAlive) return;
                runButton.enabled = !!scriptList.selection;
                statusMode = "finished";
                statusFileName = decodeName(selectedFile.name);
                updateStatusText();
            };
            activeBridgeTalk.onError = function (message) {
                activeBridgeTalk = null;
                // CRITICAL FALLBACK: Always fall back to direct execution if BridgeTalk dispatch fails!
                try {
                    executeDirectly();
                    return;
                } catch (fallbackError) {
                    if (!windowAlive) return;
                    runButton.enabled = !!scriptList.selection;
                    statusMode = "error";
                    statusFileName = decodeName(selectedFile.name);
                    updateStatusText();
                    var immediateError = getErrorMessage(fallbackError);
                    alert(
                        (OZO.isKhmer() ? "\u1798\u17b7\u1793\u17a2\u17b6\u1785\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a " : "Could not run ") +
                        decodeName(selectedFile.name) + ".\n\n" +
                        immediateError
                    );
                }
            };
            if (!activeBridgeTalk.send()) {
                executeDirectly();
            }
        } catch (error) {
            try {
                executeDirectly();
            } catch (fallbackError) {
                activeBridgeTalk = null;
                if (!windowAlive) return;
                runButton.enabled = !!scriptList.selection;
                statusMode = "error";
                statusFileName = decodeName(selectedFile.name);
                updateStatusText();
                var immediateError = getErrorMessage(fallbackError);
                alert(
                    (OZO.isKhmer() ? "\u1798\u17b7\u1793\u17a2\u17b6\u1785\u178a\u17c6\u178e\u17be\u179a\u1780\u17b6\u179a " : "Could not run ") +
                    decodeName(selectedFile.name) + ".\n\n" +
                    immediateError
                );
            }
        }
    }

    searchInput.onChanging = function () {
        if (!activeBridgeTalk) {
            statusMode = "count";
        }
        updateList();
    };
    clearButton.onClick = function () {
        searchInput.text = "";
        if (!activeBridgeTalk) {
            statusMode = "count";
        }
        updateList();
        searchInput.active = true;
    };
    folderFilter.onChange = function () {
        if (!activeBridgeTalk) {
            statusMode = "count";
        }
        updateList();
    };
    viewFilter.onChange = function () {
        if (!activeBridgeTalk) statusMode = "count";
        updateList();
    };
    favoriteButton.onClick = function () {
        if (!scriptList.selection || !visibleScripts[scriptList.selection.index]) return;
        var value = relativeName(visibleScripts[scriptList.selection.index]);
        if (listHasPath(favoritePaths, value)) {
            var retained = [];
            for (var index = 0; index < favoritePaths.length; index++) {
                if (!samePath(favoritePaths[index], value)) retained.push(favoritePaths[index]);
            }
            favoritePaths = retained;
        } else {
            favoritePaths.push(value);
            favoritePaths = cleanPathList(favoritePaths, 200);
        }
        saveLauncherLists();
        if (viewFilter.selection && viewFilter.selection.index === 1) updateList();
        else updateSelectionDetails();
    };
    scriptList.onChange = function () {
        runButton.enabled = !!scriptList.selection && !activeBridgeTalk;
        updateSelectionDetails();
    };
    scriptList.onDoubleClick = runSelectedScript;
    runButton.onClick = runSelectedScript;
    refreshButton.onClick = loadScripts;
    folderButton.onClick = function () {
        var folderToOpen = scriptsFolder;
        if (scriptList.selection && visibleScripts[scriptList.selection.index]) {
            folderToOpen = visibleScripts[scriptList.selection.index].parent;
        }
        if (!folderToOpen.execute()) {
            try {
                if (isWindows) {
                    app.system('explorer.exe "' + folderToOpen.fsName.replace(/"/g, '""') + '"');
                } else {
                    app.system('open "' + folderToOpen.fsName.replace(/"/g, '\\"') + '"');
                }
            } catch (ignoreOpen) {
                alert("Could not open the scripts folder.");
            }
        }
    };
    closeButton.onClick = function () {
        window.close();
    };

    window.onResizing = window.onResize = function () {
        this.layout.resize();
    };
    window.onClose = function () {
        windowAlive = false;
        OZO.saveWindowState(window, "script_launcher_v2", {
            folder: folderFilter.selection && folderFilter.selection.index > 0 ?
                folderFilter.selection.text : "",
            script: scriptList.selection && visibleScripts[scriptList.selection.index] ?
                visibleScripts[scriptList.selection.index].fsName : "",
            custom_scripts_folder: scriptsFolder ? scriptsFolder.fsName : ""
        });
        $.global[globalKey] = null;
    };

    try {
        if (typeof window.addEventListener === "function") {
            window.addEventListener("keydown", function (event) {
                try {
                    if (!event || !windowAlive) return;
                    if (event.keyName === "Enter") {
                        runSelectedScript();
                    } else if (event.keyName === "Escape") {
                        window.close();
                    }
                } catch (ignoreKey) {}
            });
        }
    } catch (ignoreListener) {}

    loadScripts();
    OZO.translateWindow(window, OZO.getLanguage());
    OZO.applyTheme(window);
    window.center();
    searchInput.active = true;
    window.show();
})();
