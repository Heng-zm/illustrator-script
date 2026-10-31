#target illustrator

var __ozoHostScriptFile = (function () {
    try {
        if (typeof $.fileName === "string" && $.fileName.length > 0) {
            return new File($.fileName);
        }
    } catch (e) {}
    return null;
})();

var __ozoPluginFolder = (function () {
    if (__ozoHostScriptFile && __ozoHostScriptFile.parent && __ozoHostScriptFile.parent.parent) {
        return __ozoHostScriptFile.parent.parent;
    }
    return Folder.current;
})();

var __ozoExplicitPluginFolder = null;

function ozoInitExtensionPath(pathStr) {
    try {
        if (pathStr && typeof pathStr === "string") {
            var f = new Folder(pathStr);
            if (f.exists) {
                __ozoExplicitPluginFolder = f;
            }
        }
    } catch (e) {}
}

function ozoResolveScriptsFolder() {
    var candidates = [];
    if (__ozoExplicitPluginFolder && __ozoExplicitPluginFolder.exists) {
        candidates.push(__ozoExplicitPluginFolder.fsName + "/scripts");
        candidates.push(__ozoExplicitPluginFolder.fsName + "/Script all");
    }
    candidates.push(__ozoPluginFolder.fsName + "/scripts");
    candidates.push(__ozoPluginFolder.fsName + "/Script all");
    try {
        if (app.path) {
            var roots = [
                new Folder(app.path.fsName + "/Presets"),
                new Folder(app.path.fsName + "/Presets.localized")
            ];
            if (app.path.parent) {
                roots.push(new Folder(app.path.parent.fsName + "/Presets"));
                roots.push(new Folder(app.path.parent.fsName + "/Presets.localized"));
            }
            for (var r = 0; r < roots.length; r++) {
                var rt = roots[r];
                if (rt && rt.exists) {
                    var locale = app.locale || "en_US";
                    candidates.push(rt.fsName + "/" + locale + "/Scripts/Ozo Tools");
                    var sub = rt.getFiles(function (f) { return f instanceof Folder; });
                    for (var s = 0; s < sub.length; s++) {
                        candidates.push(sub[s].fsName + "/Scripts/Ozo Tools");
                    }
                }
            }
        }
    } catch (ignoreApp) {}
    try {
        if (Folder.userData && Folder.userData.exists) {
            candidates.push(Folder.userData.fsName + "/Adobe/CEP/extensions/com.ozo.illustrator.tools/scripts");
        }
        if (Folder.myDocuments && Folder.myDocuments.exists) {
            candidates.push(Folder.myDocuments.fsName + "/Script all");
            candidates.push(Folder.myDocuments.fsName + "/script/Script all");
        }
    } catch (ignoreDocs) {}

    for (var i = 0; i < candidates.length; i++) {
        var f = new Folder(candidates[i]);
        if (f.exists) {
            return f;
        }
    }
    return new Folder(__ozoPluginFolder.fsName + "/scripts");
}

function ozoRunScript(scriptFileName) {
    try {
        var scriptsFolder = ozoResolveScriptsFolder();
        var scriptFile = new File(scriptsFolder.fsName + "/" + scriptFileName);

        if (!scriptFile.exists) {
            // Also check root of plugin folder and current directory
            var alt1 = new File(__ozoPluginFolder.fsName + "/" + scriptFileName);
            if (alt1.exists) {
                scriptFile = alt1;
            } else if (Folder.current) {
                var altCur = new File(Folder.current.fsName + "/" + scriptFileName);
                if (altCur.exists) scriptFile = altCur;
            }
        }

        if (!scriptFile.exists) {
            return JSON.stringify({
                status: "error",
                message: "Script not found: " + scriptFileName
            });
        }

        // Set Folder.current to script's directory so #include and relative paths resolve properly
        var savedFolder = Folder.current;
        try {
            if (scriptFile.parent && scriptFile.parent.exists) {
                Folder.current = scriptFile.parent;
            }
            // Execute script directly inside the Illustrator host engine
            $.evalFile(scriptFile);
        } finally {
            try { Folder.current = savedFolder; } catch (e) {}
        }

        return JSON.stringify({
            status: "success",
            message: "Finished: " + scriptFile.name
        });
    } catch (err) {
        var msg = err && err.message ? err.message : String(err);
        return JSON.stringify({
            status: "error",
            message: msg
        });
    }
}

function ozoOpenScriptsFolder() {
    try {
        var folder = ozoResolveScriptsFolder();
        if (folder && folder.exists) {
            var opened = false;
            try { opened = folder.execute(); } catch (eExec) {}
            if (!opened) {
                try {
                    if (Folder.fs === "Windows") {
                        app.system('explorer.exe "' + folder.fsName.replace(/"/g, '""') + '"');
                    } else {
                        app.system('open "' + folder.fsName.replace(/"/g, '\\"') + '"');
                    }
                    opened = true;
                } catch (eSys) {}
            }
            return JSON.stringify({ status: "success" });
        }
    } catch (e) {}
    return JSON.stringify({ status: "error", message: "Folder not found" });
}

function ozoGetDocumentStatus() {
    try {
        if (app.documents.length === 0) {
            return JSON.stringify({
                hasDoc: false,
                name: "",
                colorSpace: "",
                itemCount: 0
            });
        }
        var doc = app.activeDocument;
        return JSON.stringify({
            hasDoc: true,
            name: doc.name,
            colorSpace: String(doc.documentColorSpace).replace("DocumentColorSpace.", ""),
            itemCount: doc.pageItems.length
        });
    } catch (e) {
        return JSON.stringify({
            hasDoc: false,
            error: String(e)
        });
    }
}

function ozoOpenURL(url) {
    try {
        if (url && typeof url === "string") {
            var localFile = null;
            try {
                localFile = new File(url);
                if (localFile.exists) {
                    localFile.execute();
                    return JSON.stringify({ status: "success" });
                }
            } catch (ignoreLocalFile) {}

            // Only plain web links reach the shell. Quotes, shell variables,
            // and backslashes are rejected so the URL cannot break out of the
            // quoted argument.
            if (!/^https?:\/\/[^\s"'`$\\]+$/i.test(url)) {
                return JSON.stringify({ status: "error", message: "Only http and https links can be opened." });
            }
            if (Folder.fs === "Windows") {
                app.system('explorer.exe "' + url + '"');
            } else {
                app.system('open "' + url + '"');
            }
            return JSON.stringify({ status: "success" });
        }
    } catch (e) {
        return JSON.stringify({ status: "error", message: String(e) });
    }
    return JSON.stringify({ status: "error", message: "Invalid URL" });
}
