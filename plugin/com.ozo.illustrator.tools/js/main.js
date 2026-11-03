/* Ozo Tools - Illustrator CEP panel
   Plain ES5 on purpose: older CEP runtimes (CSXS 6.0) ship an old Chromium. */
(function () {
    "use strict";

    // ------------------------------------------------------------------
    // Config
    // ------------------------------------------------------------------
    var CURRENT_VERSION = "2.4.0"; // keep in sync with CSXS/manifest.xml
    var GITHUB_REPO = "Heng-zm/illustrator-script";
    var DONATE_URL = "https://link.payway.com.kh/ABAPAYiR4667130";
    var UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // GitHub's anonymous API limit is 60 req/h per IP
    var SYNC_HOST_COLORS = true; // derive panel colours from Illustrator's actual UI brightness
    var TRUSTED_UPDATE_URL = /^https:\/\/(github\.com|api\.github\.com|codeload\.github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//i;

    var csInterface = null;
    try {
        if (typeof CSInterface !== "undefined") csInterface = new CSInterface();
    } catch (e) {}

    // ------------------------------------------------------------------
    // Translations. Missing Km keys fall back to English.
    // ------------------------------------------------------------------
    var I18N = {
        en: {
            "cat.all": "All", "cat.favorites": "Favorites", "cat.prepress": "Prepress",
            "cat.layout": "Layout", "cat.utilities": "Utilities",
            "badge.title": "Ozo Tools v{v} (click to check for updates)",
            "view.toggle": "Toggle Grid / List View",
            "lang.toggle": "Switch to Khmer (ប្តូរទៅជាភាសាខ្មែរ)",
            "folder": "Open Scripts Directory",
            "refresh": "Refresh Panel",
            "search.placeholder": "Search {n} tools (e.g. QR, Export, Cut)...",
            "search.hint": "Press / to search",
            "search.clear": "Clear search",
            "donate.text": "Donate",
            "donate.title": "Support developer via ABA Pay",
            "dismiss": "Dismiss",
            "empty.search": "No scripts match your search.",
            "empty.favorites": "No favorites yet. Click the star on a tool to add it.",
            "empty.clear": "Clear search",
            "empty.clearTitle": "Clear search query to show all tools",
            "status.ready": "Ready \u2022 {n} tools available",
            "status.noDoc": "No document open \u2022 {n} tools available",
            "status.items": "{n} items",
            "status.docActive": "Active Document: {name}",
            "fav.toggle": "Toggle Favorite (F)",
            "fav.aria": "Favorite {name}",
            "run.label": "Run",
            "run.busy": "Running...",
            "run.title": "Run {name}",
            "run.starting": "Running {name}...",
            "run.done": "Finished {name}",
            "run.simulated": "Simulated {name} (Browser Preview)",
            "run.errorTitle": "Script Error",
            "run.errorStatus": "Error: {msg}",
            "run.failed": "Execution failed",
            "view.grid": "Grid View (Compact)",
            "view.list": "List View (Detailed)",
            "lang.switched": "Switched to English",
            "back.tools": "Tools",
            "back.title": "Back to Tools (Esc)",
            "open.dialog": "Dialog",
            "open.dialogTitle": "Open as Floating Window Dialog",
            "refreshed": "Refreshed panel",
            "update.btn": "Update",
            "update.btnTitle": "Download & update to latest release",
            "update.dismiss": "Dismiss notification",
            "update.available": "New version {tag} available!",
            "update.badgeNew": "New update available: {tag}",
            "update.checking": "Checking for updates...",
            "update.latest": "You are using the latest version (v{v})",
            "update.downloading": "Downloading...",
            "update.installing": "Downloading & installing update {tag}...",
            "update.updated": "Updated!",
            "update.success": "Update installed successfully! Reloading panel...",
            "update.retry": "Retry",
            "update.failTitle": "Update failed",
            "update.failStatus": "Update failed: {msg}",
            "update.untrusted": "Update blocked: the download link is not hosted on GitHub.",
            "update.simulated": "Simulated update complete (Browser Preview)",
            "update.err.parse": "Could not read release info",
            "update.err.rate": "GitHub rate limit reached. Try again later.",
            "update.err.notfound": "No releases found",
            "update.err.http": "Could not fetch release info",
            "update.err.network": "Could not connect to GitHub",
            "update.err.timeout": "GitHub connection timed out"
        },
        km: {
            "cat.all": "ទាំងអស់", "cat.favorites": "សំណព្វ", "cat.prepress": "មុនបោះពុម្ព",
            "cat.layout": "ប្លង់រចនា", "cat.utilities": "ឧបករណ៍ជំនួយ",
            "badge.title": "Ozo Tools v{v} (ចុចដើម្បីពិនិត្យរកកំណែថ្មី)",
            "view.toggle": "ប្តូររវាងទិដ្ឋភាព Grid / បញ្ជី (Toggle Grid/List)",
            "lang.toggle": "ប្តូរទៅជាភាសាអង់គ្លេស (Switch to English)",
            "folder": "បើកថតផ្ទុកស្គ្រីប (Open Scripts Directory)",
            "refresh": "ផ្ទុកផ្ទាំងឡើងវិញ (Refresh Panel)",
            "search.placeholder": "ស្វែងរកឧបករណ៍ទាំង {n} (QR, កាត់, Export)...",
            "search.hint": "ចុច / ដើម្បីស្វែងរក",
            "search.clear": "សម្អាតការស្វែងរក",
            "donate.text": "ឧបត្ថម្ភ",
            "donate.title": "ឧបត្ថម្ភអ្នកអភិវឌ្ឍន៍ (Support developer via ABA Pay)",
            "dismiss": "បិទ",
            "empty.search": "មិនមានស្គ្រីបត្រូវនឹងការស្វែងរករបស់អ្នកទេ។",
            "empty.favorites": "មិនទាន់មានឧបករណ៍សំណព្វទេ។ ចុចសញ្ញាផ្កាយលើឧបករណ៍ណាមួយដើម្បីដាក់ជាសំណព្វ។",
            "empty.clear": "សម្អាតការស្វែងរក",
            "empty.clearTitle": "សម្អាតពាក្យស្វែងរកដើម្បីបង្ហាញឧបករណ៍ទាំងអស់",
            "status.ready": "រួចរាល់ \u2022 មាន {n} ឧបករណ៍",
            "status.noDoc": "គ្មានឯកសារបើក \u2022 មាន {n} ឧបករណ៍",
            "status.items": "{n} វត្ថុ",
            "status.docActive": "ឯកសារសកម្ម៖ {name}",
            "fav.toggle": "ដាក់ជាសំណព្វ (F)",
            "fav.aria": "សំណព្វ {name}",
            "run.label": "ដំណើរការ",
            "run.busy": "កំពុងរត់...",
            "run.title": "ដំណើរការ {name}",
            "run.starting": "កំពុងដំណើរការ {name}...",
            "run.done": "បានបញ្ចប់ {name}",
            "run.errorTitle": "បញ្ហាពេលដំណើរការ",
            "run.errorStatus": "បញ្ហា៖ {msg}",
            "run.failed": "ការដំណើរការបរាជ័យ",
            "view.grid": "ទិដ្ឋភាព Grid (តូច)",
            "view.list": "ទិដ្ឋភាពបញ្ជី (លម្អិត)",
            "lang.switched": "បានប្តូរទៅជាភាសាខ្មែរ",
            "back.tools": "ឧបករណ៍",
            "back.title": "ត្រឡប់ទៅបញ្ជីឧបករណ៍ (Esc)",
            "open.dialog": "ផ្ទាំងបង្អួច",
            "open.dialogTitle": "បើកជាផ្ទាំងបង្អួចដាច់ដោយឡែក (Floating Dialog)",
            "refreshed": "បានផ្ទុកឡើងវិញរួចរាល់",
            "update.btn": "ដំឡើង",
            "update.btnTitle": "ទាញយក និងដំឡើងកំណែចុងក្រោយ",
            "update.dismiss": "បិទការជូនដំណឹង",
            "update.available": "មានកំណែថ្មី {tag}!",
            "update.badgeNew": "មានកំណែថ្មី៖ {tag}",
            "update.checking": "កំពុងពិនិត្យរកកំណែថ្មី...",
            "update.latest": "អ្នកកំពុងប្រើប្រាស់កំណែចុងក្រោយ (v{v})",
            "update.downloading": "កំពុងទាញយក...",
            "update.installing": "កំពុងទាញយក និងដំឡើងកំណែ {tag}...",
            "update.updated": "បានជោគជ័យ!",
            "update.success": "បានដំឡើងកំណែថ្មីជោគជ័យ! កំពុងផ្ទុកឡើងវិញ...",
            "update.retry": "ព្យាយាមម្ដងទៀត",
            "update.failTitle": "ការដំឡើងបរាជ័យ",
            "update.failStatus": "ការដំឡើងបរាជ័យ៖ {msg}",
            "update.untrusted": "ការដំឡើងត្រូវបានទប់ស្កាត់៖ តំណទាញយកមិនមែនមកពី GitHub ទេ។",
            "update.err.parse": "មិនអាចអានព័ត៌មានកំណែថ្មីបានទេ",
            "update.err.rate": "GitHub កំណត់ចំនួនសំណើ សូមព្យាយាមម្ដងទៀតពេលក្រោយ។",
            "update.err.notfound": "រកមិនឃើញកំណែថ្មីទេ",
            "update.err.http": "មិនអាចស្វែងរកកំណែថ្មីបានទេ",
            "update.err.network": "មិនអាចភ្ជាប់ទៅ GitHub បានទេ",
            "update.err.timeout": "ការតភ្ជាប់ទៅ GitHub យឺតពេក"
        }
    };

    // ------------------------------------------------------------------
    // Tool definitions (13 tools). `icon` is the inner SVG markup only.
    // ------------------------------------------------------------------
    function svgIcon(inner) {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + "</svg>";
    }

    var TOOLS = [
        {
            id: "qr", file: "Generate QR Code.jsx", category: "prepress",
            nameEn: "Generate QR Code", nameKm: "បង្កើតកូដ QR",
            descEn: "Offline vector QR (Standard & Telegram 2026)",
            descKm: "កូដ QR វ៉ិចទ័រគ្មានអ៊ីនធឺណិត (ស្តង់ដារ និង Telegram)",
            icon: svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="7" y="7" width="1" height="1"/><rect x="18" y="7" width="1" height="1"/><rect x="7" y="18" width="1" height="1"/>')
        },
        {
            id: "cutcontour", file: "CutContour Generator.jsx", category: "prepress",
            nameEn: "CutContour Generator", nameKm: "បង្កើតខ្សែបន្ទាត់កាត់",
            descEn: "Die-cut lines, bleed offset & spot registration",
            descKm: "ខ្សែបន្ទាត់កាត់ Die-cut, Bleed និង Spot Color",
            icon: svgIcon('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>')
        },
        {
            id: "printjob", file: "Print Job Info.jsx", category: "prepress",
            nameEn: "Print Job Info", nameKm: "ព័ត៌មានការងារបោះពុម្ព",
            descEn: "Metadata banner, dimensions & color separations",
            descKm: "បដាព័ត៌មានការងារ, ទំហំ និងពណ៌បោះពុម្ព",
            icon: svgIcon('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>')
        },
        {
            id: "nesting", file: "Nesting.jsx", category: "prepress",
            nameEn: "Nesting (Sheet Packing)", nameKm: "រៀបចំប្លង់កាត់ Nesting",
            descEn: "Shape packing & material waste optimization",
            descKm: "តម្រៀបប្លង់សន្សំសំចៃផ្ទៃក្រដាស/សម្ភារៈ",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="8"/><rect x="6" y="13" width="5" height="5"/>')
        },
        {
            id: "exporter", file: "Batch Production Exporter.jsx", category: "prepress",
            nameEn: "Batch Production Exporter", nameKm: "នាំចេញឯកសារជាកញ្ចប់",
            descEn: "Batch export artboards to PDF, TIFF, PNG & JPEG",
            descKm: "នាំចេញផ្ទាំងគំនូរជា PDF, TIFF, PNG, JPG តាមឈ្មោះកំណត់",
            icon: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')
        },
        {
            id: "dimension", file: "Smart Dimension.jsx", category: "layout",
            nameEn: "Smart Dimension", nameKm: "វាស់ទំហំស្វ័យប្រវត្តិ",
            descEn: "Automated linear, radial & bounding dimensions",
            descKm: "ដាក់វិមាត្រស្វ័យប្រវត្តិ (ប្រវែង, កាំ, ប្រអប់)",
            icon: svgIcon('<line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="5" x2="2" y2="19"/><line x1="22" y1="5" x2="22" y2="19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/>')
        },
        {
            id: "pathfinder", file: "Pathfinder.jsx", category: "layout",
            nameEn: "Pathfinder Pro", nameKm: "ឧបករណ៍ Pathfinder",
            descEn: "Enhanced boolean operations & shape unification",
            descKm: "កាត់តបញ្ចូលរាងវ៉ិចទ័រ និងសំអាត Path",
            icon: svgIcon('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>')
        },
        {
            id: "guide", file: "New Guide Layout.jsx", category: "layout",
            nameEn: "New Guide Layout", nameKm: "បង្កើតបន្ទាត់ណែនាំ Grid",
            descEn: "Columns, rows, margins & artboard grid guides",
            descKm: "បន្ទាត់ជួរឈរ ជួរដេក និងគែមសងខាង",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>')
        },
        {
            id: "repeat", file: "Object Repeat.jsx", category: "layout",
            nameEn: "Object Repeat", nameKm: "ចម្លងវត្ថុជាជួរ/រង្វង់",
            descEn: "Grid repeat, radial arrays & step-and-repeat",
            descKm: "ចម្លងក្រឡាចត្រង្គ រង្វង់មូល និងគម្លាតច្បាស់លាស់",
            icon: svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')
        },
        {
            id: "icons", file: "Icon Importer.jsx", category: "utilities",
            nameEn: "Icon Importer", nameKm: "ស្វែងរក និងទាញយក Icon",
            descEn: "Direct SVG icon search & vector placement",
            descKm: "ស្វែងរក និងទាញយក icon វ៉ិចទ័ររាប់ពាន់",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
        },
        {
            id: "numbering", file: "Sequential Numbering.jsx", category: "utilities",
            nameEn: "Sequential Numbering", nameKm: "វាយលេខរៀងស្វ័យប្រវត្តិ",
            descEn: "Serialized labels, batch stamps & barcode prep",
            descKm: "វាយលេខរៀងបន្តបន្ទាប់លើស្លាកសញ្ញា",
            icon: svgIcon('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>')
        },
        {
            id: "count", file: "Count.jsx", category: "utilities",
            nameEn: "Object Count", nameKm: "រាប់ចំនួនវត្ថុ",
            descEn: "Vector item statistics & selection count",
            descKm: "រាប់ចំនួនវត្ថុវ៉ិចទ័រ និងស្ថិតិលម្អិត",
            icon: svgIcon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>')
        },
        {
            id: "launcher", file: "Script Launcher.jsx", category: "utilities",
            nameEn: "Script Launcher Window", nameKm: "ផ្ទាំងបញ្ជា Launcher",
            descEn: "Floating modeless palette with full browser",
            descKm: "ផ្ទាំងបញ្ជាកម្មវិធីជំនួយអណ្តែតលើអេក្រង់",
            icon: svgIcon('<polygon points="5 3 19 12 5 21 5 3"/>')
        }
    ];

    var CATEGORIES = ["prepress", "layout", "utilities"];
    var STAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="{fill}" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

    // Lookup + pre-lowercased search text (built once, not on every keystroke)
    var toolById = {};
    (function () {
        for (var i = 0; i < TOOLS.length; i++) {
            var tool = TOOLS[i];
            toolById[tool.id] = tool;
            tool.haystack = [
                tool.nameEn, tool.nameKm, tool.descEn, tool.descKm, tool.file,
                I18N.en["cat." + tool.category], I18N.km["cat." + tool.category]
            ].join(" ").toLowerCase();
        }
    })();

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------
    function $(id) { return document.getElementById(id); }

    function each(list, fn) {
        for (var i = 0; i < list.length; i++) fn(list[i], i);
    }

    var matchesFn = Element.prototype.matches || Element.prototype.webkitMatchesSelector;
    function closest(el, selector, stop) {
        while (el && el !== stop) {
            if (el.nodeType === 1 && matchesFn.call(el, selector)) return el;
            el = el.parentNode;
        }
        return null;
    }

    var store = {
        _timers: {},
        get: function (key, fallback) {
            try {
                var v = window.localStorage.getItem(key);
                return v === null ? fallback : v;
            } catch (e) { return fallback; }
        },
        set: function (key, value) { try { window.localStorage.setItem(key, value); } catch (e) {} },
        setDebounced: function (key, value, delayMs) {
            var self = this;
            if (self._timers[key]) clearTimeout(self._timers[key]);
            self._timers[key] = setTimeout(function () {
                try { window.localStorage.setItem(key, value); } catch (e) {}
            }, delayMs || 300);
        },
        remove: function (key) { try { window.localStorage.removeItem(key); } catch (e) {} }
    };

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function escapeRegex(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // e.key is missing on very old Chromium builds, so fall back to keyCode.
    var KEYCODES = { 13: "Enter", 27: "Escape", 32: " ", 35: "End", 36: "Home", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 70: "f", 191: "/" };
    function keyOf(e) {
        return e.key || KEYCODES[e.keyCode] || "";
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    var currentLang = store.get("ozo_lang", "en") === "km" ? "km" : "en";
    var viewMode = store.get("ozo_view_mode", "list") === "grid" ? "grid" : "list";
    var currentCategory = "all";
    var searchQuery = "";
    var searchTokens = [];
    var highlightRe = null;
    var runningId = null;
    var statusTimer = null;
    var popFavId = null; // star that was just toggled (so only it animates)
    var availableRelease = null;
    var updateBusy = false;
    var updateBtnState = "idle";
    var favorites = loadFavorites();

    function loadFavorites() {
        var out = [];
        try {
            var stored = JSON.parse(store.get("ozo_favorites", "[]"));
            if (Array.isArray(stored)) {
                for (var i = 0; i < stored.length; i++) {
                    // keep only known, unique tool ids (drops entries for removed tools)
                    if (toolById.hasOwnProperty(stored[i]) && out.indexOf(stored[i]) < 0) out.push(stored[i]);
                }
            }
        } catch (e) {}
        return out;
    }

    function isFav(id) { return favorites.indexOf(id) >= 0; }
    function isKhmer() { return currentLang === "km"; }

    // ------------------------------------------------------------------
    // Elements
    // ------------------------------------------------------------------
    var toolList = $("toolList");
    var tabsContainer = $("tabs");
    var tabBtns = tabsContainer.querySelectorAll(".tab-btn");
    var searchInput = $("searchInput");
    var searchWrap = searchInput.parentNode;
    var searchClearBtn = $("searchClearBtn");
    var viewToggleBtn = $("viewToggleBtn");
    var viewIconGrid = $("viewIconGrid");
    var viewIconList = $("viewIconList");
    var langToggleBtn = $("langToggleBtn");
    var openFolderBtn = $("openFolderBtn");
    var refreshBtn = $("refreshBtn");
    var donateBtn = $("donateBtn");
    var statusDot = $("statusDot");
    var statusMessage = $("statusMessage");
    var emptyState = $("emptyState");
    var emptyText = $("emptyText");
    var emptyClearBtn = $("emptyClearBtn");
    var brandBadge = $("brandBadge");
    var updateBanner = $("updateBanner");
    var updateBannerText = $("updateBannerText");
    var updateNowBtn = $("updateNowBtn");
    var updateDismissBtn = $("updateDismissBtn");
    var errorBanner = $("errorBanner");
    var errorTitle = $("errorTitle");
    var errorMessage = $("errorMessage");
    var errorDismissBtn = $("errorDismissBtn");

    var viewCatalog = $("viewCatalog");
    var viewEmbedded = $("viewEmbedded");
    var embeddedBackBtn = $("embeddedBackBtn");
    var embeddedToolIcon = $("embeddedToolIcon");
    var embeddedToolTitle = $("embeddedToolTitle");
    var embeddedDialogBtn = $("embeddedDialogBtn");
    var embeddedContent = $("embeddedContent");
    var activeEmbeddedTool = null;

    // ------------------------------------------------------------------
    // i18n
    // ------------------------------------------------------------------
    function t(key, vars) {
        var dict = I18N[currentLang];
        var str = dict.hasOwnProperty(key) ? dict[key] : I18N.en[key];
        if (str === undefined) return key;
        vars = vars || {};
        return str.replace(/\{(\w+)\}/g, function (m, name) {
            if (vars.hasOwnProperty(name)) return vars[name];
            if (name === "n") return TOOLS.length;      // defaults, unless the caller passed its own
            if (name === "v") return CURRENT_VERSION;
            return m;
        });
    }

    function toolName(tool) { return isKhmer() ? tool.nameKm : tool.nameEn; }
    function toolDesc(tool) { return isKhmer() ? tool.descKm : tool.descEn; }

    function applyI18n() {
        document.documentElement.lang = currentLang; // lets the browser pick proper Khmer fonts/line-breaking

        each(document.querySelectorAll("[data-i18n]"), function (el) {
            el.textContent = t(el.getAttribute("data-i18n"));
        });
        each(document.querySelectorAll("[data-i18n-title]"), function (el) {
            var text = t(el.getAttribute("data-i18n-title"));
            el.title = text;
            el.setAttribute("aria-label", text);
        });
        each(document.querySelectorAll("[data-i18n-placeholder]"), function (el) {
            var text = t(el.getAttribute("data-i18n-placeholder"));
            el.placeholder = text;
            el.setAttribute("aria-label", text);
        });

        langToggleBtn.textContent = isKhmer() ? "KM" : "EN";
        setUpdateBtn(updateBtnState);
        updateUpdateUI(); // banner/badge text depends on the language
    }

    function updateCounts() {
        each(document.querySelectorAll("[data-count]"), function (el) {
            var key = el.getAttribute("data-count");
            var n;
            if (key === "all") n = TOOLS.length;
            else if (key === "favorites") n = favorites.length;
            else n = TOOLS.filter(function (tool) { return tool.category === key; }).length;
            el.textContent = n > 0 ? n : "";
            el.classList.toggle("has-count", n > 0);
        });
    }

    // ------------------------------------------------------------------
    // Status bar
    // ------------------------------------------------------------------
    function setStatus(msg, type, duration) {
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        statusMessage.textContent = msg;
        statusMessage.title = msg;
        statusDot.className = "status-dot" + (type === "running" || type === "error" || type === "success" ? " " + type : "");
        statusDot.title = "";

        if (duration > 0) {
            statusTimer = setTimeout(function () {
                statusTimer = null;
                refreshDocumentStatus();
            }, duration);
        }
    }

    function setIdleStatus(msg, docName) {
        statusMessage.textContent = msg;
        statusMessage.title = msg;
        statusDot.className = "status-dot" + (docName ? " doc-active" : "");
        statusDot.title = docName ? t("status.docActive", { name: docName }) : msg;
    }

    function refreshDocumentStatus() {
        if (runningId || statusTimer) return; // don't overwrite a message that is still showing

        if (!csInterface) {
            setIdleStatus(t("status.ready"));
            return;
        }

        csInterface.evalScript("ozoGetDocumentStatus()", function (raw) {
            if (runningId || statusTimer) return;
            var info = null;
            try { info = JSON.parse(raw); } catch (e) {}

            if (info && info.hasDoc) {
                var name = info.name || "Untitled";
                var detail = [];
                if (info.colorSpace) detail.push(info.colorSpace);
                if (typeof info.artboardsCount === "number") {
                    detail.push(info.artboardsCount + " " + (isKhmer() ? "ផ្ទាំង" : (info.artboardsCount === 1 ? "artboard" : "artboards")));
                }
                if (info.selectedCount && info.selectedCount > 0) {
                    detail.push(info.selectedCount + " " + (isKhmer() ? "បានជ្រើស" : "sel"));
                } else if (typeof info.itemCount === "number" && info.itemCount > 0) {
                    detail.push(t("status.items", { n: info.itemCount }));
                }
                setIdleStatus(name + " (" + detail.join(" \u2022 ") + ")", name);
            } else if (info) {
                setIdleStatus(t("status.noDoc"));
            } else {
                setIdleStatus(t("status.ready"));
            }
        });
    }

    // ------------------------------------------------------------------
    // Error banner (non-blocking replacement for alert())
    // ------------------------------------------------------------------
    function showError(title, message) {
        errorTitle.textContent = title;
        errorMessage.textContent = message;
        errorBanner.hidden = false;
    }

    function hideError() {
        errorBanner.hidden = true;
    }

    // ------------------------------------------------------------------
    // Search
    // ------------------------------------------------------------------
    function setSearch(value) {
        searchQuery = String(value).replace(/^\s+|\s+$/g, "");
        searchTokens = searchQuery ? searchQuery.toLowerCase().split(/\s+/) : [];
        highlightRe = null;
        if (searchTokens.length) {
            // longest first so "export" wins over "ex" when both are typed
            var pattern = searchTokens.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRegex).join("|");
            highlightRe = new RegExp("(" + pattern + ")", "gi");
        }
        searchWrap.classList.toggle("has-value", searchInput.value.length > 0);
    }

    function highlight(text) {
        if (!highlightRe) return escapeHtml(text);
        var parts = String(text).split(highlightRe);
        var out = "";
        for (var i = 0; i < parts.length; i++) {
            // with one capture group, odd indexes are the matches
            out += (i % 2) ? '<mark class="search-match">' + escapeHtml(parts[i]) + "</mark>" : escapeHtml(parts[i]);
        }
        return out;
    }

    var searchDebounceTimer = null;
    function onSearchChanged() {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(function () {
            setSearch(searchInput.value);
            renderTools();
        }, 80);
    }

    function clearSearch(refocus) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchInput.value = "";
        setSearch("");
        renderTools();
        if (refocus) searchInput.focus();
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    function getVisibleTools() {
        var favs = [];
        var rest = [];
        for (var i = 0; i < TOOLS.length; i++) {
            var tool = TOOLS[i];
            if (currentCategory === "favorites") {
                if (!isFav(tool.id)) continue;
            } else if (currentCategory !== "all" && tool.category !== currentCategory) {
                continue;
            }
            var ok = true;
            for (var k = 0; k < searchTokens.length; k++) {
                if (tool.haystack.indexOf(searchTokens[k]) < 0) { ok = false; break; }
            }
            if (!ok) continue;
            (isFav(tool.id) ? favs : rest).push(tool);
        }
        // Favourites first. A plain partition keeps the original order stable
        // (Array.sort is not stable on older Chromium for arrays over 10 items).
        return favs.concat(rest);
    }

    function buildCard(tool) {
        var name = toolName(tool);
        var desc = toolDesc(tool);
        var fav = isFav(tool.id);

        var card = document.createElement("div");
        card.className = "tool-card cat-" + tool.category;
        card.setAttribute("data-id", tool.id);
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", name + ": " + desc);
        card.title = name + "\n" + desc; // grid view hides the description

        card.innerHTML =
            '<div class="tool-icon-wrap">' + tool.icon + "</div>" +
            '<div class="tool-info">' +
                '<div class="tool-header-row">' +
                    '<span class="tool-name" title="' + escapeHtml(name) + '">' + highlight(name) + "</span>" +
                    '<span class="tool-badge badge-' + tool.category + '">' + escapeHtml(t("cat." + tool.category)) + "</span>" +
                "</div>" +
                '<div class="tool-desc" title="' + escapeHtml(desc) + '">' + highlight(desc) + "</div>" +
            "</div>" +
            '<div class="tool-actions">' +
                // Inner buttons stay out of the tab order: the card itself is the single
                // tab stop (Enter = run, F = favourite, arrows = move).
                '<button type="button" class="fav-btn' + (fav ? " active" : "") + (popFavId === tool.id ? " pop" : "") + '" tabindex="-1" aria-pressed="' + fav + '" title="' + escapeHtml(t("fav.toggle")) + '" aria-label="' + escapeHtml(t("fav.aria", { name: name })) + '">' +
                    STAR_SVG.replace("{fill}", fav ? "currentColor" : "none") +
                "</button>" +
                '<button type="button" class="run-btn" tabindex="-1" title="' + escapeHtml(t("run.title", { name: name })) + '">' + escapeHtml(t("run.label")) + "</button>" +
            "</div>";

        return card;
    }

    function updateEmptyState() {
        var noFavsYet = currentCategory === "favorites" && !searchQuery;
        emptyText.textContent = t(noFavsYet ? "empty.favorites" : "empty.search");
        emptyClearBtn.hidden = noFavsYet;
    }

    function renderTools() {
        // Remember keyboard focus + scroll so a re-render doesn't throw the user back to the top
        var focusedId = null;
        var active = document.activeElement;
        if (active && toolList.contains(active)) {
            var focusedCard = closest(active, ".tool-card", toolList);
            focusedId = focusedCard ? focusedCard.getAttribute("data-id") : null;
        }
        var scrollTop = toolList.scrollTop;

        var visible = getVisibleTools();
        var frag = document.createDocumentFragment();
        for (var i = 0; i < visible.length; i++) frag.appendChild(buildCard(visible[i]));

        toolList.innerHTML = "";
        toolList.appendChild(frag);
        toolList.scrollTop = scrollTop;

        var empty = visible.length === 0;
        toolList.hidden = empty;
        emptyState.hidden = !empty;
        if (empty) updateEmptyState();

        syncRunningUI();

        if (focusedId) {
            var again = toolList.querySelector('.tool-card[data-id="' + focusedId + '"]');
            if (again) again.focus();
        }
    }

    function syncRunningUI() {
        each(toolList.querySelectorAll(".tool-card"), function (card) {
            var on = card.getAttribute("data-id") === runningId;
            var runBtn = card.querySelector(".run-btn");
            card.classList.toggle("is-running", on);
            card.setAttribute("aria-busy", on ? "true" : "false");
            runBtn.classList.toggle("running", on);
            runBtn.textContent = t(on ? "run.busy" : "run.label");
        });
    }

    function updateViewMode() {
        var grid = viewMode === "grid";
        toolList.classList.toggle("view-grid", grid);
        viewIconGrid.style.display = grid ? "none" : "block";
        viewIconList.style.display = grid ? "block" : "none";
        viewToggleBtn.setAttribute("aria-pressed", grid ? "true" : "false");
    }

    function setCategory(btn) {
        each(tabBtns, function (b) {
            var on = b === btn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
        });
        currentCategory = btn.getAttribute("data-category");
        renderTools();
    }

    function toggleFavorite(id) {
        var idx = favorites.indexOf(id);
        popFavId = null;
        if (idx >= 0) favorites.splice(idx, 1);
        else { favorites.push(id); popFavId = id; }
        store.set("ozo_favorites", JSON.stringify(favorites));
        updateCounts();
        renderTools();
        popFavId = null;
    }

    // ------------------------------------------------------------------
    // Running scripts
    // ------------------------------------------------------------------
    function setRunning(id) {
        runningId = id;
        syncRunningUI();
    }

    function runScript(tool) {
        if (runningId) return;
        hideError();
        var name = toolName(tool);
        setRunning(tool.id);
        setStatus(t("run.starting", { name: name }), "running");

        if (!csInterface) { // plain-browser preview
            setTimeout(function () {
                setRunning(null);
                setStatus(t("run.simulated", { name: tool.nameEn }), "success", 3000);
            }, 600);
            return;
        }

        csInterface.evalScript("ozoRunScript(" + JSON.stringify(tool.file) + ")", function (raw) {
            setRunning(null);
            handleRunResult(tool, raw);
        });
    }

    function handleRunResult(tool, raw) {
        var name = toolName(tool);
        var clean = String(raw == null ? "" : raw).replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
        var res = null;
        try { res = JSON.parse(clean); } catch (e) {}

        if (res && typeof res === "object") {
            if (res.status === "success") {
                setStatus(res.message || t("run.done", { name: name }), "success", 4000);
            } else {
                var msg = res.message || t("run.failed");
                setStatus(t("run.errorStatus", { msg: String(msg).replace(/\s+/g, " ") }), "error", 6000);
                showError(t("run.errorTitle"), msg);
            }
        } else if (clean && clean !== "EvalScript error.") {
            // script returned plain text rather than JSON: treat as finished
            setStatus(t("run.done", { name: name }), "success", 4000);
        } else {
            setStatus(t("run.failed"), "error", 5000);
        }
    }

    // ------------------------------------------------------------------
    // In-Dock Embedded Views
    // ------------------------------------------------------------------
    function openEmbeddedView(toolId) {
        var tool = toolById[toolId];
        if (!tool) return;
        activeEmbeddedTool = tool;
        hideError();
        viewCatalog.style.display = "none";
        viewEmbedded.style.display = "flex";
        embeddedToolIcon.innerHTML = tool.icon;
        embeddedToolTitle.textContent = toolName(tool);
        embeddedContent.innerHTML = "";

        if (tool.id === "exporter") {
            renderEmbeddedExporter();
        } else if (tool.id === "qr") {
            renderEmbeddedQR();
        } else {
            renderEmbeddedGeneric(tool);
        }
    }

    function closeEmbeddedView() {
        activeEmbeddedTool = null;
        viewEmbedded.style.display = "none";
        viewCatalog.style.display = "flex";
        renderTools();
    }

    function buildPreviewSample(template, docName, ab, formatExt, unit, isCombined) {
        var abName = isCombined ? "All" : (ab ? ab.name : "Artboard_1");
        var w = ab ? ab.width : "100";
        var h = ab ? ab.height : "100";
        var num = isCombined ? "All" : "01";
        var rawNum = isCombined ? "All" : "1";
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth() + 1; if (m < 10) m = "0" + m;
        var d = now.getDate(); if (d < 10) d = "0" + d;
        var dateStr = y + "-" + m + "-" + d;
        var hr = now.getHours(); if (hr < 10) hr = "0" + hr;
        var mn = now.getMinutes(); if (mn < 10) mn = "0" + mn;
        var timeStr = String(hr) + String(mn);
        var color = "CMYK";

        var res = String(template || "").replace(
            /\[(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\]|\{(doc|ab|num|raw_num|w|h|unit|date|time|color|fmt)\}/gi,
            function (match, bracketToken, braceToken) {
                var token = String(bracketToken || braceToken || "").toLowerCase();
                switch (token) {
                    case "doc": return docName;
                    case "ab": return abName;
                    case "num": return num;
                    case "raw_num": return rawNum;
                    case "w": return w;
                    case "h": return h;
                    case "unit": return unit;
                    case "date": return dateStr;
                    case "time": return timeStr;
                    case "color": return color;
                    case "fmt": return formatExt;
                }
                return match;
            }
        );
        res = res.replace(/[\\\/:\*\?"<>\|]/g, "_").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        if (!res) res = docName + "_" + abName;
        return res + "." + formatExt;
    }

    // -------------------------------------------------------------
    // Exporter In-Dock View
    // -------------------------------------------------------------
    function renderEmbeddedExporter() {
        embeddedContent.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;padding:40px 0;color:var(--text-secondary);gap:8px;">' +
                '<span class="status-dot running"></span> ' + (isKhmer() ? "កំពុងអានព័ត៌មានឯកសារ..." : "Reading document info...") +
            '</div>';

        if (!csInterface) {
            mountExporterForm({
                hasDoc: true,
                docName: "File For Print",
                fullDocName: "File For Print.ai",
                isSaved: true,
                docPath: "C:/Desktop",
                defaultUnit: "cm",
                colorSpace: "RGB",
                totalArtboards: 2,
                activeArtboardIndex: 0,
                artboards: [
                    { index: 0, name: "Front Card", width: "9.0", height: "5.4" },
                    { index: 1, name: "Back Card", width: "9.0", height: "5.4" }
                ],
                pdfPresets: ["[High Quality Print]", "[Press Quality]", "[Smallest File Size]"]
            });
            return;
        }

        csInterface.evalScript("ozoGetExportMetadata()", function (raw) {
            var meta = null;
            try {
                meta = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, ""));
            } catch (e) {}

            if (!meta || !meta.hasDoc) {
                embeddedContent.innerHTML =
                    '<div class="embed-generic-card">' +
                        '<div class="embed-generic-icon">' + svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>') + '</div>' +
                        '<div class="embed-generic-title">' + (isKhmer() ? "គ្មានឯកសារបើកក្នុង Illustrator" : "No Document Open") + '</div>' +
                        '<div class="embed-generic-desc">' + (isKhmer() ? "សូមបើកឯកសារគំនូរក្នុង Illustrator រួចចុច Refresh ដើម្បីប្រើប្រាស់មុខងារនាំចេញជាកញ្ចប់។" : "Open an artwork document in Illustrator, then click Refresh to configure batch artboard export.") + '</div>' +
                        '<button type="button" id="btnRetryDoc" class="btn-action-primary" style="margin-top:8px;">' + (isKhmer() ? "ផ្ទុកឡើងវិញ (Refresh)" : "Refresh Document") + '</button>' +
                    '</div>';
                var btnRetry = $("btnRetryDoc");
                if (btnRetry) btnRetry.addEventListener("click", renderEmbeddedExporter);
                return;
            }

            mountExporterForm(meta);
        });
    }

    function mountExporterForm(meta) {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_exporter_settings", "{}")); } catch (e) {}

        var state = {
            scope: saved.scope || "all",
            customRange: saved.customRange || ("1-" + Math.min(meta.totalArtboards, 5)),
            pdf: saved.pdf !== undefined ? saved.pdf : true,
            pdfPreset: saved.pdfPreset || (meta.pdfPresets && meta.pdfPresets[0] ? meta.pdfPresets[0] : "[High Quality Print]"),
            pdfCombined: saved.pdfCombined === true,
            tiff: saved.tiff === true,
            tiffDpi: saved.tiffDpi || 300,
            tiffColor: saved.tiffColor || (meta.colorSpace === "RGB" ? "RGB" : "CMYK"),
            tiffLzw: saved.tiffLzw !== undefined ? saved.tiffLzw : true,
            png: saved.png === true,
            pngDpi: saved.pngDpi || 300,
            pngTrans: saved.pngTrans !== undefined ? saved.pngTrans : true,
            jpg: saved.jpg === true,
            jpgDpi: saved.jpgDpi || 300,
            outline: saved.outline === true,
            template: saved.template || "[doc]_[ab]_[w]x[h][unit]",
            unit: saved.unit || meta.defaultUnit || "mm",
            destFolder: saved.destFolder || meta.docPath || "",
            useSubfolder: saved.useSubfolder === true,
            subfolderName: saved.subfolderName || "Export",
            openFolder: saved.openFolder !== undefined ? saved.openFolder : true
        };

        var namingPresets = [
            { label: "Doc_Artboard_Size", pattern: "[doc]_[ab]_[w]x[h][unit]" },
            { label: "Doc_Artboard", pattern: "[doc]_[ab]" },
            { label: "Artboard_Size", pattern: "[ab]_[w]x[h][unit]" },
            { label: "01_Doc_Artboard", pattern: "[num]_[doc]_[ab]" },
            { label: "Doc_01", pattern: "[doc]_[num]" },
            { label: "Timestamp", pattern: "[doc]_[ab]_[date]_[time]" },
            { label: "Custom", pattern: "" }
        ];

        var html = [];

        // 1. Doc Info Bar
        html.push('<div class="embed-doc-bar">');
        html.push('  <span class="embed-doc-name" title="' + escapeHtml(meta.fullDocName) + '">' + escapeHtml(meta.fullDocName) + '</span>');
        html.push('  <div class="embed-doc-tags">');
        html.push('    <span class="embed-tag">' + escapeHtml(meta.colorSpace) + '</span>');
        html.push('    <span class="embed-tag ' + (meta.isSaved ? "tag-saved" : "tag-unsaved") + '">' + (meta.isSaved ? "Saved" : "Unsaved") + '</span>');
        html.push('    <span class="embed-tag">' + meta.totalArtboards + ' AB</span>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Scope Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ផ្ទាំងគំនូរគោលដៅ" : "Target Artboards") + '</span></div>');
        html.push('  <div class="embed-segmented" id="expScopeSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.scope === "all" ? "active" : "") + '" data-scope="all">' + (isKhmer() ? "ទាំងអស់" : "All") + ' (' + meta.totalArtboards + ')</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.scope === "active" ? "active" : "") + '" data-scope="active">' + (isKhmer() ? "សកម្ម" : "Active") + ' (#' + (meta.activeArtboardIndex + 1) + ')</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.scope === "range" ? "active" : "") + '" data-scope="range">' + (isKhmer() ? "ចន្លោះ" : "Range") + '</button>');
        html.push('  </div>');
        html.push('  <div class="embed-range-row" id="expRangeRow" style="display:' + (state.scope === "range" ? "flex" : "none") + ';">');
        html.push('    <label>' + (isKhmer() ? "ចន្លោះ (ឧ. 1-3, 5)៖" : "Range (e.g. 1-3, 5):") + '</label>');
        html.push('    <input type="text" id="expRangeInput" class="embed-input" value="' + escapeHtml(state.customRange) + '" style="flex:1;">');
        html.push('  </div>');
        html.push('</div>');

        // 3. Formats Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទម្រង់នាំចេញ" : "Export Formats") + '</span></div>');
        html.push('  <div class="embed-format-group">');

        // Format PDF
        html.push('    <div class="embed-format-card ' + (state.pdf ? "active" : "") + '">');
        html.push('      <div class="embed-format-top">');
        html.push('        <label class="embed-format-label"><input type="checkbox" id="chkPdf" ' + (state.pdf ? "checked" : "") + '> PDF (Print / Vector)</label>');
        html.push('      </div>');
        html.push('      <div class="embed-format-options" id="optPdf" style="display:' + (state.pdf ? "flex" : "none") + ';">');
        html.push('        <select id="selPdfPreset" class="embed-select" style="flex:1;">');
        for (var p = 0; p < meta.pdfPresets.length; p++) {
            var pr = meta.pdfPresets[p];
            html.push('          <option value="' + escapeHtml(pr) + '" ' + (state.pdfPreset === pr ? "selected" : "") + '>' + escapeHtml(pr) + '</option>');
        }
        html.push('        </select>');
        html.push('        <label class="embed-check-row" style="margin-left:4px;"><input type="radio" name="pdfMode" id="rbPdfSep" value="sep" ' + (!state.pdfCombined ? "checked" : "") + '> Separate</label>');
        html.push('        <label class="embed-check-row"><input type="radio" name="pdfMode" id="rbPdfComb" value="comb" ' + (state.pdfCombined ? "checked" : "") + '> Multi-page</label>');
        html.push('      </div>');
        html.push('    </div>');

        // Format TIFF
        html.push('    <div class="embed-format-card ' + (state.tiff ? "active" : "") + '">');
        html.push('      <div class="embed-format-top">');
        html.push('        <label class="embed-format-label"><input type="checkbox" id="chkTiff" ' + (state.tiff ? "checked" : "") + '> TIFF (Prepress / RIP)</label>');
        html.push('      </div>');
        html.push('      <div class="embed-format-options" id="optTiff" style="display:' + (state.tiff ? "flex" : "none") + ';">');
        html.push('        <select id="selTiffDpi" class="embed-select"><option value="300" ' + (state.tiffDpi == 300 ? "selected" : "") + '>300 DPI</option><option value="150" ' + (state.tiffDpi == 150 ? "selected" : "") + '>150 DPI</option><option value="72" ' + (state.tiffDpi == 72 ? "selected" : "") + '>72 DPI</option></select>');
        html.push('        <select id="selTiffColor" class="embed-select"><option value="CMYK" ' + (state.tiffColor === "CMYK" ? "selected" : "") + '>CMYK</option><option value="RGB" ' + (state.tiffColor === "RGB" ? "selected" : "") + '>RGB</option></select>');
        html.push('        <label class="embed-check-row"><input type="checkbox" id="chkTiffLzw" ' + (state.tiffLzw ? "checked" : "") + '> LZW</label>');
        html.push('      </div>');
        html.push('    </div>');

        // Format PNG
        html.push('    <div class="embed-format-card ' + (state.png ? "active" : "") + '">');
        html.push('      <div class="embed-format-top">');
        html.push('        <label class="embed-format-label"><input type="checkbox" id="chkPng" ' + (state.png ? "checked" : "") + '> PNG (Transparent Web)</label>');
        html.push('      </div>');
        html.push('      <div class="embed-format-options" id="optPng" style="display:' + (state.png ? "flex" : "none") + ';">');
        html.push('        <select id="selPngDpi" class="embed-select"><option value="300" ' + (state.pngDpi == 300 ? "selected" : "") + '>300 DPI</option><option value="150" ' + (state.pngDpi == 150 ? "selected" : "") + '>150 DPI</option><option value="72" ' + (state.pngDpi == 72 ? "selected" : "") + '>72 DPI</option></select>');
        html.push('        <label class="embed-check-row"><input type="checkbox" id="chkPngTrans" ' + (state.pngTrans ? "checked" : "") + '> Transparent</label>');
        html.push('      </div>');
        html.push('    </div>');

        // Format JPEG
        html.push('    <div class="embed-format-card ' + (state.jpg ? "active" : "") + '">');
        html.push('      <div class="embed-format-top">');
        html.push('        <label class="embed-format-label"><input type="checkbox" id="chkJpg" ' + (state.jpg ? "checked" : "") + '> JPEG (Client Proof)</label>');
        html.push('      </div>');
        html.push('      <div class="embed-format-options" id="optJpg" style="display:' + (state.jpg ? "flex" : "none") + ';">');
        html.push('        <select id="selJpgDpi" class="embed-select"><option value="300" ' + (state.jpgDpi == 300 ? "selected" : "") + '>300 DPI</option><option value="150" ' + (state.jpgDpi == 150 ? "selected" : "") + '>150 DPI</option><option value="72" ' + (state.jpgDpi == 72 ? "selected" : "") + '>72 DPI</option></select>');
        html.push('        <span style="font-size:11px;color:var(--text-muted);">Quality 100% (Max)</span>');
        html.push('      </div>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Prepress Options
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ជម្រើសមុនបោះពុម្ព" : "Prepress Options") + '</span></div>');
        html.push('  <label class="embed-check-row" title="Outlines all text frames for export, then restores the saved document so live text is preserved.">');
        html.push('    <input type="checkbox" id="chkOutline" ' + (state.outline ? "checked" : "") + '>');
        html.push('    <span>' + (isKhmer() ? "បម្លែងអក្សរទៅជា Outline មុននាំចេញ" : "Convert text to outlines before export") + '</span>');
        html.push('  </label>');
        html.push('</div>');

        // 5. Dynamic File Naming Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ឈ្មោះឯកសារ" : "Dynamic File Naming") + '</span></div>');
        html.push('  <div class="embed-naming-row">');
        html.push('    <select id="selNamingPreset" class="embed-select" style="flex:1;">');
        for (var np = 0; np < namingPresets.length; np++) {
            var npo = namingPresets[np];
            var isSel = (npo.pattern && npo.pattern === state.template);
            html.push('      <option value="' + escapeHtml(npo.pattern) + '" ' + (isSel ? "selected" : "") + '>' + escapeHtml(npo.label) + '</option>');
        }
        html.push('    </select>');
        html.push('    <select id="selNamingUnit" class="embed-select" style="width:65px;">');
        var units = ["mm", "cm", "in", "pt"];
        for (var u = 0; u < units.length; u++) {
            html.push('      <option value="' + units[u] + '" ' + (state.unit === units[u] ? "selected" : "") + '>' + units[u] + '</option>');
        }
        html.push('    </select>');
        html.push('    <select id="selNamingTag" class="embed-select" style="width:85px;">');
        html.push('      <option value="">+ Tag... ▾</option>');
        html.push('      <option value="[doc]">[doc] Document</option>');
        html.push('      <option value="[ab]">[ab] Artboard</option>');
        html.push('      <option value="[w]">[w] Width</option>');
        html.push('      <option value="[h]">[h] Height</option>');
        html.push('      <option value="[unit]">[unit] Unit</option>');
        html.push('      <option value="[num]">[num] 01, 02</option>');
        html.push('      <option value="[raw_num]">[raw_num] 1, 2</option>');
        html.push('      <option value="[date]">[date] YYYY-MM-DD</option>');
        html.push('      <option value="[time]">[time] HHMM</option>');
        html.push('      <option value="[color]">[color] Color</option>');
        html.push('      <option value="[fmt]">[fmt] Format</option>');
        html.push('    </select>');
        html.push('  </div>');
        html.push('  <input type="text" id="expTemplateInput" class="embed-input embed-input-mono" value="' + escapeHtml(state.template) + '">');
        html.push('  <div class="embed-naming-preview" id="expNamingPreview">→ Preview</div>');
        html.push('  <div class="embed-naming-info" id="expNamingInfo"></div>');
        html.push('</div>');

        // 6. Destination Folder Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ថតគោលដៅ" : "Destination Folder") + '</span></div>');
        html.push('  <div class="embed-browse-row">');
        html.push('    <input type="text" id="expDestInput" class="embed-input" value="' + escapeHtml(state.destFolder) + '">');
        html.push('    <button type="button" id="btnBrowseDest" class="embed-btn-browse">' + (isKhmer() ? "ជ្រើសរើស..." : "Browse...") + '</button>');
        html.push('  </div>');
        html.push('  <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkUseSubfolder" ' + (state.useSubfolder ? "checked" : "") + '> ' + (isKhmer() ? "ថតរង" : "Subfolder") + ':</label>');
        html.push('    <input type="text" id="expSubfolderInput" class="embed-input" value="' + escapeHtml(state.subfolderName) + '" style="width:100px;' + (state.useSubfolder ? "" : "opacity:0.5;") + '" ' + (state.useSubfolder ? "" : "disabled") + '>');
        html.push('  </div>');
        html.push('  <label class="embed-check-row"><input type="checkbox" id="chkOpenFolder" ' + (state.openFolder ? "checked" : "") + '> ' + (isKhmer() ? "បើកថតពេលរួចរាល់" : "Open folder when finished") + '</label>');
        html.push('</div>');

        // 7. Sticky Action Footer
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnExportSubmit" class="btn-action-primary">🚀 ' + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        // Wire elements
        var scopeBtns = embeddedContent.querySelectorAll("#expScopeSegmented .embed-seg-btn");
        var expRangeRow = $("expRangeRow");
        var expRangeInput = $("expRangeInput");
        var chkPdf = $("chkPdf");
        var optPdf = $("optPdf");
        var selPdfPreset = $("selPdfPreset");
        var rbPdfSep = $("rbPdfSep");
        var rbPdfComb = $("rbPdfComb");
        var chkTiff = $("chkTiff");
        var optTiff = $("optTiff");
        var selTiffDpi = $("selTiffDpi");
        var selTiffColor = $("selTiffColor");
        var chkTiffLzw = $("chkTiffLzw");
        var chkPng = $("chkPng");
        var optPng = $("optPng");
        var selPngDpi = $("selPngDpi");
        var chkPngTrans = $("chkPngTrans");
        var chkJpg = $("chkJpg");
        var optJpg = $("optJpg");
        var selJpgDpi = $("selJpgDpi");
        var chkOutline = $("chkOutline");
        var selNamingPreset = $("selNamingPreset");
        var selNamingUnit = $("selNamingUnit");
        var selNamingTag = $("selNamingTag");
        var expTemplateInput = $("expTemplateInput");
        var expNamingPreview = $("expNamingPreview");
        var expNamingInfo = $("expNamingInfo");
        var expDestInput = $("expDestInput");
        var btnBrowseDest = $("btnBrowseDest");
        var chkUseSubfolder = $("chkUseSubfolder");
        var expSubfolderInput = $("expSubfolderInput");
        var chkOpenFolder = $("chkOpenFolder");
        var btnExportSubmit = $("btnExportSubmit");

        function updateExportPreview() {
            var ext = chkPdf.checked ? "pdf" : (chkTiff.checked ? "tif" : (chkPng.checked ? "png" : (chkJpg.checked ? "jpg" : "pdf")));
            var isComb = chkPdf.checked && rbPdfComb.checked;
            var abIndex = state.scope === "active" ? meta.activeArtboardIndex : 0;
            var ab = meta.artboards && meta.artboards[abIndex] ? meta.artboards[abIndex] : null;
            var sampleName = buildPreviewSample(expTemplateInput.value, meta.docName, ab, ext, selNamingUnit.value, isComb);
            expNamingPreview.textContent = "→ " + sampleName;

            var abCount = 0;
            if (state.scope === "all") {
                abCount = meta.totalArtboards;
            } else if (state.scope === "active") {
                abCount = 1;
            } else {
                var rangeArr = (expRangeInput.value || "").split(",");
                var count = 0;
                for (var r = 0; r < rangeArr.length; r++) {
                    var prt = rangeArr[r].trim();
                    if (prt.indexOf("-") !== -1) {
                        var parts = prt.split("-");
                        var start = parseInt(parts[0], 10);
                        var end = parseInt(parts[1], 10);
                        if (!isNaN(start) && !isNaN(end)) count += Math.max(0, Math.abs(end - start) + 1);
                    } else if (parseInt(prt, 10)) {
                        count++;
                    }
                }
                abCount = count > 0 ? count : meta.totalArtboards;
            }

            var fmtCount = (chkPdf.checked ? 1 : 0) + (chkTiff.checked ? 1 : 0) + (chkPng.checked ? 1 : 0) + (chkJpg.checked ? 1 : 0);
            var fileCount = 0;
            if (chkPdf.checked) fileCount += isComb ? 1 : abCount;
            if (chkTiff.checked) fileCount += abCount;
            if (chkPng.checked) fileCount += abCount;
            if (chkJpg.checked) fileCount += abCount;

            expNamingInfo.textContent = abCount + " " + (isKhmer() ? "ផ្ទាំងគំនូរ" : "artboard(s)") + " • " +
                fmtCount + " " + (isKhmer() ? "ទម្រង់" : "format(s)") + " • " +
                fileCount + " " + (isKhmer() ? "ឯកសារសរុប" : "file(s) total");

            state.customRange = expRangeInput.value;
            state.pdf = chkPdf.checked;
            state.pdfPreset = selPdfPreset.value;
            state.pdfCombined = rbPdfComb.checked;
            state.tiff = chkTiff.checked;
            state.tiffDpi = parseInt(selTiffDpi.value, 10) || 300;
            state.tiffColor = selTiffColor.value;
            state.tiffLzw = chkTiffLzw.checked;
            state.png = chkPng.checked;
            state.pngDpi = parseInt(selPngDpi.value, 10) || 300;
            state.pngTrans = chkPngTrans.checked;
            state.jpg = chkJpg.checked;
            state.jpgDpi = parseInt(selJpgDpi.value, 10) || 300;
            state.outline = chkOutline.checked;
            state.template = expTemplateInput.value;
            state.unit = selNamingUnit.value;
            state.destFolder = expDestInput.value;
            state.useSubfolder = chkUseSubfolder.checked;
            state.subfolderName = expSubfolderInput.value;
            state.openFolder = chkOpenFolder.checked;

            store.setDebounced("ozo_exporter_settings", JSON.stringify(state), 250);
        }

        // Scope handlers
        for (var b = 0; b < scopeBtns.length; b++) {
            scopeBtns[b].addEventListener("click", function () {
                for (var sb = 0; sb < scopeBtns.length; sb++) scopeBtns[sb].classList.remove("active");
                this.classList.add("active");
                state.scope = this.getAttribute("data-scope");
                expRangeRow.style.display = (state.scope === "range") ? "flex" : "none";
                updateExportPreview();
            });
        }
        expRangeInput.addEventListener("input", updateExportPreview);

        // Format handlers
        chkPdf.addEventListener("change", function () {
            optPdf.style.display = this.checked ? "flex" : "none";
            var card = closest(this, ".embed-format-card");
            if (card) card.classList.toggle("active", this.checked);
            updateExportPreview();
        });
        selPdfPreset.addEventListener("change", updateExportPreview);
        rbPdfSep.addEventListener("change", updateExportPreview);
        rbPdfComb.addEventListener("change", updateExportPreview);

        chkTiff.addEventListener("change", function () {
            optTiff.style.display = this.checked ? "flex" : "none";
            var card = closest(this, ".embed-format-card");
            if (card) card.classList.toggle("active", this.checked);
            updateExportPreview();
        });
        selTiffDpi.addEventListener("change", updateExportPreview);
        selTiffColor.addEventListener("change", updateExportPreview);
        chkTiffLzw.addEventListener("change", updateExportPreview);

        chkPng.addEventListener("change", function () {
            optPng.style.display = this.checked ? "flex" : "none";
            var card = closest(this, ".embed-format-card");
            if (card) card.classList.toggle("active", this.checked);
            updateExportPreview();
        });
        selPngDpi.addEventListener("change", updateExportPreview);
        chkPngTrans.addEventListener("change", updateExportPreview);

        chkJpg.addEventListener("change", function () {
            optJpg.style.display = this.checked ? "flex" : "none";
            var card = closest(this, ".embed-format-card");
            if (card) card.classList.toggle("active", this.checked);
            updateExportPreview();
        });
        selJpgDpi.addEventListener("change", updateExportPreview);
        chkOutline.addEventListener("change", updateExportPreview);

        // Naming handlers
        selNamingPreset.addEventListener("change", function () {
            if (this.value) {
                expTemplateInput.value = this.value;
                updateExportPreview();
            }
        });
        selNamingUnit.addEventListener("change", updateExportPreview);
        selNamingTag.addEventListener("change", function () {
            if (this.value) {
                expTemplateInput.value += this.value;
                this.selectedIndex = 0;
                updateExportPreview();
            }
        });
        expTemplateInput.addEventListener("input", updateExportPreview);

        // Destination folder
        btnBrowseDest.addEventListener("click", function () {
            if (!csInterface) {
                expDestInput.value = "C:/Projects/Export/Batch_Out";
                updateExportPreview();
                return;
            }
            csInterface.evalScript("ozoPickDestinationFolder(" + JSON.stringify(expDestInput.value) + ")", function (raw) {
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success" && res.folder) {
                    expDestInput.value = res.folder;
                    updateExportPreview();
                }
            });
        });

        chkUseSubfolder.addEventListener("change", function () {
            expSubfolderInput.disabled = !this.checked;
            expSubfolderInput.style.opacity = this.checked ? "1" : "0.5";
            updateExportPreview();
        });
        expSubfolderInput.addEventListener("input", updateExportPreview);
        chkOpenFolder.addEventListener("change", updateExportPreview);

        // Submit Export
        btnExportSubmit.addEventListener("click", function () {
            var fmtCount = (chkPdf.checked ? 1 : 0) + (chkTiff.checked ? 1 : 0) + (chkPng.checked ? 1 : 0) + (chkJpg.checked ? 1 : 0);
            if (fmtCount === 0) {
                showError("Batch Export", isKhmer() ? "សូមជ្រើសរើសទម្រង់យ៉ាងហោចមួយដើម្បីនាំចេញ។" : "Please select at least one format to export.");
                return;
            }
            if (!expDestInput.value.trim()) {
                showError("Batch Export", isKhmer() ? "សូមជ្រើសរើសថតគោលដៅ។" : "Please choose a destination folder.");
                return;
            }

            hideError();
            btnExportSubmit.disabled = true;
            btnExportSubmit.textContent = isKhmer() ? "⏳ កំពុងនាំចេញ..." : "⏳ Exporting...";
            setStatus(isKhmer() ? "កំពុងនាំចេញឯកសារ..." : "Batch exporting artboards...", "running");

            var exportConfig = {
                scope: state.scope,
                customRange: expRangeInput.value,
                formats: {
                    pdf: { enabled: chkPdf.checked, preset: selPdfPreset.value, combined: rbPdfComb.checked },
                    tiff: { enabled: chkTiff.checked, dpi: parseInt(selTiffDpi.value, 10) || 300, colorSpace: selTiffColor.value, lzw: chkTiffLzw.checked },
                    png: { enabled: chkPng.checked, dpi: parseInt(selPngDpi.value, 10) || 300, transparency: chkPngTrans.checked },
                    jpg: { enabled: chkJpg.checked, dpi: parseInt(selJpgDpi.value, 10) || 300, quality: 100 }
                },
                template: expTemplateInput.value,
                unit: selNamingUnit.value,
                destFolder: expDestInput.value,
                useSubfolder: chkUseSubfolder.checked,
                subfolderName: expSubfolderInput.value,
                openFolder: chkOpenFolder.checked,
                outline: chkOutline.checked
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnExportSubmit.disabled = false;
                    btnExportSubmit.textContent = "🚀 " + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now");
                    setStatus("Simulated Export Complete (2 files)", "success", 4000);
                }, 1200);
                return;
            }

            csInterface.evalScript("ozoExecuteBatchExport(" + JSON.stringify(JSON.stringify(exportConfig)) + ")", function (raw) {
                btnExportSubmit.disabled = false;
                btnExportSubmit.textContent = "🚀 " + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var successMsg = (isKhmer() ? "នាំចេញបានជោគជ័យ៖ " : "Export complete: ") + res.count + " " + (isKhmer() ? "ឯកសារ" : "file(s)") + " → " + res.folder;
                    setStatus(successMsg, "success", 6000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Export failed");
                    showError(isKhmer() ? "ការនាំចេញបរាជ័យ" : "Export Failed", errMsg);
                    setStatus(isKhmer() ? "ការនាំចេញបរាជ័យ៖ " + errMsg : "Export failed: " + errMsg, "error", 6000);
                }
            });
        });

        updateExportPreview();
    }

    // -------------------------------------------------------------
    // QR Code In-Dock View
    // -------------------------------------------------------------
    function renderEmbeddedQR() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_qr_settings", "{}")); } catch (e) {}

        var state = {
            style: saved.style || "Normal",
            content: saved.content || "https://",
            size: saved.size || 30,
            unit: saved.unit || "mm",
            quietZone: saved.quietZone !== undefined ? saved.quietZone : 4,
            level: saved.level || "M",
            background: saved.background !== false,
            newLayer: saved.newLayer === true,
            theme: saved.theme || "Official Telegram Blue",
            title: saved.title || "Telegram",
            handle: saved.handle || "@telegram"
        };

        var html = [];

        // 1. Style Segmented Control
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "រចនាប័ទ្ម QR" : "QR Style") + '</span></div>');
        html.push('  <div class="embed-segmented" id="qrStyleSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "Normal" ? "active" : "") + '" data-style="Normal">Standard</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "Telegram 2026 (Share Card)" ? "active" : "") + '" data-style="Telegram 2026 (Share Card)">Telegram Card</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "Telegram 2026 (QR Only)" ? "active" : "") + '" data-style="Telegram 2026 (QR Only)">Telegram QR</button>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Content Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "មាតិកា QR" : "QR Content") + '</span></div>');
        html.push('  <div class="embed-chips">');
        html.push('    <button type="button" class="embed-chip" data-tpl="https://">URL</button>');
        html.push('    <button type="button" class="embed-chip" data-tpl="WIFI:T:WPA;S:Network;P:Password;;">Wi-Fi</button>');
        html.push('    <button type="button" class="embed-chip" data-tpl="BEGIN:VCARD\nVERSION:3.0\nFN:Name\nTEL:+855\nEND:VCARD">Contact</button>');
        html.push('    <button type="button" class="embed-chip" data-tpl="tel:+855">Phone</button>');
        html.push('  </div>');
        html.push('  <textarea id="qrContentInput" class="embed-textarea" placeholder="Enter text, URL, or data...">' + escapeHtml(state.content) + '</textarea>');
        html.push('  <div class="embed-naming-info" id="qrCharCount"></div>');
        html.push('</div>');

        // 3. Size & Options Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទំហំ និងជម្រើស" : "Dimensions & Options") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទំហំបញ្ចប់៖" : "Size:") + '</label>');
        html.push('      <div style="display:flex;gap:4px;margin-top:2px;">');
        html.push('        <input type="number" id="qrSizeInput" class="embed-input" value="' + state.size + '" style="flex:1;" min="1" step="1">');
        html.push('        <select id="qrUnitSelect" class="embed-select" style="width:60px;">');
        var qrUnits = ["mm", "cm", "in"];
        for (var qu = 0; qu < qrUnits.length; qu++) {
            html.push('          <option value="' + qrUnits[qu] + '" ' + (state.unit === qrUnits[qu] ? "selected" : "") + '>' + qrUnits[qu] + '</option>');
        }
        html.push('        </select>');
        html.push('      </div>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កម្រិតកែកំហុស៖" : "Correction:") + '</label>');
        html.push('      <select id="qrCorrectionSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="L" ' + (state.level === "L" ? "selected" : "") + '>L - 7%</option>');
        html.push('        <option value="M" ' + (state.level === "M" ? "selected" : "") + '>M - 15%</option>');
        html.push('        <option value="Q" ' + (state.level === "Q" ? "selected" : "") + '>Q - 25%</option>');
        html.push('        <option value="H" ' + (state.level === "H" ? "selected" : "") + '>H - 30%</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="display:flex;gap:12px;margin-top:4px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkQrBg" ' + (state.background ? "checked" : "") + '> White Background</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkQrNewLayer" ' + (state.newLayer ? "checked" : "") + '> New Layer</label>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Telegram Style Options
        var isTg = (state.style.indexOf("Telegram") !== -1);
        html.push('<div class="embed-card" id="qrTelegramCard" style="display:' + (isTg ? "flex" : "none") + ';">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ជម្រើស Telegram 2026" : "Telegram Options") + '</span></div>');
        html.push('  <div>');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ពណ៌រចនាប័ទ្ម៖" : "Theme:") + '</label>');
        html.push('    <select id="qrTgThemeSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var tgThemes = ["Official Telegram Blue", "Midnight Dark", "Vibrant Cyan", "Classic Black"];
        for (var tt = 0; tt < tgThemes.length; tt++) {
            html.push('      <option value="' + tgThemes[tt] + '" ' + (state.theme === tgThemes[tt] ? "selected" : "") + '>' + tgThemes[tt] + '</option>');
        }
        html.push('    </select>');
        html.push('  </div>');
        html.push('  <div id="qrTgCardFields" style="display:' + (state.style === "Telegram 2026 (Share Card)" ? "flex" : "none") + ';flex-direction:column;gap:6px;">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះបង្ហាញ៖" : "Display Name:") + '</label>');
        html.push('      <input type="text" id="qrTgTitleInput" class="embed-input" value="' + escapeHtml(state.title) + '" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះគណនី / តំណ៖" : "Username / Link:") + '</label>');
        html.push('      <input type="text" id="qrTgHandleInput" class="embed-input" value="' + escapeHtml(state.handle) + '" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Sticky Action Button
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnQrSubmit" class="btn-action-primary">➕ ' + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var styleBtns = embeddedContent.querySelectorAll("#qrStyleSegmented .embed-seg-btn");
        var qrContentInput = $("qrContentInput");
        var qrCharCount = $("qrCharCount");
        var qrSizeInput = $("qrSizeInput");
        var qrUnitSelect = $("qrUnitSelect");
        var qrCorrectionSelect = $("qrCorrectionSelect");
        var chkQrBg = $("chkQrBg");
        var chkQrNewLayer = $("chkQrNewLayer");
        var qrTelegramCard = $("qrTelegramCard");
        var qrTgThemeSelect = $("qrTgThemeSelect");
        var qrTgCardFields = $("qrTgCardFields");
        var qrTgTitleInput = $("qrTgTitleInput");
        var qrTgHandleInput = $("qrTgHandleInput");
        var btnQrSubmit = $("btnQrSubmit");

        function updateQRState() {
            var len = qrContentInput.value.length;
            qrCharCount.textContent = len + " " + (isKhmer() ? "តួអក្សរ" : "characters") + (len > 0 ? " • " + (isKhmer() ? "រួចរាល់សម្រាប់បង្កើត" : "Ready to generate") : "");

            state.content = qrContentInput.value;
            state.size = parseFloat(qrSizeInput.value) || 30;
            state.unit = qrUnitSelect.value;
            state.level = qrCorrectionSelect.value;
            state.background = chkQrBg.checked;
            state.newLayer = chkQrNewLayer.checked;
            state.theme = qrTgThemeSelect.value;
            state.title = qrTgTitleInput.value;
            state.handle = qrTgHandleInput.value;

            store.setDebounced("ozo_qr_settings", JSON.stringify(state), 250);
        }

        // Style Segmented
        for (var s = 0; s < styleBtns.length; s++) {
            styleBtns[s].addEventListener("click", function () {
                for (var sb = 0; sb < styleBtns.length; sb++) styleBtns[sb].classList.remove("active");
                this.classList.add("active");
                state.style = this.getAttribute("data-style");
                var tg = (state.style.indexOf("Telegram") !== -1);
                qrTelegramCard.style.display = tg ? "flex" : "none";
                qrTgCardFields.style.display = (state.style === "Telegram 2026 (Share Card)") ? "flex" : "none";
                if (tg) {
                    qrCorrectionSelect.value = "M";
                    qrCorrectionSelect.disabled = true;
                } else {
                    qrCorrectionSelect.disabled = false;
                }
                updateQRState();
            });
        }

        // Template chips
        var chips = embeddedContent.querySelectorAll(".embed-chip");
        for (var c = 0; c < chips.length; c++) {
            chips[c].addEventListener("click", function () {
                qrContentInput.value = this.getAttribute("data-tpl");
                qrContentInput.focus();
                updateQRState();
            });
        }

        qrContentInput.addEventListener("input", updateQRState);
        qrSizeInput.addEventListener("input", updateQRState);
        qrUnitSelect.addEventListener("change", updateQRState);
        qrCorrectionSelect.addEventListener("change", updateQRState);
        chkQrBg.addEventListener("change", updateQRState);
        chkQrNewLayer.addEventListener("change", updateQRState);
        qrTgThemeSelect.addEventListener("change", updateQRState);
        qrTgTitleInput.addEventListener("input", updateQRState);
        qrTgHandleInput.addEventListener("input", updateQRState);

        // Submit QR
        btnQrSubmit.addEventListener("click", function () {
            var txt = qrContentInput.value.trim();
            if (!txt) {
                showError("Generate QR Code", isKhmer() ? "សូមបញ្ចូលអត្ថបទ ឬតំណ URL សម្រាប់កូដ QR។" : "Enter text, a URL, or contact data for the QR code.");
                return;
            }

            hideError();
            btnQrSubmit.disabled = true;
            btnQrSubmit.textContent = isKhmer() ? "⏳ កំពុងបង្កើត..." : "⏳ Generating...";
            setStatus(isKhmer() ? "កំពុងបង្កើតកូដ QR..." : "Generating vector QR code...", "running");

            var qrParams = {
                content: txt,
                size: parseFloat(qrSizeInput.value) || 30,
                unit: qrUnitSelect.value,
                style: state.style,
                level: qrCorrectionSelect.value,
                quietZone: 4,
                background: chkQrBg.checked,
                newLayer: chkQrNewLayer.checked,
                telegramTheme: qrTgThemeSelect.value,
                telegramTitle: qrTgTitleInput.value,
                telegramHandle: qrTgHandleInput.value
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnQrSubmit.disabled = false;
                    btnQrSubmit.textContent = "➕ " + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code");
                    setStatus("Simulated QR Inserted (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteGenerateQR(" + JSON.stringify(JSON.stringify(qrParams)) + ")", function (raw) {
                btnQrSubmit.disabled = false;
                btnQrSubmit.textContent = "➕ " + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var successMsg = (isKhmer() ? "បានបង្កើតកូដ QR វ៉ិចទ័រជោគជ័យ (ជំនាន់ " : "QR code inserted: Version ") + res.version + " (" + res.modules + "x" + res.modules + " modules)";
                    setStatus(successMsg, "success", 5000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to generate QR code");
                    showError(isKhmer() ? "ការបង្កើត QR បរាជ័យ" : "QR Generation Failed", errMsg);
                    setStatus(isKhmer() ? "ការបង្កើត QR បរាជ័យ៖ " + errMsg : "QR generation failed: " + errMsg, "error", 6000);
                }
            });
        });

        updateQRState();
    }

    // -------------------------------------------------------------
    // Generic In-Dock View (for other tools)
    // -------------------------------------------------------------
    function renderEmbeddedGeneric(tool) {
        var name = toolName(tool);
        var desc = toolDesc(tool);

        var html = [];
        html.push('<div class="embed-generic-card">');
        html.push('  <div class="embed-generic-icon">' + tool.icon + '</div>');
        html.push('  <div class="embed-generic-title">' + escapeHtml(name) + '</div>');
        html.push('  <span class="tool-badge badge-' + tool.category + '">' + escapeHtml(t("cat." + tool.category)) + '</span>');
        html.push('  <div class="embed-generic-desc">' + escapeHtml(desc) + '</div>');
        html.push('  <div style="font-size:10.5px;color:var(--text-muted);font-family:monospace;">' + escapeHtml(tool.file) + '</div>');
        html.push('  <div class="embed-generic-actions">');
        html.push('    <button type="button" id="btnGenericRun" class="btn-action-primary">▶ ' + (isKhmer() ? "ដំណើរការក្នុង Illustrator" : "Run in Illustrator") + '</button>');
        html.push('    <button type="button" id="btnGenericDialog" class="btn-action-secondary">↗ ' + (isKhmer() ? "បើកផ្ទាំងបញ្ជា (Dialog)" : "Open Dialog Window") + '</button>');
        html.push('  </div>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var btnRun = $("btnGenericRun");
        var btnDialog = $("btnGenericDialog");
        if (btnRun) btnRun.addEventListener("click", function () { runScript(tool); });
        if (btnDialog) btnDialog.addEventListener("click", function () { runScript(tool); });
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    // One delegated click handler for every card, star and Run button
    toolList.addEventListener("click", function (e) {
        var card = closest(e.target, ".tool-card", toolList);
        if (!card) return;
        var tool = toolById[card.getAttribute("data-id")];
        if (!tool) return;
        if (closest(e.target, ".fav-btn", card)) toggleFavorite(tool.id);
        else openEmbeddedView(tool.id);
    });

    toolList.addEventListener("keydown", function (e) {
        var card = e.target;
        if (!card.classList || !card.classList.contains("tool-card")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var tool = toolById[card.getAttribute("data-id")];
        var key = keyOf(e);
        var target = null;

        if (key === "Enter" || key === " ") {
            e.preventDefault();
            if (tool) openEmbeddedView(tool.id);
        } else if (key === "f" || key === "F") {
            e.preventDefault();
            if (tool) toggleFavorite(tool.id);
        } else if (key === "ArrowDown" || key === "ArrowRight") {
            e.preventDefault();
            target = card.nextElementSibling;
        } else if (key === "ArrowUp" || key === "ArrowLeft") {
            e.preventDefault();
            target = card.previousElementSibling;
            if (!target) { searchInput.focus(); searchInput.select(); return; }
        } else if (key === "Home") {
            e.preventDefault();
            target = toolList.firstElementChild;
        } else if (key === "End") {
            e.preventDefault();
            target = toolList.lastElementChild;
        }
        if (target && target.classList.contains("tool-card")) target.focus();
    });

    tabsContainer.addEventListener("click", function (e) {
        var btn = closest(e.target, ".tab-btn", tabsContainer);
        if (btn) setCategory(btn);
    });

    searchInput.addEventListener("input", onSearchChanged);

    searchInput.addEventListener("keydown", function (e) {
        if (e.isComposing) return; // Khmer/CJK IME: Enter confirms the composition, it must not launch a tool
        var key = keyOf(e);
        if (key === "Enter") {
            if (!searchQuery) return;
            var first = toolList.querySelector(".tool-card");
            if (first) first.click(); // launch the top match
        } else if (key === "ArrowDown") {
            e.preventDefault();
            var firstCard = toolList.querySelector(".tool-card");
            if (firstCard) firstCard.focus();
        }
    });

    window.addEventListener("keydown", function (e) {
        var key = keyOf(e);
        var active = document.activeElement;
        var editing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);

        if (key === "/" && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (activeEmbeddedTool) closeEmbeddedView();
            searchInput.focus();
            searchInput.select();
        } else if (key === "Escape") {
            if (activeEmbeddedTool && !editing) {
                closeEmbeddedView();
            } else if (searchInput.value) {
                clearSearch(false);
                if (active === searchInput) searchInput.blur();
            } else if (active === searchInput) {
                searchInput.blur();
            } else if (active && active.classList && active.classList.contains("tool-card")) {
                searchInput.focus();
            }
        }
    });

    if (embeddedBackBtn) {
        embeddedBackBtn.addEventListener("click", closeEmbeddedView);
    }

    if (embeddedDialogBtn) {
        embeddedDialogBtn.addEventListener("click", function () {
            if (activeEmbeddedTool) {
                runScript(activeEmbeddedTool);
            }
        });
    }

    searchClearBtn.addEventListener("click", function () { clearSearch(true); });
    emptyClearBtn.addEventListener("click", function () { clearSearch(true); });
    errorDismissBtn.addEventListener("click", hideError);

    viewToggleBtn.addEventListener("click", function () {
        viewMode = viewMode === "grid" ? "list" : "grid";
        store.set("ozo_view_mode", viewMode);
        updateViewMode();
        setStatus(t(viewMode === "grid" ? "view.grid" : "view.list"), "ready", 1500);
    });

    langToggleBtn.addEventListener("click", function () {
        currentLang = isKhmer() ? "en" : "km";
        store.set("ozo_lang", currentLang);
        applyI18n();
        if (activeEmbeddedTool) {
            openEmbeddedView(activeEmbeddedTool.id);
        } else {
            renderTools();
        }
        setStatus(t("lang.switched"), "success", 2500);
    });

    openFolderBtn.addEventListener("click", function () {
        if (csInterface) csInterface.evalScript("ozoOpenScriptsFolder()");
    });

    function openExternalURL(url) {
        try {
            if (csInterface && typeof csInterface.openURLInDefaultBrowser === "function") {
                csInterface.openURLInDefaultBrowser(url);
            } else if (window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === "function") {
                window.cep.util.openURLInDefaultBrowser(url);
            } else if (csInterface) {
                csInterface.evalScript("ozoOpenURL(" + JSON.stringify(url) + ")");
            } else {
                window.open(url, "_blank");
            }
        } catch (e) {
            window.open(url, "_blank");
        }
    }

    donateBtn.addEventListener("click", function () { openExternalURL(DONATE_URL); });

    refreshBtn.addEventListener("click", function () {
        if (activeEmbeddedTool) {
            if (activeEmbeddedTool.id === "exporter") renderEmbeddedExporter();
            else if (activeEmbeddedTool.id === "qr") renderEmbeddedQR();
            else renderEmbeddedGeneric(activeEmbeddedTool);
        } else {
            renderTools();
        }
        refreshDocumentStatus();
        checkForUpdates(true);
        setStatus(t("refreshed"), "success", 2000);
    });

    window.addEventListener("focus", refreshDocumentStatus);
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) refreshDocumentStatus();
    });

    // ------------------------------------------------------------------
    // Theme sync with Illustrator
    // ------------------------------------------------------------------
    function mix(a, b, amount) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * amount),
            Math.round(a[1] + (b[1] - a[1]) * amount),
            Math.round(a[2] + (b[2] - a[2]) * amount)
        ];
    }

    function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

    var HOST_VARS = ["--bg-main", "--bg-surface", "--bg-surface-hover", "--bg-surface-active", "--border-color", "--border-strong"];

    function applyHostPalette(panel, luma) {
        var vars = {};
        var white = [255, 255, 255];
        var black = [0, 0, 0];
        if (luma < 128) {
            // dark UI: panels use the host colour, the list area sits slightly deeper
            vars["--bg-surface"] = panel;
            vars["--bg-main"] = mix(panel, black, 0.15);
            vars["--bg-surface-hover"] = mix(panel, white, 0.06);
            vars["--bg-surface-active"] = mix(panel, white, 0.11);
            vars["--border-color"] = mix(panel, white, 0.10);
            vars["--border-strong"] = mix(panel, white, 0.22);
        } else {
            // light UI: the list area uses the host colour, cards sit lighter on top
            var surface = mix(panel, white, 0.55);
            vars["--bg-main"] = panel;
            vars["--bg-surface"] = surface;
            vars["--bg-surface-hover"] = mix(surface, black, 0.05);
            vars["--bg-surface-active"] = mix(surface, black, 0.10);
            vars["--border-color"] = mix(panel, black, 0.10);
            vars["--border-strong"] = mix(panel, black, 0.25);
        }
        // Set on <body> so it wins over the body.theme-* fallbacks in style.css
        for (var name in vars) {
            if (vars.hasOwnProperty(name)) document.body.style.setProperty(name, rgb(vars[name]));
        }
    }

    function clearHostPalette() {
        for (var i = 0; i < HOST_VARS.length; i++) document.body.style.removeProperty(HOST_VARS[i]);
    }

    function updateTheme() {
        if (!csInterface) return;
        try {
            var env = csInterface.getHostEnvironment();
            if (!env || !env.appSkinInfo) return;
            var c = env.appSkinInfo.panelBackgroundColor.color;
            var panel = [Math.round(c.red), Math.round(c.green), Math.round(c.blue)];
            var luma = 0.2126 * panel[0] + 0.7152 * panel[1] + 0.0722 * panel[2];

            var body = document.body;
            body.classList.remove("theme-dark", "theme-medium-dark", "theme-medium-light", "theme-light");
            if (luma < 55) body.classList.add("theme-dark");
            else if (luma < 130) body.classList.add("theme-medium-dark");
            else if (luma < 215) body.classList.add("theme-medium-light");
            else body.classList.add("theme-light");

            if (SYNC_HOST_COLORS) applyHostPalette(panel, luma);
            else clearHostPalette();
        } catch (e) {}
    }

    // ------------------------------------------------------------------
    // Host script bootstrap
    // ------------------------------------------------------------------
    function getExtensionPath() {
        try {
            var p = csInterface.getSystemPath(SystemPath.EXTENSION);
            return p ? p.replace(/\\/g, "/") : "";
        } catch (e) { return ""; }
    }

    function loadHostScript(extPath) {
        var file = extPath + "/jsx/hostscript.jsx";
        csInterface.evalScript("try { $.evalFile(new File(" + JSON.stringify(file) + ")); } catch (e) {}");
    }

    function initHost() {
        var extPath = getExtensionPath();
        if (!extPath) return;
        loadHostScript(extPath);
        csInterface.evalScript("ozoInitExtensionPath(" + JSON.stringify(extPath) + ")");
    }

    // ------------------------------------------------------------------
    // Update checker (GitHub releases)
    // ------------------------------------------------------------------
    function parseVersion(str) {
        var parts = String(str || "").replace(/^v/i, "").split("-")[0].split(".").map(function (p) { return parseInt(p, 10) || 0; });
        while (parts.length < 3) parts.push(0);
        return parts;
    }

    function isNewerVersion(remote, local) {
        var r = parseVersion(remote);
        var l = parseVersion(local);
        for (var i = 0; i < 3; i++) {
            if (r[i] > l[i]) return true;
            if (r[i] < l[i]) return false;
        }
        return false;
    }

    function resolveReleaseZip(data) {
        var assets = data.assets || [];
        for (var i = 0; i < assets.length; i++) {
            var a = assets[i];
            if (a && a.browser_download_url && /\.zip$/i.test(a.name || a.browser_download_url)) return a.browser_download_url;
        }
        if (assets[0] && assets[0].browser_download_url) return assets[0].browser_download_url;
        if (data.zipball_url) return data.zipball_url;
        return "https://github.com/" + GITHUB_REPO + "/releases/download/" + data.tag_name + "/Ozo-Tools-" + data.tag_name + ".zip";
    }

    // Keep only the three fields we need (the raw API payload includes a long release body)
    function normalizeRelease(data) {
        if (!data || !data.tag_name) return null;
        return { tag: String(data.tag_name), zip: resolveReleaseZip(data), url: data.html_url || "" };
    }

    function readCachedRelease() {
        var raw = store.get("ozo_latest_release", null);
        if (!raw) return null;
        try {
            var obj = JSON.parse(raw);
            if (obj && obj.tag_name) obj = normalizeRelease(obj); // cache written by an older version
            return obj && obj.tag ? obj : null;
        } catch (e) { return null; }
    }

    function fetchLatestRelease(done) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest", true);
        xhr.setRequestHeader("Accept", "application/vnd.github.v3+json");
        xhr.timeout = 7000;
        xhr.onload = function () {
            if (xhr.status === 200) {
                var rel = null;
                try { rel = normalizeRelease(JSON.parse(xhr.responseText)); } catch (e) {}
                if (!rel) { done("parse"); return; }
                store.set("ozo_last_update_check", String(new Date().getTime()));
                store.set("ozo_latest_release", JSON.stringify(rel));
                done(null, rel);
            } else if (xhr.status === 403 || xhr.status === 429) {
                done("rate");
            } else if (xhr.status === 404) {
                done("notfound");
            } else {
                done("http");
            }
        };
        xhr.onerror = function () { done("network"); };
        xhr.ontimeout = function () { done("timeout"); };
        xhr.send();
    }

    function updateUpdateUI() {
        var has = !!availableRelease;
        updateBanner.hidden = !has;
        brandBadge.classList.toggle("has-update", has);
        if (has) {
            updateBannerText.textContent = t("update.available", { tag: availableRelease.tag });
            brandBadge.title = t("update.badgeNew", { tag: availableRelease.tag });
        } else {
            brandBadge.title = t("badge.title");
        }
        brandBadge.setAttribute("aria-label", brandBadge.title);
    }

    function applyRelease(rel, force) {
        if (rel && isNewerVersion(rel.tag, CURRENT_VERSION)) {
            if (!force && store.get("ozo_dismissed_update", "") === rel.tag) return;
            availableRelease = rel;
            updateUpdateUI();
        } else {
            availableRelease = null;
            updateUpdateUI();
            if (force) setStatus(t("update.latest"), "success", 3000);
        }
    }

    function checkForUpdates(force) {
        var cached = readCachedRelease();
        var last = parseInt(store.get("ozo_last_update_check", "0"), 10) || 0;

        // Within the cache window, trust the cache (original code still hit the network every time)
        if (!force && cached && new Date().getTime() - last < UPDATE_CHECK_INTERVAL) {
            applyRelease(cached, false);
            return;
        }

        fetchLatestRelease(function (err, rel) {
            if (err) {
                if (force) setStatus(t("update.err." + err), "error", 3500);
                else if (cached) applyRelease(cached, false);
                return;
            }
            applyRelease(rel, force);
        });
    }

    function setUpdateBtn(state) {
        updateBtnState = state;
        updateNowBtn.classList.remove("updating", "updated");
        updateNowBtn.disabled = false;
        updateDismissBtn.hidden = false;

        if (state === "busy") {
            updateNowBtn.disabled = true;
            updateNowBtn.classList.add("updating");
            updateNowBtn.innerHTML = '<span class="update-spinner"></span> ' + escapeHtml(t("update.downloading"));
            updateDismissBtn.hidden = true;
        } else if (state === "done") {
            updateNowBtn.classList.add("updated");
            updateNowBtn.textContent = "\u2713 " + t("update.updated");
        } else if (state === "retry") {
            updateNowBtn.textContent = t("update.retry");
        } else {
            updateNowBtn.textContent = t("update.btn");
        }
    }

    function failUpdate(message) {
        updateBusy = false;
        setUpdateBtn("retry");
        setStatus(t("update.failStatus", { msg: String(message).replace(/\s+/g, " ") }), "error", 8000);
        showError(t("update.failTitle"), message);
    }

    function performUpdate(rel) {
        if (!rel || updateBusy) return;

        // Defence in depth: only ever hand the host script a GitHub-hosted URL
        if (!TRUSTED_UPDATE_URL.test(rel.zip || "")) {
            setStatus(t("update.untrusted"), "error", 6000);
            showError(t("update.failTitle"), t("update.untrusted"));
            return;
        }

        updateBusy = true;
        hideError();
        setUpdateBtn("busy");
        setStatus(t("update.installing", { tag: rel.tag }), "running");

        if (!csInterface) { // plain-browser preview
            setTimeout(function () {
                updateBusy = false;
                setUpdateBtn("done");
                setStatus(t("update.simulated"), "success", 3000);
            }, 2000);
            return;
        }

        csInterface.evalScript("ozoDownloadAndApplyUpdate(" + JSON.stringify(rel.zip) + ", " + JSON.stringify(rel.tag) + ")", function (raw) {
            var res = null;
            try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

            if (res && res.status === "success") {
                setUpdateBtn("done");
                store.remove("ozo_dismissed_update");
                store.set("ozo_last_update_check", "0");
                setStatus(t("update.success"), "success", 5000);

                var extPath = getExtensionPath();
                if (extPath) loadHostScript(extPath);
                setTimeout(function () { window.location.reload(); }, 1400);
            } else {
                failUpdate((res && res.message) || String(raw || "Unknown error"));
            }
        });
    }

    updateNowBtn.addEventListener("click", function () { performUpdate(availableRelease); });

    updateDismissBtn.addEventListener("click", function () {
        updateBanner.hidden = true;
        if (availableRelease) store.set("ozo_dismissed_update", availableRelease.tag);
    });

    brandBadge.addEventListener("click", function () {
        checkForUpdates(true);
        setStatus(t("update.checking"), "info", 2000);
    });

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    brandBadge.textContent = "v" + CURRENT_VERSION;

    if (csInterface) {
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);
        updateTheme();
        initHost();
    }

    applyI18n();
    updateCounts();
    updateViewMode();
    renderTools();
    refreshDocumentStatus();
    checkForUpdates(false);
})();
