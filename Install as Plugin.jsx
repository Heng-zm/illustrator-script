#target illustrator
#targetengine "ozoPluginInstaller"

(function () {
    var SCRIPT_NAME = "Ozo Plugin Installer";
    var isWindows = /windows/i.test($.os || "");

    // Resolve script source directory
    var sourceFolder = (function () {
        try {
            if (typeof $.fileName === "string" && $.fileName.length > 0) {
                return new File($.fileName).parent;
            }
        } catch (e) {}
        return Folder.current;
    })();

    var pluginSourceFolder = new Folder(sourceFolder.fsName + "/plugin/com.ozo.illustrator.tools");
    var scriptsSourceFolder = new Folder(sourceFolder.fsName + "/Script all");

    if (!pluginSourceFolder.exists && !scriptsSourceFolder.exists) {
        alert("Installer files are missing. Please ensure the 'plugin' or 'Script all' folder is located in:\n" + sourceFolder.fsName);
        return;
    }

    // Helper: recursively ensure directory exists
    function ensureFolder(f) {
        if (!f) return false;
        if (f.exists) return true;
        if (f.parent && !f.parent.exists) {
            ensureFolder(f.parent);
        }
        try {
            return f.create();
        } catch (e) {
            return false;
        }
    }

    // Helper: copy directory recursively; throws instead of silently
    // leaving a partially installed plugin behind.
    function copyDirectory(src, dst) {
        if (!ensureFolder(dst)) {
            throw new Error("Could not create folder: " + dst.fsName);
        }
        var files = src.getFiles();
        for (var i = 0; i < files.length; i++) {
            var item = files[i];
            if (item instanceof Folder) {
                if (!/^\./.test(item.name)) {
                    copyDirectory(item, new Folder(dst.fsName + "/" + item.name));
                }
            } else if (item instanceof File) {
                var targetFile = new File(dst.fsName + "/" + item.name);
                if (targetFile.exists) {
                    try { targetFile.remove(); } catch (e) {}
                }
                if (!item.copy(targetFile)) {
                    throw new Error("Could not copy: " + item.fsName);
                }
            }
        }
    }

    // Helper: Enable CEP PlayerDebugMode in Windows Registry or macOS plist
    function enablePlayerDebugMode() {
        if (isWindows) {
            try {
                var bat = new File(Folder.temp.fsName + "/ozo_debug_mode.bat");
                bat.open("w");
                bat.writeln("@echo off");
                bat.writeln('for /L %%v in (6,1,20) do reg add HKCU\\Software\\Adobe\\CSXS.%%v /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1');
                bat.close();
                bat.execute();
                $.sleep(300);
                try { bat.remove(); } catch (eRem) {}
                return true;
            } catch (e) {
                if (typeof app.system === "function") {
                    try {
                        app.system('cmd.exe /c "for /L %v in (6,1,16) do reg add HKCU\\Software\\Adobe\\CSXS.%v /v PlayerDebugMode /t REG_SZ /d 1 /f" >nul 2>&1');
                        return true;
                    } catch (eSys) {}
                }
                return false;
            }
        } else {
            try {
                var cmd = new File(Folder.temp.fsName + "/ozo_debug_mode.command");
                cmd.open("w");
                cmd.writeln("#!/bin/sh");
                cmd.writeln('for v in 6 7 8 9 10 11 12 13 14 15 16; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done >/dev/null 2>&1');
                cmd.close();
                cmd.execute();
                $.sleep(300);
                try { cmd.remove(); } catch (eRem) {}
                return true;
            } catch (e) {
                if (typeof app.system === "function") {
                    try {
                        app.system("bash -c 'for v in {6..16}; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done' >/dev/null 2>&1");
                        return true;
                    } catch (eSys) {}
                }
                return false;
            }
        }
    }

    // Determine target CEP directory
    var cepTargetFolder = (function () {
        if (isWindows) {
            return new Folder(Folder.userData.fsName + "/Adobe/CEP/extensions/com.ozo.illustrator.tools");
        } else {
            var macUserLib = new Folder("~/Library/Application Support");
            var base = macUserLib.exists ? macUserLib.fsName : Folder.userData.fsName;
            return new Folder(base + "/Adobe/CEP/extensions/com.ozo.illustrator.tools");
        }
    })();

    // Determine target Presets Scripts directory (supporting Windows Presets and macOS Presets.localized in any language)
    var presetsTargetFolder = (function () {
        try {
            if (app.path) {
                var candidateRoots = [
                    new Folder(app.path.fsName + "/Presets"),
                    new Folder(app.path.fsName + "/Presets.localized")
                ];
                if (app.path.parent) {
                    candidateRoots.push(new Folder(app.path.parent.fsName + "/Presets"));
                    candidateRoots.push(new Folder(app.path.parent.fsName + "/Presets.localized"));
                }
                for (var r = 0; r < candidateRoots.length; r++) {
                    var root = candidateRoots[r];
                    if (root && root.exists) {
                        var locale = app.locale || "en_US";
                        var locCandidate = new Folder(root.fsName + "/" + locale + "/Scripts");
                        if (locCandidate.exists) {
                            return new Folder(locCandidate.fsName + "/Ozo Tools");
                        }
                        var sub = root.getFiles(function (f) { return f instanceof Folder; });
                        for (var i = 0; i < sub.length; i++) {
                            var s = new Folder(sub[i].fsName + "/Scripts");
                            if (s.exists) {
                                return new Folder(s.fsName + "/Ozo Tools");
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    })();

    // Attempt to load OzoShared.jsxinc for unified bilingual support & theming
    try {
        var sharedCandidates = [
            sourceFolder.fsName + "/lib/OzoShared.jsxinc",
            sourceFolder.fsName + "/Script all/lib/OzoShared.jsxinc"
        ];
        for (var scIdx = 0; scIdx < sharedCandidates.length; scIdx++) {
            var scFile = new File(sharedCandidates[scIdx]);
            if (scFile.exists) {
                $.evalFile(scFile);
                break;
            }
        }
    } catch (ignoreShared) {}

    var hasOzo = (typeof OZO !== "undefined" && OZO && OZO.tr);
    function _tr(txt) { return hasOzo ? OZO.tr(txt) : txt; }

    // UI Dialog
    var dlg = new Window("dialog", _tr("Install Ozo Tools Plugin"));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 12;
    dlg.margins = 16;
    dlg.preferredSize.width = 480;

    if (hasOzo && OZO.addDialogHeader) {
        OZO.addDialogHeader(dlg, _tr("Install Ozo Tools Plugin"), "v2.6.43 \u2022 Suite Setup & Integration");
    } else {
        var header = dlg.add("group");
        header.orientation = "column";
        header.alignChildren = ["left", "center"];
        var title = header.add("statictext", undefined, "Install Ozo Tools for Adobe Illustrator");
        title.graphics.font = ScriptUI.newFont(title.graphics.font.name, "BOLD", 15);
        var subtitle = header.add("statictext", undefined, "Transforms all scripts into a native dockable panel and menu plugin.");
    }

    var optionsPanel = dlg.add("panel", undefined, _tr("Installation Options"));
    optionsPanel.orientation = "column";
    optionsPanel.alignChildren = ["left", "center"];
    optionsPanel.margins = [14, 18, 14, 12];
    optionsPanel.spacing = 10;

    var cepCheck = optionsPanel.add("checkbox", undefined, _tr("Install Dockable Panel Plugin (Window > Extensions > Ozo Tools)"));
    cepCheck.value = true;
    var menuCheck = optionsPanel.add("checkbox", undefined, _tr("Install Native Menu Items (File > Scripts > Ozo Tools)"));
    menuCheck.value = true;
    var debugCheck = optionsPanel.add("checkbox", undefined, _tr("Enable Adobe Extension Developer Mode (PlayerDebugMode)"));
    debugCheck.value = true;

    var infoText = dlg.add("statictext", undefined,
        "After installation, restart Adobe Illustrator to see the new panel under Window > Extensions > Ozo Tools.",
        {multiline: true}
    );
    infoText.preferredSize.width = 440;

    var btnGroup = dlg.add("group");
    btnGroup.alignment = ["right", "center"];
    var cancelBtn = btnGroup.add("button", undefined, _tr("Cancel"), {name: "cancel"});
    var installBtn = btnGroup.add("button", undefined, _tr("Install Now"), {name: "ok"});

    dlg.defaultElement = installBtn;
    dlg.cancelElement = cancelBtn;

    if (hasOzo && OZO.addLanguageSelector) {
        OZO.addLanguageSelector(dlg);
        OZO.translateWindow(dlg, OZO.getLanguage());
        OZO.applyTheme(dlg);
    }
    dlg.center();

    if (dlg.show() !== 1) {
        return;
    }

    var successCep = false;
    var successMenu = false;
    var adminNeeded = false;

    // 1. Enable PlayerDebugMode
    if (debugCheck.value) {
        enablePlayerDebugMode();
    }

    // 2. Install CEP Extension
    if (cepCheck.value && pluginSourceFolder.exists) {
        try {
            // Keep bundled scripts synchronized before deploying
            if (scriptsSourceFolder.exists) {
                var bundledScripts = new Folder(pluginSourceFolder.fsName + "/scripts");
                copyDirectory(scriptsSourceFolder, bundledScripts);
                var launcherSrc = new File(sourceFolder.fsName + "/Script Launcher.jsx");
                if (launcherSrc.exists) {
                    var launcherTarget = new File(bundledScripts.fsName + "/Script Launcher.jsx");
                    if (launcherTarget.exists) {
                        try { launcherTarget.remove(); } catch (eLauncherRemove) {}
                    }
                    if (!launcherSrc.copy(launcherTarget)) {
                        throw new Error("Could not copy: " + launcherSrc.fsName);
                    }
                }
            }
            copyDirectory(pluginSourceFolder, cepTargetFolder);
            successCep = true;
        } catch (eCep) {
            alert("Could not copy CEP panel to:\n" + cepTargetFolder.fsName + "\n\nError: " + eCep);
        }
    }

    // 3. Install Native Menu Scripts
    if (menuCheck.value && scriptsSourceFolder.exists) {
        if (presetsTargetFolder) {
            try {
                ensureFolder(presetsTargetFolder);
                copyDirectory(scriptsSourceFolder, presetsTargetFolder);
                // Also copy Script Launcher.jsx
                var launcherSrcMenu = new File(sourceFolder.fsName + "/Script Launcher.jsx");
                if (launcherSrcMenu.exists) {
                    var launcherTargetMenu = new File(presetsTargetFolder.fsName + "/Script Launcher.jsx");
                    if (launcherTargetMenu.exists) {
                        try { launcherTargetMenu.remove(); } catch (eLauncherMenuRemove) {}
                    }
                    if (!launcherSrcMenu.copy(launcherTargetMenu)) {
                        throw new Error("Could not copy: " + launcherSrcMenu.fsName);
                    }
                }
                successMenu = true;
            } catch (eMenu) {
                // Program Files write permission error on Windows
                adminNeeded = true;
            }
        } else {
            adminNeeded = true;
        }
    }

    // Report Results
    var msg = "Ozo Tools Installation Results:\n\n";
    if (cepCheck.value) {
        msg += (successCep ? "[OK] Dockable Panel installed successfully!\n  (Window > Extensions > Ozo Tools)\n" : "[ERROR] Dockable Panel installation failed.\n");
    }
    if (menuCheck.value) {
        if (successMenu) {
            msg += "[OK] Native Menu scripts installed successfully!\n  (File > Scripts > Ozo Tools)\n";
        } else if (adminNeeded) {
            msg += isWindows ?
                "[NOTE] Menu Scripts require Administrator elevation to write into Program Files.\n" :
                "[NOTE] Could not copy the menu scripts into the Illustrator Presets folder.\n";
        }
    }
    msg += "\n* Please RESTART Adobe Illustrator for the changes to take effect!";

    if (adminNeeded && isWindows) {
        if (confirm(msg + "\n\nWould you like to run the Administrator installer now to complete File > Scripts menu integration?")) {
            var batFile = new File(sourceFolder.fsName + "/setup.bat");
            if (batFile.exists) {
                batFile.execute();
                return;
            }
        }
    } else {
        alert(msg);
    }

})();
