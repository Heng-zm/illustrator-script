(function () {
    var csInterface = null;
    try {
        if (typeof CSInterface !== "undefined") {
            csInterface = new CSInterface();
        }
    } catch (e) {}

    // Tool Definitions (13 tools)
    var TOOLS = [
        {
            id: "qr",
            file: "Generate QR Code.jsx",
            category: "prepress",
            nameEn: "Generate QR Code",
            nameKm: "បង្កើតកូដ QR",
            descEn: "Offline vector QR (Standard & Telegram 2026)",
            descKm: "កូដ QR វ៉ិចទ័រគ្មានអ៊ីនធឺណិត (ស្តង់ដារ និង Telegram)",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="7" y="7" width="1" height="1"/><rect x="18" y="7" width="1" height="1"/><rect x="7" y="18" width="1" height="1"/></svg>'
        },
        {
            id: "cutcontour",
            file: "CutContour Generator.jsx",
            category: "prepress",
            nameEn: "CutContour Generator",
            nameKm: "បង្កើតខ្សែបន្ទាត់កាត់",
            descEn: "Die-cut lines, bleed offset & spot registration",
            descKm: "ខ្សែបន្ទាត់កាត់ Die-cut, Bleed និង Spot Color",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
        },
        {
            id: "printjob",
            file: "Print Job Info.jsx",
            category: "prepress",
            nameEn: "Print Job Info",
            nameKm: "ព័ត៌មានការងារបោះពុម្ព",
            descEn: "Metadata banner, dimensions & color separations",
            descKm: "បដាព័ត៌មានការងារ, ទំហំ និងពណ៌បោះពុម្ព",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
        },
        {
            id: "nesting",
            file: "Nesting.jsx",
            category: "prepress",
            nameEn: "Nesting (Sheet Packing)",
            nameKm: "រៀបចំប្លង់កាត់ Nesting",
            descEn: "Shape packing & material waste optimization",
            descKm: "តម្រៀបប្លង់សន្សំសំចៃផ្ទៃក្រដាស/សម្ភារៈ",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="8"/><rect x="6" y="13" width="5" height="5"/></svg>'
        },
        {
            id: "exporter",
            file: "Batch Production Exporter.jsx",
            category: "prepress",
            nameEn: "Batch Production Exporter",
            nameKm: "នាំចេញឯកសារជាកញ្ចប់",
            descEn: "Batch export artboards to PDF, TIFF, PNG & JPEG",
            descKm: "នាំចេញផ្ទាំងគំនូរជា PDF, TIFF, PNG, JPG តាមឈ្មោះកំណត់",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
        },
        {
            id: "dimension",
            file: "Smart Dimension.jsx",
            category: "layout",
            nameEn: "Smart Dimension",
            nameKm: "វាស់ទំហំស្វ័យប្រវត្តិ",
            descEn: "Automated linear, radial & bounding dimensions",
            descKm: "ដាក់វិមាត្រស្វ័យប្រវត្តិ (ប្រវែង, កាំ, ប្រអប់)",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="5" x2="2" y2="19"/><line x1="22" y1="5" x2="22" y2="19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/></svg>'
        },
        {
            id: "pathfinder",
            file: "Pathfinder.jsx",
            category: "layout",
            nameEn: "Pathfinder Pro",
            nameKm: "ឧបករណ៍ Pathfinder",
            descEn: "Enhanced boolean operations & shape unification",
            descKm: "កាត់តបញ្ចូលរាងវ៉ិចទ័រ និងសំអាត Path",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>'
        },
        {
            id: "guide",
            file: "New Guide Layout.jsx",
            category: "layout",
            nameEn: "New Guide Layout",
            nameKm: "បង្កើតបន្ទាត់ណែនាំ Grid",
            descEn: "Columns, rows, margins & artboard grid guides",
            descKm: "បន្ទាត់ជួរឈរ ជួរដេក និងគែមសងខាង",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>'
        },
        {
            id: "repeat",
            file: "Object Repeat.jsx",
            category: "layout",
            nameEn: "Object Repeat",
            nameKm: "ចម្លងវត្ថុជាជួរ/រង្វង់",
            descEn: "Grid repeat, radial arrays & step-and-repeat",
            descKm: "ចម្លងក្រឡាចត្រង្គ រង្វង់មូល និងគម្លាតច្បាស់លាស់",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
        },
        {
            id: "icons",
            file: "Icon Importer.jsx",
            category: "utilities",
            nameEn: "Icon Importer",
            nameKm: "ស្វែងរក និងទាញយក Icon",
            descEn: "Direct SVG icon search & vector placement",
            descKm: "ស្វែងរក និងទាញយក icon វ៉ិចទ័ររាប់ពាន់",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        },
        {
            id: "numbering",
            file: "Sequential Numbering.jsx",
            category: "utilities",
            nameEn: "Sequential Numbering",
            nameKm: "វាយលេខរៀងស្វ័យប្រវត្តិ",
            descEn: "Serialized labels, batch stamps & barcode prep",
            descKm: "វាយលេខរៀងបន្តបន្ទាប់លើស្លាកសញ្ញា",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>'
        },
        {
            id: "count",
            file: "Count.jsx",
            category: "utilities",
            nameEn: "Object Count",
            nameKm: "រាប់ចំនួនវត្ថុ",
            descEn: "Vector item statistics & selection count",
            descKm: "រាប់ចំនួនវត្ថុវ៉ិចទ័រ និងស្ថិតិលម្អិត",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
        },
        {
            id: "launcher",
            file: "Script Launcher.jsx",
            category: "utilities",
            nameEn: "Script Launcher Window",
            nameKm: "ផ្ទាំងបញ្ជា Launcher",
            descEn: "Floating modeless palette with full browser",
            descKm: "ផ្ទាំងបញ្ជាកម្មវិធីជំនួយអណ្តែតលើអេក្រង់",
            icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
        }
    ];

    // State
    var currentLang = localStorage.getItem("ozo_lang") || "en";
    var currentCategory = "all";
    var searchQuery = "";
    var favorites = JSON.parse(localStorage.getItem("ozo_favorites") || "[]");
    var isExecuting = false;
    var statusResetTimer = null;
    var viewMode = localStorage.getItem("ozo_view_mode") || "list";

    // Elements
    var toolList = document.getElementById("toolList");
    var searchInput = document.getElementById("searchInput");
    var searchClearBtn = document.getElementById("searchClearBtn");
    var searchKbdHint = document.getElementById("searchKbdHint");
    var viewToggleBtn = document.getElementById("viewToggleBtn");
    var viewIconGrid = document.getElementById("viewIconGrid");
    var viewIconList = document.getElementById("viewIconList");
    var langToggleBtn = document.getElementById("langToggleBtn");
    var openFolderBtn = document.getElementById("openFolderBtn");
    var refreshBtn = document.getElementById("refreshBtn");
    var donateBtn = document.getElementById("donateBtn");
    var donateText = document.getElementById("donateText");
    var statusDot = document.getElementById("statusDot");
    var statusMessage = document.getElementById("statusMessage");
    var emptyState = document.getElementById("emptyState");
    var emptyText = document.getElementById("emptyText");
    var tabBtns = document.querySelectorAll(".tab-btn");
    var tabAll = document.getElementById("tabAll");
    var tabAllText = document.getElementById("tabAllText");
    var allCount = document.getElementById("allCount");
    var tabFavsText = document.getElementById("tabFavsText");
    var favsCount = document.getElementById("favsCount");
    var tabPrepress = document.getElementById("tabPrepress");
    var tabPrepressText = document.getElementById("tabPrepressText");
    var prepressCount = document.getElementById("prepressCount");
    var tabLayout = document.getElementById("tabLayout");
    var tabLayoutText = document.getElementById("tabLayoutText");
    var layoutCount = document.getElementById("layoutCount");
    var tabUtilities = document.getElementById("tabUtilities");
    var tabUtilitiesText = document.getElementById("tabUtilitiesText");
    var utilCount = document.getElementById("utilCount");

    function isKhmer() {
        return currentLang === "km";
    }

    function updateViewMode() {
        if (viewMode === "grid") {
            toolList.classList.add("view-grid");
            if (viewIconGrid) viewIconGrid.style.display = "none";
            if (viewIconList) viewIconList.style.display = "block";
        } else {
            toolList.classList.remove("view-grid");
            if (viewIconGrid) viewIconGrid.style.display = "block";
            if (viewIconList) viewIconList.style.display = "none";
        }
    }

    function setStatus(msg, type, duration) {
        if (statusResetTimer) {
            clearTimeout(statusResetTimer);
            statusResetTimer = null;
        }

        statusMessage.textContent = msg;
        statusDot.className = "status-dot";
        if (type === "running") statusDot.classList.add("running");
        else if (type === "error") statusDot.classList.add("error");
        else if (type === "success") statusDot.classList.add("success");

        if (duration && duration > 0) {
            statusResetTimer = setTimeout(function () {
                var defaultText = isKhmer() ? ("រួចរាល់ • មាន " + TOOLS.length + " ឧបករណ៍") : ("Ready • " + TOOLS.length + " tools available");
                statusMessage.textContent = defaultText;
                statusDot.className = "status-dot";
            }, duration);
        }
    }

    function updateChromeLanguage() {
        var khmer = isKhmer();
        langToggleBtn.textContent = khmer ? "KM" : "EN";
        langToggleBtn.title = khmer ? "ប្តូរទៅជាភាសាអង់គ្លេស (Switch to English)" : "Switch to Khmer (ប្តូរទៅជាភាសាខ្មែរ)";
        if (viewToggleBtn) {
            viewToggleBtn.title = khmer ? "ប្តូររវាងទិដ្ឋភាព Grid / បញ្ជី (Toggle Grid/List)" : "Toggle Grid / List View";
        }

        // Category count numbers
        var prepressTotal = TOOLS.filter(function (t) { return t.category === "prepress"; }).length;
        var layoutTotal = TOOLS.filter(function (t) { return t.category === "layout"; }).length;
        var utilTotal = TOOLS.filter(function (t) { return t.category === "utilities"; }).length;

        // Tabs
        if (tabAllText) tabAllText.textContent = khmer ? "ទាំងអស់" : "All";
        if (allCount) allCount.textContent = TOOLS.length;

        if (tabFavsText) tabFavsText.textContent = khmer ? "សំណព្វ" : "Favorites";

        if (tabPrepressText) tabPrepressText.textContent = khmer ? "មុនបោះពុម្ព" : "Prepress";
        if (prepressCount) prepressCount.textContent = prepressTotal;

        if (tabLayoutText) tabLayoutText.textContent = khmer ? "ប្លង់រចនា" : "Layout";
        if (layoutCount) layoutCount.textContent = layoutTotal;

        if (tabUtilitiesText) tabUtilitiesText.textContent = khmer ? "ឧបករណ៍ជំនួយ" : "Utilities";
        if (utilCount) utilCount.textContent = utilTotal;

        // Favorite badge
        if (favorites.length > 0) {
            favsCount.textContent = favorites.length;
            favsCount.classList.add("has-count");
        } else {
            favsCount.textContent = "";
            favsCount.classList.remove("has-count");
        }

        // Header tooltips & search placeholder
        openFolderBtn.title = khmer ? "បើកថតផ្ទុកស្គ្រីប (Open Scripts Directory)" : "Open Scripts Directory";
        refreshBtn.title = khmer ? "ផ្ទុកផ្ទាំងឡើងវិញ (Refresh Panel)" : "Refresh Panel";
        searchInput.placeholder = khmer ? ("ស្វែងរកឧបករណ៍ទាំង " + TOOLS.length + " (QR, កាត់, Export)...") : ("Search " + TOOLS.length + " tools (e.g. QR, Export, Cut)...");
        if (donateText) donateText.textContent = khmer ? "ឧបត្ថម្ភ" : "Donate";
        donateBtn.title = khmer ? "ឧបត្ថម្ភអ្នកអភិវឌ្ឍន៍ (Support developer via ABA Pay)" : "Support developer via ABA Pay";
    }

    function renderTools() {
        toolList.innerHTML = "";
        var khmer = isKhmer();
        updateChromeLanguage();

        var filtered = TOOLS.filter(function (tool) {
            // Category filter
            if (currentCategory === "favorites") {
                if (favorites.indexOf(tool.id) < 0) return false;
            } else if (currentCategory !== "all" && tool.category !== currentCategory) {
                return false;
            }

            // Search filter
            if (searchQuery) {
                var q = searchQuery.toLowerCase();
                var text = (tool.nameEn + " " + tool.nameKm + " " + tool.descEn + " " + tool.descKm + " " + tool.file).toLowerCase();
                if (text.indexOf(q) < 0) return false;
            }
            return true;
        });

        // Sort: favorites first, then original order
        filtered.sort(function (a, b) {
            var aFav = favorites.indexOf(a.id) >= 0 ? 1 : 0;
            var bFav = favorites.indexOf(b.id) >= 0 ? 1 : 0;
            return bFav - aFav;
        });

        if (filtered.length === 0) {
            emptyState.style.display = "block";
            emptyText.textContent = khmer ?
                "មិនមានស្គ្រីបត្រូវនឹងការស្វែងរករបស់អ្នកទេ។" :
                "No scripts match your search.";
        } else {
            emptyState.style.display = "none";
        }

        filtered.forEach(function (tool) {
            var isFav = favorites.indexOf(tool.id) >= 0;
            var card = document.createElement("div");
            card.className = "tool-card cat-" + tool.category;
            card.setAttribute("tabindex", "0");
            card.setAttribute("role", "button");

            var title = khmer ? tool.nameKm : tool.nameEn;
            var desc = khmer ? tool.descKm : tool.descEn;
            var runLabel = khmer ? "ដំណើរការ" : "Run";
            var categoryBadge = tool.category.toUpperCase();

            card.innerHTML =
                '<div class="tool-icon-wrap">' + tool.icon + '</div>' +
                '<div class="tool-info">' +
                    '<div class="tool-header-row">' +
                        '<span class="tool-name" title="' + title + '">' + title + '</span>' +
                        '<span class="tool-badge badge-' + tool.category + '">' + categoryBadge + '</span>' +
                    '</div>' +
                    '<div class="tool-desc" title="' + desc + '">' + desc + '</div>' +
                '</div>' +
                '<div class="tool-actions">' +
                    '<button class="fav-btn' + (isFav ? ' active' : '') + '" title="' + (khmer ? "ដាក់ជាសំណព្វ" : "Toggle Favorite") + '" aria-label="Favorite">' +
                        '<svg viewBox="0 0 24 24" width="14" height="14" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
                            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
                        '</svg>' +
                    '</button>' +
                    '<button class="run-btn" title="' + (khmer ? "ដំណើរការ " + title : "Run " + title) + '">' + runLabel + '</button>' +
                '</div>';

            // Favorite toggle
            var favBtn = card.querySelector(".fav-btn");
            favBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                toggleFavorite(tool.id);
            });

            // Run action
            var runBtn = card.querySelector(".run-btn");
            runBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                runScript(tool, card, runBtn);
            });

            card.addEventListener("click", function () {
                runScript(tool, card, runBtn);
            });

            // Enter key to run on focused card
            card.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.keyCode === 13) {
                    runScript(tool, card, runBtn);
                }
            });

            toolList.appendChild(card);
        });
    }

    function toggleFavorite(id) {
        var idx = favorites.indexOf(id);
        if (idx >= 0) favorites.splice(idx, 1);
        else favorites.push(id);
        localStorage.setItem("ozo_favorites", JSON.stringify(favorites));
        renderTools();
    }

    function runScript(tool, cardElement, runButtonElement) {
        if (isExecuting) return;
        isExecuting = true;

        var title = isKhmer() ? tool.nameKm : tool.nameEn;
        setStatus((isKhmer() ? "កំពុងដំណើរការ " : "Running ") + title + "...", "running");

        if (runButtonElement) {
            runButtonElement.classList.add("running");
            runButtonElement.textContent = isKhmer() ? "កំពុងរត់..." : "Running...";
        }

        if (!csInterface) {
            setTimeout(function () {
                isExecuting = false;
                if (runButtonElement) {
                    runButtonElement.classList.remove("running");
                    runButtonElement.textContent = isKhmer() ? "ដំណើរការ" : "Run";
                }
                setStatus("Simulated " + tool.nameEn + " (Browser Preview)", "success", 3000);
            }, 600);
            return;
        }

        csInterface.evalScript('ozoRunScript(' + JSON.stringify(tool.file) + ')', function (rawResult) {
            isExecuting = false;
            if (runButtonElement) {
                runButtonElement.classList.remove("running");
                runButtonElement.textContent = isKhmer() ? "ដំណើរការ" : "Run";
            }

            try {
                var res = JSON.parse(rawResult);
                if (res.status === "success") {
                    var successMsg = res.message || ((isKhmer() ? "បានបញ្ចប់ " : "Finished ") + title);
                    setStatus(successMsg, "success", 4000);
                } else {
                    setStatus("Error: " + res.message, "error", 6000);
                    alert((isKhmer() ? "បញ្ហាពេលដំណើរការ៖\n\n" : "Script Error:\n\n") + res.message);
                }
            } catch (parseErr) {
                if (rawResult && rawResult !== "EvalScript error.") {
                    setStatus((isKhmer() ? "បានបញ្ចប់ " : "Finished ") + title, "success", 4000);
                } else {
                    setStatus("Execution failed", "error", 5000);
                }
            }
        });
    }

    // Search events
    searchInput.addEventListener("input", function () {
        searchQuery = searchInput.value.trim();
        searchClearBtn.style.display = searchQuery ? "block" : "none";
        if (searchKbdHint) searchKbdHint.style.display = searchQuery ? "none" : "block";
        renderTools();
    });

    searchInput.addEventListener("focus", function () {
        if (searchKbdHint) searchKbdHint.style.opacity = "0";
    });

    searchInput.addEventListener("blur", function () {
        if (searchKbdHint && !searchInput.value) searchKbdHint.style.opacity = "1";
    });

    window.addEventListener("keydown", function (e) {
        if (e.key === "/" && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.keyCode === 13) {
            // Run the first displayed tool if search matched
            var firstCard = toolList.querySelector(".tool-card");
            if (firstCard) {
                firstCard.click();
            }
        } else if (e.key === "Escape" || e.keyCode === 27) {
            searchInput.value = "";
            searchQuery = "";
            searchClearBtn.style.display = "none";
            if (searchKbdHint) searchKbdHint.style.display = "block";
            renderTools();
            searchInput.blur();
        }
    });

    searchClearBtn.addEventListener("click", function () {
        searchInput.value = "";
        searchQuery = "";
        searchClearBtn.style.display = "none";
        if (searchKbdHint) searchKbdHint.style.display = "block";
        renderTools();
        searchInput.focus();
    });

    // View Toggle (Grid vs List)
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener("click", function () {
            viewMode = (viewMode === "grid") ? "list" : "grid";
            localStorage.setItem("ozo_view_mode", viewMode);
            updateViewMode();
            var msg = viewMode === "grid" 
                ? (isKhmer() ? "ទិដ្ឋភាព Grid (តូច gọn)" : "Grid View (Compact)")
                : (isKhmer() ? "ទិដ្ឋភាពបញ្ជី (លម្អិត)" : "List View (Detailed)");
            setStatus(msg, "ready", 1500);
        });
    }

    // Category Tabs
    tabBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            tabBtns.forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            currentCategory = btn.getAttribute("data-category");
            renderTools();
        });
    });

    // Language toggle
    langToggleBtn.addEventListener("click", function () {
        currentLang = currentLang === "en" ? "km" : "en";
        localStorage.setItem("ozo_lang", currentLang);
        renderTools();
        setStatus(isKhmer() ? "បានប្តូរទៅជាភាសាខ្មែរ" : "Switched to English", "success", 2500);
    });

    // Open Scripts Folder
    openFolderBtn.addEventListener("click", function () {
        if (csInterface) {
            csInterface.evalScript("ozoOpenScriptsFolder()");
        }
    });

    // Refresh Panel
    refreshBtn.addEventListener("click", function () {
        renderTools();
        setStatus(isKhmer() ? "បានផ្ទុកឡើងវិញរួចរាល់" : "Refreshed panel", "success", 2500);
    });

    // Donate button
    donateBtn.addEventListener("click", function () {
        var donateUrl = "https://link.payway.com.kh/ABAPAYiR4667130";
        try {
            if (csInterface && typeof csInterface.openURLInDefaultBrowser === "function") {
                csInterface.openURLInDefaultBrowser(donateUrl);
            } else if (typeof window.cep !== "undefined" && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === "function") {
                window.cep.util.openURLInDefaultBrowser(donateUrl);
            } else if (csInterface) {
                csInterface.evalScript('ozoOpenURL(' + JSON.stringify(donateUrl) + ')');
            } else {
                window.open(donateUrl, "_blank");
            }
        } catch (eDonate) {
            window.open(donateUrl, "_blank");
        }
    });

    // Theme Sync with Adobe Illustrator (4 Tiers)
    function updateTheme() {
        if (!csInterface) return;
        try {
            var hostEnv = csInterface.getHostEnvironment();
            if (hostEnv && hostEnv.appSkinInfo) {
                var panelBg = hostEnv.appSkinInfo.panelBackgroundColor.color;
                var r = Math.round(panelBg.red);
                var g = Math.round(panelBg.green);
                var b = Math.round(panelBg.blue);

                document.body.classList.remove("theme-dark", "theme-medium-dark", "theme-medium-light", "theme-light");

                if (r < 55) {
                    document.body.classList.add("theme-dark");
                } else if (r < 130) {
                    document.body.classList.add("theme-medium-dark");
                } else if (r < 215) {
                    document.body.classList.add("theme-medium-light");
                } else {
                    document.body.classList.add("theme-light");
                }

                // Dynamic CSS variable synchronization for pixel-perfect integration
                var root = document.documentElement;
                root.style.setProperty("--bg-surface", "rgb(" + r + "," + g + "," + b + ")");
                var mainR = Math.max(0, Math.min(255, r > 160 ? r - 14 : r - 10));
                var mainG = Math.max(0, Math.min(255, g > 160 ? g - 14 : g - 10));
                var mainB = Math.max(0, Math.min(255, b > 160 ? b - 14 : b - 10));
                root.style.setProperty("--bg-main", "rgb(" + mainR + "," + mainG + "," + mainB + ")");
            }
        } catch (e) {}
    }

    if (csInterface) {
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);
        updateTheme();
        try {
            var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            if (extPath) {
                csInterface.evalScript('ozoInitExtensionPath(' +
                    JSON.stringify(extPath.replace(/\\/g, "/")) + ')');
            }
        } catch (eInit) {}
    }

    // Initial Render
    updateViewMode();
    renderTools();
    setStatus(isKhmer() ? ("រួចរាល់ • មាន " + TOOLS.length + " ឧបករណ៍") : ("Ready • " + TOOLS.length + " tools available"), "ready");
})();
