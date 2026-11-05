/* Ozo Tools - Illustrator CEP panel
   Plain ES5 on purpose: older CEP runtimes (CSXS 6.0) ship an old Chromium. */
(function () {
    "use strict";

    // ------------------------------------------------------------------
    // Config
    // ------------------------------------------------------------------
    var CURRENT_VERSION = "2.6.30"; // keep in sync with version.json
    var GITHUB_REPO = "Heng-zm/illustrator-script";
    var DONATE_URL = "https://link.payway.com.kh/ABAPAYiR4667130";
    var UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // GitHub's anonymous API limit is 60 req/h per IP
    var UPDATE_POLL_INTERVAL = 30 * 60 * 1000; // re-apply the cached result; network still capped by UPDATE_CHECK_INTERVAL
    var SPLASH_MIN_MS = 650;   // keep the intro visible long enough to register
    var SPLASH_MAX_MS = 2200;  // hard cap: never delay the panel longer than this, even if init stalls
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
            "search.hint": "Press / or Ctrl+K to search",
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
            "update.err.timeout": "GitHub connection timed out",
            "preview.title": "Tool Preview",
            "preview.features": "Key Features",
            "preview.open": "Open Tool",
            "preview.run": "Quick Run",
            "preview.close": "Back",
            "preview.btn": "Preview",
            "splash.subtitle": "Illustrator Automation Suite",
            "splash.status": "Ready \u2022 {n} tools available",
            "shortcuts.title": "Keyboard Shortcuts (?)",
            "shortcuts.heading": "Keyboard Shortcuts",
            "reset.title": "Reset tool to default settings",
            "reset.label": "Reset",
            "reset.done": "Reset {name} to defaults",
            "recent.label": "Recent:",
            "recent.clear": "Clear recent history",
            "density.toggle": "Toggle Compact / Comfortable View (Alt+D)",
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
            "search.hint": "ចុច / ឬ Ctrl+K ដើម្បីស្វែងរក",
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
            "update.err.timeout": "ការតភ្ជាប់ទៅ GitHub យឺតពេក",
            "shortcuts.title": "ផ្លូវកាត់ក្តារចុច (?)",
            "shortcuts.heading": "ផ្លូវកាត់ក្តារចុច",
            "reset.title": "កំណត់មកដូចដើមវិញ",
            "reset.label": "កំណត់ឡើងវិញ",
            "reset.done": "បានកំណត់ {name} មកដូចដើមវិញ",
            "recent.label": "ទើបប្រើ៖",
            "recent.clear": "សម្អាតប្រវត្តិឧបករណ៍ថ្មីៗ",
            "density.toggle": "ប្តូររចនាប័ទ្ម បង្រួម / ធម្មតា (Alt+D)",
            "preview.title": "ព័តឹម័នឡបករណ៍",
            "preview.features": "លក្ខណែសំខាញ។",
            "preview.open": "បើកឡបករណ៍",
            "preview.run": "តំណើរការភ្លាម",
            "preview.close": "ត្រជល័ប",
            "preview.btn": "មើលព័តឹម័ន",
            "splash.subtitle": "កញ្ចប់ឧបករណ៍ជំនួយការងារ Illustrator",
            "splash.status": "រួចរាល់ \u2022 មាន {n} ឧបករណ៍",
        }
    };

    // ------------------------------------------------------------------
    // Tool definitions (13 tools). `icon` is the inner SVG markup only.
    // ------------------------------------------------------------------
    function svgIcon(inner) {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + "</svg>";
    }

    function uiIcon(name, size) {
        size = size || 14;
        var paths = {
            export: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
            scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
            ruler: '<path d="M2 12h20M2 5v14M22 5v14M6 9v6M10 9v6M14 9v6M18 9v6"/>',
            printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
            refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
            hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
            grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
            trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
            repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
            nest: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="8"/><rect x="6" y="13" width="5" height="5"/>',
            download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
            folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
            play: '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>',
            file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
            radial: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
            check: '<polyline points="20 6 9 17 4 12"/>',
            unite: '<rect x="3" y="3" width="11" height="11" rx="1"/><rect x="10" y="10" width="11" height="11" rx="1"/>',
            minusfront: '<rect x="3" y="3" width="11" height="11" rx="1"/><path d="M14 10h7v11H10v-7"/>',
            intersect: '<rect x="3" y="3" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="10" y="10" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="10" y="10" width="4" height="4" fill="currentColor"/>',
            exclude: '<rect x="3" y="3" width="11" height="11" rx="1" fill="currentColor"/><rect x="10" y="10" width="11" height="11" rx="1" fill="currentColor"/>',
            divide: '<line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>',
            trim: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/>',
            merge: '<path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',
            crop: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M3 7h4v14M7 3v4h14"/>',
            outline: '<polygon points="12 2 2 22 22 22"/>',
            minusback: '<rect x="10" y="10" width="11" height="11" rx="1"/><path d="M3 3h11v7H10v4H3z"/>',
            roundrect: '<rect x="3" y="3" width="18" height="18" rx="5"/>',
            rect: '<rect x="3" y="5" width="18" height="14"/>',
            circle: '<circle cx="12" cy="12" r="9"/>',
            capsule: '<rect x="2" y="6" width="20" height="12" rx="6"/>',
            hexagon: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/>',
            octagon: '<polygon points="7.8 2 16.2 2 22 7.8 22 16.2 16.2 22 7.8 22 2 16.2 2 7.8"/>',
            plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
            x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
            select: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
            text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/>',
            image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
            path: '<circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>',
            compound: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/>',
            dots: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
            dimboth: '<polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/><polyline points="9 21 3 21 3 15"/><line x1="3" y1="21" x2="10" y2="14"/>',
            dimwidth: '<line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/>',
            dimheight: '<line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/>',
            dimbox: '<rect x="3" y="3" width="18" height="18" rx="2"/>'
        };
        var inner = paths[name] || '<circle cx="12" cy="12" r="9"/>';
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-svg-icon" aria-hidden="true">' + inner + '</svg>';
    }

    var TOOLS = [
        {
            id: "qr", file: "Generate QR Code.jsx", category: "prepress",
            nameEn: "Generate QR Code", nameKm: "បង្កើតកូដ QR",
            descEn: "Offline vector QR (Standard & Telegram 2026)",
            descKm: "កូដ QR វ៉ិចទ័រគ្មានអ៊ីនធឺណិត (ស្តង់ដារ និង Telegram)",
            icon: svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="7" y="7" width="1" height="1"/><rect x="18" y="7" width="1" height="1"/><rect x="7" y="18" width="1" height="1"/>'),
            featuresEn: ["100% offline — no internet required","Standard QR & Telegram 2026 deep-link style","Pure vector SVG output — infinitely scalable","Configurable size, margin & module color"],
            featuresKm: ["ដំណើរការគ្មានអ៊ីនធឺណិត 100%","ម៉ូដស្តង់ដារ QR និង Telegram 2026","លទ្ធផលជា Vector SVG អាចពង្រីកតាមចិត្ត","កំណត់ទំហំ គែម និងពណ៌តាមតម្រូវការ"],
            previewSvgInner: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"/><rect x=\"5\" y=\"5\" width=\"3\" height=\"3\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"16\" y=\"5\" width=\"3\" height=\"3\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"5\" y=\"16\" width=\"3\" height=\"3\" fill=\"currentColor\" stroke=\"none\"/>",
            keywords: "qrcode barcode 2d matrix link url web scan phone camera telegram bot channel me contact vcard vector offline"

        },
        {
            id: "cutcontour", file: "CutContour Generator.jsx", category: "prepress",
            nameEn: "CutContour Generator", nameKm: "បង្កើតខ្សែបន្ទាត់កាត់",
            descEn: "Die-cut lines, bleed offset & spot registration",
            descKm: "ខ្សែបន្ទាត់កាត់ Die-cut, Bleed និង Spot Color",
            icon: svgIcon('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'),
            featuresEn: ["Automated die-cut path generation","Configurable bleed offset per side","Spot color registration for RIP compatibility","Works on any selected artwork or group"],
            featuresKm: ["បង្កើតខ្សែបន្ទាត់កាត់ Die-cut ស្វ័យប្រវត្តិ","កំណត់កម្រិត Bleed offset លើគ្រប់ជ្រុង","Spot Color ស្តង់ដារត្រូវជាមួយប្រព័ន្ធ RIP","ដំណើរការលើរូបរាង ឬក្រុមដែលបានជ្រើស"],
            previewSvgInner: "<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><line x1=\"20\" y1=\"4\" x2=\"8.12\" y2=\"15.88\"/><line x1=\"14.47\" y1=\"14.48\" x2=\"20\" y2=\"20\"/><line x1=\"8.12\" y1=\"8.12\" x2=\"12\" y2=\"12\"/>",
            keywords: "die cut dieline kiss cut sticker label plotter roland mimaki cutter rip spot color offset bleed regmark knife path registration contour"

        },
        {
            id: "printjob", file: "Print Job Info.jsx", category: "prepress",
            nameEn: "Print Job Info", nameKm: "ព័ត៌មានការងារបោះពុម្ព",
            descEn: "Metadata banner, dimensions & color separations",
            descKm: "បដាព័ត៌មានការងារ, ទំហំ និងពណ៌បោះពុម្ព",
            icon: svgIcon('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
            featuresEn: ["Production metadata banner on artboard","Width × height with live unit conversion","Active ink separation color preview","Auto-expand artboard to fit banner"],
            featuresKm: ["បដាព័ត៌មានការងារបោះពុម្ពលើផ្ទាំងគំនូរ","បង្ហាញទំហំ ទទឹង × កម្ពស់ តាមខ្នាតជាក់ស្តែង","មើលពណ៌ Ink Separation មុនបោះពុម្ព","ពង្រីកផ្ទាំង Artboard ដោយស្វ័យប្រវត្តិ"],
            previewSvgInner: "<polyline points=\"6 9 6 2 18 2 18 9\"/><path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\"/>",
            keywords: "slug metadata header banner production proof approval dimensions sep separation cmyk ink info footer ticket colorbar press artboard size job"

        },
        {
            id: "nesting", file: "Nesting.jsx", category: "prepress",
            nameEn: "Nesting (Sheet Packing)", nameKm: "រៀបចំប្លង់កាត់ Nesting",
            descEn: "Shape packing & material waste optimization",
            descKm: "តម្រៀបប្លង់សន្សំសំចៃផ្ទៃក្រដាស/សម្ភារៈ",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="8"/><rect x="6" y="13" width="5" height="5"/>'),
            featuresEn: ["Bin-packing algorithm minimizes sheet waste","Configurable sheet size, spacing & bleed","Supports mixed shapes and rotations","Real-time fill efficiency percentage"],
            featuresKm: ["តម្រៀបប្លង់កាត់សន្សំសំចៃផ្ទៃក្រដាស/សម្ភារៈ","កំណត់ទំហំសន្លឹក គម្លាត និង Bleed","គាំទ្ររូបរាងចម្រុះ និងការបង្វិលមុំ","បង្ហាញភាគរយផ្ទៃប្រើប្រាស់ភ្លាមៗ"],
            previewSvgInner: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><rect x=\"6\" y=\"6\" width=\"5\" height=\"5\" fill=\"currentColor\" stroke=\"none\" opacity=\"0.7\"/><rect x=\"13\" y=\"6\" width=\"5\" height=\"8\" fill=\"currentColor\" stroke=\"none\" opacity=\"0.5\"/><rect x=\"6\" y=\"13\" width=\"5\" height=\"5\" fill=\"currentColor\" stroke=\"none\" opacity=\"0.6\"/><rect x=\"13\" y=\"15\" width=\"5\" height=\"3\" fill=\"currentColor\" stroke=\"none\" opacity=\"0.4\"/>",
            keywords: "bin pack sheet gang ganging layout waste optimization roll cut arrange fit nesting area material yield efficiency sheetpacking rotate"

        },
        {
            id: "exporter", file: "Batch Production Exporter.jsx", category: "prepress",
            nameEn: "Batch Production Exporter", nameKm: "នាំចេញឯកសារជាកញ្ចប់",
            descEn: "Batch export artboards to PDF, TIFF, PNG & JPEG",
            descKm: "នាំចេញផ្ទាំងគំនូរជា PDF, TIFF, PNG, JPG តាមឈ្មោះកំណត់",
            icon: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
            featuresEn: ["Batch export to PDF, TIFF, PNG & JPEG","Multi-page or separate PDF per artboard","Dynamic filename tokens: [doc] [ab] [num] [date]","Custom output folder with one-click open"],
            featuresKm: ["នាំចេញជា PDF, TIFF, PNG និង JPEG ជាកញ្ចប់","ជម្រើស PDF ច្រើនទំព័រ ឬបំបែកតាម Artboard","កំណត់ឈ្មោះឯកសារស្វ័យប្រវត្តិតាម Token","ជ្រើសរើសថតផ្ទុកឯកសារ និងបើកបានភ្លាមៗ"],
            previewSvgInner: "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/>",
            keywords: "batch export artboard pdf tiff png jpeg cmyk rgb print token folder output save separate multi-page resolution dpi bulk packaging"

        },
        {
            id: "dimension", file: "Smart Dimension.jsx", category: "layout",
            nameEn: "Smart Dimension", nameKm: "វាស់ទំហំស្វ័យប្រវត្តិ",
            descEn: "Automated linear, radial & bounding dimensions",
            descKm: "ដាក់វិមាត្រស្វ័យប្រវត្តិ (ប្រវែង, កាំ, ប្រអប់)",
            icon: svgIcon('<line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="5" x2="2" y2="19"/><line x1="22" y1="5" x2="22" y2="19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/>'),
            featuresEn: ["Linear, radial & bounding-box dimension types","Auto-detects object shape for best annotation","Smart leader text placement avoids overlaps","Non-destructive annotation layer"],
            featuresKm: ["វាស់ប្រវែង រង្វាស់កាំ និងប្រអប់វិមាត្រ","ស្វែងរកទម្រង់វត្ថុស្វ័យប្រវត្តិសម្រាប់ដាក់ខ្នាត","រៀបចំអក្សរវិមាត្រមិនឱ្យជាន់គ្នា","បង្កើតលើ Layer ដាច់ដោយឡែកមិនខូចគំនូរ"],
            previewSvgInner: "<line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"2\" y1=\"5\" x2=\"2\" y2=\"19\"/><line x1=\"22\" y1=\"5\" x2=\"22\" y2=\"19\"/><polyline points=\"5 9 2 12 5 15\"/><polyline points=\"19 9 22 12 19 15\"/>",
            keywords: "measure ruler smart dimension size width height radius diameter bounding box annotation leader cad blueprint millimeters inches points technical"

        },
        {
            id: "pathfinder", file: "Pathfinder.jsx", category: "layout",
            nameEn: "Pathfinder Pro", nameKm: "ឧបករណ៍ Pathfinder",
            descEn: "Enhanced boolean operations & shape unification",
            descKm: "កាត់តបញ្ចូលរាងវ៉ិចទ័រ និងសំអាត Path",
            icon: svgIcon('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
            featuresEn: ["Unite, Minus Front/Back, Intersect, Exclude","Divide, Trim, Merge, Crop, Outline","Shape tools: Round Rect, compound paths","One-click boolean with live preview"],
            featuresKm: ["Unite, Minus Front/Back, Intersect, Exclude","Divide, Trim, Merge, Crop, Outline","ឧបករណ៍កែប្រែជ្រុងមូល និង Compound Paths","ដំណើរការ Boolean រហ័សដោយចុចតែម្តង"],
            previewSvgInner: "<circle cx=\"9\" cy=\"12\" r=\"6\"/><circle cx=\"15\" cy=\"12\" r=\"6\"/>",
            keywords: "boolean unite minus front back intersect exclude divide trim merge crop outline compound shape vector cleanup simplify join subtract"

        },
        {
            id: "guide", file: "New Guide Layout.jsx", category: "layout",
            nameEn: "New Guide Layout", nameKm: "បង្កើតបន្ទាត់ណែនាំ Grid",
            descEn: "Columns, rows, margins & artboard grid guides",
            descKm: "បន្ទាត់ជួរឈរ ជួរដេក និងគែមសងខាង",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>'),
            featuresEn: ["Column & row grids with configurable gutters","Precise margin control on all four sides","Apply to active artboard or all artboards","Option to clear existing guides first"],
            featuresKm: ["បង្កើតបន្ទាត់ Grid ជួរឈរ និងជួរដេក","កំណត់គម្លាត Margin ទាំង ៤ ជ្រុងច្បាស់លាស់","អនុវត្តលើ Artboard សកម្ម ឬគ្រប់ Artboards","ជម្រើសលុបបន្ទាត់ Guide ចាស់ៗជាមុន"],
            previewSvgInner: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><line x1=\"3\" y1=\"9\" x2=\"21\" y2=\"9\"/><line x1=\"3\" y1=\"15\" x2=\"21\" y2=\"15\"/><line x1=\"9\" y1=\"3\" x2=\"9\" y2=\"21\"/><line x1=\"15\" y1=\"3\" x2=\"15\" y2=\"21\"/>",
            keywords: "grid guide layout margin column row gutter ruler align structure artboard baseline modular guides safe zone printing columns rows"

        },
        {
            id: "repeat", file: "Object Repeat.jsx", category: "layout",
            nameEn: "Object Repeat", nameKm: "ចម្លងវត្ថុជាជួរ/រង្វង់",
            descEn: "Grid repeat, radial arrays & step-and-repeat",
            descKm: "ចម្លងក្រឡាចត្រង្គ រង្វង់មូល និងគម្លាតច្បាស់លាស់",
            icon: svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
            featuresEn: ["Grid array with configurable rows & columns","Radial/circular arrangement with rotation","Fit-to-Artboard mode for perfect spacing","Offset & step options for alternating rows"],
            featuresKm: ["ចម្លងវត្ថុជាក្រឡាចត្រង្គ ជួរឈរ និងជួរដេក","ចម្លងជារង្វង់មូលជាមួយការបង្វិលមុំ","មុខងារ Fit-to-Artboard រៀបចំស្មើផ្ទាំងគំនូរ","កំណត់គម្លាត Offset និងលំនាំចន្លោះជួរ"],
            previewSvgInner: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"/>",
            keywords: "array grid step repeat step-and-repeat radial circle rotate duplicate pattern tile distribute spacing matrix clone multiply offset"

        },
        {
            id: "icons", file: "Icon Importer.jsx", category: "utilities",
            nameEn: "Icon Importer", nameKm: "ស្វែងរក និងទាញយក Icon",
            descEn: "Direct SVG icon search & vector placement",
            descKm: "ស្វែងរក និងទាញយក icon វ៉ិចទ័ររាប់ពាន់",
            icon: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
            featuresEn: ["Search 200,000+ SVG icons (Iconify library)","Place crisp vector icons at any size","Filter by icon set (Material, Feather, etc.)","Copy SVG markup or place in document"],
            featuresKm: ["ស្វែងរក Icon ជាង ២០០,០០០ (បណ្ណាល័យ Iconify)","ដាក់រូប Icon វ៉ិចទ័រច្បាស់លើឯកសារភ្លាមៗ","ច្រោះតាមក្រុម Icon (Material, Feather...)","ចម្លងកូដ SVG ឬទាញទម្លាក់ចូលគំនូរផ្ទាល់"],
            previewSvgInner: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><polyline points=\"21 15 16 10 5 21\"/>",
            keywords: "iconify svg symbol vector icon glyph search download insert library logo web brand ui feather material fontawesome icons"

        },
        {
            id: "numbering", file: "Sequential Numbering.jsx", category: "utilities",
            nameEn: "Sequential Numbering", nameKm: "វាយលេខរៀងស្វ័យប្រវត្តិ",
            descEn: "Serialized labels, batch stamps & barcode prep",
            descKm: "វាយលេខរៀងបន្តបន្ទាប់លើស្លាកសញ្ញា",
            icon: svgIcon('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
            featuresEn: ["Serial numbering for labels & tickets","Configurable start number, step & padding","Grid layout or across-artboard placement","Barcode-ready sequential text preparation"],
            featuresKm: ["វាយលេខរៀងស្វ័យប្រវត្តិនៃស្លាក និងសំបុត្រ","កំណត់លេខចាប់ផ្តើម ចន្លោះរាប់ និងចំនួនខ្ទង់","រៀបចំជា Grid ឬតាមផ្ទាំង Artboard នីមួយៗ","ត្រៀមទិន្នន័យអក្សរសម្រាប់បារកូដបានងាយស្រួល"],
            previewSvgInner: "<line x1=\"4\" y1=\"9\" x2=\"20\" y2=\"9\"/><line x1=\"4\" y1=\"15\" x2=\"20\" y2=\"15\"/><line x1=\"10\" y1=\"3\" x2=\"8\" y2=\"21\"/><line x1=\"16\" y1=\"3\" x2=\"14\" y2=\"21\"/>",
            keywords: "serial sequence sequential number ticket numbering counter barcode prefix suffix padding consecutive stamp raffle invoice lot numeric"

        },
        {
            id: "count", file: "Count.jsx", category: "utilities",
            nameEn: "Object Count", nameKm: "រាប់ចំនួនវត្ថុ",
            descEn: "Vector item statistics & selection count",
            descKm: "រាប់ចំនួនវត្ថុវ៉ិចទ័រ និងស្ថិតិលម្អិត",
            icon: svgIcon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
            featuresEn: ["Total item count by object type","Selection statistics (selected vs. total)","Per-layer breakdown dashboard","Auto-refreshes when selection changes"],
            featuresKm: ["រាប់ចំនួនវត្ថុសរុបបែងចែកតាមប្រភេទ","ស្ថិតិវត្ថុដែលបានជ្រើសរើស ធៀបនឹងចំនួនសរុប","តារាងបង្ហាញទិន្នន័យលម្អិតតាម Layer","ធ្វើបច្ចុប្បន្នភាពស្វ័យប្រវត្តិតាមការជ្រើសរើស"],
            previewSvgInner: "<line x1=\"18\" y1=\"20\" x2=\"18\" y2=\"10\"/><line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"4\"/><line x1=\"6\" y1=\"20\" x2=\"6\" y2=\"14\"/>",
            keywords: "statistics count tally object inspect layer path text compound group shape selection calculate audit elements inventory objects"

        },
        {
            id: "launcher", file: "Script Launcher.jsx", category: "utilities",
            nameEn: "Script Launcher Window", nameKm: "ផ្ទាំងបញ្ជា Launcher",
            descEn: "Floating modeless palette with full browser",
            descKm: "ផ្ទាំងបញ្ជាកម្មវិធីជំនួយអណ្តែតលើអេក្រង់",
            icon: svgIcon('<polygon points="5 3 19 12 5 21 5 3"/>'),
            featuresEn: ["Floating modeless palette stays on top","Browse any folder for .jsx/.js scripts","Pin favorite scripts for one-click access","Custom folder bookmarks across sessions"],
            featuresKm: ["ផ្ទាំងបញ្ជាអណ្តែតពីលើមិនរំខានការងារ","ស្វែងរក និងដំណើរការស្គ្រីប .jsx/.js ពីគ្រប់ថត","ចំណាំស្គ្រីបសំណព្វដើម្បីបើកបានរហ័ស","ចងចាំថតឯកសារដែលបាន Bookmark ទុក"],
            previewSvgInner: "<polygon points=\"5 3 19 12 5 21 5 3\"/>",
            keywords: "script launcher runner palette window floating jsx js browse favorite pin bookmark tools manager dockable modeless scripts"
        },
        {
            id: "richblack", file: "Rich Black Optimizer.jsx", category: "prepress",
            nameEn: "Rich Black Optimizer", nameKm: "បង្កើនកម្រិតពណ៌ខ្មៅដិត",
            descEn: "Prepress rich black conversion & text overprint",
            descKm: "បម្លែងពណ៌ខ្មៅដិត Rich Black និង Overprint អក្សរ",
            icon: svgIcon('<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="var(--bg-main)"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'),
            featuresEn: ["Standard, Cool, Warm & Backlit Prepress profiles","Total Ink Coverage (TIC) gauge with press safety","Small text protection (preserves K:100% to avoid blur)","Auto-enables Overprint on pure black text"],
            featuresKm: ["ទម្រង់កម្រិតពណ៌ខ្មៅដិតស្តង់ដាររោងពុម្ព (TIC 160-250%)","វាស់ស្ទង់កម្រិតទឹកថ្នាំ (TIC Gauge) សុវត្ថិភាពម៉ាស៊ីន","ការពារអក្សរតូចៗមិនឲ្យបែកព្រាល (រក្សា K:100%)","កំណត់ Overprint ស្វ័យប្រវត្តិកុំឲ្យលេចចន្លោះស"],
            previewSvgInner: "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"12\" r=\"4\" fill=\"var(--bg-main)\"/>",
            keywords: "cmyk rich black deep dark k100 overprint tic total ink coverage press prepress registration offset offsetprint pure black trap density"
        },
        {
            id: "khqr", file: "ABA KHQR Generator.jsx", category: "utilities",
            nameEn: "ABA KHQR Generator", nameKm: "បង្កើតកូដ ABA KHQR",
            descEn: "Official Bakong KHQR table standee cards & vector QR",
            descKm: "កាតទូទាត់ប្រាក់ ABA KHQR ស្តង់ដារបាគង និង Vector QR",
            icon: svgIcon('<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="8" y="7" width="8" height="8"/><path d="M4 8h16"/><circle cx="12" cy="18" r="1"/>'),
            featuresEn: ["Official EMVCo Bakong KHQR standard with CRC-16","Table Standee Card templates (Bakong Red & ABA Navy)","Dynamic amount, currency (USD/KHR) & bill numbering","Crisp vector output with official center Bakong icon"],
            featuresKm: ["ស្តង់ដារផ្លូវការ Bakong EMVCo ត្រឹមត្រូវ 100%","ទម្រង់កាតបញ្ឈរលើតុ (Bakong Red & ABA Navy Standee)","កំណត់ចំនួនទឹកប្រាក់ (USD/KHR) និងលេខវិក្កយបត្រ","លទ្ធផលជា Vector ម៉ត់ច្បាស់ជាមួយ Logo បាគងកណ្តាល"],
            previewSvgInner: "<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><rect x=\"8\" y=\"7\" width=\"8\" height=\"8\" fill=\"currentColor\"/><path d=\"M4 8h16\"/>",
            keywords: "bakong khqr aba bank cambodia riel usd khr emvco qr standee card payment table promptpay standard bill invoice cashier pay merchant"
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
                tool.id,
                tool.nameEn, tool.nameKm, tool.descEn, tool.descKm, tool.file,
                I18N.en["cat." + tool.category], I18N.km["cat." + tool.category],
                (tool.featuresEn || []).join(" "),
                (tool.featuresKm || []).join(" "),
                tool.keywords || ""
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

    function getTicketDateStr() {
        var d = new Date();
        var day = ("0" + d.getDate()).slice(-2);
        var month = ("0" + (d.getMonth() + 1)).slice(-2);
        var year = d.getFullYear();
        return day + " " + month + " " + year;
    }

    function fallbackExecCopy(text, onSuccess, onError) {
        try {
            var textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            var ok = document.execCommand("copy");
            document.body.removeChild(textArea);
            if (ok) {
                if (onSuccess) onSuccess();
            } else {
                if (onError) onError(new Error("execCommand failed"));
            }
        } catch (err) {
            if (onError) onError(err);
        }
    }

    function copyToClipboard(text, onSuccess, onError) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard.writeText(text).then(function () {
                if (onSuccess) onSuccess();
            }).catch(function () {
                fallbackExecCopy(text, onSuccess, onError);
            });
        } else {
            fallbackExecCopy(text, onSuccess, onError);
        }
    }

    function copyJobTicket(ticketEl, triggerBtn) {
        if (!ticketEl) return;
        var lines = [];
        var lineElements = ticketEl.querySelectorAll(".ticket-line-date, .ticket-line-mat, .ticket-line-dim, .ticket-line-note, .ticket-row-main, .ticket-row-sub, .ticket-row-desc");
        if (lineElements && lineElements.length > 0) {
            for (var i = 0; i < lineElements.length; i++) {
                var el = lineElements[i];
                if (el.style && el.style.display === "none") continue;
                var txt = (el.textContent || el.innerText || "").trim();
                if (txt) lines.push(txt);
            }
        }
        if (lines.length === 0) {
            var raw = (ticketEl.innerText || ticketEl.textContent || "").trim();
            var rawLines = raw.split(/\r?\n/);
            for (var j = 0; j < rawLines.length; j++) {
                var l = rawLines[j].trim();
                if (l) lines.push(l);
            }
        }
        if (lines.length === 0) return;

        var formatted = [
            "📋 PREPRESS JOB TICKET",
            "------------------------------",
            lines.join("\n"),
            "------------------------------"
        ].join("\n");

        copyToClipboard(formatted, function () {
            if (ticketEl) {
                ticketEl.classList.remove("copied-pulse");
                void ticketEl.offsetWidth;
                ticketEl.classList.add("copied-pulse");
                setTimeout(function () {
                    ticketEl.classList.remove("copied-pulse");
                }, 500);
            }
            if (triggerBtn) {
                if (!triggerBtn._origTicketHtml) {
                    triggerBtn._origTicketHtml = triggerBtn.innerHTML;
                }
                if (triggerBtn._copyTimer) {
                    clearTimeout(triggerBtn._copyTimer);
                }
                triggerBtn.classList.add("copied");
                triggerBtn.innerHTML = "✅ " + (isKhmer() ? "បានចម្លង!" : "Copied!");
                triggerBtn._copyTimer = setTimeout(function () {
                    triggerBtn.classList.remove("copied");
                    triggerBtn.innerHTML = triggerBtn._origTicketHtml;
                    delete triggerBtn._origTicketHtml;
                    delete triggerBtn._copyTimer;
                }, 1800);
            }
            setStatus(isKhmer() ? "បានចម្លងព័ត៌មាន Ticket ទៅកាន់ Clipboard រួចរាល់!" : "Job Ticket copied to clipboard!", "success", 2000);
        }, function (err) {
            setStatus(isKhmer() ? "មិនអាចចម្លងបានទេ: " + (err ? err.message : "") : "Failed to copy ticket: " + (err ? err.message : ""), "error", 2500);
        });
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function escapeRegex(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // e.key is missing on very old Chromium builds, so fall back to keyCode.
    var KEYCODES = { 13: "Enter", 27: "Escape", 32: " ", 35: "End", 36: "Home", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 70: "f", 75: "k", 191: "/" };
    function keyOf(e) {
        return e.key || KEYCODES[e.keyCode] || "";
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    var currentLang = store.get("ozo_lang", "en") === "km" ? "km" : "en";
    var viewMode = store.get("ozo_view_mode", "list") === "grid" ? "grid" : "list";
    var currentCategory = store.get("ozo_category", "all");
    if (CATEGORIES.indexOf(currentCategory) === -1 && currentCategory !== "all" && currentCategory !== "favorites") currentCategory = "all";
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

    // Live document tracking. The panel used to learn about the document only
    // on focus/Refresh, so opening, closing or switching a document left the
    // footer stale. A light poll keeps it current without user action.
    var DOC_POLL_INTERVAL = 1200;
    var docPollTimer = null;
    var docPollInFlight = false;
    var lastDocSignature = null;

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
    var recentToolsWrap = $("recentToolsWrap");
    var recentToolsList = $("recentToolsList");
    var embeddedResetBtn = $("embeddedResetBtn");
    var shortcutsBtn = $("shortcutsBtn");
    var shortcutsModal = $("shortcutsModal");
    var shortcutsBackdrop = $("shortcutsBackdrop");
    var shortcutsCloseBtn = $("shortcutsCloseBtn");
    var shortcutsBody = $("shortcutsBody");
    var searchTagsWrap = $("searchTagsWrap");
    var embeddedHeader = $("embeddedHeader") || (embeddedBackBtn ? embeddedBackBtn.parentNode : null);
    var embeddedSelRibbon = $("embeddedSelRibbon");
    var embeddedSelIcon = $("embeddedSelIcon");
    var embeddedSelText = $("embeddedSelText");
    var docPopover = $("docPopover");
    var docPopoverClose = $("docPopoverClose");
    var docPopoverStats = $("docPopoverStats");
    var latestDocInfo = null;
    var densityToggleBtn = $("densityToggleBtn");
    var recentClearBtn = $("recentClearBtn");
    var toastNotification = $("toastNotification");
    var toastIcon = $("toastIcon");
    var toastText = $("toastText");
    var toastBar = $("toastBar");
    var toastDismissBtn = $("toastDismissBtn");
    var toastTimer = null;

    var viewCatalog = $("viewCatalog");
    var viewEmbedded = $("viewEmbedded");
    viewPreview = $("viewPreview");
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

        var catHints = ["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5"];
        each(tabBtns, function (b, idx) {
            var cat = b.getAttribute("data-category");
            var label = t("cat." + cat);
            b.title = label + (catHints[idx] ? " (" + catHints[idx] + ")" : "");
        });

        langToggleBtn.textContent = isKhmer() ? "KM" : "EN";
        moveTabIndicator();
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
        moveTabIndicator();
    }

    // ------------------------------------------------------------------
    // Status bar
    // ------------------------------------------------------------------
    function flashButtonSuccess(btn, customText) {
        if (!btn || btn.classList.contains("btn-success")) return;
        var prevHtml = btn.innerHTML;
        btn.classList.add("btn-success");
        var text = customText || (isKhmer() ? "ជោគជ័យ!" : "Done!");
        btn.innerHTML = uiIcon("check", 14) + " " + text;
        setTimeout(function () {
            btn.classList.remove("btn-success");
            btn.innerHTML = prevHtml;
        }, 1500);
    }

    function showToast(msg, type, duration) {
        if (!toastNotification || !toastText) return;
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        var t = type || "info";
        toastNotification.className = "toast-notification toast-" + t;
        toastText.textContent = msg;
        if (toastIcon) {
            if (t === "success") {
                toastIcon.innerHTML = uiIcon("check", 13);
            } else if (t === "error") {
                toastIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
            } else {
                toastIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
            }
        }
        toastNotification.hidden = false;
        var d = duration || 2600;
        if (toastBar) {
            toastBar.style.transition = "none";
            toastBar.style.width = "100%";
            setTimeout(function () {
                toastBar.style.transition = "width " + d + "ms linear";
                toastBar.style.width = "0%";
            }, 30);
        }
        toastTimer = setTimeout(function () {
            hideToast();
        }, d);
    }

    function hideToast() {
        if (!toastNotification || toastNotification.hidden) return;
        toastNotification.classList.add("toast-out");
        setTimeout(function () {
            toastNotification.hidden = true;
            toastNotification.classList.remove("toast-out");
        }, 180);
    }

    if (toastDismissBtn) {
        toastDismissBtn.addEventListener("click", hideToast);
    }

    function setStatus(msg, type, duration) {
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        statusMessage.textContent = msg;
        statusMessage.title = msg;
        statusDot.className = "status-dot" + (type === "running" || type === "error" || type === "success" ? " " + type : "");
        statusDot.title = "";

        if (type === "success" && activeEmbeddedTool && embeddedContent) {
            var primaryBtn = embeddedContent.querySelector(".btn-action-primary") ||
                             embeddedContent.querySelector("#btnGenericRun");
            if (primaryBtn) flashButtonSuccess(primaryBtn);
        }

        if (type === "success" || type === "error") {
            showToast(msg, type, duration || 2400);
        }

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

    function docSignature(info) {
        if (!info || !info.hasDoc) return "none";
        return [
            info.name || "",
            info.colorSpace || "",
            info.artboardsCount || 0,
            info.selectedCount || 0
        ].join("|");
    }

    function updateEmbeddedSelRibbon(info) {
        if (!embeddedSelRibbon || !embeddedSelText) return;
        if (!activeEmbeddedTool) {
            embeddedSelRibbon.hidden = true;
            return;
        }
        var inf = info || latestDocInfo;
        if (!inf || !inf.hasDoc) {
            embeddedSelRibbon.className = "embedded-sel-ribbon ribbon-sel-warn";
            if (embeddedSelIcon) embeddedSelIcon.textContent = "⚠";
            embeddedSelText.textContent = isKhmer() ? "គ្មានឯកសារបើកក្នុង Illustrator ទេ" : "No active document open in Illustrator";
            embeddedSelRibbon.hidden = false;
            return;
        }

        if (inf.selectedCount > 0) {
            embeddedSelRibbon.className = "embedded-sel-ribbon ribbon-sel-active";
            if (embeddedSelIcon) embeddedSelIcon.textContent = "✓";
            var dimStr = (inf.selWidthMm && inf.selHeightMm) ? (' (' + inf.selWidthMm + ' × ' + inf.selHeightMm + ' mm)') : '';
            embeddedSelText.textContent = inf.selectedCount + ' ' + (isKhmer() ? "វត្ថុបានជ្រើសរើស" : "object(s) selected") + dimStr;
        } else {
            embeddedSelRibbon.className = "embedded-sel-ribbon ribbon-sel-idle";
            if (embeddedSelIcon) embeddedSelIcon.textContent = "📄";
            var abSize = (inf.artboardWidthMm && inf.artboardHeightMm) ? (' (' + inf.artboardWidthMm + ' × ' + inf.artboardHeightMm + ' mm)') : '';
            embeddedSelText.textContent = (isKhmer() ? "គ្មានវត្ថុជ្រើស — ប្រើ Artboard៖ " : "No selection (Target: ") + (inf.activeArtboardName || "Artboard") + abSize + ')';
        }
        embeddedSelRibbon.hidden = false;
    }

    function applyDocumentStatus(info) {
        if (!info) return;
        latestDocInfo = info;

        if (info.hasDoc) {
            if (statusDot) statusDot.classList.add("has-doc");
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
        } else {
            if (statusDot) statusDot.classList.remove("has-doc");
            setIdleStatus(t("status.noDoc"));
        }

        updateEmbeddedSelRibbon(info);
        if (docPopover && !docPopover.hidden) {
            openDocPopover();
        }

        var sig = docSignature(info);
        var prev = lastDocSignature;
        lastDocSignature = sig;
        if (prev !== null && prev !== sig) handleDocumentChange(prev, sig);
    }

    // Keep the embedded view in step when a document opens or closes. Forms the
    // user has already filled in are left alone; only the no-document card and
    // the read-only count dashboard are rebuilt, so typing is never lost.
    function handleDocumentChange(prevSig, sig) {
        var hadDoc = prevSig !== "none";
        var hasDoc = sig !== "none";
        if (hadDoc === hasDoc) return; // selection or document switch only
        if (!activeEmbeddedTool) return;

        var id = activeEmbeddedTool.id;
        if (id === "exporter") {
            var showingNoDoc = !!document.getElementById("btnRetryDoc");
            // Re-render only when the card is out of step with the host state.
            if (hasDoc === showingNoDoc) renderEmbeddedExporter();
        } else if (id === "count") {
            renderEmbeddedCount();
        }
    }

    function refreshDocumentStatus() {
        if (runningId || statusTimer) return; // don't overwrite a message that is still showing
        if (!csInterface) {
            setIdleStatus(t("status.ready"));
            return;
        }
        if (docPollInFlight) return; // previous round-trip has not answered yet

        docPollInFlight = true;
        try {
            csInterface.evalScript("ozoGetDocumentStatus()", function (raw) {
                docPollInFlight = false;
                if (runningId || statusTimer) return;
                var info = null;
                try { info = JSON.parse(raw); } catch (e) {}
                applyDocumentStatus(info);
            });
        } catch (ePoll) {
            docPollInFlight = false;
        }
    }

    function startDocumentMonitor() {
        if (!csInterface || docPollTimer) return;
        docPollTimer = setInterval(function () {
            if (document.hidden) return; // panel collapsed or tab is in the background
            refreshDocumentStatus();
        }, DOC_POLL_INTERVAL);
    }

    // ------------------------------------------------------------------
    // Error banner (non-blocking replacement for alert())
    // ------------------------------------------------------------------
    function showError(title, message) {
        errorTitle.textContent = title;
        errorMessage.textContent = message;
        errorBanner.hidden = false;
        errorBanner.classList.remove("error-shake");
        void errorBanner.offsetWidth;
        errorBanner.classList.add("error-shake");
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
    // ------------------------------------------------------------------
    // Motion helpers (v2.7)
    // ------------------------------------------------------------------
    var enterTimer = null;
    // One staggered entrance, only when the list context changes (load, tab, view mode, return from a tool).
    // Never on search keystrokes or star toggles, which re-render constantly.
    function playEnter() {
        toolList.classList.remove("is-entering");
        void toolList.offsetWidth; // restart the animation if it is already running
        toolList.classList.add("is-entering");
        clearTimeout(enterTimer);
        enterTimer = setTimeout(function () { toolList.classList.remove("is-entering"); }, 600);
    }

    function goBackToCatalog() {
        viewCatalog.classList.add("slide-back");
        setTimeout(function () { viewCatalog.classList.remove("slide-back"); }, 300);
    }

    var tabIndicator = $("tabIndicator");
    var tabIndicatorReady = false;
    function moveTabIndicator() {
        var active = tabsContainer.querySelector(".tab-btn.active");
        if (!tabIndicator || !active || !active.offsetWidth) return;
        tabIndicator.style.width = active.offsetWidth + "px";
        tabIndicator.style.transform = "translateX(" + active.offsetLeft + "px)";
        if (!tabIndicatorReady) { // first placement must not slide in from x = 0
            tabIndicatorReady = true;
            requestAnimationFrame(function () { tabIndicator.classList.add("ready"); });
        }
    }

    function flashDone(id) {
        var card = toolList.querySelector('.tool-card[data-id="' + id + '"]');
        if (!card) return;
        card.classList.remove("run-done");
        void card.offsetWidth;
        card.classList.add("run-done");
        setTimeout(function () { card.classList.remove("run-done"); }, 1100);
    }

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
                '<button type="button" class="preview-card-btn" tabindex="-1" title="' + escapeHtml(t("preview.btn") + ': ' + name) + '" aria-label="' + escapeHtml(t("preview.btn") + ': ' + name) + '" data-preview="' + tool.id + '">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
                '</button>' +
                '<button type="button" class="run-btn" tabindex="-1" title="' + escapeHtml(t("run.title", { name: name })) + '">' + escapeHtml(t("run.label")) + "</button>" +
            "</div>";

        return card;
    }

    function matchesInAllCategories(tokens) {
        if (!tokens || !tokens.length) return 0;
        var count = 0;
        for (var i = 0; i < TOOLS.length; i++) {
            var ok = true;
            for (var k = 0; k < tokens.length; k++) {
                if (TOOLS[i].haystack.indexOf(tokens[k]) < 0) { ok = false; break; }
            }
            if (ok) count++;
        }
        return count;
    }

    function updateEmptyState() {
        var noFavsYet = currentCategory === "favorites" && !searchQuery;
        if (noFavsYet) {
            emptyText.textContent = t("empty.favorites");
            emptyClearBtn.hidden = true;
            return;
        }

        var matchesAll = (currentCategory !== "all" && searchQuery) ? matchesInAllCategories(searchTokens) : 0;
        if (matchesAll > 0) {
            emptyText.textContent = isKhmer() ?
                "មិនមានឧបករណ៍ត្រូវគ្នាក្នុងប្រភេទនេះទេ។ មាន " + matchesAll + " ឧបករណ៍ក្នុងប្រភេទផ្សេងទៀត។" :
                "No tools match in this category, but " + matchesAll + " match(es) exist in other categories.";
            emptyClearBtn.textContent = isKhmer() ?
                "បង្ហាញក្នុងគ្រប់ប្រភេទ (" + matchesAll + ")" :
                "Show in All Categories (" + matchesAll + ")";
            emptyClearBtn.title = isKhmer() ? "ប្តូរទៅប្រភេទទាំងអស់ដើម្បីមើលឧបករណ៍ទាំងនេះ" : "Switch to All categories to view these tools";
            emptyClearBtn.hidden = false;
        } else {
            emptyText.textContent = t("empty.search");
            emptyClearBtn.textContent = t("empty.clear");
            emptyClearBtn.title = t("empty.clearTitle");
            emptyClearBtn.hidden = !searchQuery;
        }
    }

    // ------------------------------------------------------------------
    // Recent Tools Quick Strip
    // ------------------------------------------------------------------
    var recentTools = [];
    try {
        recentTools = JSON.parse(store.get("ozo_recent_tools", "[]"));
        if (!Array.isArray(recentTools)) recentTools = [];
    } catch (e) { recentTools = []; }

    function recordRecentTool(id) {
        if (!id || !toolById[id]) return;
        var idx = recentTools.indexOf(id);
        if (idx !== -1) recentTools.splice(idx, 1);
        recentTools.unshift(id);
        if (recentTools.length > 4) recentTools = recentTools.slice(0, 4);
        store.set("ozo_recent_tools", JSON.stringify(recentTools));
        renderRecentTools();
    }

    function renderRecentTools() {
        if (!recentToolsWrap || !recentToolsList) return;
        if (searchQuery || currentCategory !== "all" || recentTools.length === 0) {
            recentToolsWrap.hidden = true;
            return;
        }
        var html = [];
        for (var i = 0; i < recentTools.length; i++) {
            var tool = toolById[recentTools[i]];
            if (!tool) continue;
            var name = toolName(tool);
            html.push('<button type="button" class="recent-chip" data-id="' + tool.id + '" title="' + escapeHtml(name) + '">');
            html.push('  <span class="recent-chip-icon">' + tool.icon + '</span>');
            html.push('  <span class="recent-chip-name">' + escapeHtml(name) + '</span>');
            html.push('</button>');
        }
        if (html.length === 0) {
            recentToolsWrap.hidden = true;
            return;
        }
        recentToolsList.innerHTML = html.join("");
        recentToolsWrap.hidden = false;
    }

    // ------------------------------------------------------------------
    // Keyboard Shortcuts Cheat Sheet Modal
    // ------------------------------------------------------------------
    function openShortcutsModal() {
        if (!shortcutsModal) return;
        var km = isKhmer();
        var groups = [
            {
                title: km ? "ការរុករកទូទៅ (Navigation)" : "Navigation & Tabs",
                items: [
                    { desc: km ? "ស្វែងរកឧបករណ៍" : "Search Tools", keys: ["/", km ? "ឬ" : "or", "Ctrl", "K"] },
                    { desc: km ? "ប្តូរប្រភេទ Tab" : "Switch Category Tab", keys: ["Alt", "1–5"] },
                    { desc: km ? "ប្តូរបង្រួម / ធម្មតា" : "Toggle Density", keys: ["Alt", "D"] },
                    { desc: km ? "រំកិលរវាងឧបករណ៍" : "Navigate Tools", keys: ["↑", "↓", "←", "→"] },
                    { desc: km ? "បង្ហាញផ្ទាំងផ្លូវកាត់" : "Keyboard Help", keys: ["?"] }
                ]
            },
            {
                title: km ? "បញ្ជីឧបករណ៍ (Catalog Cards)" : "Catalog & Tools",
                items: [
                    { desc: km ? "បើកឧបករណ៍ក្នុងផ្ទាំង" : "Open Selected Tool", keys: ["Enter"] },
                    { desc: km ? "មើលទម្រង់គំរូ (Preview)" : "Preview Tool Details", keys: ["P"] },
                    { desc: km ? "ដាក់ / ដកសំណព្វ" : "Toggle Favorite", keys: ["F"] }
                ]
            },
            {
                title: km ? "ទម្រង់ឧបករណ៍ (Embedded Forms)" : "Embedded Forms & Run",
                items: [
                    { desc: km ? "ដំណើរការស្គ្រីប" : "Run / Submit Form", keys: ["Ctrl", "Enter"] },
                    { desc: km ? "កើន/ថយលេខម្តង ១០" : "Step Number (±10)", keys: ["Shift", "↑/↓"] },
                    { desc: km ? "កើន/ថយលេខម្តង ០.១" : "Fine Step (±0.1)", keys: ["Alt", "↑/↓"] },
                    { desc: km ? "ត្រឡប់ទៅបញ្ជីវិញ" : "Back to Tools", keys: ["Esc"] }
                ]
            },
            {
                title: km ? "ផ្ទាំងមើលគំរូ (Preview Modal)" : "Preview Screen",
                items: [
                    { desc: km ? "ឧបករណ៍មុន / បន្ទាប់" : "Next / Previous Tool", keys: ["←", "→"] },
                    { desc: km ? "បើកឧបករណ៍" : "Open Tool in Panel", keys: ["Enter"] },
                    { desc: km ? "ដំណើរការស្គ្រីបភ្លាម" : "Quick Run Script", keys: ["R"] }
                ]
            }
        ];

        var bodyHtml = [];
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            bodyHtml.push('<div class="shortcuts-group">');
            bodyHtml.push('  <div class="shortcuts-group-title">' + escapeHtml(grp.title) + '</div>');
            for (var it = 0; it < grp.items.length; it++) {
                var item = grp.items[it];
                bodyHtml.push('  <div class="shortcut-row">');
                bodyHtml.push('    <span class="shortcut-desc">' + escapeHtml(item.desc) + '</span>');
                bodyHtml.push('    <span class="shortcut-keys">');
                for (var k = 0; k < item.keys.length; k++) {
                    var keyText = item.keys[k];
                    if (keyText === "or" || keyText === "ឬ") {
                        bodyHtml.push('<span style="color:var(--text-muted);font-size:10px;">' + keyText + '</span>');
                    } else {
                        bodyHtml.push('<kbd>' + escapeHtml(keyText) + '</kbd>');
                    }
                }
                bodyHtml.push('    </span>');
                bodyHtml.push('  </div>');
            }
            bodyHtml.push('</div>');
        }

        shortcutsBody.innerHTML = bodyHtml.join("");
        shortcutsModal.hidden = false;
    }

    function closeShortcutsModal() {
        if (shortcutsModal) shortcutsModal.hidden = true;
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
        for (var i = 0; i < visible.length; i++) {
            // thin divider between starred tools and the rest
            if (i > 0 && currentCategory !== "favorites" && isFav(visible[i - 1].id) && !isFav(visible[i].id)) {
                var sep = document.createElement("div");
                sep.className = "list-sep";
                sep.setAttribute("role", "separator");
                frag.appendChild(sep);
            }
            var card = buildCard(visible[i]);
            card.style.setProperty("--i", Math.min(i, 9));
            frag.appendChild(card);
        }

        toolList.innerHTML = "";
        toolList.appendChild(frag);
        toolList.scrollTop = scrollTop;

        var empty = visible.length === 0;
        toolList.hidden = empty;
        emptyState.hidden = !empty;
        if (empty) updateEmptyState();
        renderRecentTools();

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
        store.set("ozo_category", currentCategory);
        moveTabIndicator();
        playEnter();
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
        recordRecentTool(tool.id);
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
                flashDone(tool.id);
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
    var lastOpenedToolId = null;
    function openEmbeddedView(toolId) {
        var tool = toolById[toolId];
        if (!tool) return;
        lastOpenedToolId = tool.id;
        recordRecentTool(tool.id);
        activeEmbeddedTool = tool;
        hideError();
        viewCatalog.style.display = "none";
        viewEmbedded.style.display = "flex";
        embeddedToolIcon.innerHTML = tool.icon;
        embeddedToolTitle.textContent = toolName(tool);
        embeddedContent.innerHTML = "";
        embeddedContent.scrollTop = 0;

        if (tool.id === "exporter") {
            renderEmbeddedExporter();
        } else if (tool.id === "qr") {
            renderEmbeddedQR();
        } else if (tool.id === "cutcontour") {
            renderEmbeddedCutContour();
        } else if (tool.id === "dimension") {
            renderEmbeddedDimension();
        } else if (tool.id === "printjob") {
            renderEmbeddedPrintJob();
        } else if (tool.id === "count") {
            renderEmbeddedCount();
        } else if (tool.id === "numbering") {
            renderEmbeddedNumbering();
        } else if (tool.id === "pathfinder") {
            renderEmbeddedPathfinder();
        } else if (tool.id === "guide" || tool.id === "guides") {
            renderEmbeddedGuides();
        } else if (tool.id === "repeat") {
            renderEmbeddedRepeat();
        } else if (tool.id === "nesting") {
            renderEmbeddedNesting();
        } else if (tool.id === "icons") {
            renderEmbeddedIcons();
        } else if (tool.id === "launcher") {
            renderEmbeddedLauncher();
        } else if (tool.id === "richblack") {
            renderEmbeddedRichBlack();
        } else if (tool.id === "khqr") {
            renderEmbeddedKHQR();
        } else {
            renderEmbeddedGeneric(tool);
        }

        // Add shortcut title tooltip to primary action button
        var primaryBtn = embeddedContent.querySelector(".btn-action-primary");
        if (primaryBtn && !primaryBtn.hasAttribute("title")) {
            primaryBtn.setAttribute("title", isKhmer() ? "ដំណើរការ (Ctrl+Enter)" : "Run (Ctrl+Enter)");
        }

        updateEmbeddedSelRibbon();

        // Auto-focus first interactive input for fast keyboard workflows
        setTimeout(function () {
            if (!activeEmbeddedTool) return;
            var firstInput = embeddedContent.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select");
            if (firstInput && typeof firstInput.focus === "function") {
                firstInput.focus();
                if (typeof firstInput.select === "function" && firstInput.type === "text") {
                    firstInput.select();
                }
            }
        }, 50);
    }


    // ------------------------------------------------------------------
    // Tool Preview Screen
    // ------------------------------------------------------------------
    var activePreviewTool = null;
    var viewPreview = null;

    function openPreviewPanel(toolId) {
        var tool = toolById[toolId];
        if (!tool) return;
        activePreviewTool = tool;
        hideError();
        if (!viewPreview) viewPreview = document.getElementById('viewPreview');
        if (!viewPreview) return;

        var name = toolName(tool);
        var desc = toolDesc(tool);
        var feats = (currentLang === 'km' && tool.featuresKm && tool.featuresKm.length)
            ? tool.featuresKm : (tool.featuresEn || []);
        var catClass = 'badge-' + tool.category;
        var dotClass = 'dot-' + tool.category;

        var featsHtml = '';
        for (var i = 0; i < feats.length; i++) {
            featsHtml += '<li><span class="preview-feat-dot ' + dotClass + '"></span>' +
                '<span>' + escapeHtml(feats[i]) + '</span></li>';
        }

        var illuHtml = '';
        if (tool.previewSvgInner) {
            illuHtml = '<div class="preview-illustration illu-' + tool.category + '">' +
                '<svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor"' +
                ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                tool.previewSvgInner + '</svg></div>';
        }

        viewPreview.innerHTML =
            '<div class="preview-header">' +
                '<button type="button" class="preview-back-btn" id="previewBackBtn" title="' + escapeHtml(t('preview.close')) + '">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>' +
                    '</svg><span>' + escapeHtml(t('preview.close')) + '</span>' +
                '</button>' +
                '<span class="preview-header-title">' + escapeHtml(t('preview.title')) + '</span>' +
                '<div class="preview-nav-arrows">' +
                    '<button type="button" class="preview-arrow-btn" id="previewPrevBtn" title="' + (isKhmer() ? "ឧបករណ៍មុន (Left Arrow)" : "Previous Tool (Left Arrow)") + '">' +
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
                    '</button>' +
                    '<button type="button" class="preview-arrow-btn" id="previewNextBtn" title="' + (isKhmer() ? "ឧបករណ៍បន្ទាប់ (Right Arrow)" : "Next Tool (Right Arrow)") + '">' +
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="preview-body">' +
                '<div class="preview-hero">' +
                    '<div class="preview-icon-wrap">' + tool.icon + '</div>' +
                    '<div class="preview-tool-name">' + escapeHtml(name) + '</div>' +
                    '<span class="preview-tool-badge ' + catClass + '">' + escapeHtml(t('cat.' + tool.category)) + '</span>' +
                    '<p class="preview-tool-desc">' + escapeHtml(desc) + '</p>' +
                    illuHtml +
                '</div>' +
                (featsHtml ? '<div class="preview-section"><div class="preview-section-title">' +
                    escapeHtml(t('preview.features')) + '</div><ul class="preview-features">' +
                    featsHtml + '</ul></div>' : '') +
            '</div>' +
            '<div class="preview-actions">' +
                '<button type="button" class="preview-open-btn" id="previewOpenBtn">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
                    escapeHtml(t('preview.open')) +
                '</button>' +
                '<button type="button" class="preview-run-btn" id="previewRunBtn">' + escapeHtml(t('preview.run')) + '</button>' +
            '</div>';

        viewCatalog.style.display = 'none';
        viewEmbedded.style.display = 'none';
        viewPreview.classList.add('is-open');

        var backBtn = document.getElementById('previewBackBtn');
        var openBtn = document.getElementById('previewOpenBtn');
        var runBtn  = document.getElementById('previewRunBtn');
        if (backBtn) backBtn.onclick = closePreviewPanel;
        if (openBtn) openBtn.onclick = function () { closePreviewPanel(); openEmbeddedView(tool.id); };
        if (runBtn)  runBtn.onclick  = function () { closePreviewPanel(); runScript(tool); };

        var prevBtn = document.getElementById('previewPrevBtn');
        var nextBtn = document.getElementById('previewNextBtn');
        function stepPreview(dir) {
            var visibleList = getVisibleTools();
            var curIdx = -1;
            for (var v = 0; v < visibleList.length; v++) {
                if (visibleList[v].id === tool.id) { curIdx = v; break; }
            }
            if (curIdx !== -1) {
                var nextIndex = dir > 0 ?
                    (curIdx + 1) % visibleList.length :
                    (curIdx - 1 + visibleList.length) % visibleList.length;
                openPreviewPanel(visibleList[nextIndex].id);
            }
        }
        if (prevBtn) prevBtn.onclick = function () { stepPreview(-1); };
        if (nextBtn) nextBtn.onclick = function () { stepPreview(1); };
    }

    function closePreviewPanel() {
        if (!viewPreview) return;
        activePreviewTool = null;
        viewPreview.classList.remove('is-open');
        viewPreview.innerHTML = '';
        viewEmbedded.style.display = 'none';
        viewCatalog.style.display = 'flex';
        goBackToCatalog();
        playEnter();
        renderTools();
    }

    function closeEmbeddedView() {
        var prevId = lastOpenedToolId;
        activeEmbeddedTool = null;
        if (embeddedSelRibbon) embeddedSelRibbon.hidden = true;
        viewEmbedded.style.display = "none";
        viewCatalog.style.display = "flex";
        goBackToCatalog();
        playEnter();
        renderTools();
        moveTabIndicator();
        if (prevId) {
            var card = toolList.querySelector('.tool-card[data-id="' + prevId + '"]');
            if (card && typeof card.focus === "function") card.focus();
        }
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
                        '<div class="embed-generic-desc">' + (isKhmer() ? "សូមបើកឯកសារគំនូរក្នុង Illustrator ដើម្បីកំណត់ការនាំចេញជាកញ្ចប់។ ផ្ទាំងនឹងផ្ទុកដោយស្វ័យប្រវត្តិ។" : "Open an artwork document in Illustrator to configure batch artboard export. This panel updates automatically.") + '</div>' +
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

        // 0. Live Export Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="expLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Doc Info Bar
        html.push('<div class="embed-doc-bar">');
        html.push('  <span class="embed-doc-name" title="' + escapeHtml(meta.fullDocName) + '">' + escapeHtml(meta.fullDocName) + '</span>');
        html.push('  <div class="embed-doc-tags">');
        html.push('    <span class="embed-tag">' + escapeHtml(meta.colorSpace) + '</span>');
        html.push('    <span class="embed-tag ' + (meta.isSaved ? "tag-saved" : "tag-unsaved") + '">' + (meta.isSaved ? (isKhmer() ? "បានរក្សាទុក" : "Saved") : (isKhmer() ? "មិនបានរក្សាទុក" : "Unsaved")) + '</span>');
        html.push('    <span class="embed-tag">' + meta.totalArtboards + (isKhmer() ? " ផ្ទាំង" : " AB") + '</span>');
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
        html.push('        <label class="embed-check-row" style="margin-left:4px;"><input type="radio" name="pdfMode" id="rbPdfSep" value="sep" ' + (!state.pdfCombined ? "checked" : "") + '> ' + (isKhmer() ? "ដោយឡែក" : "Separate") + '</label>');
        html.push('        <label class="embed-check-row"><input type="radio" name="pdfMode" id="rbPdfComb" value="comb" ' + (state.pdfCombined ? "checked" : "") + '> ' + (isKhmer() ? "ច្រើនទំព័រ" : "Multi-page") + '</label>');
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
        html.push('        <span style="font-size:11px;color:var(--text-muted);">' + (isKhmer() ? "គុណភាព 100% (អតិបរមា)" : "Quality 100% (Max)") + '</span>');
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
        html.push('      <option value="">+ Add Tag...</option>');
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
        html.push('  <div class="embed-naming-preview" id="expNamingPreview">' + (isKhmer() ? "ឧទាហរណ៍ឈ្មោះឯកសារ" : "Sample filename preview") + '</div>');
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
        html.push('  <button type="button" id="btnExportSubmit" class="btn-action-primary">' + uiIcon("export") + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now") + '</button>');
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
            expNamingPreview.textContent = sampleName;

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
            updateExpTicket();
        }

        function updateExpTicket() {
            var box = $("expLiveTicket");
            if (!box) return;

            var formats = [];
            if (chkPdf && chkPdf.checked) {
                formats.push("PDF" + (chkPdfCombined && chkPdfCombined.checked ? " [Combined]" : ""));
            }
            if (chkTiff && chkTiff.checked) {
                formats.push("TIFF " + (selTiffDpi ? selTiffDpi.value : "300") + "DPI");
            }
            if (chkPng && chkPng.checked) {
                formats.push("PNG " + (selPngDpi ? selPngDpi.value : "300") + "DPI");
            }
            if (chkJpg && chkJpg.checked) {
                formats.push("JPG " + (selJpgDpi ? selJpgDpi.value : "300") + "DPI");
            }
            var fmtText = formats.length ? formats.join(" \u2022 ") : (isKhmer() ? "គ្មានទម្រង់ជ្រើសរើស" : "No export format selected");

            var scopeText = (state.scope === "all") ? (isKhmer() ? "គ្រប់ Artboards (" + meta.totalArtboards + ")" : "All Artboards (" + meta.totalArtboards + ")")
                : (state.scope === "active" ? (isKhmer() ? "Artboard សកម្ម (#" + (meta.activeArtboardIndex + 1) + ")" : "Active Artboard (#" + (meta.activeArtboardIndex + 1) + ")") : (isKhmer() ? "ជួរ Artboards: " + (expRangeInput ? expRangeInput.value : state.customRange) : "Range: " + (expRangeInput ? expRangeInput.value : state.customRange)));

            var dest = expDestInput ? expDestInput.value : state.destFolder;
            var isOut = chkOutline ? chkOutline.checked : state.outline;
            var noteParts = [];
            if (isOut) noteParts.push(isKhmer() ? "Outline អក្សរ" : "Text Outlined");
            if (dest) {
                noteParts.push((isKhmer() ? "ទៅកាន់៖ " : "To: ") + (dest.length > 45 ? dest.slice(0, 44) + "\u2026" : dest));
            } else {
                noteParts.push(isKhmer() ? "មិនទាន់ជ្រើសថត" : "No folder chosen");
            }

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Batch Exporter</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(meta.docName || "Untitled") + ' (' + escapeHtml(scopeText) + ')</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(fmtText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
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
            btnExportSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "កំពុងនាំចេញ..." : "Exporting...");
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
                    btnExportSubmit.innerHTML = uiIcon("export") + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now");
                    setStatus("Simulated Export Complete (2 files)", "success", 4000);
                }, 1200);
                return;
            }

            csInterface.evalScript("ozoExecuteBatchExport(" + JSON.stringify(JSON.stringify(exportConfig)) + ")", function (raw) {
                btnExportSubmit.disabled = false;
                btnExportSubmit.innerHTML = uiIcon("export") + (isKhmer() ? "នាំចេញឥឡូវនេះ" : "Export Now");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var successMsg = (isKhmer() ? "នាំចេញបានជោគជ័យ៖ " : "Export complete: ") + res.count + " " + (isKhmer() ? "ឯកសារ" : "file(s)") + " : " + res.folder;
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

        // 0. Live QR Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="qrLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

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
        html.push('  <button type="button" id="btnQrSubmit" class="btn-action-primary">' + uiIcon("plus") + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code") + '</button>');
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
            var scanMeter = "";
            if (len === 0) {
                scanMeter = '<span class="qr-meter meter-empty">Empty</span>';
            } else if (len < 50) {
                scanMeter = '<span class="qr-meter meter-easy" title="High scan speed and camera distance">⚡ Easy Scan</span>';
            } else if (len <= 150) {
                scanMeter = '<span class="qr-meter meter-medium" title="Optimal density for URLs and Telegram">✓ Standard</span>';
            } else {
                scanMeter = '<span class="qr-meter meter-dense" title="Dense grid: recommend 40mm+ print size">⚠ Dense Grid</span>';
            }
            qrCharCount.innerHTML = len + " " + (isKhmer() ? "តួអក្សរ" : "chars") + " " + scanMeter;

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
            updateQrTicket();
        }

        function updateQrTicket() {
            var box = $("qrLiveTicket");
            if (!box) return;
            var content = (qrContentInput ? qrContentInput.value : state.content) || "";
            var size = (qrSizeInput ? qrSizeInput.value : state.size) || "30";
            var unit = (qrUnitSelect ? qrUnitSelect.value : state.unit) || "mm";
            var level = (qrCorrectionSelect ? qrCorrectionSelect.value : state.level) || "M";
            var hasBg = chkQrBg ? chkQrBg.checked : state.background;
            var isNewLayer = chkQrNewLayer ? chkQrNewLayer.checked : state.newLayer;

            var bgText = hasBg ? (isKhmer() ? "ផ្ទៃស (White BG)" : "White BG") : (isKhmer() ? "ផ្ទៃថ្លា (Transparent)" : "Transparent");
            var dimText = "w" + size + unit + " x h" + size + unit + " \u2022 EC Level " + level + " \u2022 " + bgText;

            var noteParts = [];
            if (isNewLayer) noteParts.push(isKhmer() ? "Layer ថ្មី" : "New Layer");
            if (state.style.indexOf("Telegram") !== -1) noteParts.push(state.theme);
            if (content) {
                var clean = content.replace(/\s+/g, " ").trim();
                noteParts.push((isKhmer() ? "មាតិកា៖ " : "Data: ") + (clean.length > 50 ? clean.slice(0, 49) + "\u2026" : clean));
            } else {
                noteParts.push(isKhmer() ? "មិនទាន់មានមាតិកា" : "No content yet");
            }

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Vector QR Code</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(state.style) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
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
            btnQrSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "កំពុងបង្កើត..." : "Generating...");
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
                    btnQrSubmit.innerHTML = uiIcon("plus") + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code");
                    setStatus("Simulated QR Inserted (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteGenerateQR(" + JSON.stringify(JSON.stringify(qrParams)) + ")", function (raw) {
                btnQrSubmit.disabled = false;
                btnQrSubmit.innerHTML = uiIcon("plus") + (isKhmer() ? "បញ្ចូលកូដ QR វ៉ិចទ័រ" : "Insert Vector QR Code");
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
    // In-Dock CutContour Generator View
    // -------------------------------------------------------------
    function renderEmbeddedCutContour() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_cutcontour_settings", "{}")); } catch (e) {}

        var PRESETS_LIST = [
            { name: "Roland VersaWorks", kiss: "CutContour", perf: "PerfCutContour", stroke: 0.25, cmykKiss: [0, 100, 0, 0], cmykPerf: [100, 0, 0, 0] },
            { name: "Mimaki RasterLink", kiss: "CutContour", perf: "HalfCutContour", stroke: 0.30, cmykKiss: [0, 100, 0, 0], cmykPerf: [100, 0, 0, 0] },
            { name: "Summa / WinPlot", kiss: "OPOS", perf: "FlexCut", stroke: 0.25, cmykKiss: [0, 100, 100, 0], cmykPerf: [100, 0, 100, 0] },
            { name: "Graphtec FC", kiss: "FC Cut", perf: "PerfCut", stroke: 0.25, cmykKiss: [0, 100, 0, 0], cmykPerf: [100, 0, 0, 0] },
            { name: "Onyx / Caldera", kiss: "CutContour", perf: "ThruCut", stroke: 0.25, cmykKiss: [0, 100, 0, 0], cmykPerf: [100, 0, 0, 0] }
        ];

        var SHAPES_LIST = [
            { id: 4, name: isKhmer() ? "រាងតាមរូប" : "Tight Silhouette", icon: uiIcon("scissors", 13) },
            { id: 0, name: isKhmer() ? "ចតុកោណមូល" : "Rounded Rect", icon: uiIcon("roundrect", 13) },
            { id: 1, name: isKhmer() ? "ចតុកោណកែង" : "Rectangle", icon: uiIcon("rect", 13) },
            { id: 2, name: isKhmer() ? "រង្វង់ / ពងក្រពើ" : "Circle / Oval", icon: uiIcon("circle", 13) },
            { id: 3, name: isKhmer() ? "កន្សោមថ្នាំ" : "Capsule", icon: uiIcon("capsule", 13) },
            { id: 5, name: isKhmer() ? "ប្រាំមួយជ្រុង" : "Hexagon", icon: uiIcon("hexagon", 13) },
            { id: 6, name: isKhmer() ? "ប្រាំបីជ្រុង" : "Octagon", icon: uiIcon("octagon", 13) }
        ];

        var state = {
            preset: saved.preset !== undefined ? saved.preset : 0,
            shape: saved.shape !== undefined ? saved.shape : 4,
            offset: saved.offset !== undefined ? saved.offset : 2.0,
            radius: saved.radius !== undefined ? saved.radius : 3.0,
            unit: saved.unit || "mm",
            perfectSquare: saved.perfectSquare === true,
            kissEnabled: saved.kissEnabled !== false,
            kissName: saved.kissName || "CutContour",
            kissOffset: saved.kissOffset !== undefined ? saved.kissOffset : 2.0,
            perfEnabled: saved.perfEnabled === true,
            perfName: saved.perfName || "PerfCutContour",
            perfOffset: saved.perfOffset !== undefined ? saved.perfOffset : 5.0,
            strokeWeight: saved.strokeWeight !== undefined ? saved.strokeWeight : 0.25,
            overprint: saved.overprint !== false,
            optimizePath: saved.optimizePath !== false,
            addRegMarks: saved.addRegMarks === true
        };

        var html = [];

        // 0. Live CutContour Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="cutLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Machine RIP Preset Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ម៉ាស៊ីន / RIP Preset" : "Machine / RIP Preset") + '</span></div>');
        html.push('  <select id="cutPresetSelect" class="embed-select" style="width:100%;">');
        for (var p = 0; p < PRESETS_LIST.length; p++) {
            html.push('    <option value="' + p + '" ' + (state.preset == p ? "selected" : "") + '>' + escapeHtml(PRESETS_LIST[p].name) + '</option>');
        }
        html.push('  </select>');
        html.push('</div>');

        // 2. Shape Geometry Card (Segmented Grid)
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទម្រង់រាងបន្ទាត់កាត់ (Geometry)" : "Cutline Geometry") + '</span></div>');
        html.push('  <div class="embed-shape-grid" id="cutShapeGrid">');
        for (var sh = 0; sh < SHAPES_LIST.length; sh++) {
            var sItem = SHAPES_LIST[sh];
            var isAct = (state.shape == sItem.id);
            html.push('    <button type="button" class="embed-shape-btn ' + (isAct ? "active" : "") + '" data-shape="' + sItem.id + '">');
            html.push('      <span class="shape-icon">' + sItem.icon + '</span>');
            html.push('      <span class="shape-lbl">' + escapeHtml(sItem.name) + '</span>');
            html.push('    </button>');
        }
        html.push('  </div>');
        html.push('</div>');

        // 3. Offset & Dimensions Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "គម្លាតកាត់ (Offset & Radius)" : "Offset & Dimensions") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាត Offset:" : "Offset / Bleed:") + '</label>');
        html.push('      <div style="display:flex;gap:4px;margin-top:2px;">');
        html.push('        <input type="number" id="cutOffsetInput" class="embed-input" value="' + state.offset + '" step="0.5" style="flex:1;">');
        html.push('        <select id="cutUnitSelect" class="embed-select" style="width:58px;">');
        var uList = ["mm", "cm", "pt", "in"];
        for (var u = 0; u < uList.length; u++) {
            html.push('          <option value="' + uList[u] + '" ' + (state.unit === uList[u] ? "selected" : "") + '>' + uList[u] + '</option>');
        }
        html.push('        </select>');
        html.push('      </div>');
        html.push('    </div>');
        html.push('    <div id="wrapCornerRadius" style="display:' + (state.shape === 0 ? "block" : "none") + ';">');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កាំជ្រុង Radius:" : "Corner Radius:") + '</label>');
        html.push('      <input type="number" id="cutRadiusInput" class="embed-input" value="' + state.radius + '" step="0.5" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <label class="embed-check-row" style="margin-top:4px;"><input type="checkbox" id="chkCutSquare" ' + (state.perfectSquare ? "checked" : "") + '> ' + (isKhmer() ? "ទទឹង និងបណ្តោយស្មើគ្នា (Square / Circle)" : "Equal width & height (Square/Circle)") + '</label>');
        html.push('</div>');

        // 4. Cut Types & Spot Colors Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ប្រភេទបន្ទាត់ និងពណ៌ Spot" : "Cut Types & Spot Layers") + '</span></div>');

        // Kiss-Cut row
        html.push('  <div style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid var(--border-color);">');
        html.push('    <label class="embed-check-row" style="font-weight:600;"><input type="checkbox" id="chkKiss" ' + (state.kissEnabled ? "checked" : "") + '> ' + (isKhmer() ? "Kiss-Cut (កាត់រាក់ខាងក្នុង)" : "Kiss-Cut (Inner Cut)") + '</label>');
        html.push('    <div id="kissFields" style="display:' + (state.kissEnabled ? "flex" : "none") + ';gap:6px;align-items:center;">');
        html.push('      <input type="text" id="cutKissNameInput" class="embed-input embed-input-mono" value="' + escapeHtml(state.kissName) + '" placeholder="Spot Name" style="flex:1;">');
        html.push('      <div style="display:flex;align-items:center;gap:3px;">');
        html.push('        <span style="font-size:10.5px;color:var(--text-secondary);">+</span>');
        html.push('        <input type="number" id="cutKissOffsetInput" class="embed-input" value="' + state.kissOffset + '" step="0.5" style="width:52px;" title="Kiss-Cut Offset">');
        html.push('        <span class="cutUnitLbl" style="font-size:10.5px;color:var(--text-secondary);">' + state.unit + '</span>');
        html.push('      </div>');
        html.push('    </div>');
        html.push('  </div>');

        // Die-Cut row
        html.push('  <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">');
        html.push('    <label class="embed-check-row" style="font-weight:600;"><input type="checkbox" id="chkPerf" ' + (state.perfEnabled ? "checked" : "") + '> ' + (isKhmer() ? "Die-Cut / Perf-Cut (កាត់ដាច់ក្រៅ)" : "Die-Cut / Perf-Cut (Outer Backing)") + '</label>');
        html.push('    <div id="perfFields" style="display:' + (state.perfEnabled ? "flex" : "none") + ';gap:6px;align-items:center;">');
        html.push('      <input type="text" id="cutPerfNameInput" class="embed-input embed-input-mono" value="' + escapeHtml(state.perfName) + '" placeholder="Perf Spot Name" style="flex:1;">');
        html.push('      <div style="display:flex;align-items:center;gap:3px;">');
        html.push('        <span style="font-size:10.5px;color:var(--text-secondary);">+</span>');
        html.push('        <input type="number" id="cutPerfOffsetInput" class="embed-input" value="' + state.perfOffset + '" step="0.5" style="width:52px;" title="Die-Cut Offset">');
        html.push('        <span class="cutUnitLbl" style="font-size:10.5px;color:var(--text-secondary);">' + state.unit + '</span>');
        html.push('      </div>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Prepress & Production Options Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ការកំណត់មុនបោះពុម្ព (Prepress)" : "Prepress & RIP Options") + '</span></div>');
        html.push('  <div style="display:flex;gap:12px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkCutOverprint" ' + (state.overprint ? "checked" : "") + '> Overprint Stroke</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkCutOpt" ' + (state.optimizePath ? "checked" : "") + '> ' + (isKhmer() ? "បង្កើនគុណភាព Path" : "Optimize Path") + '</label>');
        html.push('  </div>');
        html.push('  <label class="embed-check-row" style="margin-top:3px;"><input type="checkbox" id="chkCutReg" ' + (state.addRegMarks ? "checked" : "") + '> ' + (isKhmer() ? "បន្ថែមសញ្ញាសម្គាល់ (Registration Marks)" : "Add Registration Marks") + '</label>');
        html.push('</div>');

        // 6. Action Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnCutSubmit" class="btn-action-primary">' + uiIcon("scissors") + (isKhmer() ? "បង្កើតខ្សែបន្ទាត់កាត់ឥឡូវនេះ" : "Generate CutContour Now") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var cutPresetSelect = $("cutPresetSelect");
        var shapeBtns = embeddedContent.querySelectorAll("#cutShapeGrid .embed-shape-btn");
        var cutOffsetInput = $("cutOffsetInput");
        var cutUnitSelect = $("cutUnitSelect");
        var cutRadiusInput = $("cutRadiusInput");
        var wrapCornerRadius = $("wrapCornerRadius");
        var chkCutSquare = $("chkCutSquare");
        var chkKiss = $("chkKiss");
        var kissFields = $("kissFields");
        var cutKissNameInput = $("cutKissNameInput");
        var cutKissOffsetInput = $("cutKissOffsetInput");
        var chkPerf = $("chkPerf");
        var perfFields = $("perfFields");
        var cutPerfNameInput = $("cutPerfNameInput");
        var cutPerfOffsetInput = $("cutPerfOffsetInput");
        var chkCutOverprint = $("chkCutOverprint");
        var chkCutOpt = $("chkCutOpt");
        var chkCutReg = $("chkCutReg");
        var btnCutSubmit = $("btnCutSubmit");

        function updateCutState() {
            state.preset = parseInt(cutPresetSelect.value, 10) || 0;
            state.offset = parseFloat(cutOffsetInput.value) || 2.0;
            state.radius = parseFloat(cutRadiusInput.value) || 3.0;
            state.unit = cutUnitSelect.value;
            state.perfectSquare = chkCutSquare.checked;
            state.kissEnabled = chkKiss.checked;
            state.kissName = cutKissNameInput.value.trim() || "CutContour";
            state.kissOffset = parseFloat(cutKissOffsetInput.value) || state.offset;
            state.perfEnabled = chkPerf.checked;
            state.perfName = cutPerfNameInput.value.trim() || "PerfCutContour";
            state.perfOffset = parseFloat(cutPerfOffsetInput.value) || 5.0;
            state.overprint = chkCutOverprint.checked;
            state.optimizePath = chkCutOpt.checked;
            state.addRegMarks = chkCutReg.checked;

            wrapCornerRadius.style.display = (state.shape === 0) ? "block" : "none";
            kissFields.style.display = state.kissEnabled ? "flex" : "none";
            perfFields.style.display = state.perfEnabled ? "flex" : "none";

            var uLabels = embeddedContent.querySelectorAll(".cutUnitLbl");
            for (var ul = 0; ul < uLabels.length; ul++) uLabels[ul].textContent = state.unit;

            store.setDebounced("ozo_cutcontour_settings", JSON.stringify(state), 250);
            updateCutTicket();
        }

        function updateCutTicket() {
            var box = $("cutLiveTicket");
            if (!box) return;
            var presetObj = PRESETS_LIST[state.preset] || PRESETS_LIST[0];
            var shapeObj = null;
            for (var i = 0; i < SHAPES_LIST.length; i++) {
                if (SHAPES_LIST[i].id === state.shape) { shapeObj = SHAPES_LIST[i]; break; }
            }
            var shapeName = shapeObj ? shapeObj.name : "Custom";
            if (state.shape === 0) shapeName += " (R: " + state.radius + state.unit + ")";

            var cuts = [];
            if (state.kissEnabled) {
                cuts.push("Kiss: " + state.kissName + " (+" + state.kissOffset + state.unit + ")");
            }
            if (state.perfEnabled) {
                cuts.push("Perf: " + state.perfName + " (+" + state.perfOffset + state.unit + ")");
            }
            var cutDimText = cuts.length ? cuts.join(" \u2022 ") : (isKhmer() ? "គ្មានបន្ទាត់កាត់" : "No cutline enabled");

            var opts = [];
            opts.push((isKhmer() ? "កម្រាស់៖ " : "Stroke: ") + state.strokeWeight + " pt");
            if (state.overprint) opts.push("Overprint");
            if (state.optimizePath) opts.push(isKhmer() ? "សម្រួល Path" : "Optimize");
            if (state.addRegMarks) opts.push(isKhmer() ? "សញ្ញាសម្គាល់" : "Marks");

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 CutContour PRO</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(presetObj.name) + ' \u2014 ' + escapeHtml(shapeName) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(cutDimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(opts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
        }

        cutPresetSelect.addEventListener("change", function () {
            var idx = parseInt(this.value, 10) || 0;
            var p = PRESETS_LIST[idx];
            if (p) {
                cutKissNameInput.value = p.kiss;
                cutPerfNameInput.value = p.perf;
                state.strokeWeight = p.stroke;
            }
            updateCutState();
        });

        for (var sb = 0; sb < shapeBtns.length; sb++) {
            shapeBtns[sb].addEventListener("click", function () {
                for (var b = 0; b < shapeBtns.length; b++) shapeBtns[b].classList.remove("active");
                this.classList.add("active");
                state.shape = parseInt(this.getAttribute("data-shape"), 10);
                updateCutState();
            });
        }

        cutOffsetInput.addEventListener("input", function () {
            cutKissOffsetInput.value = this.value;
            updateCutState();
        });
        cutRadiusInput.addEventListener("input", updateCutState);
        cutUnitSelect.addEventListener("change", updateCutState);
        chkCutSquare.addEventListener("change", updateCutState);
        chkKiss.addEventListener("change", updateCutState);
        cutKissNameInput.addEventListener("input", updateCutState);
        cutKissOffsetInput.addEventListener("input", updateCutState);
        chkPerf.addEventListener("change", updateCutState);
        cutPerfNameInput.addEventListener("input", updateCutState);
        cutPerfOffsetInput.addEventListener("input", updateCutState);
        chkCutOverprint.addEventListener("change", updateCutState);
        chkCutOpt.addEventListener("change", updateCutState);
        chkCutReg.addEventListener("change", updateCutState);

        btnCutSubmit.addEventListener("click", function () {
            if (!chkKiss.checked && !chkPerf.checked) {
                showError("CutContour", isKhmer() ? "សូមជ្រើសរើសយ៉ាងហោច Kiss-Cut ឬ Die-Cut មួយ។" : "Please enable at least Kiss-Cut or Die-Cut.");
                return;
            }

            hideError();
            btnCutSubmit.disabled = true;
            btnCutSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "កំពុងបង្កើត..." : "Generating...");
            setStatus(isKhmer() ? "កំពុងបង្កើតបន្ទាត់កាត់ CutContour..." : "Generating CutContour paths...", "running");

            var pObj = PRESETS_LIST[state.preset] || PRESETS_LIST[0];
            var params = {
                shapeIndex: state.shape,
                unit: state.unit,
                offset: parseFloat(cutOffsetInput.value) || 2.0,
                radius: parseFloat(cutRadiusInput.value) || 3.0,
                perfectSquare: chkCutSquare.checked,
                kissEnabled: chkKiss.checked,
                kissName: cutKissNameInput.value.trim() || "CutContour",
                kissOffset: parseFloat(cutKissOffsetInput.value) || 2.0,
                cmykKiss: pObj.cmykKiss,
                perfEnabled: chkPerf.checked,
                perfName: cutPerfNameInput.value.trim() || "PerfCutContour",
                perfOffset: parseFloat(cutPerfOffsetInput.value) || 5.0,
                cmykPerf: pObj.cmykPerf,
                strokeWeight: pObj.stroke || 0.25,
                overprint: chkCutOverprint.checked,
                optimizePath: chkCutOpt.checked,
                addRegMarks: chkCutReg.checked,
                layerName: pObj.name === "Roland VersaWorks" ? "CUTTING" : "CutContour"
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnCutSubmit.disabled = false;
                    btnCutSubmit.innerHTML = uiIcon("scissors") + (isKhmer() ? "បង្កើតខ្សែបន្ទាត់កាត់ឥឡូវនេះ" : "Generate CutContour Now");
                    setStatus("Simulated CutContour Generated (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteCutContour(" + JSON.stringify(JSON.stringify(params)) + ")", function (raw) {
                btnCutSubmit.disabled = false;
                btnCutSubmit.innerHTML = uiIcon("scissors") + (isKhmer() ? "បង្កើតខ្សែបន្ទាត់កាត់ឥឡូវនេះ" : "Generate CutContour Now");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = isKhmer() ? "បានបង្កើតខ្សែបន្ទាត់កាត់ CutContour ជោគជ័យលើ Layer " + res.layerName : "CutContour created on layer " + res.layerName;
                    setStatus(okMsg, "success", 5000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to generate CutContour");
                    showError(isKhmer() ? "ការបង្កើត CutContour បរាជ័យ" : "CutContour Generation Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        updateCutState();
    }

    // -------------------------------------------------------------
    // In-Dock Smart Dimension View
    // -------------------------------------------------------------
    function renderEmbeddedDimension() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_dimension_settings", "{}")); } catch (e) {}

        var state = {
            mode: saved.mode !== undefined ? saved.mode : 0,
            unit: saved.unit || "mm",
            precision: saved.precision !== undefined ? saved.precision : 2,
            showUnit: saved.showUnit !== false,
            offset: saved.offset !== undefined ? saved.offset : 5.0,
            textSize: saved.textSize !== undefined ? saved.textSize : 10,
            arrow: saved.arrow !== undefined ? saved.arrow : 5,
            stroke: saved.stroke !== undefined ? saved.stroke : 0.5,
            labelBackground: saved.labelBackground !== false,
            boundsProperty: saved.boundsProperty || "visibleBounds"
        };

        var html = [];

        // 0. Live Dimension Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="dimLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Placement Mode (Segmented)
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទិសដៅវាស់ (Direction)" : "Dimension Direction") + '</span></div>');
        html.push('  <div class="embed-segmented" id="dimModeSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 0 ? "active" : "") + '" data-mode="0">' + uiIcon("dimboth", 12) + (isKhmer() ? "ទទឹង & កម្ពស់" : "Both (W+H)") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 1 ? "active" : "") + '" data-mode="1">' + uiIcon("dimwidth", 12) + (isKhmer() ? "ទទឹង" : "Width") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 2 ? "active" : "") + '" data-mode="2">' + uiIcon("dimheight", 12) + (isKhmer() ? "កម្ពស់" : "Height") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 3 ? "active" : "") + '" data-mode="3">' + uiIcon("dimbox", 12) + (isKhmer() ? "ប្រអប់" : "Box") + '</button>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Units & Offset Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ខ្នាត និងគម្លាត (Units & Offset)" : "Units & Distance") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាតរង្វាស់:" : "Unit:") + '</label>');
        html.push('      <select id="dimUnitSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var dimUnits = ["mm", "cm", "in", "pt", "m"];
        for (var du = 0; du < dimUnits.length; du++) {
            html.push('        <option value="' + dimUnits[du] + '" ' + (state.unit === dimUnits[du] ? "selected" : "") + '>' + dimUnits[du] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតពីគែម (Offset):" : "Offset Distance:") + '</label>');
        html.push('      <input type="number" id="dimOffsetInput" class="embed-input" value="' + state.offset + '" step="1" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="embed-row-2col" style="margin-top:4px;">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនក្បៀស (Precision):" : "Precision:") + '</label>');
        html.push('      <select id="dimPrecisionSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        for (var p = 0; p <= 3; p++) {
            html.push('        <option value="' + p + '" ' + (state.precision === p ? "selected" : "") + '>' + p + (p === 0 ? " (e.g. 50)" : (p === 2 ? " (e.g. 50.25)" : "")) + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div style="display:flex;align-items:flex-end;padding-bottom:5px;">');
        html.push('      <label class="embed-check-row"><input type="checkbox" id="chkDimShowUnit" ' + (state.showUnit ? "checked" : "") + '> ' + (isKhmer() ? "បង្ហាញឈ្មោះខ្នាត" : "Display unit text") + '</label>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 3. Style & Font Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទំហំអក្សរ និងសញ្ញាព្រួញ" : "Style & Appearance") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទំហំអក្សរ (pt):" : "Text Size (pt):") + '</label>');
        html.push('      <input type="number" id="dimTextSizeInput" class="embed-input" value="' + state.textSize + '" min="4" max="100" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទំហំក្បាលព្រួញ:" : "Arrow Size (pt):") + '</label>');
        html.push('      <input type="number" id="dimArrowInput" class="embed-input" value="' + state.arrow + '" min="1" max="50" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="display:flex;gap:12px;margin-top:4px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkDimBg" ' + (state.labelBackground ? "checked" : "") + '> ' + (isKhmer() ? "ផ្ទៃសពីក្រោយអក្សរ (White Pill)" : "White Label Background") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Action Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnDimSubmit" class="btn-action-primary">' + uiIcon("ruler") + (isKhmer() ? "ដាក់វិមាត្រទំហំឥឡូវនេះ" : "Add Dimensions Now") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var modeBtns = embeddedContent.querySelectorAll("#dimModeSegmented .embed-seg-btn");
        var dimUnitSelect = $("dimUnitSelect");
        var dimOffsetInput = $("dimOffsetInput");
        var dimPrecisionSelect = $("dimPrecisionSelect");
        var chkDimShowUnit = $("chkDimShowUnit");
        var dimTextSizeInput = $("dimTextSizeInput");
        var dimArrowInput = $("dimArrowInput");
        var chkDimBg = $("chkDimBg");
        var btnDimSubmit = $("btnDimSubmit");

        function updateDimState() {
            state.unit = dimUnitSelect.value;
            state.offset = parseFloat(dimOffsetInput.value) || 5.0;
            state.precision = parseInt(dimPrecisionSelect.value, 10) || 2;
            state.showUnit = chkDimShowUnit.checked;
            state.textSize = parseFloat(dimTextSizeInput.value) || 10;
            state.arrow = parseFloat(dimArrowInput.value) || 5;
            state.labelBackground = chkDimBg.checked;

            store.setDebounced("ozo_dimension_settings", JSON.stringify(state), 250);
            updateDimTicket();
        }

        function updateDimTicket() {
            var box = $("dimLiveTicket");
            if (!box) return;
            var modeNames = [
                isKhmer() ? "ទទឹង & កម្ពស់ (W+H)" : "Both (Width + Height)",
                isKhmer() ? "ទទឹង (Width Only)" : "Width Only",
                isKhmer() ? "កម្ពស់ (Height Only)" : "Height Only",
                isKhmer() ? "ប្រអប់ (Bounding Box)" : "Bounding Box All Sides"
            ];
            var mName = modeNames[state.mode] || modeNames[0];

            var dimText = "Offset: " + state.offset + state.unit + " \u2022 Text: " + state.textSize + " pt \u2022 Arrow: " + state.arrow + " pt";

            var noteParts = [];
            noteParts.push((isKhmer() ? "ក្បៀស៖ " : "Precision: ") + state.precision + " decimals");
            if (state.showUnit) noteParts.push(isKhmer() ? "បង្ហាញខ្នាត (" + state.unit + ")" : "Show unit label (" + state.unit + ")");
            if (state.labelBackground) noteParts.push(isKhmer() ? "ផ្ទៃសពីក្រោយ (White Pill)" : "White Pill Background");

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Smart Dimension</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(mName) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
        }

        for (var m = 0; m < modeBtns.length; m++) {
            modeBtns[m].addEventListener("click", function () {
                for (var mb = 0; mb < modeBtns.length; mb++) modeBtns[mb].classList.remove("active");
                this.classList.add("active");
                state.mode = parseInt(this.getAttribute("data-mode"), 10);
                updateDimState();
            });
        }

        dimUnitSelect.addEventListener("change", updateDimState);
        dimOffsetInput.addEventListener("input", updateDimState);
        dimPrecisionSelect.addEventListener("change", updateDimState);
        chkDimShowUnit.addEventListener("change", updateDimState);
        dimTextSizeInput.addEventListener("input", updateDimState);
        dimArrowInput.addEventListener("input", updateDimState);
        chkDimBg.addEventListener("change", updateDimState);

        btnDimSubmit.addEventListener("click", function () {
            hideError();
            btnDimSubmit.disabled = true;
            btnDimSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "កំពុងគណនា..." : "Adding dimensions...");
            setStatus(isKhmer() ? "កំពុងដាក់វិមាត្រទំហំ..." : "Adding dimensions to artwork...", "running");

            var params = {
                mode: state.mode,
                unit: state.unit,
                offset: parseFloat(dimOffsetInput.value) || 5.0,
                precision: parseInt(dimPrecisionSelect.value, 10) || 2,
                showUnit: chkDimShowUnit.checked,
                scale: 1,
                textSize: parseFloat(dimTextSizeInput.value) || 10,
                arrow: parseFloat(dimArrowInput.value) || 5,
                stroke: 0.5,
                labelBackground: chkDimBg.checked,
                boundsProperty: "visibleBounds"
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnDimSubmit.disabled = false;
                    btnDimSubmit.innerHTML = uiIcon("ruler") + (isKhmer() ? "ដាក់វិមាត្រទំហំឥឡូវនេះ" : "Add Dimensions Now");
                    setStatus("Simulated Dimensions Placed (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteSmartDimension(" + JSON.stringify(JSON.stringify(params)) + ")", function (raw) {
                btnDimSubmit.disabled = false;
                btnDimSubmit.innerHTML = uiIcon("ruler") + (isKhmer() ? "ដាក់វិមាត្រទំហំឥឡូវនេះ" : "Add Dimensions Now");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = isKhmer() ? "បានបង្កើតវិមាត្រ " + res.count + " ដោយជោគជ័យលើ Layer " + res.layer : "Created " + res.count + " dimensions on layer " + res.layer;
                    setStatus(okMsg, "success", 5000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to add dimensions");
                    showError(isKhmer() ? "ការដាក់វិមាត្របរាជ័យ" : "Dimension Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        updateDimState();
    }

    

    // -------------------------------------------------------------
    // In-Dock Print Job Info View
    // -------------------------------------------------------------
    function renderEmbeddedPrintJob() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_printjob_settings", "{}")); } catch (e) {}

        var today = new Date();
        var dStr = ("0" + today.getDate()).slice(-2) + " " + ("0" + (today.getMonth() + 1)).slice(-2) + " " + today.getFullYear();

        var state = {
            material: saved.material || "Silk Light Box",
            dateStr: saved.dateStr || dStr,
            widthVal: saved.widthVal || "",
            heightVal: saved.heightVal || "",
            unit: saved.unit || "cm",
            qty: saved.qty !== undefined ? saved.qty : 1,
            note: saved.note || "",
            expandArtboard: saved.expandArtboard !== false,
            // Match the standalone dialog: the dark header box is on by default.
            darkBox: saved.darkBox !== false,
            textColorIndex: saved.textColorIndex !== undefined ? saved.textColorIndex : 0,
            alignmentIndex: saved.alignmentIndex !== undefined ? saved.alignmentIndex : 0,
            fontSizeIndex: saved.fontSizeIndex !== undefined ? saved.fontSizeIndex : 0,
            fontChoiceIndex: saved.fontChoiceIndex !== undefined ? saved.fontChoiceIndex : 0
        };

        var materials = [
            { id: "Silk Light Box", name: "Silk Light Box" },
            { id: "Sticker / Decal", name: isKhmer() ? "Sticker (ស្ទីគ័រ)" : "Sticker / Decal" },
            { id: "Sticker បិតបត់", name: isKhmer() ? "Sticker បិតបត់ (Standee)" : "Sticker Foldable (បិតបត់)" },
            { id: "Sticker ចោះកុង", name: isKhmer() ? "Sticker ចោះកុង (Die-Cut)" : "Sticker Die-Cut (ចោះកុង)" },
            { id: "Vinyl Banner", name: isKhmer() ? "Vinyl Banner (បដា)" : "Vinyl Banner" },
            { id: "Slim LED", name: "Slim LED" },
            { id: "Backlit Film", name: "Backlit Film" },
            { id: "Canvas", name: "Canvas" },
            { id: "Clear Sticker", name: isKhmer() ? "Clear Sticker (ស្ទីគ័រថ្លា)" : "Clear Sticker" },
            { id: "Custom", name: isKhmer() ? "ផ្សេងទៀត (Custom...)" : "Custom..." }
        ];

        var html = [];

        // 1. Live Ticket Preview Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="pjTicketCard" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '">');
        html.push('    <div class="ticket-line-date" id="pjTicketDate">' + escapeHtml(state.dateStr || dStr) + '</div>');
        html.push('    <div class="ticket-line-mat" id="pjTicketMat">' + escapeHtml(state.material) + '</div>');
        html.push('    <div class="ticket-line-dim" id="pjTicketDim">w' + (state.widthVal || "--") + state.unit + ' x h' + (state.heightVal || "--") + state.unit + ' =' + state.qty + 'pcs</div>');
        html.push('    <div class="ticket-line-note" id="pjTicketNote" style="' + (state.note ? "" : "display:none;") + '">' + escapeHtml(state.note) + '</div>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Job Metadata
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ព័ត៌មានការងារបោះពុម្ព (Job Info)" : "Production Details") + '</span></div>');
        html.push('  <div style="margin-bottom:8px;">');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ប្រភេទសម្ភារៈ (Material / Media):" : "Material / Media:") + '</label>');
        html.push('    <div style="display:flex;gap:6px;margin-top:2px;">');
        html.push('      <select id="pjMatSelect" class="embed-select" style="flex:1;">');
        var isKnownMat = false;
        for (var mi = 0; mi < materials.length; mi++) {
            var m = materials[mi];
            if (m.id !== "Custom" && state.material === m.id) isKnownMat = true;
        }
        for (var mi2 = 0; mi2 < materials.length; mi2++) {
            var m2 = materials[mi2];
            var mSel = (state.material === m2.id || (!isKnownMat && m2.id === "Custom")) ? "selected" : "";
            html.push('        <option value="' + escapeHtml(m2.id) + '" ' + mSel + '>' + escapeHtml(m2.name) + '</option>');
        }
        html.push('      </select>');
        html.push('      <input type="text" id="pjMatCustomInput" class="embed-input" value="' + escapeHtml(state.material) + '" placeholder="Material name" style="flex:1.2;' + (!isKnownMat || state.material === "Custom" ? "" : "display:none;") + '">');
        html.push('    </div>');
        html.push('  </div>');

        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កាលបរិច្ឆេទ (Date):" : "Date (DD MM YYYY):") + '</label>');
        html.push('      <input type="text" id="pjDateInput" class="embed-input" value="' + escapeHtml(state.dateStr) + '" placeholder="DD MM YYYY" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួន (Quantity):" : "Quantity (pcs):") + '</label>');
        html.push('      <input type="number" id="pjQtyInput" class="embed-input" value="' + state.qty + '" min="1" step="1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');

        html.push('  <div style="margin-top:8px;">');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះអតិថិជន / ចំណាំ (Note / Customer):" : "Customer / Note (Optional):") + '</label>');
        html.push('    <input type="text" id="pjNoteInput" class="embed-input" value="' + escapeHtml(state.note) + '" placeholder="e.g. OZO Brand - Urgent" style="width:100%;margin-top:2px;">');
        html.push('  </div>');
        html.push('</div>');

        // 3. Dimensions Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header">');
        html.push('    <span>' + (isKhmer() ? "ទំហំបោះពុម្ព (Print Dimensions)" : "Print Dimensions") + '</span>');
        html.push('    <button type="button" id="btnPjSyncAb" class="embed-preset-btn" style="padding:2px 8px;font-size:10.5px;">' + uiIcon("grid", 11) + (isKhmer() ? "យកទំហំ Artboard" : "Sync Artboard") + '</button>');
        html.push('  </div>');
        html.push('  <div class="embed-row-3col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទទឹង (W):" : "Width:") + '</label>');
        html.push('      <input type="number" id="pjWidthInput" class="embed-input" value="' + state.widthVal + '" step="0.1" min="0.1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កម្ពស់ (H):" : "Height:") + '</label>');
        html.push('      <input type="number" id="pjHeightInput" class="embed-input" value="' + state.heightVal + '" step="0.1" min="0.1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាត:" : "Unit:") + '</label>');
        html.push('      <select id="pjUnitSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var pjUnits = ["cm", "mm", "in", "m", "pt"];
        for (var pju = 0; pju < pjUnits.length; pju++) {
            html.push('        <option value="' + pjUnits[pju] + '" ' + (state.unit === pjUnits[pju] ? "selected" : "") + '>' + pjUnits[pju] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Header Style & Placement
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ការកំណត់ និងម៉ូតបដា" : "Header Style & Placement") + '</span></div>');
        html.push('  <div class="embed-row-3col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទំហំអក្សរ:" : "Font Size:") + '</label>');
        html.push('      <select id="pjFontSizeSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var fSizes = [
            isKhmer() ? "ស្វ័យប្រវត្តិ (Auto)" : "Auto (Proportional)",
            isKhmer() ? "តូច (Small)" : "Small",
            isKhmer() ? "មធ្យម (Medium)" : "Medium",
            isKhmer() ? "ធំ (Large)" : "Large",
            isKhmer() ? "ធំបំផុត (Extra Large)" : "Extra Large"
        ];
        for (var fsi = 0; fsi < fSizes.length; fsi++) {
            html.push('        <option value="' + fsi + '" ' + (state.fontSizeIndex === fsi ? "selected" : "") + '>' + fSizes[fsi] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ពណ៌អក្សរ:" : "Text Color:") + '</label>');
        html.push('      <select id="pjColorSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var tColors = [
            isKhmer() ? "ស (White)" : "White",
            isKhmer() ? "លឿង (Yellow)" : "Yellow",
            isKhmer() ? "ខៀវ (Cyan)" : "Cyan",
            isKhmer() ? "ខ្មៅ (Black)" : "Black",
            isKhmer() ? "ក្រហមផ្កាឈូក (Magenta)" : "Magenta"
        ];
        for (var tci = 0; tci < tColors.length; tci++) {
            html.push('        <option value="' + tci + '" ' + (state.textColorIndex === tci ? "selected" : "") + '>' + tColors[tci] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ពុម្ពអក្សរ:" : "Font:") + '</label>');
        html.push('      <select id="pjFontSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var fChoices = [
            isKhmer() ? "សកម្ម (Active)" : "Active Font",
            "Kantumruy Pro Bold",
            "Leelawadee UI Bold",
            "Khmer OS Battambang",
            "Hanuman Bold",
            "Arial Bold",
            "Impact"
        ];
        for (var fci = 0; fci < fChoices.length; fci++) {
            html.push('        <option value="' + fci + '" ' + (state.fontChoiceIndex === fci ? "selected" : "") + '>' + fChoices[fci] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');

        html.push('  <div style="margin-top:8px;">');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ការតម្រឹម (Alignment):" : "Header Alignment:") + '</label>');
        html.push('    <div class="embed-segmented" id="pjAlignSegmented" style="margin-top:2px;">');
        html.push('      <button type="button" class="embed-seg-btn ' + (state.alignmentIndex === 0 ? "active" : "") + '" data-align="0">' + (isKhmer() ? "ឆ្វេង (Left)" : "Left") + '</button>');
        html.push('      <button type="button" class="embed-seg-btn ' + (state.alignmentIndex === 1 ? "active" : "") + '" data-align="1">' + (isKhmer() ? "កណ្តាល (Center)" : "Center") + '</button>');
        html.push('      <button type="button" class="embed-seg-btn ' + (state.alignmentIndex === 2 ? "active" : "") + '" data-align="2">' + (isKhmer() ? "ស្តាំ (Right)" : "Right") + '</button>');
        html.push('    </div>');
        html.push('  </div>');

        html.push('  <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPjExpand" ' + (state.expandArtboard ? "checked" : "") + '> ' + (isKhmer() ? "ពង្រីកកម្ពស់ Artboard ស្វ័យប្រវត្តិ" : "Auto-expand artboard height for header") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPjDark" ' + (state.darkBox ? "checked" : "") + '> ' + (isKhmer() ? "ដាក់ប្រអប់ផ្ទៃក្រោយពណ៌ខ្មៅ (Dark Box)" : "Add solid dark background box") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Submit Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnPjSubmit" class="btn-action-primary">' + uiIcon("printer") + (isKhmer() ? "បង្កើតក្បាល File Print ឥឡូវនេះ" : "Generate Print Job Header") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var pjMatSelect = $("pjMatSelect");
        var pjMatCustomInput = $("pjMatCustomInput");
        var pjDateInput = $("pjDateInput");
        var pjQtyInput = $("pjQtyInput");
        var pjNoteInput = $("pjNoteInput");
        var pjWidthInput = $("pjWidthInput");
        var pjHeightInput = $("pjHeightInput");
        var pjUnitSelect = $("pjUnitSelect");
        var pjFontSizeSelect = $("pjFontSizeSelect");
        var pjColorSelect = $("pjColorSelect");
        var pjFontSelect = $("pjFontSelect");
        var chkPjExpand = $("chkPjExpand");
        var chkPjDark = $("chkPjDark");
        var btnPjSyncAb = $("btnPjSyncAb");
        var btnPjSubmit = $("btnPjSubmit");
        var alignBtns = embeddedContent.querySelectorAll("#pjAlignSegmented .embed-seg-btn");

        var pjTicketDate = $("pjTicketDate");
        var pjTicketMat = $("pjTicketMat");
        var pjTicketDim = $("pjTicketDim");
        var pjTicketNote = $("pjTicketNote");
        var pjTicketCard = $("pjTicketCard");
        var pjPreviousUnit = state.unit;

        // Same point conversions as OZO.toPoints / OZO.fromPoints in ExtendScript.
        function pjUnitToPoints(value, unit) {
            if (unit === "mm") return value * (72 / 25.4);
            if (unit === "cm") return value * (72 / 2.54);
            if (unit === "in") return value * 72;
            if (unit === "m") return value * (72000 / 25.4);
            return value; // pt
        }

        function pjPointsToUnit(points, unit) {
            if (unit === "mm") return points * (25.4 / 72);
            if (unit === "cm") return points * (2.54 / 72);
            if (unit === "in") return points / 72;
            if (unit === "m") return points * (25.4 / 72000);
            return points; // pt
        }

        function pjCleanNumber(value) {
            return String(Math.round(value * 100) / 100);
        }

        function getEffectiveMaterial() {
            if (pjMatSelect.value === "Custom") {
                return pjMatCustomInput.value.trim() || "Silk Light Box";
            }
            return pjMatSelect.value;
        }

        function hasPjKhmer(s) {
            return /[\u1780-\u17FF]/.test(String(s || ""));
        }

        function updateTicketPreview() {
            var mat = getEffectiveMaterial();
            var dt = pjDateInput.value.trim() || dStr;
            var w = pjWidthInput.value || "--";
            var h = pjHeightInput.value || "--";
            var u = pjUnitSelect.value;
            var q = pjQtyInput.value || "1";
            var n = pjNoteInput.value.trim();

            if ((hasPjKhmer(mat) || hasPjKhmer(n)) && pjFontSelect && pjFontSelect.value === "0") {
                pjFontSelect.value = "1";
                state.fontChoiceIndex = 1;
            }

            pjTicketDate.textContent = dt;
            pjTicketMat.textContent = mat;
            pjTicketDim.textContent = "w" + w + u + " x h" + h + u + " =" + q + "pcs";
            if (n) {
                pjTicketNote.textContent = n;
                pjTicketNote.style.display = "block";
            } else {
                pjTicketNote.style.display = "none";
            }

            // Text color preview: 0=White, 1=Yellow, 2=Cyan, 3=Black, 4=Magenta
            var colorIdx = parseInt(pjColorSelect.value, 10) || 0;
            var colors = ["#ffffff", "#ffd200", "#00d2ff", "#222222", "#ff2a85"];
            var textColor = colors[colorIdx] || "#ffffff";
            if (!chkPjDark.checked && colorIdx === 0) textColor = "#111111";
            pjTicketMat.style.color = textColor;

            // Dark box preview
            pjTicketCard.style.background = chkPjDark.checked ? "#080808" : "#f5f6f8";
            pjTicketCard.style.border = chkPjDark.checked ? "1px solid #333" : "1px solid var(--border-color)";
            pjTicketDim.style.color = chkPjDark.checked ? "#cfcfcf" : "#333333";
            pjTicketDate.style.color = chkPjDark.checked ? "#888888" : "#666666";

            var just = "left";
            if (state.alignmentIndex === 1) just = "center";
            else if (state.alignmentIndex === 2) just = "right";
            pjTicketDate.style.textAlign = just;
            pjTicketMat.style.textAlign = just;
            pjTicketDim.style.textAlign = just;
            pjTicketNote.style.textAlign = just;
        }

        function saveState() {
            state.material = getEffectiveMaterial();
            state.dateStr = pjDateInput.value.trim();
            state.qty = parseInt(pjQtyInput.value, 10) || 1;
            state.note = pjNoteInput.value.trim();
            state.widthVal = pjWidthInput.value;
            state.heightVal = pjHeightInput.value;
            state.unit = pjUnitSelect.value;
            state.fontSizeIndex = parseInt(pjFontSizeSelect.value, 10) || 0;
            state.textColorIndex = parseInt(pjColorSelect.value, 10) || 0;
            state.fontChoiceIndex = parseInt(pjFontSelect.value, 10) || 0;
            state.expandArtboard = chkPjExpand.checked;
            state.darkBox = chkPjDark.checked;
            store.setDebounced("ozo_printjob_settings", JSON.stringify(state), 250);
            updateTicketPreview();
        }

        pjMatSelect.addEventListener("change", function() {
            if (this.value === "Custom") {
                pjMatCustomInput.style.display = "block";
                pjMatCustomInput.focus();
            } else {
                pjMatCustomInput.style.display = "none";
                pjMatCustomInput.value = this.value;
            }
            saveState();
        });

        pjMatCustomInput.addEventListener("input", saveState);
        pjDateInput.addEventListener("input", saveState);
        pjQtyInput.addEventListener("input", saveState);
        pjNoteInput.addEventListener("input", saveState);
        pjWidthInput.addEventListener("input", saveState);
        pjHeightInput.addEventListener("input", saveState);
        pjUnitSelect.addEventListener("change", function() {
            var newUnit = pjUnitSelect.value;
            var wVal = parseFloat(String(pjWidthInput.value).replace(/,/g, "."));
            var hVal = parseFloat(String(pjHeightInput.value).replace(/,/g, "."));
            if (isFinite(wVal)) {
                pjWidthInput.value = pjCleanNumber(pjPointsToUnit(pjUnitToPoints(wVal, pjPreviousUnit), newUnit));
            }
            if (isFinite(hVal)) {
                pjHeightInput.value = pjCleanNumber(pjPointsToUnit(pjUnitToPoints(hVal, pjPreviousUnit), newUnit));
            }
            pjPreviousUnit = newUnit;
            saveState();
        });
        pjFontSizeSelect.addEventListener("change", saveState);
        pjColorSelect.addEventListener("change", saveState);
        pjFontSelect.addEventListener("change", saveState);
        chkPjExpand.addEventListener("change", saveState);
        chkPjDark.addEventListener("change", saveState);

        for (var ai = 0; ai < alignBtns.length; ai++) {
            alignBtns[ai].addEventListener("click", function() {
                for (var ab = 0; ab < alignBtns.length; ab++) alignBtns[ab].classList.remove("active");
                this.classList.add("active");
                state.alignmentIndex = parseInt(this.getAttribute("data-align"), 10);
                saveState();
            });
        }

        function fetchArtboardDefaults() {
            if (!csInterface) return;
            csInterface.evalScript("ozoGetPrintJobDefaults()", function(raw) {
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success") {
                    var oldUnit = pjPreviousUnit;
                    var existingW = parseFloat(String(pjWidthInput.value).replace(/,/g, "."));
                    var existingH = parseFloat(String(pjHeightInput.value).replace(/,/g, "."));
                    if (isFinite(existingW) && existingW > 0) {
                        pjWidthInput.value = pjCleanNumber(pjPointsToUnit(pjUnitToPoints(existingW, oldUnit), res.unit));
                    } else {
                        pjWidthInput.value = res.width;
                    }
                    if (isFinite(existingH) && existingH > 0) {
                        pjHeightInput.value = pjCleanNumber(pjPointsToUnit(pjUnitToPoints(existingH, oldUnit), res.unit));
                    } else {
                        pjHeightInput.value = res.height;
                    }
                    if (!pjDateInput.value) pjDateInput.value = res.dateStr;
                    pjUnitSelect.value = res.unit;
                    pjPreviousUnit = res.unit;
                    saveState();
                }
            });
        }

        btnPjSyncAb.addEventListener("click", function() {
            if (!csInterface) return;
            csInterface.evalScript("ozoGetPrintJobDefaults()", function(raw) {
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success") {
                    pjWidthInput.value = res.width;
                    pjHeightInput.value = res.height;
                    pjUnitSelect.value = res.unit;
                    pjPreviousUnit = res.unit;
                    if (res.dateStr) pjDateInput.value = res.dateStr;
                    saveState();
                    setStatus(isKhmer() ? "បានទាញយកទំហំ " + res.width + " x " + res.height + " " + res.unit : "Synced " + res.width + " x " + res.height + " " + res.unit + " from " + res.artboardName, "success", 3000);
                } else {
                    showError(isKhmer() ? "ពុំអាចយកទំហំបានទេ" : "Sync Failed", (res && res.message) || String(raw));
                }
            });
        });

        btnPjSubmit.addEventListener("click", function() {
            hideError();
            var w = parseFloat(String(pjWidthInput.value).replace(/,/g, "."));
            var h = parseFloat(String(pjHeightInput.value).replace(/,/g, "."));
            if (!w || w <= 0 || !h || h <= 0) {
                showError(isKhmer() ? "ទំហំមិនត្រឹមត្រូវ" : "Invalid Dimensions", isKhmer() ? "សូមបញ្ចូលទទឹង និងកម្ពស់ធំជាង 0" : "Width and Height must be greater than zero.");
                return;
            }

            btnPjSubmit.disabled = true;
            btnPjSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "កំពុងបង្កើត..." : "Generating Header...");
            setStatus(isKhmer() ? "កំពុងបង្កើតក្បាល File Print..." : "Creating print production header...", "running");

            var params = {
                material: getEffectiveMaterial(),
                dateStr: pjDateInput.value.trim() || dStr,
                widthVal: w,
                heightVal: h,
                unit: pjUnitSelect.value,
                qty: parseInt(pjQtyInput.value, 10) || 1,
                note: pjNoteInput.value.trim(),
                expandArtboard: chkPjExpand.checked,
                darkBox: chkPjDark.checked,
                textColorIndex: parseInt(pjColorSelect.value, 10) || 0,
                alignmentIndex: state.alignmentIndex,
                fontSizeIndex: parseInt(pjFontSizeSelect.value, 10) || 0,
                fontChoiceIndex: parseInt(pjFontSelect.value, 10) || 0
            };

            if (!csInterface) {
                setTimeout(function() {
                    btnPjSubmit.disabled = false;
                    btnPjSubmit.innerHTML = uiIcon("printer") + (isKhmer() ? "បង្កើតក្បាល File Print ឥឡូវនេះ" : "Generate Print Job Header");
                    setStatus("Simulated Print Job Header Created (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecutePrintJob(" + JSON.stringify(JSON.stringify(params)) + ")", function(raw) {
                btnPjSubmit.disabled = false;
                btnPjSubmit.innerHTML = uiIcon("printer") + (isKhmer() ? "បង្កើតក្បាល File Print ឥឡូវនេះ" : "Generate Print Job Header");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = isKhmer() ? "បានបង្កើតក្បាល File Print ដោយជោគជ័យលើ Layer " + res.layer : "Created Print Header (" + res.material + " | " + res.dimensions + ") on layer " + res.layer;
                    setStatus(okMsg, "success", 5000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to generate print job header");
                    showError(isKhmer() ? "ការបង្កើតបដាបរាជ័យ" : "Print Job Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        // Initialize defaults if width/height are empty
        if (!state.widthVal || !state.heightVal) {
            fetchArtboardDefaults();
        } else {
            updateTicketPreview();
        }
    }

    // -------------------------------------------------------------
    // In-Dock Object Count & Prepress Inspector View
    // -------------------------------------------------------------
    function renderEmbeddedCount() {
        embeddedContent.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:12px;">' + uiIcon("refresh", 16) + ' ' + (isKhmer() ? "កំពុងវិភាគឯកសារ..." : "Analyzing artwork...") + '</div>';

        function loadStats() {
            if (!csInterface) {
                renderCountDashboard({
                    status: "success",
                    docName: "Active Artwork.ai",
                    colorSpace: "CMYK",
                    unit: "cm",
                    artboardCount: 1,
                    layerCount: 4,
                    activeLayerName: "Layer 1",
                    selection: { count: 6, width: 38.2, height: 18.5, hasBounds: true },
                    activeLayerStats: { total: 42, paths: 28, groups: 4, texts: 4, images: 2, compounds: 4, other: 0 },
                    documentStats: { total: 120, paths: 85, groups: 12, texts: 10, images: 5, compounds: 8, other: 0 }
                });
                return;
            }

            csInterface.evalScript("ozoGetObjectCountStats()", function (raw) {
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success") {
                    renderCountDashboard(res);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to analyze artwork");
                    embeddedContent.innerHTML = '<div style="padding:16px;color:var(--danger);font-size:12px;">' + escapeHtml(errMsg) + '</div>';
                }
            });
        }

        function renderCountDashboard(data) {
            var html = [];
            var sel = data.selection || { count: 0 };
            var act = data.activeLayerStats || { total: 0, paths: 0, groups: 0, texts: 0, images: 0, compounds: 0, other: 0 };
            var docS = data.documentStats || { total: 0, paths: 0, groups: 0, texts: 0, images: 0, compounds: 0, other: 0 };

            // 1. Selection Inspector Card
            html.push('<div class="embed-card">');
            html.push('  <div class="embed-card-header">');
            html.push('    <span>' + (isKhmer() ? "វត្ថុដែលបានជ្រើសរើស (Selection)" : "Selection Inspector") + '</span>');
            html.push('    <span class="tool-badge ' + (sel.count > 0 ? "badge-prepress" : "") + '" style="font-weight:700;">' + sel.count + ' ' + (isKhmer() ? "វត្ថុ" : "selected") + '</span>');
            html.push('  </div>');
            if (sel.count > 0 && sel.hasBounds) {
                html.push('  <div class="stat-summary-grid">');
                html.push('    <div class="stat-box">');
                html.push('      <span class="stat-box-val">' + sel.width + ' <small style="font-size:11px;">' + data.unit + '</small></span>');
                html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "ទទឹង (Width)" : "Selection Width") + '</span>');
                html.push('    </div>');
                html.push('    <div class="stat-box">');
                html.push('      <span class="stat-box-val">' + sel.height + ' <small style="font-size:11px;">' + data.unit + '</small></span>');
                html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "កម្ពស់ (Height)" : "Selection Height") + '</span>');
                html.push('    </div>');
                html.push('  </div>');
            } else {
                html.push('  <div style="font-size:11px;color:var(--text-muted);padding:4px 0;">' + (isKhmer() ? "ពុំទាន់បានជ្រើសរើស Artwork ទេ - បង្ហាញស្ថិតិទូទៅខាងក្រោម" : "No artwork selected. Displaying active layer & document stats below.") + '</div>');
            }
            html.push('</div>');

            // 2. Document & Layer Overview
            html.push('<div class="embed-card">');
            html.push('  <div class="embed-card-header">');
            html.push('    <span>' + (isKhmer() ? "ស្ថិតិឯកសារ (Document Overview)" : "Document Overview") + '</span>');
            html.push('    <span class="tool-badge" style="font-family:monospace;font-size:10px;">' + escapeHtml(data.colorSpace) + '</span>');
            html.push('  </div>');
            html.push('  <div class="stat-summary-grid">');
            html.push('    <div class="stat-box">');
            html.push('      <span class="stat-box-val">' + data.artboardCount + '</span>');
            html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "ផ្ទាំងគំនូរ (Artboards)" : "Artboards") + '</span>');
            html.push('    </div>');
            html.push('    <div class="stat-box">');
            html.push('      <span class="stat-box-val">' + data.layerCount + '</span>');
            html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "ស្រទាប់ (Layers)" : "Layers") + '</span>');
            html.push('    </div>');
            html.push('    <div class="stat-box">');
            html.push('      <span class="stat-box-val">' + act.total + '</span>');
            html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "Layer សកម្ម (" + escapeHtml(data.activeLayerName) + ")" : "Active Layer (" + escapeHtml(data.activeLayerName) + ")") + '</span>');
            html.push('    </div>');
            html.push('    <div class="stat-box">');
            html.push('      <span class="stat-box-val">' + docS.total + '</span>');
            html.push('      <span class="stat-box-lbl">' + (isKhmer() ? "វត្ថុសរុបក្នុងឯកសារ" : "Total Document Items") + '</span>');
            html.push('    </div>');
            html.push('  </div>');
            html.push('</div>');

            // 3. Object Types Breakdown
            html.push('<div class="embed-card">');
            html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ប្រភេទវត្ថុក្នុង Layer សកម្ម (Active Layer Types)" : "Active Layer Type Breakdown") + '</span></div>');
            html.push('  <div class="stat-pill-list">');
            html.push('    <div class="stat-pill"><span>' + uiIcon("path", 12) + (isKhmer() ? "Paths:" : "Paths:") + '</span><span class="stat-pill-val">' + act.paths + '</span></div>');
            html.push('    <div class="stat-pill"><span>' + uiIcon("folder", 12) + (isKhmer() ? "Groups:" : "Groups:") + '</span><span class="stat-pill-val">' + act.groups + '</span></div>');
            html.push('    <div class="stat-pill"><span>' + uiIcon("text", 12) + (isKhmer() ? "Text:" : "Text:") + '</span><span class="stat-pill-val">' + act.texts + '</span></div>');
            html.push('    <div class="stat-pill"' + (act.images > 0 ? ' style="border-color:#e6a23c;"' : '') + '><span>' + uiIcon("image", 12) + (isKhmer() ? "Images:" : "Images:") + '</span><span class="stat-pill-val"' + (act.images > 0 ? ' style="color:#e6a23c;"' : '') + '>' + act.images + '</span></div>');
            html.push('    <div class="stat-pill"><span>' + uiIcon("compound", 12) + (isKhmer() ? "Compounds:" : "Compounds:") + '</span><span class="stat-pill-val">' + act.compounds + '</span></div>');
            html.push('    <div class="stat-pill"><span>' + uiIcon("dots", 12) + (isKhmer() ? "Other:" : "Other:") + '</span><span class="stat-pill-val">' + act.other + '</span></div>');
            html.push('  </div>');
            html.push('</div>');

            // 4. Quick Actions
            html.push('<div class="embed-action-wrap" style="gap:8px;">');
            html.push('  <button type="button" id="btnCountRefresh" class="btn-action-primary">' + uiIcon("refresh") + (isKhmer() ? "វិភាគម្ដងទៀត (Refresh)" : "Refresh Statistics") + '</button>');
            html.push('  <div style="display:flex;gap:8px;width:100%;">');
            html.push('    <button type="button" id="btnCountSelectAb" class="btn-action-secondary" style="flex:1;">' + uiIcon("select", 12) + (isKhmer() ? "ជ្រើសលើ Artboard" : "Select Artboard") + '</button>');
            html.push('    <button type="button" id="btnCountDeselect" class="btn-action-secondary" style="flex:1;">' + uiIcon("x", 12) + (isKhmer() ? "ដោះការជ្រើសរើស" : "Deselect") + '</button>');
            html.push('  </div>');
            html.push('</div>');

            embeddedContent.innerHTML = html.join("\n");

            $("btnCountRefresh").addEventListener("click", loadStats);
            $("btnCountSelectAb").addEventListener("click", function() {
                if (csInterface) {
                    csInterface.evalScript("ozoSelectAllOnActiveArtboard()", function() { loadStats(); });
                }
            });
            $("btnCountDeselect").addEventListener("click", function() {
                if (csInterface) {
                    csInterface.evalScript("ozoDeselectAll()", function() { loadStats(); });
                }
            });
        }

        loadStats();
    }

    // -------------------------------------------------------------
    // In-Dock Sequential Numbering View
    // -------------------------------------------------------------
    function renderEmbeddedNumbering() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_numbering_settings", "{}")); } catch (e) {}

        var state = {
            start: saved.start !== undefined ? saved.start : 1,
            end: saved.end !== undefined ? saved.end : 10,
            prefix: saved.prefix || "",
            suffix: saved.suffix || "",
            padding: saved.padding !== undefined ? saved.padding : 3,
            layout: saved.layout !== undefined ? saved.layout : 0, // 0: Grid, 1: Artboards
            columns: saved.columns !== undefined ? saved.columns : 5,
            horizontalStep: saved.horizontalStep !== undefined ? saved.horizontalStep : 30,
            verticalStep: saved.verticalStep !== undefined ? saved.verticalStep : 15,
            unit: saved.unit || "mm",
            templateAction: saved.templateAction !== undefined ? saved.templateAction : 0 // 0: Hide, 1: Lock, 2: Keep
        };

        var html = [];

        // Helper function for format preview
        function formatSample(num, pad) {
            var s = String(num);
            while (s.length < pad) s = "0" + s;
            return s;
        }

        // 1. Live Ticket Preview Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="numLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 2. Sequence Values Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "តម្លៃលេខរៀង (Sequence Range)" : "Sequence Range") + '</span></div>');
        html.push('  <div class="embed-row-3col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចាប់ផ្តើម:" : "Start:") + '</label>');
        html.push('      <input type="number" id="numStartInput" class="embed-input" value="' + state.start + '" step="1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "បញ្ចប់:" : "End:") + '</label>');
        html.push('      <input type="number" id="numEndInput" class="embed-input" value="' + state.end + '" step="1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនខ្ទង់:" : "Digits:") + '</label>');
        html.push('      <select id="numPaddingSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var pads = [
            { v: 0, l: "None (1, 2...)" },
            { v: 2, l: "2 (01, 02...)" },
            { v: 3, l: "3 (001, 002...)" },
            { v: 4, l: "4 (0001...)" },
            { v: 5, l: "5 (00001...)" },
            { v: 6, l: "6 (000001...)" }
        ];
        for (var pi = 0; pi < pads.length; pi++) {
            html.push('        <option value="' + pads[pi].v + '" ' + (state.padding === pads[pi].v ? "selected" : "") + '>' + pads[pi].l + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 3. Affixes Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "អក្សរមុខ-ក្រោយ (Prefix & Suffix)" : "Prefix & Suffix") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "អក្សរខាងមុខ (Prefix):" : "Prefix:") + '</label>');
        html.push('      <input type="text" id="numPrefixInput" class="embed-input" value="' + escapeHtml(state.prefix) + '" placeholder="e.g. INV-" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "អក្សរខាងក្រោយ (Suffix):" : "Suffix:") + '</label>');
        html.push('      <input type="text" id="numSuffixInput" class="embed-input" value="' + escapeHtml(state.suffix) + '" placeholder="e.g. -A" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Layout Mode Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទម្រង់នៃការរៀបចំ (Placement)" : "Placement Mode") + '</span></div>');
        html.push('  <div class="embed-segmented" id="numLayoutSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.layout === 0 ? "active" : "") + '" data-layout="0">' + uiIcon("grid", 12) + (isKhmer() ? "ក្រឡាចត្រង្គ (Grid Repeat)" : "Grid Repeat") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.layout === 1 ? "active" : "") + '" data-layout="1">' + uiIcon("file", 12) + (isKhmer() ? "តាម Artboards" : "Across Artboards") + '</button>');
        html.push('  </div>');

        html.push('  <div id="numGridOptions" style="margin-top:10px;' + (state.layout === 0 ? "" : "display:none;") + '">');
        html.push('    <div class="embed-row-3col">');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនជួរឈរ:" : "Columns:") + '</label>');
        html.push('        <input type="number" id="numColsInput" class="embed-input" value="' + state.columns + '" min="1" max="100" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតដេក (X):" : "Step X:") + '</label>');
        html.push('        <input type="number" id="numStepXInput" class="embed-input" value="' + state.horizontalStep + '" step="1" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតឈរ (Y):" : "Step Y:") + '</label>');
        html.push('        <input type="number" id="numStepYInput" class="embed-input" value="' + state.verticalStep + '" step="1" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('    </div>');
        html.push('    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាតគម្លាត:" : "Step Unit:") + '</label>');
        html.push('      <select id="numUnitSelect" class="embed-select" style="width:80px;">');
        var nUnits = ["mm", "cm", "in", "pt"];
        for (var nu = 0; nu < nUnits.length; nu++) {
            html.push('        <option value="' + nUnits[nu] + '" ' + (state.unit === nUnits[nu] ? "selected" : "") + '>' + nUnits[nu] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');

        html.push('  <div id="numAbOptions" style="margin-top:10px;' + (state.layout === 1 ? "" : "display:none;") + '">');
        html.push('    <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">' + (isKhmer() ? "ដាក់លេខរៀង ១ លើផ្ទាំងគំនូរ Artboard នីមួយៗ ដោយយកទីតាំងតាមប្រអប់អត្ថបទគំរូ" : "Places 1 sequential number on each Artboard at the exact relative position of the template text.") + '</div>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Template Action Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "សកម្មភាពលើអក្សរគំរូ (Template Frame)" : "Template Text Frame") + '</span></div>');
        html.push('  <select id="numTemplateSelect" class="embed-select" style="width:100%;">');
        var tActions = [
            isKhmer() ? "លាក់អក្សរគំរូដើម (Hide original - Recommended)" : "Hide original text frame (Recommended)",
            isKhmer() ? "ចាក់សោអក្សរគំរូដើម (Lock original)" : "Lock original text frame",
            isKhmer() ? "រក្សាទុកធម្មតា (Keep original)" : "Keep original text frame untouched"
        ];
        for (var tai = 0; tai < tActions.length; tai++) {
            html.push('    <option value="' + tai + '" ' + (state.templateAction === tai ? "selected" : "") + '>' + tActions[tai] + '</option>');
        }
        html.push('  </select>');
        html.push('</div>');

        // 6. Action Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnNumSubmit" class="btn-action-primary">' + uiIcon("hash") + (isKhmer() ? "បង្កើតលេខរៀងឥឡូវនេះ" : "Generate Sequence Numbers") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var numStartInput = $("numStartInput");
        var numEndInput = $("numEndInput");
        var numPaddingSelect = $("numPaddingSelect");
        var numPrefixInput = $("numPrefixInput");
        var numSuffixInput = $("numSuffixInput");
        var numColsInput = $("numColsInput");
        var numStepXInput = $("numStepXInput");
        var numStepYInput = $("numStepYInput");
        var numUnitSelect = $("numUnitSelect");
        var numTemplateSelect = $("numTemplateSelect");
        var btnNumSubmit = $("btnNumSubmit");
        var numSamplePill = $("numSamplePill");
        var numTotalBadge = $("numTotalBadge");
        var layoutBtns = embeddedContent.querySelectorAll("#numLayoutSegmented .embed-seg-btn");
        var numGridOptions = $("numGridOptions");
        var numAbOptions = $("numAbOptions");

        function updateSamplePreview() {
            var st = parseInt(numStartInput.value, 10) || 1;
            var en = parseInt(numEndInput.value, 10) || 10;
            var pad = parseInt(numPaddingSelect.value, 10) || 0;
            var pfx = numPrefixInput.value || "";
            var sfx = numSuffixInput.value || "";
            var cnt = Math.abs(en - st) + 1;

            if (numTotalBadge) numTotalBadge.textContent = cnt + (isKhmer() ? " លេខ" : " numbers");
            var sample1 = pfx + formatSample(st, pad) + sfx;
            var sample2 = pfx + formatSample(en, pad) + sfx;
            if (numSamplePill) numSamplePill.textContent = sample1 + "  ...  " + sample2;

            var rangeStr = sample1 + "  ...  " + sample2 + " (" + cnt + (isKhmer() ? " លេខ" : " numbers") + ")";

            var layoutText = (state.layout === 0)
                ? (isKhmer() ? "ក្រឡាចត្រង្គ: " + (numColsInput ? numColsInput.value : state.columns) + " ជួរឈរ \u2022 គម្លាត " + (numStepXInput ? numStepXInput.value : state.horizontalStep) + "\u00d7" + (numStepYInput ? numStepYInput.value : state.verticalStep) + (numUnitSelect ? numUnitSelect.value : state.unit) : "Grid Repeat: " + (numColsInput ? numColsInput.value : state.columns) + " cols \u2022 Step " + (numStepXInput ? numStepXInput.value : state.horizontalStep) + "\u00d7" + (numStepYInput ? numStepYInput.value : state.verticalStep) + (numUnitSelect ? numUnitSelect.value : state.unit))
                : (isKhmer() ? "តាម Artboards (១ លេខក្នុង ១ ផ្ទាំង)" : "Across Artboards (1 number per artboard)");

            var noteParts = [];
            if (pad > 0) noteParts.push((isKhmer() ? "ចំនួនខ្ទង់៖ " : "Digits: ") + pad);
            var tActions = [
                isKhmer() ? "លាក់អក្សរគំរូដើម" : "Hide original text",
                isKhmer() ? "ចាក់សោអក្សរគំរូដើម" : "Lock original text",
                isKhmer() ? "រក្សាទុកអក្សរគំរូដើម" : "Keep original text"
            ];
            noteParts.push(tActions[state.templateAction] || tActions[0]);

            var box = $("numLiveTicket");
            if (box) {
                var html = '';
                html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Sequential Numbering</div>';
                html += '<div class="ticket-line-mat">' + escapeHtml(rangeStr) + '</div>';
                html += '<div class="ticket-line-dim">' + escapeHtml(layoutText) + '</div>';
                html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';
                box.innerHTML = html;
            }
        }

        function saveNumState() {
            state.start = parseInt(numStartInput.value, 10) || 1;
            state.end = parseInt(numEndInput.value, 10) || 10;
            state.padding = parseInt(numPaddingSelect.value, 10) || 0;
            state.prefix = numPrefixInput.value;
            state.suffix = numSuffixInput.value;
            state.columns = parseInt(numColsInput.value, 10) || 5;
            state.horizontalStep = parseFloat(numStepXInput.value) || 30;
            state.verticalStep = parseFloat(numStepYInput.value) || 15;
            state.unit = numUnitSelect.value;
            state.templateAction = parseInt(numTemplateSelect.value, 10) || 0;
            store.setDebounced("ozo_numbering_settings", JSON.stringify(state), 250);
            updateSamplePreview();
        }

        numStartInput.addEventListener("input", saveNumState);
        numEndInput.addEventListener("input", saveNumState);
        numPaddingSelect.addEventListener("change", saveNumState);
        numPrefixInput.addEventListener("input", saveNumState);
        numSuffixInput.addEventListener("input", saveNumState);
        numColsInput.addEventListener("input", saveNumState);
        numStepXInput.addEventListener("input", saveNumState);
        numStepYInput.addEventListener("input", saveNumState);
        numUnitSelect.addEventListener("change", saveNumState);
        numTemplateSelect.addEventListener("change", saveNumState);

        for (var li = 0; li < layoutBtns.length; li++) {
            layoutBtns[li].addEventListener("click", function() {
                for (var lb = 0; lb < layoutBtns.length; lb++) layoutBtns[lb].classList.remove("active");
                this.classList.add("active");
                state.layout = parseInt(this.getAttribute("data-layout"), 10);
                if (state.layout === 0) {
                    numGridOptions.style.display = "block";
                    numAbOptions.style.display = "none";
                } else {
                    numGridOptions.style.display = "none";
                    numAbOptions.style.display = "block";
                }
                saveNumState();
            });
        }

        btnNumSubmit.addEventListener("click", function() {
            hideError();
            btnNumSubmit.disabled = true;
            btnNumSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងដំណើរការ..." : "Generating...");
            setStatus(isKhmer() ? "កំពុងបង្កើតលេខរៀង..." : "Generating sequential numbers...", "running");

            var params = {
                start: parseInt(numStartInput.value, 10) || 1,
                end: parseInt(numEndInput.value, 10) || 10,
                prefix: numPrefixInput.value || "",
                suffix: numSuffixInput.value || "",
                padding: parseInt(numPaddingSelect.value, 10) || 0,
                layout: state.layout,
                columns: parseInt(numColsInput.value, 10) || 5,
                horizontalStep: parseFloat(numStepXInput.value) || 30,
                verticalStep: parseFloat(numStepYInput.value) || 15,
                unit: numUnitSelect.value,
                templateAction: parseInt(numTemplateSelect.value, 10) || 0
            };

            if (!csInterface) {
                setTimeout(function() {
                    btnNumSubmit.disabled = false;
                    btnNumSubmit.innerHTML = uiIcon("hash") + (isKhmer() ? "បង្កើតលេខរៀងឥឡូវនេះ" : "Generate Sequence Numbers");
                    setStatus("Simulated Numbers Generated (Browser Preview)", "success", 4000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteSequentialNumbering(" + JSON.stringify(JSON.stringify(params)) + ")", function(raw) {
                btnNumSubmit.disabled = false;
                btnNumSubmit.innerHTML = uiIcon("hash") + (isKhmer() ? "បង្កើតលេខរៀងឥឡូវនេះ" : "Generate Sequence Numbers");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = isKhmer() ? "បានបង្កើតលេខរៀង " + res.count + " ដោយជោគជ័យលើ Layer " + res.layer : "Generated " + res.count + " numbers on layer " + res.layer;
                    setStatus(okMsg, "success", 5000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to generate sequence numbers");
                    showError(isKhmer() ? "ការបង្កើតលេខរៀងបរាជ័យ" : "Numbering Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        updateSamplePreview();
    }

    // -------------------------------------------------------------
    // In-Dock Pathfinder View
    // -------------------------------------------------------------
    function renderEmbeddedPathfinder() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_pathfinder_settings", "{}")); } catch (e) {}

        var state = {
            expandResult: saved.expandResult !== false,
            ungroupResult: saved.ungroupResult !== false,
            cleanGroups: saved.cleanGroups !== false,
            keepOriginals: saved.keepOriginals === true,
            pairwise: saved.pairwise === true
        };

        var operations = [
            { id: 0, name: "Unite", nameKm: "ផ្គុំចូលគ្នា", icon: uiIcon("unite", 20), desc: "Combine overlapping objects into one shape" },
            { id: 1, name: "Minus Front", nameKm: "ដកខាងមុខ", icon: uiIcon("minusfront", 20), desc: "Subtract front objects from back object" },
            { id: 2, name: "Intersect", nameKm: "កាត់យកចំណុចប្រសព្វ", icon: uiIcon("intersect", 20), desc: "Keep only overlapping areas" },
            { id: 3, name: "Exclude", nameKm: "ដកចំណុចប្រសព្វ", icon: uiIcon("exclude", 20), desc: "Remove overlapping regions" },
            { id: 4, name: "Divide", nameKm: "ពុះបំបែក", icon: uiIcon("divide", 20), desc: "Split artwork where objects overlap" },
            { id: 5, name: "Trim", nameKm: "កាត់តម្រឹម", icon: uiIcon("trim", 20), desc: "Remove hidden portions" },
            { id: 6, name: "Merge", nameKm: "ច្របាច់បញ្ចូល", icon: uiIcon("merge", 20), desc: "Merge adjoining objects with same fill" },
            { id: 7, name: "Crop", nameKm: "កាត់យកទំហំ", icon: uiIcon("crop", 20), desc: "Crop to boundary of front object" },
            { id: 8, name: "Outline", nameKm: "បន្ទាត់គ្រោង", icon: uiIcon("outline", 20), desc: "Convert overlaps into outlined edges" },
            { id: 9, name: "Minus Back", nameKm: "ដកខាងក្រោយ", icon: uiIcon("minusback", 20), desc: "Subtract back objects from front object" }
        ];

        var html = [];

        // 1. Shape Modes Grid
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ប្រតិបត្តិការរូបរាង (Pathfinder Modes)" : "Pathfinder Operations") + '</span></div>');
        html.push('  <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:6px;">' + (isKhmer() ? "ចុចប៊ូតុងណាមួយដើម្បីអនុវត្តលើ Artwork ដែលបានជ្រើសរើស៖" : "Click an operation button to apply instantly to selected artwork:") + '</div>');
        html.push('  <div class="embed-pf-grid">');
        for (var oi = 0; oi < operations.length; oi++) {
            var op = operations[oi];
            html.push('    <button type="button" class="embed-pf-btn" data-op="' + op.id + '" title="' + escapeHtml(op.desc) + '">');
            html.push('      <span class="embed-pf-icon">' + op.icon + '</span>');
            html.push('      <span class="embed-pf-name">' + (isKhmer() ? escapeHtml(op.nameKm) : escapeHtml(op.name)) + '</span>');
            html.push('    </button>');
        }
        html.push('  </div>');
        html.push('</div>');

        // 2. Options Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ជម្រើសកែសម្រួល (Options)" : "Execution Options") + '</span></div>');
        html.push('  <div style="display:flex;flex-direction:column;gap:6px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPfExpand" ' + (state.expandResult ? "checked" : "") + '> ' + (isKhmer() ? "ពង្រីករូបរាងលទ្ធផល (Expand Result)" : "Expand Pathfinder effects to editable shapes") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPfUngroup" ' + (state.ungroupResult ? "checked" : "") + '> ' + (isKhmer() ? "ពន្លា Group ស្វ័យប្រវត្តិ (Ungroup)" : "Ungroup result items automatically") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPfClean" ' + (state.cleanGroups ? "checked" : "") + '> ' + (isKhmer() ? "សម្អាត Group ទទេ (Clean Empty Groups)" : "Clean unpainted and empty groups") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkPfKeep" ' + (state.keepOriginals ? "checked" : "") + '> ' + (isKhmer() ? "រក្សាទុកវត្ថុដើម (Keep Original Objects)" : "Keep original objects untouched (Duplicate)") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var chkPfExpand = $("chkPfExpand");
        var chkPfUngroup = $("chkPfUngroup");
        var chkPfClean = $("chkPfClean");
        var chkPfKeep = $("chkPfKeep");
        var pfBtns = embeddedContent.querySelectorAll(".embed-pf-btn");

        function savePfState() {
            state.expandResult = chkPfExpand.checked;
            state.ungroupResult = chkPfUngroup.checked;
            state.cleanGroups = chkPfClean.checked;
            state.keepOriginals = chkPfKeep.checked;
            store.setDebounced("ozo_pathfinder_settings", JSON.stringify(state), 250);
        }

        chkPfExpand.addEventListener("change", savePfState);
        chkPfUngroup.addEventListener("change", savePfState);
        chkPfClean.addEventListener("change", savePfState);
        chkPfKeep.addEventListener("change", savePfState);

        for (var bi = 0; bi < pfBtns.length; bi++) {
            pfBtns[bi].addEventListener("click", function() {
                var opId = parseInt(this.getAttribute("data-op"), 10);
                var opObj = operations[opId] || operations[0];
                hideError();
                setStatus((isKhmer() ? "កំពុងអនុវត្ត " + opObj.nameKm + "..." : "Applying " + opObj.name + "..."), "running");

                var params = {
                    operation: opId,
                    expandResult: chkPfExpand.checked,
                    ungroupResult: chkPfUngroup.checked,
                    cleanGroups: chkPfClean.checked,
                    keepOriginals: chkPfKeep.checked,
                    pairwise: false
                };

                if (!csInterface) {
                    setStatus("Simulated " + opObj.name + " applied (Browser Preview)", "success", 3000);
                    return;
                }

                csInterface.evalScript("ozoExecutePathfinder(" + JSON.stringify(JSON.stringify(params)) + ")", function(raw) {
                    var res = null;
                    try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                    if (res && res.status === "success") {
                        var okMsg = isKhmer() ? "បានអនុវត្ត " + opObj.nameKm + " ដោយជោគជ័យលើ Artwork" : "Successfully applied " + opObj.name + " (" + res.resultCount + " result objects)";
                        setStatus(okMsg, "success", 4000);
                    } else {
                        var errMsg = (res && res.message) || String(raw || "Failed to execute Pathfinder");
                        showError(isKhmer() ? "Pathfinder បរាជ័យ" : "Pathfinder Failed", errMsg);
                        setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                    }
                });
            });
        }
    }

    // -------------------------------------------------------------
    // In-Dock New Guide Layout View
    // -------------------------------------------------------------
    function renderEmbeddedGuides() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_guidelayout_settings", "{}")); } catch (e) {}

        var state = {
            targetIndex: saved.targetIndex !== undefined ? saved.targetIndex : 0, // 0: Active AB, 1: All ABs, 2: Selection
            useColumns: saved.useColumns !== false,
            colCount: saved.colCount !== undefined ? saved.colCount : 12,
            colGutter: saved.colGutter !== undefined ? saved.colGutter : 5,
            colWidth: saved.colWidth || "",
            centerColumns: saved.centerColumns !== false,

            useRows: saved.useRows === true,
            rowCount: saved.rowCount !== undefined ? saved.rowCount : 4,
            rowGutter: saved.rowGutter !== undefined ? saved.rowGutter : 5,
            rowHeight: saved.rowHeight || "",
            centerRows: saved.centerRows !== false,

            useMargin: saved.useMargin === true,
            marginTop: saved.marginTop !== undefined ? saved.marginTop : 10,
            marginLeft: saved.marginLeft !== undefined ? saved.marginLeft : 10,
            marginBottom: saved.marginBottom !== undefined ? saved.marginBottom : 10,
            marginRight: saved.marginRight !== undefined ? saved.marginRight : 10,

            unit: saved.unit || "mm",
            clearGuides: saved.clearGuides !== false,
            colorIndex: saved.colorIndex !== undefined ? saved.colorIndex : 0
        };

        var guideColors = [
            { name: "Cyan", hex: "#00ffff" },
            { name: "Light Blue", hex: "#4da6ff" },
            { name: "Magenta", hex: "#ff00ff" },
            { name: "Yellow", hex: "#ffff00" },
            { name: "Green", hex: "#00ff00" },
            { name: "Red", hex: "#ff0000" }
        ];

        var html = [];

        // 0. Live Guides Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="glLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Presets & Target Bar
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "គោលដៅ និងទម្រង់គំរូ (Target & Presets)" : "Target & Presets") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "អនុវត្តលើ (Target):" : "Target:") + '</label>');
        html.push('      <select id="glTargetSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="0" ' + (state.targetIndex === 0 ? "selected" : "") + '>' + (isKhmer() ? "Artboard សកម្ម" : "Active Artboard") + '</option>');
        html.push('        <option value="1" ' + (state.targetIndex === 1 ? "selected" : "") + '>' + (isKhmer() ? "គ្រប់ Artboards ទាំងអស់" : "All Artboards") + '</option>');
        html.push('        <option value="2" ' + (state.targetIndex === 2 ? "selected" : "") + '>' + (isKhmer() ? "Artwork ដែលបានជ្រើស" : "Selected Artwork") + '</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទម្រង់គំរូ (Preset):" : "Preset:") + '</label>');
        html.push('      <select id="glPresetSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="custom">' + (isKhmer() ? "កំណត់ដោយខ្លួនឯង" : "Custom Layout") + '</option>');
        html.push('        <option value="col12">12-Column Grid (5mm)</option>');
        html.push('        <option value="col8">8-Column Grid (5mm)</option>');
        html.push('        <option value="col3">3-Column Grid</option>');
        html.push('        <option value="grid2x2">2x2 Grid (Quarter)</option>');
        html.push('        <option value="crosshair">Center Crosshair</option>');
        html.push('        <option value="margin5">Prepress Margin (5mm)</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Columns Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header">');
        html.push('    <label class="embed-check-row" style="font-weight:700;"><input type="checkbox" id="chkGlColumns" ' + (state.useColumns ? "checked" : "") + '> ' + (isKhmer() ? "ជួរឈរ (Columns)" : "Columns") + '</label>');
        html.push('  </div>');
        html.push('  <div id="glColsBody" class="embed-row-3col" style="' + (state.useColumns ? "" : "opacity:0.4;pointer-events:none;") + '">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួន:" : "Count:") + '</label>');
        html.push('      <input type="number" id="glColCountInput" class="embed-input" value="' + state.colCount + '" min="1" max="100" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាត (Gutter):" : "Gutter:") + '</label>');
        html.push('      <input type="number" id="glColGutterInput" class="embed-input" value="' + state.colGutter + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទទឹង (Width):" : "Width:") + '</label>');
        html.push('      <input type="number" id="glColWidthInput" class="embed-input" value="' + state.colWidth + '" placeholder="Auto" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 3. Rows Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header">');
        html.push('    <label class="embed-check-row" style="font-weight:700;"><input type="checkbox" id="chkGlRows" ' + (state.useRows ? "checked" : "") + '> ' + (isKhmer() ? "ជួរដេក (Rows)" : "Rows") + '</label>');
        html.push('  </div>');
        html.push('  <div id="glRowsBody" class="embed-row-3col" style="' + (state.useRows ? "" : "opacity:0.4;pointer-events:none;") + '">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួន:" : "Count:") + '</label>');
        html.push('      <input type="number" id="glRowCountInput" class="embed-input" value="' + state.rowCount + '" min="1" max="100" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាត (Gutter):" : "Gutter:") + '</label>');
        html.push('      <input type="number" id="glRowGutterInput" class="embed-input" value="' + state.rowGutter + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កម្ពស់ (Height):" : "Height:") + '</label>');
        html.push('      <input type="number" id="glRowHeightInput" class="embed-input" value="' + state.rowHeight + '" placeholder="Auto" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Margins Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header">');
        html.push('    <label class="embed-check-row" style="font-weight:700;"><input type="checkbox" id="chkGlMargin" ' + (state.useMargin ? "checked" : "") + '> ' + (isKhmer() ? "គែមសងខាង (Margins)" : "Margins") + '</label>');
        html.push('  </div>');
        html.push('  <div id="glMarginsBody" style="' + (state.useMargin ? "" : "opacity:0.4;pointer-events:none;") + '">');
        html.push('    <div class="embed-row-2col">');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "លើ (Top):" : "Top:") + '</label>');
        html.push('        <input type="number" id="glMarginTopInput" class="embed-input" value="' + state.marginTop + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឆ្វេង (Left):" : "Left:") + '</label>');
        html.push('        <input type="number" id="glMarginLeftInput" class="embed-input" value="' + state.marginLeft + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('    </div>');
        html.push('    <div class="embed-row-2col" style="margin-top:4px;">');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ក្រោម (Bottom):" : "Bottom:") + '</label>');
        html.push('        <input type="number" id="glMarginBottomInput" class="embed-input" value="' + state.marginBottom + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('      <div>');
        html.push('        <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ស្តាំ (Right):" : "Right:") + '</label>');
        html.push('        <input type="number" id="glMarginRightInput" class="embed-input" value="' + state.marginRight + '" step="0.5" min="0" style="width:100%;margin-top:2px;">');
        html.push('      </div>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Guide Options & Color
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ពណ៌បន្ទាត់ និងជម្រើស" : "Guide Color & Options") + '</span></div>');
        html.push('  <div class="guide-color-row">');
        html.push('    <div class="guide-swatch-list" id="glColorSwatches">');
        for (var ci = 0; ci < guideColors.length; ci++) {
            var gc = guideColors[ci];
            html.push('      <span class="guide-swatch-dot ' + (state.colorIndex === ci ? "active" : "") + '" data-color="' + ci + '" style="background:' + gc.hex + ';" title="' + gc.name + '"></span>');
        }
        html.push('    </div>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាត:" : "Unit:") + '</label>');
        html.push('      <select id="glUnitSelect" class="embed-select" style="width:75px;">');
        var glUnits = ["mm", "cm", "in", "pt"];
        for (var glu = 0; glu < glUnits.length; glu++) {
            html.push('        <option value="' + glUnits[glu] + '" ' + (state.unit === glUnits[glu] ? "selected" : "") + '>' + glUnits[glu] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkGlClear" ' + (state.clearGuides ? "checked" : "") + '> ' + (isKhmer() ? "លុបបន្ទាត់ចាស់ៗចេញមុន (Clear existing guides)" : "Clear existing guides in target area first") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 6. Action Wrap
        html.push('<div class="embed-action-wrap" style="gap:8px;">');
        html.push('  <button type="button" id="btnGlSubmit" class="btn-action-primary">' + uiIcon("grid") + (isKhmer() ? "បង្កើតបន្ទាត់ណែនាំ (Generate Guides)" : "Generate Guide Layout") + '</button>');
        html.push('  <button type="button" id="btnGlClearOnly" class="btn-action-secondary">' + uiIcon("trash") + (isKhmer() ? "លុបបន្ទាត់ណែនាំចេញ (Clear Guides Only)" : "Clear Guides Only") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var glTargetSelect = $("glTargetSelect");
        var glPresetSelect = $("glPresetSelect");
        var chkGlColumns = $("chkGlColumns");
        var glColsBody = $("glColsBody");
        var glColCountInput = $("glColCountInput");
        var glColGutterInput = $("glColGutterInput");
        var glColWidthInput = $("glColWidthInput");
        var chkGlRows = $("chkGlRows");
        var glRowsBody = $("glRowsBody");
        var glRowCountInput = $("glRowCountInput");
        var glRowGutterInput = $("glRowGutterInput");
        var glRowHeightInput = $("glRowHeightInput");
        var chkGlMargin = $("chkGlMargin");
        var glMarginsBody = $("glMarginsBody");
        var glMarginTopInput = $("glMarginTopInput");
        var glMarginLeftInput = $("glMarginLeftInput");
        var glMarginBottomInput = $("glMarginBottomInput");
        var glMarginRightInput = $("glMarginRightInput");
        var glUnitSelect = $("glUnitSelect");
        var chkGlClear = $("chkGlClear");
        var btnGlSubmit = $("btnGlSubmit");
        var btnGlClearOnly = $("btnGlClearOnly");
        var swatchDots = embeddedContent.querySelectorAll("#glColorSwatches .guide-swatch-dot");

        function updateGlTicket() {
            var box = $("glLiveTicket");
            if (!box) return;
            var targetNames = [
                isKhmer() ? "Artboard សកម្ម (Active Artboard)" : "Target: Active Artboard",
                isKhmer() ? "គ្រប់ Artboards (All Artboards)" : "Target: All Artboards",
                isKhmer() ? "វត្ថុជ្រើសរើស (Selected Artwork)" : "Target: Selected Artwork"
            ];
            var targetText = targetNames[state.targetIndex] || targetNames[0];

            var gc = guideColors[state.colorIndex] || guideColors[0];
            var colParts = state.useColumns ? (state.colCount + " Cols (Gutter " + state.colGutter + state.unit + ")") : (isKhmer() ? "គ្មានជួរឈរ" : "No cols");
            var rowParts = state.useRows ? (state.rowCount + " Rows (Gutter " + state.rowGutter + state.unit + ")") : (isKhmer() ? "គ្មានជួរដេក" : "No rows");
            var dimText = colParts + " \u2022 " + rowParts + " \u2022 " + gc.name;

            var noteParts = [];
            if (state.useMargin) noteParts.push("Margins: " + state.marginTop + "/" + state.marginLeft + "/" + state.marginBottom + "/" + state.marginRight + state.unit);
            if (state.clearGuides) noteParts.push(isKhmer() ? "លុបបន្ទាត់ចាស់ៗចេញមុន" : "Clear existing guides");

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Guide Layout</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(targetText) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
        }

        function saveGlState() {
            state.targetIndex = parseInt(glTargetSelect.value, 10) || 0;
            state.useColumns = chkGlColumns.checked;
            state.colCount = parseInt(glColCountInput.value, 10) || 0;
            state.colGutter = parseFloat(glColGutterInput.value) || 0;
            state.colWidth = glColWidthInput.value;
            state.useRows = chkGlRows.checked;
            state.rowCount = parseInt(glRowCountInput.value, 10) || 0;
            state.rowGutter = parseFloat(glRowGutterInput.value) || 0;
            state.rowHeight = glRowHeightInput.value;
            state.useMargin = chkGlMargin.checked;
            state.marginTop = parseFloat(glMarginTopInput.value) || 0;
            state.marginLeft = parseFloat(glMarginLeftInput.value) || 0;
            state.marginBottom = parseFloat(glMarginBottomInput.value) || 0;
            state.marginRight = parseFloat(glMarginRightInput.value) || 0;
            state.unit = glUnitSelect.value;
            state.clearGuides = chkGlClear.checked;
            store.setDebounced("ozo_guidelayout_settings", JSON.stringify(state), 250);
            updateGlTicket();
        }

        chkGlColumns.addEventListener("change", function() {
            glColsBody.style.opacity = this.checked ? "1" : "0.4";
            glColsBody.style.pointerEvents = this.checked ? "auto" : "none";
            saveGlState();
        });
        chkGlRows.addEventListener("change", function() {
            glRowsBody.style.opacity = this.checked ? "1" : "0.4";
            glRowsBody.style.pointerEvents = this.checked ? "auto" : "none";
            saveGlState();
        });
        chkGlMargin.addEventListener("change", function() {
            glMarginsBody.style.opacity = this.checked ? "1" : "0.4";
            glMarginsBody.style.pointerEvents = this.checked ? "auto" : "none";
            saveGlState();
        });

        glPresetSelect.addEventListener("change", function() {
            var p = this.value;
            if (p === "col12") {
                chkGlColumns.checked = true; glColCountInput.value = "12"; glColGutterInput.value = "5"; glColWidthInput.value = "";
                chkGlRows.checked = false; chkGlMargin.checked = false;
            } else if (p === "col8") {
                chkGlColumns.checked = true; glColCountInput.value = "8"; glColGutterInput.value = "5"; glColWidthInput.value = "";
                chkGlRows.checked = false; chkGlMargin.checked = false;
            } else if (p === "col3") {
                chkGlColumns.checked = true; glColCountInput.value = "3"; glColGutterInput.value = "10"; glColWidthInput.value = "";
                chkGlRows.checked = false; chkGlMargin.checked = false;
            } else if (p === "grid2x2") {
                chkGlColumns.checked = true; glColCountInput.value = "2"; glColGutterInput.value = "0"; glColWidthInput.value = "";
                chkGlRows.checked = true; glRowCountInput.value = "2"; glRowGutterInput.value = "0"; glRowHeightInput.value = "";
            } else if (p === "crosshair") {
                chkGlColumns.checked = true; glColCountInput.value = "2"; glColGutterInput.value = "0"; glColWidthInput.value = "";
                chkGlRows.checked = true; glRowCountInput.value = "2"; glRowGutterInput.value = "0"; glRowHeightInput.value = "";
                chkGlMargin.checked = false;
            } else if (p === "margin5") {
                chkGlColumns.checked = false; chkGlRows.checked = false;
                chkGlMargin.checked = true; glMarginTopInput.value = "5"; glMarginLeftInput.value = "5"; glMarginBottomInput.value = "5"; glMarginRightInput.value = "5";
            }
            chkGlColumns.dispatchEvent(new Event("change"));
            chkGlRows.dispatchEvent(new Event("change"));
            chkGlMargin.dispatchEvent(new Event("change"));
        });

        for (var di = 0; di < swatchDots.length; di++) {
            swatchDots[di].addEventListener("click", function() {
                for (var sd = 0; sd < swatchDots.length; sd++) swatchDots[sd].classList.remove("active");
                this.classList.add("active");
                state.colorIndex = parseInt(this.getAttribute("data-color"), 10);
                saveGlState();
            });
        }

        glTargetSelect.addEventListener("change", saveGlState);
        glColCountInput.addEventListener("input", saveGlState);
        glColGutterInput.addEventListener("input", saveGlState);
        glColWidthInput.addEventListener("input", saveGlState);
        glRowCountInput.addEventListener("input", saveGlState);
        glRowGutterInput.addEventListener("input", saveGlState);
        glRowHeightInput.addEventListener("input", saveGlState);
        glMarginTopInput.addEventListener("input", saveGlState);
        glMarginLeftInput.addEventListener("input", saveGlState);
        glMarginBottomInput.addEventListener("input", saveGlState);
        glMarginRightInput.addEventListener("input", saveGlState);
        glUnitSelect.addEventListener("change", saveGlState);
        chkGlClear.addEventListener("change", saveGlState);
        updateGlTicket();

        function dispatchGuides(clearOnly) {
            hideError();
            btnGlSubmit.disabled = true;
            btnGlSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងដំណើរការ..." : "Building Guides...");
            setStatus(isKhmer() ? "កំពុងបង្កើតបន្ទាត់ណែនាំ..." : "Building guide layout...", "running");

            var params = {
                targetIndex: parseInt(glTargetSelect.value, 10) || 0,
                useColumns: clearOnly ? false : chkGlColumns.checked,
                colCount: parseInt(glColCountInput.value, 10) || 0,
                colGutter: parseFloat(glColGutterInput.value) || 0,
                colWidth: glColWidthInput.value ? parseFloat(glColWidthInput.value) : null,
                centerColumns: true,

                useRows: clearOnly ? false : chkGlRows.checked,
                rowCount: parseInt(glRowCountInput.value, 10) || 0,
                rowGutter: parseFloat(glRowGutterInput.value) || 0,
                rowHeight: glRowHeightInput.value ? parseFloat(glRowHeightInput.value) : null,
                centerRows: true,

                useMargin: clearOnly ? false : chkGlMargin.checked,
                marginTop: parseFloat(glMarginTopInput.value) || 0,
                marginLeft: parseFloat(glMarginLeftInput.value) || 0,
                marginBottom: parseFloat(glMarginBottomInput.value) || 0,
                marginRight: parseFloat(glMarginRightInput.value) || 0,

                unit: glUnitSelect.value,
                clearGuides: clearOnly ? true : chkGlClear.checked,
                colorIndex: state.colorIndex
            };

            if (!csInterface) {
                setTimeout(function() {
                    btnGlSubmit.disabled = false;
                    btnGlSubmit.innerHTML = uiIcon("grid") + (isKhmer() ? "បង្កើតបន្ទាត់ណែនាំ (Generate Guides)" : "Generate Guide Layout");
                    setStatus("Simulated Guides Generated (Browser Preview)", "success", 3000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteGuideLayout(" + JSON.stringify(JSON.stringify(params)) + ")", function(raw) {
                btnGlSubmit.disabled = false;
                btnGlSubmit.innerHTML = uiIcon("grid") + (isKhmer() ? "បង្កើតបន្ទាត់ណែនាំ (Generate Guides)" : "Generate Guide Layout");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = clearOnly ? (isKhmer() ? "បានលុបបន្ទាត់ណែនាំចាស់ៗដោយជោគជ័យ" : "Cleared existing guides in target area.") : (isKhmer() ? "បានបង្កើតបន្ទាត់ណែនាំ " + res.count + " ដោយជោគជ័យ" : "Created " + res.count + " native guides in target area.");
                    setStatus(okMsg, "success", 4000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to generate guides");
                    showError(isKhmer() ? "ការបង្កើតបន្ទាត់បរាជ័យ" : "Guide Layout Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        }

        btnGlSubmit.addEventListener("click", function() { dispatchGuides(false); });
        btnGlClearOnly.addEventListener("click", function() { dispatchGuides(true); });
    }

    // -------------------------------------------------------------
    // In-Dock Object Repeat View
    // -------------------------------------------------------------
    function renderEmbeddedRepeat() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_repeat_settings", "{}")); } catch (e) {}

        var state = {
            mode: saved.mode !== undefined ? saved.mode : 0, // 0: Fit Artboard, 1: Fixed Step & Repeat, 2: Radial
            columns: saved.columns !== undefined ? saved.columns : 5,
            rows: saved.rows !== undefined ? saved.rows : 5,
            horizontalGap: saved.horizontalGap !== undefined ? saved.horizontalGap : 5,
            verticalGap: saved.verticalGap !== undefined ? saved.verticalGap : 5,
            unitIndex: saved.unitIndex !== undefined ? saved.unitIndex : 0, // 0: mm, 1: cm, 2: in, 3: pt, 4: px
            alternating: saved.alternating !== undefined ? saved.alternating : 0, // 0: None, 1: Flip X, 2: Flip Y, 3: Rotate 180
            distributeEvenly: saved.distributeEvenly !== false,

            radialCopies: saved.radialCopies !== undefined ? saved.radialCopies : 12,
            radialRadius: saved.radialRadius !== undefined ? saved.radialRadius : 50,
            radialTotalAngle: saved.radialTotalAngle !== undefined ? saved.radialTotalAngle : 360,
            radialRotate: saved.radialRotate !== false,

            layerName: saved.layerName || "Object Repeat",
            selectResult: saved.selectResult !== false
        };

        var html = [];

        // 0. Live Repeat Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="repLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Mode Segmented
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទម្រង់ចម្លង (Repeat Mode)" : "Repeat Mode") + '</span></div>');
        html.push('  <div class="embed-segmented" id="repModeSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 0 ? "active" : "") + '" data-mode="0">' + uiIcon("grid", 12) + (isKhmer() ? "ពេញ Artboard (Fit)" : "Fit Artboard") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 1 ? "active" : "") + '" data-mode="1">' + uiIcon("grid", 12) + (isKhmer() ? "ក្រឡាចត្រង្គ (Fixed)" : "Step & Repeat") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.mode === 2 ? "active" : "") + '" data-mode="2">' + uiIcon("radial", 12) + (isKhmer() ? "រង្វង់មូល (Radial)" : "Radial Array") + '</button>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Grid Parameters
        html.push('<div class="embed-card" id="repGridCard" style="' + (state.mode === 2 ? "display:none;" : "") + '">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ការកំណត់ក្រឡាចត្រង្គ (Grid Settings)" : "Grid Settings") + '</span></div>');
        html.push('  <div class="embed-row-2col" id="repFixedCountsRow" style="' + (state.mode === 1 ? "" : "display:none;") + '">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនជួរឈរ (Cols):" : "Columns:") + '</label>');
        html.push('      <input type="number" id="repColsInput" class="embed-input" value="' + state.columns + '" min="1" max="1000" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនជួរដេក (Rows):" : "Rows:") + '</label>');
        html.push('      <input type="number" id="repRowsInput" class="embed-input" value="' + state.rows + '" min="1" max="1000" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="embed-row-3col" style="margin-top:6px;">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតដេក (X):" : "Gap X:") + '</label>');
        html.push('      <input type="number" id="repGapXInput" class="embed-input" value="' + state.horizontalGap + '" step="1" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតឈរ (Y):" : "Gap Y:") + '</label>');
        html.push('      <input type="number" id="repGapYInput" class="embed-input" value="' + state.verticalGap + '" step="1" min="0" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាត:" : "Unit:") + '</label>');
        html.push('      <select id="repUnitSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        var repUnits = ["mm", "cm", "in", "pt", "px"];
        for (var rui = 0; rui < repUnits.length; rui++) {
            html.push('        <option value="' + rui + '" ' + (state.unitIndex === rui ? "selected" : "") + '>' + repUnits[rui] + '</option>');
        }
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;">');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទម្រង់ឆ្លាស់ (Alternating Pattern):" : "Alternating Pattern:") + '</label>');
        html.push('    <select id="repAltSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('      <option value="0" ' + (state.alternating === 0 ? "selected" : "") + '>' + (isKhmer() ? "គ្មាន (ធម្មតា)" : "None (Standard)") + '</option>');
        html.push('      <option value="1" ' + (state.alternating === 1 ? "selected" : "") + '>' + (isKhmer() ? "ត្រឡប់ឆ្វេងស្តាំ (Flip Horizontal X)" : "Flip Horizontal (X)") + '</option>');
        html.push('      <option value="2" ' + (state.alternating === 2 ? "selected" : "") + '>' + (isKhmer() ? "ត្រឡប់លើក្រោម (Flip Vertical Y)" : "Flip Vertical (Y)") + '</option>');
        html.push('      <option value="3" ' + (state.alternating === 3 ? "selected" : "") + '>' + (isKhmer() ? "បង្វិល 180 ដឺក្រេ (Rotate 180°)" : "Rotate 180° Checkerboard") + '</option>');
        html.push('    </select>');
        html.push('  </div>');
        html.push('</div>');

        // 3. Radial Parameters
        html.push('<div class="embed-card" id="repRadialCard" style="' + (state.mode === 2 ? "" : "display:none;") + '">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ការកំណត់រង្វង់មូល (Radial Array)" : "Radial Settings") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ចំនួនចម្លង (Copies):" : "Copies:") + '</label>');
        html.push('      <input type="number" id="repRadialCopiesInput" class="embed-input" value="' + state.radialCopies + '" min="2" max="1000" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កាំរង្វង់ (Radius):" : "Radius:") + '</label>');
        html.push('      <input type="number" id="repRadialRadiusInput" class="embed-input" value="' + state.radialRadius + '" min="0" step="5" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:6px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkRepRadialRotate" ' + (state.radialRotate ? "checked" : "") + '> ' + (isKhmer() ? "បង្វិលវត្ថុតាមគន្លងរង្វង់ (Rotate With Circle)" : "Rotate objects along circular path") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Output Options
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ស្រទាប់លទ្ធផល (Output)" : "Output Layer") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះ Layer:" : "Layer Name:") + '</label>');
        html.push('      <input type="text" id="repLayerInput" class="embed-input" value="' + escapeHtml(state.layerName) + '" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div style="display:flex;align-items:flex-end;padding-bottom:5px;">');
        html.push('      <label class="embed-check-row"><input type="checkbox" id="chkRepSelect" ' + (state.selectResult ? "checked" : "") + '> ' + (isKhmer() ? "ជ្រើសរើសលទ្ធផល" : "Select result group") + '</label>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        // 5. Submit Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnRepSubmit" class="btn-action-primary">' + uiIcon("repeat") + (isKhmer() ? "ចម្លងវត្ថុឥឡូវនេះ" : "Repeat Artwork Now") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var modeBtns = embeddedContent.querySelectorAll("#repModeSegmented .embed-seg-btn");
        var repGridCard = $("repGridCard");
        var repRadialCard = $("repRadialCard");
        var repFixedCountsRow = $("repFixedCountsRow");
        var repColsInput = $("repColsInput");
        var repRowsInput = $("repRowsInput");
        var repGapXInput = $("repGapXInput");
        var repGapYInput = $("repGapYInput");
        var repUnitSelect = $("repUnitSelect");
        var repAltSelect = $("repAltSelect");
        var repRadialCopiesInput = $("repRadialCopiesInput");
        var repRadialRadiusInput = $("repRadialRadiusInput");
        var chkRepRadialRotate = $("chkRepRadialRotate");
        var repLayerInput = $("repLayerInput");
        var chkRepSelect = $("chkRepSelect");
        var btnRepSubmit = $("btnRepSubmit");

        function saveRepState() {
            state.columns = parseInt(repColsInput.value, 10) || 5;
            state.rows = parseInt(repRowsInput.value, 10) || 5;
            state.horizontalGap = parseFloat(repGapXInput.value) || 5;
            state.verticalGap = parseFloat(repGapYInput.value) || 5;
            state.unitIndex = parseInt(repUnitSelect.value, 10) || 0;
            state.alternating = parseInt(repAltSelect.value, 10) || 0;
            state.radialCopies = parseInt(repRadialCopiesInput.value, 10) || 12;
            state.radialRadius = parseFloat(repRadialRadiusInput.value) || 50;
            state.radialRotate = chkRepRadialRotate.checked;
            state.layerName = repLayerInput.value.trim() || "Object Repeat";
            state.selectResult = chkRepSelect.checked;
            store.setDebounced("ozo_repeat_settings", JSON.stringify(state), 250);
            updateRepTicket();
        }

        function updateRepTicket() {
            var box = $("repLiveTicket");
            if (!box) return;
            var repUnits = ["mm", "cm", "in", "pt", "px"];
            var u = repUnits[state.unitIndex] || "mm";
            var modeName = state.mode === 0 ? (isKhmer() ? "ពេញ Artboard (Fit Artboard)" : "Fit Artboard")
                : (state.mode === 1 ? (isKhmer() ? "ក្រឡាចត្រង្គ (Fixed Step & Repeat)" : "Fixed Step & Repeat")
                : (isKhmer() ? "រាងជារង្វង់ (Radial Array)" : "Radial Array"));

            var dimText = "";
            if (state.mode === 2) {
                dimText = state.radialCopies + " " + (isKhmer() ? "ចម្លង" : "copies") + " \u2022 Radius: " + state.radialRadius + u + " \u2022 Angle: " + state.radialTotalAngle + "\u00b0";
            } else {
                var total = (state.mode === 1) ? (state.columns * state.rows) + " " + (isKhmer() ? "ចម្លង (" : "copies (") + state.columns + "\u00d7" + state.rows + ")" : (isKhmer() ? "ពេញផ្ទាំងស្វ័យប្រវត្តិ" : "Auto fill artboard");
                dimText = total + " \u2022 Gap: " + state.horizontalGap + "\u00d7" + state.verticalGap + " " + u;
            }

            var noteParts = [];
            noteParts.push((isKhmer() ? "ស្រទាប់៖ " : "Layer: ") + (state.layerName || "Object Repeat"));
            var altNames = ["None", "Flip X", "Flip Y", "Rotate 180\u00b0"];
            if (state.alternating > 0) noteParts.push("Alternating: " + (altNames[state.alternating] || ""));
            if (state.selectResult) noteParts.push(isKhmer() ? "ជ្រើសរើសលទ្ធផល" : "Select Result");

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Object Repeat</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(modeName) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
        }

        for (var mi = 0; mi < modeBtns.length; mi++) {
            modeBtns[mi].addEventListener("click", function() {
                for (var mb = 0; mb < modeBtns.length; mb++) modeBtns[mb].classList.remove("active");
                this.classList.add("active");
                state.mode = parseInt(this.getAttribute("data-mode"), 10);
                if (state.mode === 0) { // Fit Artboard
                    repGridCard.style.display = "block";
                    repRadialCard.style.display = "none";
                    repFixedCountsRow.style.display = "none";
                } else if (state.mode === 1) { // Fixed Step & Repeat
                    repGridCard.style.display = "block";
                    repRadialCard.style.display = "none";
                    repFixedCountsRow.style.display = "flex";
                } else { // Radial
                    repGridCard.style.display = "none";
                    repRadialCard.style.display = "block";
                }
                saveRepState();
            });
        }

        repColsInput.addEventListener("input", saveRepState);
        repRowsInput.addEventListener("input", saveRepState);
        repGapXInput.addEventListener("input", saveRepState);
        repGapYInput.addEventListener("input", saveRepState);
        repUnitSelect.addEventListener("change", saveRepState);
        repAltSelect.addEventListener("change", saveRepState);
        repRadialCopiesInput.addEventListener("input", saveRepState);
        repRadialRadiusInput.addEventListener("input", saveRepState);
        chkRepRadialRotate.addEventListener("change", saveRepState);
        repLayerInput.addEventListener("input", saveRepState);
        chkRepSelect.addEventListener("change", saveRepState);
        updateRepTicket();

        btnRepSubmit.addEventListener("click", function() {
            hideError();
            btnRepSubmit.disabled = true;
            btnRepSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងចម្លង..." : "Repeating Artwork...");
            setStatus(isKhmer() ? "កំពុងចម្លងវត្ថុតាមប្លង់..." : "Generating repeated artwork...", "running");

            var params = {
                mode: state.mode,
                columns: parseInt(repColsInput.value, 10) || 5,
                rows: parseInt(repRowsInput.value, 10) || 5,
                horizontalGap: parseFloat(repGapXInput.value) || 5,
                verticalGap: parseFloat(repGapYInput.value) || 5,
                unitIndex: parseInt(repUnitSelect.value, 10) || 0,
                alternating: parseInt(repAltSelect.value, 10) || 0,
                radialCopies: parseInt(repRadialCopiesInput.value, 10) || 12,
                radialRadius: parseFloat(repRadialRadiusInput.value) || 50,
                radialTotalAngle: 360,
                radialRotate: chkRepRadialRotate.checked,
                layerName: repLayerInput.value.trim() || "Object Repeat",
                selectResult: chkRepSelect.checked
            };

            if (!csInterface) {
                setTimeout(function() {
                    btnRepSubmit.disabled = false;
                    btnRepSubmit.innerHTML = uiIcon("repeat") + (isKhmer() ? "ចម្លងវត្ថុឥឡូវនេះ" : "Repeat Artwork Now");
                    setStatus("Simulated Repeat Applied (Browser Preview)", "success", 3000);
                }, 1000);
                return;
            }

            csInterface.evalScript("ozoExecuteObjectRepeat(" + JSON.stringify(JSON.stringify(params)) + ")", function(raw) {
                btnRepSubmit.disabled = false;
                btnRepSubmit.innerHTML = uiIcon("repeat") + (isKhmer() ? "ចម្លងវត្ថុឥឡូវនេះ" : "Repeat Artwork Now");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "success") {
                    var okMsg = isKhmer() ? "បានបង្កើតវត្ថុចម្លង " + res.count + " ដោយជោគជ័យលើ Layer " + res.layer : "Created " + res.count + " repeated objects on layer " + res.layer;
                    setStatus(okMsg, "success", 4000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to repeat artwork");
                    showError(isKhmer() ? "ការចម្លងវត្ថុបរាជ័យ" : "Repeat Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });
    }

    // -------------------------------------------------------------
    // In-Dock Nesting View
    // -------------------------------------------------------------
    function renderEmbeddedNesting() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_nesting_settings", "{}")); } catch (e) {}

        var state = {
            mode: saved.mode !== undefined ? saved.mode : 0,
            unit: saved.unit || "mm",
            custom: saved.custom === true,
            width: saved.width !== undefined ? saved.width : 600,
            height: saved.height !== undefined ? saved.height : 400,
            resizeArtboard: saved.resizeArtboard !== false,
            spacing: saved.spacing !== undefined ? saved.spacing : 2,
            edge: saved.edge !== undefined ? saved.edge : 2,
            left: saved.left !== undefined ? saved.left : 0,
            right: saved.right !== undefined ? saved.right : 0,
            top: saved.top !== undefined ? saved.top : 0,
            bottom: saved.bottom !== undefined ? saved.bottom : 0,
            rotation: saved.rotation !== undefined ? saved.rotation : 1,
            divide: saved.divide !== undefined ? saved.divide : 0,
            allowInside: saved.allowInside !== false,
            fixed: saved.fixed !== false,
            best: saved.best !== false,
            autoMultiSheet: saved.autoMultiSheet !== false
        };

        var html = [];

        // 0. Live Nesting Job Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="nestLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "សន្លឹក / ផ្ទៃរៀបចំ (Sheet & Target)" : "Sheets & Containers") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គោលដៅរៀបចំ (Target):" : "Target Sheet:") + '</label>');
        html.push('      <select id="nestTargetSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="0" ' + (state.mode === 0 ? "selected" : "") + '>' + (isKhmer() ? "Artboard សកម្ម" : "Active Artboard") + '</option>');
        html.push('        <option value="1" ' + (state.mode === 1 ? "selected" : "") + '>' + (isKhmer() ? "គ្រប់ Artboards" : "All Artboards") + '</option>');
        html.push('        <option value="2" ' + (state.mode === 2 ? "selected" : "") + '>' + (isKhmer() ? "វត្ថុចុងក្រោយ" : "Last Selected Object") + '</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ខ្នាត (Unit):" : "Units:") + '</label>');
        html.push('      <select id="nestUnitSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="mm" ' + (state.unit === "mm" ? "selected" : "") + '>Millimeters (mm)</option>');
        html.push('        <option value="cm" ' + (state.unit === "cm" ? "selected" : "") + '>Centimeters (cm)</option>');
        html.push('        <option value="m" ' + (state.unit === "m" ? "selected" : "") + '>Meters (m)</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestCustom" ' + (state.custom ? "checked" : "") + '> ' + (isKhmer() ? "កំណត់ទំហំសន្លឹកផ្ទាល់ខ្លួន" : "Use custom active sheet size") + '</label>');
        html.push('  </div>');
        html.push('  <div id="nestCustomSizeRow" class="embed-row-2col" style="margin-top:6px;' + (state.custom ? "" : "display:none;") + '">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទទឹង (Width):" : "Width:") + '</label>');
        html.push('      <input type="number" id="numNestWidth" class="embed-input" value="' + state.width + '" min="1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "កម្ពស់ (Height):" : "Height:") + '</label>');
        html.push('      <input type="number" id="numNestHeight" class="embed-input" value="' + state.height + '" min="1" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div id="nestResizeRow" style="margin-top:6px;' + (state.custom ? "" : "display:none;") + '">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestResize" ' + (state.resizeArtboard ? "checked" : "") + '> ' + (isKhmer() ? "ប្តូរទំហំ Artboard តាមសន្លឹកនេះ" : "Resize active artboard on Apply") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "គម្លាត និងគែម (Spacing & Margins)" : "Spacing & Margins") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតរវាងវត្ថុ:" : "Min. Distance:") + '</label>');
        html.push('      <input type="number" id="numNestSpacing" class="embed-input" value="' + state.spacing + '" min="0" step="0.5" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គម្លាតពីគែម:" : "Edge Padding:") + '</label>');
        html.push('      <input type="number" id="numNestEdge" class="embed-input" value="' + state.edge + '" min="0" step="0.5" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="embed-row-4col" style="margin-top:8px;">');
        html.push('    <div><label style="font-size:10px;color:var(--text-muted);">' + (isKhmer() ? "លើ (Top)" : "Top") + '</label><input type="number" id="numNestTop" class="embed-input" value="' + state.top + '" min="0" style="width:100%;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-muted);">' + (isKhmer() ? "ឆ្វេង (Left)" : "Left") + '</label><input type="number" id="numNestLeft" class="embed-input" value="' + state.left + '" min="0" style="width:100%;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-muted);">' + (isKhmer() ? "ក្រោម (Bottom)" : "Bottom") + '</label><input type="number" id="numNestBottom" class="embed-input" value="' + state.bottom + '" min="0" style="width:100%;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-muted);">' + (isKhmer() ? "ស្តាំ (Right)" : "Right") + '</label><input type="number" id="numNestRight" class="embed-input" value="' + state.right + '" min="0" style="width:100%;"></div>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ការបង្វិល និងប្រសិទ្ធភាព (Optimization)" : "Placement & Optimization") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ការបង្វិល:" : "Rotation:") + '</label>');
        html.push('      <select id="nestRotSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="1" ' + (state.rotation === 1 ? "selected" : "") + '>90° Steps (Standard)</option>');
        html.push('        <option value="0" ' + (state.rotation === 0 ? "selected" : "") + '>Free (15° Steps)</option>');
        html.push('        <option value="2" ' + (state.rotation === 2 ? "selected" : "") + '>180° Steps</option>');
        html.push('        <option value="3" ' + (state.rotation === 3 ? "selected" : "") + '>' + (isKhmer() ? "កុំបង្វិល" : "Do Not Rotate") + '</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "លំដាប់:" : "Ordering:") + '</label>');
        html.push('      <select id="nestDivSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="0" ' + (state.divide === 0 ? "selected" : "") + '>No division</option>');
        html.push('        <option value="1" ' + (state.divide === 1 ? "selected" : "") + '>Color - grouped</option>');
        html.push('        <option value="2" ' + (state.divide === 2 ? "selected" : "") + '>Layer - grouped</option>');
        html.push('        <option value="3" ' + (state.divide === 3 ? "selected" : "") + '>' + (isKhmer() ? "ពណ៌ - សន្លឹកដាច់ដោយឡែក" : "Color - separate sheets") + '</option>');
        html.push('        <option value="4" ' + (state.divide === 4 ? "selected" : "") + '>' + (isKhmer() ? "ស្រទាប់ - សន្លឹកដាច់ដោយឡែក" : "Layer - separate sheets") + '</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestHoles" ' + (state.allowInside ? "checked" : "") + '> ' + (isKhmer() ? "ដាក់ក្នុងប្រហោង (Compound holes)" : "Allow inside compound-path holes") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestFixed" ' + (state.fixed ? "checked" : "") + '> ' + (isKhmer() ? "ចាត់ទុកវត្ថុចាក់សោរជារបាំងថេរ" : "Respect locked artwork as fixed obstacles") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestBest" ' + (state.best ? "checked" : "") + '> ' + (isKhmer() ? "ស្វែងរកលទ្ធផលល្អបំផុត" : "Search best result (thorough optimization)") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkNestAutoSheets" ' + (state.autoMultiSheet ? "checked" : "") + '> ' + (isKhmer() ? "បង្កើតសន្លឹកបន្ថែមស្វ័យប្រវត្តិ" : "Auto-create additional sheets for unplaced items") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-card" id="nestResultCard" style="display:none;">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "លទ្ធផលនៃការរៀបចំ (Results)" : "Nesting Results") + '</span></div>');
        html.push('  <div class="nest-util-wrap">');
        html.push('    <div class="nest-util-header"><span>' + (isKhmer() ? "ការប្រើប្រាស់ផ្ទៃសន្លឹក:" : "Sheet Utilization:") + '</span><span id="nestUtilVal" style="color:var(--accent);font-weight:700;">0%</span></div>');
        html.push('    <div class="nest-util-bar"><div id="nestUtilFill" class="nest-util-fill"></div></div>');
        html.push('  </div>');
        html.push('  <div class="stat-pill-row" style="margin-top:8px;">');
        html.push('    <div class="stat-pill"><span class="stat-pill-label">' + (isKhmer() ? "បានដាក់" : "Placed") + '</span><span class="stat-pill-val" id="nestStatPlaced">0/0</span></div>');
        html.push('    <div class="stat-pill"><span class="stat-pill-label">' + (isKhmer() ? "សន្លឹក" : "Sheets") + '</span><span class="stat-pill-val" id="nestStatSheets">1</span></div>');
        html.push('    <div class="stat-pill"><span class="stat-pill-label">' + (isKhmer() ? "របាំងថេរ" : "Obstacles") + '</span><span class="stat-pill-val" id="nestStatFixed">0</span></div>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-action-footer">');
        html.push('  <button type="button" id="btnNestSubmit" class="btn-action-primary">' + uiIcon("nest") + (isKhmer() ? "ចាប់ផ្តើមរៀបចំ (Run Nesting)" : "Run Sheet Nesting") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var nestTargetSelect = document.getElementById("nestTargetSelect");
        var nestUnitSelect = document.getElementById("nestUnitSelect");
        var chkNestCustom = document.getElementById("chkNestCustom");
        var nestCustomSizeRow = document.getElementById("nestCustomSizeRow");
        var nestResizeRow = document.getElementById("nestResizeRow");
        var numNestWidth = document.getElementById("numNestWidth");
        var numNestHeight = document.getElementById("numNestHeight");
        var chkNestResize = document.getElementById("chkNestResize");
        var numNestSpacing = document.getElementById("numNestSpacing");
        var numNestEdge = document.getElementById("numNestEdge");
        var numNestTop = document.getElementById("numNestTop");
        var numNestLeft = document.getElementById("numNestLeft");
        var numNestBottom = document.getElementById("numNestBottom");
        var numNestRight = document.getElementById("numNestRight");
        var nestRotSelect = document.getElementById("nestRotSelect");
        var nestDivSelect = document.getElementById("nestDivSelect");
        var chkNestHoles = document.getElementById("chkNestHoles");
        var chkNestFixed = document.getElementById("chkNestFixed");
        var chkNestBest = document.getElementById("chkNestBest");
        var chkNestAutoSheets = document.getElementById("chkNestAutoSheets");
        var btnNestSubmit = document.getElementById("btnNestSubmit");
        var nestResultCard = document.getElementById("nestResultCard");
        var nestUtilVal = document.getElementById("nestUtilVal");
        var nestUtilFill = document.getElementById("nestUtilFill");
        var nestStatPlaced = document.getElementById("nestStatPlaced");
        var nestStatSheets = document.getElementById("nestStatSheets");
        var nestStatFixed = document.getElementById("nestStatFixed");

        var NEST_UNIT_MM = {mm: 1, cm: 10, m: 1000};
        var lastNestUnit = nestUnitSelect.value;

        function nestNumber(input, fallback) {
            var value = parseFloat(input.value);
            return isFinite(value) ? value : fallback;
        }

        function formatNestNumber(value) {
            return String(Math.round(value * 10000) / 10000);
        }

        function convertNestUnits(oldUnit, newUnit) {
            var oldFactor = NEST_UNIT_MM[oldUnit] || 1;
            var newFactor = NEST_UNIT_MM[newUnit] || 1;
            if (oldFactor === newFactor) return;
            [numNestWidth, numNestHeight, numNestSpacing, numNestEdge,
                numNestTop, numNestLeft, numNestBottom, numNestRight].forEach(function (input) {
                var value = parseFloat(input.value);
                if (isFinite(value)) {
                    input.value = formatNestNumber(value * oldFactor / newFactor);
                }
            });
        }

        function updateNestTargetControls() {
            var customAllowed = parseInt(nestTargetSelect.value, 10) === 0;
            chkNestCustom.disabled = !customAllowed;
            var show = customAllowed && chkNestCustom.checked;
            nestCustomSizeRow.style.display = show ? "grid" : "none";
            nestResizeRow.style.display = show ? "block" : "none";
        }

        chkNestCustom.addEventListener("change", function () {
            updateNestTargetControls();
            saveNestingState();
        });
        nestTargetSelect.addEventListener("change", updateNestTargetControls);

        function saveNestingState() {
            var selectedUnit = nestUnitSelect.value;
            if (selectedUnit !== lastNestUnit) {
                convertNestUnits(lastNestUnit, selectedUnit);
                lastNestUnit = selectedUnit;
            }
            var customAllowed = parseInt(nestTargetSelect.value, 10) === 0;
            var s = {
                mode: parseInt(nestTargetSelect.value, 10),
                unit: selectedUnit,
                custom: chkNestCustom.checked && customAllowed,
                width: Math.max(1, nestNumber(numNestWidth, 600)),
                height: Math.max(1, nestNumber(numNestHeight, 400)),
                resizeArtboard: chkNestResize.checked,
                spacing: Math.max(0, nestNumber(numNestSpacing, 2)),
                edge: Math.max(0, nestNumber(numNestEdge, 2)),
                top: Math.max(0, nestNumber(numNestTop, 0)),
                left: Math.max(0, nestNumber(numNestLeft, 0)),
                bottom: Math.max(0, nestNumber(numNestBottom, 0)),
                right: Math.max(0, nestNumber(numNestRight, 0)),
                rotation: parseInt(nestRotSelect.value, 10),
                divide: parseInt(nestDivSelect.value, 10),
                allowInside: chkNestHoles.checked,
                fixed: chkNestFixed.checked,
                best: chkNestBest.checked,
                autoMultiSheet: chkNestAutoSheets.checked
            };
            store.setDebounced("ozo_nesting_settings", JSON.stringify(s), 250);
            updateNestTicket(s);
        }

        function updateNestTicket(curr) {
            var box = $("nestLiveTicket");
            if (!box) return;
            var cur = curr || {
                mode: parseInt(nestTargetSelect.value, 10),
                custom: chkNestCustom.checked,
                width: Math.max(1, nestNumber(numNestWidth, 600)),
                height: Math.max(1, nestNumber(numNestHeight, 400)),
                unit: nestUnitSelect.value,
                spacing: Math.max(0, nestNumber(numNestSpacing, 2)),
                edge: Math.max(0, nestNumber(numNestEdge, 2)),
                rotation: parseInt(nestRotSelect.value, 10),
                resizeArtboard: chkNestResize.checked,
                best: chkNestBest.checked,
                allowInside: chkNestHoles.checked
            };
            var customSheet = cur.custom && Number(cur.mode) === 0;
            var sheet = customSheet ? ("Sheet: " + cur.width + " \u00d7 " + cur.height + " " + cur.unit) : (isKhmer() ? "សន្លឹក៖ ទំហំ Artboard សកម្ម" : "Sheet: Active Artboard Size");

            var rotNames = [
                "Free Rotation (15\u00b0 Steps)",
                "90\u00b0 Steps",
                "180\u00b0 Steps",
                "No Rotation"
            ];
            var rotText = rotNames[cur.rotation] || "90\u00b0 Steps";
            var dimText = "Part Gap: " + cur.spacing + cur.unit + " \u2022 Edge: " + cur.edge + cur.unit + " \u2022 " + rotText;

            var noteParts = [];
            if (cur.best) noteParts.push(isKhmer() ? "ប្រសិទ្ធភាពខ្ពស់បំផុត (Best Fit)" : "Best Packing Efficiency");
            if (cur.allowInside) noteParts.push(isKhmer() ? "តម្រៀបក្នុងប្រហោង (Holes)" : "Nest in Holes");
            noteParts.push(cur.resizeArtboard ? (isKhmer() ? "ពង្រីក Artboard តាមសន្លឹក" : "Resize artboard") : (isKhmer() ? "រក្សាទំហំ Artboard" : "Keep artboard"));

            var html = '';
            html += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' \u2022 Nesting Optimizer</div>';
            html += '<div class="ticket-line-mat">' + escapeHtml(sheet) + '</div>';
            html += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            html += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" \u2022 ")) + '</div>';

            box.innerHTML = html;
        }

        var inputsToSave = [nestTargetSelect, nestUnitSelect, numNestWidth, numNestHeight, chkNestResize, numNestSpacing, numNestEdge, numNestTop, numNestLeft, numNestBottom, numNestRight, nestRotSelect, nestDivSelect, chkNestHoles, chkNestFixed, chkNestBest, chkNestAutoSheets];
        updateNestTargetControls();
        updateNestTicket();
        inputsToSave.forEach(function (inp) {
            inp.addEventListener("change", saveNestingState);
            inp.addEventListener("input", saveNestingState);
            inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") btnNestSubmit.click();
            });
        });

        btnNestSubmit.addEventListener("click", function () {
            hideError();
            // Never leave the previous run's numbers on screen while a new
            // calculation is running or after it fails.
            nestResultCard.style.display = "none";
            saveNestingState();
            btnNestSubmit.disabled = true;
            btnNestSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងគណនា..." : "Optimizing Nesting...");
            setStatus(isKhmer() ? "កំពុងរៀបចំទីតាំង Artwork..." : "Calculating sheet layout...", "running");

            var params = {
                mode: parseInt(nestTargetSelect.value, 10),
                unit: nestUnitSelect.value,
                custom: chkNestCustom.checked && parseInt(nestTargetSelect.value, 10) === 0,
                width: Math.max(1, nestNumber(numNestWidth, 600)),
                height: Math.max(1, nestNumber(numNestHeight, 400)),
                resizeArtboard: chkNestResize.checked,
                spacing: Math.max(0, nestNumber(numNestSpacing, 2)),
                edge: Math.max(0, nestNumber(numNestEdge, 2)),
                top: Math.max(0, nestNumber(numNestTop, 0)),
                left: Math.max(0, nestNumber(numNestLeft, 0)),
                bottom: Math.max(0, nestNumber(numNestBottom, 0)),
                right: Math.max(0, nestNumber(numNestRight, 0)),
                rotation: parseInt(nestRotSelect.value, 10),
                divide: parseInt(nestDivSelect.value, 10),
                quality: 0,
                allowInside: chkNestHoles.checked,
                fixed: chkNestFixed.checked,
                best: chkNestBest.checked,
                autoMultiSheet: chkNestAutoSheets.checked
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnNestSubmit.disabled = false;
                    btnNestSubmit.innerHTML = uiIcon("nest") + (isKhmer() ? "ចាប់ផ្តើមរៀបចំ (Run Nesting)" : "Run Sheet Nesting");
                    nestResultCard.style.display = "block";
                    nestUtilVal.textContent = "84.5%";
                    nestUtilFill.style.width = "84.5%";
                    nestStatPlaced.textContent = "12/12";
                    nestStatSheets.textContent = "1";
                    nestStatFixed.textContent = "0";
                    setStatus("Simulated Nesting Applied (Browser Preview)", "success", 3000);
                }, 1000);
                return;
            }

            try {
                csInterface.evalScript("ozoExecuteNesting(" + JSON.stringify(JSON.stringify(params)) + ")", function (raw) {
                    btnNestSubmit.disabled = false;
                    btnNestSubmit.innerHTML = uiIcon("nest") + (isKhmer() ? "ចាប់ផ្តើមរៀបចំ (Run Nesting)" : "Run Sheet Nesting");
                    var res = null;
                    try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                    if (res && res.success) {
                        nestResultCard.style.display = "block";
                        var u = (res.utilization !== undefined ? res.utilization : 0) + "%";
                        nestUtilVal.textContent = u;
                        nestUtilFill.style.width = u;
                        nestStatPlaced.textContent = res.placed + "/" + res.total;
                        nestStatSheets.textContent = res.sheets || 1;
                        nestStatFixed.textContent = res.fixed || 0;

                        var okMsg = isKhmer()
                            ? "បានរៀបចំវត្ថុ " + res.placed + "/" + res.total + " ដោយជោគជ័យ (សន្សំសំចៃ " + u + ")"
                            : "Nesting complete: Placed " + res.placed + "/" + res.total + " items (" + u + " utilization)";
                        setStatus(okMsg, "success", 4000);
                    } else {
                        var errMsg = (res && res.message) || String(raw || "Failed to nest artwork");
                        showError(isKhmer() ? "ការរៀបចំបរាជ័យ" : "Nesting Failed", errMsg);
                        setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                    }
                });
            } catch (evalError) {
                btnNestSubmit.disabled = false;
                btnNestSubmit.innerHTML = uiIcon("nest") + (isKhmer() ? "ចាប់ផ្តើមរៀបចំ (Run Nesting)" : "Run Sheet Nesting");
                var bridgeMsg = (evalError && evalError.message) || String(evalError);
                showError(isKhmer() ? "ការរៀបចំបរាជ័យ" : "Nesting Failed", bridgeMsg);
                setStatus(isKhmer() ? "បញ្ហា៖ " + bridgeMsg : "Error: " + bridgeMsg, "error", 6000);
            }
        });
    }

    // -------------------------------------------------------------
    // In-Dock Icon Importer View
    // -------------------------------------------------------------
    var BUILTIN_ICONS = [
        { id: "arrow-right", cat: "arrows", name: "Arrow Right", svg: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
        { id: "arrow-left", cat: "arrows", name: "Arrow Left", svg: '<path d="M19 12H5M12 19l-7-7 7-7"/>' },
        { id: "arrow-up", cat: "arrows", name: "Arrow Up", svg: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
        { id: "arrow-down", cat: "arrows", name: "Arrow Down", svg: '<path d="M12 5v14M19 12l-7 7-7-7"/>' },
        { id: "chevron-right", cat: "arrows", name: "Chevron Right", svg: '<path d="m9 18 6-6-6-6"/>' },
        { id: "chevron-left", cat: "arrows", name: "Chevron Left", svg: '<path d="m15 18-6-6 6-6"/>' },
        { id: "refresh-cw", cat: "arrows", name: "Refresh", svg: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>' },
        { id: "check", cat: "interface", name: "Check", svg: '<path d="M20 6 9 17l-5-5"/>' },
        { id: "x", cat: "interface", name: "Close Cross", svg: '<path d="M18 6 6 18M6 6l12 12"/>' },
        { id: "plus", cat: "interface", name: "Plus", svg: '<path d="M5 12h14M12 5v14"/>' },
        { id: "search", cat: "interface", name: "Search", svg: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>' },
        { id: "home", cat: "interface", name: "Home", svg: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        { id: "user", cat: "interface", name: "User", svg: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
        { id: "settings", cat: "interface", name: "Settings", svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
        { id: "heart", cat: "shapes", name: "Heart", svg: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' },
        { id: "star", cat: "shapes", name: "Star", svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
        { id: "circle", cat: "shapes", name: "Circle", svg: '<circle cx="12" cy="12" r="10"/>' },
        { id: "square", cat: "shapes", name: "Square", svg: '<rect width="18" height="18" x="3" y="3" rx="2"/>' },
        { id: "shopping-cart", cat: "commerce", name: "Cart", svg: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>' },
        { id: "tag", cat: "commerce", name: "Price Tag", svg: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5" fill="currentColor"/>' },
        { id: "dollar-sign", cat: "commerce", name: "Dollar", svg: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
        { id: "image", cat: "media", name: "Image", svg: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>' },
        { id: "camera", cat: "media", name: "Camera", svg: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>' },
        { id: "play", cat: "media", name: "Play", svg: '<polygon points="5 3 19 12 5 21 5 3"/>' },
        { id: "mail", cat: "comm", name: "Mail", svg: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>' },
        { id: "phone", cat: "comm", name: "Phone", svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' },
        { id: "bell", cat: "comm", name: "Bell", svg: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' },
        { id: "download", cat: "actions", name: "Download", svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>' },
        { id: "printer", cat: "actions", name: "Printer", svg: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>' },
        { id: "sun", cat: "weather", name: "Sun", svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>' },
        { id: "zap", cat: "weather", name: "Lightning", svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
        { id: "map-pin", cat: "interface", name: "Pin", svg: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>' }
    ];

    function renderEmbeddedIcons() {
        var selectedIcon = BUILTIN_ICONS[0];
        var activeCategory = "all";

        var html = [];

        html.push('<div class="embed-card">');
        html.push('  <input type="text" id="iconSearchInput" class="embed-input" placeholder="' + (isKhmer() ? "ស្វែងរករូបតំណាង (Search 150,000+ icons)..." : "Search icons (arrow, user, star, cart)...") + '" style="width:100%;">');
        html.push('  <div class="icon-cat-bar" id="iconCatBar" style="margin-top:8px;">');
        html.push('    <span class="icon-cat-chip active" data-cat="all">All</span>');
        html.push('    <span class="icon-cat-chip" data-cat="interface">Interface</span>');
        html.push('    <span class="icon-cat-chip" data-cat="arrows">Arrows</span>');
        html.push('    <span class="icon-cat-chip" data-cat="commerce">Commerce</span>');
        html.push('    <span class="icon-cat-chip" data-cat="media">Media</span>');
        html.push('    <span class="icon-cat-chip" data-cat="shapes">Shapes</span>');
        html.push('    <span class="icon-cat-chip" data-cat="comm">Social</span>');
        html.push('    <span class="icon-cat-chip" data-cat="weather">Nature</span>');
        html.push('  </div>');
        html.push('  <div class="icon-grid" id="iconGrid"></div>');
        html.push('</div>');

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ព័ត៌មានរូបសញ្ញា (Icon Inspector)" : "Selected Icon Inspector") + '</span></div>');
        html.push('  <div class="icon-preview-hero">');
        html.push('    <div class="icon-preview-box" id="iconHeroPreview"></div>');
        html.push('    <div style="flex:1;overflow:hidden;">');
        html.push('      <div style="font-weight:700;font-size:12px;color:var(--text-primary);" id="iconHeroName">Arrow Right</div>');
        html.push('      <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;" id="iconHeroCat">SVG Vector • 24x24 viewBox</div>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="embed-row-2col" style="margin-top:8px;">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទំហំ (Size pt):" : "Size (pt):") + '</label>');
        html.push('      <input type="number" id="numIconSize" class="embed-input" value="48" min="8" max="1000" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះ Layer:" : "Target Layer:") + '</label>');
        html.push('      <input type="text" id="txtIconLayer" class="embed-input" value="[Icons]" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-action-footer">');
        html.push('  <button type="button" id="btnIconInsert" class="btn-action-primary">' + uiIcon("download") + (isKhmer() ? "បញ្ចូលរូប Vector (Insert Icon)" : "Insert Vector Icon") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var iconSearchInput = document.getElementById("iconSearchInput");
        var iconCatBar = document.getElementById("iconCatBar");
        var iconGrid = document.getElementById("iconGrid");
        var iconHeroPreview = document.getElementById("iconHeroPreview");
        var iconHeroName = document.getElementById("iconHeroName");
        var iconHeroCat = document.getElementById("iconHeroCat");
        var numIconSize = document.getElementById("numIconSize");
        var txtIconLayer = document.getElementById("txtIconLayer");
        var btnIconInsert = document.getElementById("btnIconInsert");

        function makeSvg(inner) {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
        }

        function updateHero(icon) {
            selectedIcon = icon;
            iconHeroPreview.innerHTML = makeSvg(icon.svg);
            iconHeroName.textContent = icon.name;
            iconHeroCat.textContent = "SVG Vector • Category: " + icon.cat;
        }

        function renderGrid() {
            var q = iconSearchInput.value.trim().toLowerCase();
            var list = BUILTIN_ICONS.filter(function (it) {
                var matchesCat = (activeCategory === "all" || it.cat === activeCategory);
                var matchesQuery = !q || it.name.toLowerCase().indexOf(q) !== -1 || it.id.toLowerCase().indexOf(q) !== -1;
                return matchesCat && matchesQuery;
            });

            if (list.length === 0) {
                iconGrid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--text-muted);font-size:11px;">' + (isKhmer() ? "រកមិនឃើញរូបសញ្ញាទេ" : "No icons found matching search") + '</div>';
                return;
            }

            var gHtml = [];
            list.forEach(function (icon) {
                var isSel = (selectedIcon && selectedIcon.id === icon.id);
                gHtml.push('<div class="icon-tile ' + (isSel ? "selected" : "") + '" data-id="' + icon.id + '" title="' + escapeHtml(icon.name) + '">');
                gHtml.push('  <div class="icon-svg-wrap">' + makeSvg(icon.svg) + '</div>');
                gHtml.push('  <span class="icon-tile-name">' + escapeHtml(icon.name) + '</span>');
                gHtml.push('</div>');
            });
            iconGrid.innerHTML = gHtml.join("");
        }

        iconCatBar.addEventListener("click", function (e) {
            var chip = closest(e.target, ".icon-cat-chip", iconCatBar);
            if (!chip) return;
            var chips = iconCatBar.querySelectorAll(".icon-cat-chip");
            for (var i = 0; i < chips.length; i++) chips[i].classList.remove("active");
            chip.classList.add("active");
            activeCategory = chip.getAttribute("data-cat");
            renderGrid();
        });

        iconSearchInput.addEventListener("input", function () {
            renderGrid();
        });

        iconGrid.addEventListener("click", function (e) {
            var tile = closest(e.target, ".icon-tile", iconGrid);
            if (!tile) return;
            var id = tile.getAttribute("data-id");
            var found = BUILTIN_ICONS.filter(function (it) { return it.id === id; })[0];
            if (found) {
                updateHero(found);
                var tiles = iconGrid.querySelectorAll(".icon-tile");
                for (var i = 0; i < tiles.length; i++) tiles[i].classList.remove("selected");
                tile.classList.add("selected");
            }
        });

        iconGrid.addEventListener("dblclick", function (e) {
            var tile = closest(e.target, ".icon-tile", iconGrid);
            if (!tile) return;
            btnIconInsert.click();
        });

        numIconSize.addEventListener("keydown", function (e) {
            if (e.key === "Enter") btnIconInsert.click();
        });

        iconSearchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                var firstTile = iconGrid.querySelector(".icon-tile");
                if (firstTile) {
                    firstTile.click();
                    btnIconInsert.click();
                }
            }
        });

        btnIconInsert.addEventListener("click", function () {
            if (!selectedIcon) return;
            hideError();
            btnIconInsert.disabled = true;
            btnIconInsert.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងបញ្ចូល..." : "Inserting Icon...");
            setStatus(isKhmer() ? "កំពុងបញ្ចូលរូបតំណាង..." : "Placing vector icon into document...", "running");

            var fullSvg = '<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + selectedIcon.svg + '</svg>';
            var params = {
                svg: fullSvg,
                name: selectedIcon.name,
                sizePt: parseFloat(numIconSize.value) || 48,
                layerName: txtIconLayer.value.trim() || "[Icons]"
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnIconInsert.disabled = false;
                    btnIconInsert.innerHTML = uiIcon("download") + (isKhmer() ? "បញ្ចូលរូប Vector (Insert Icon)" : "Insert Vector Icon");
                    setStatus("Simulated Icon Inserted: " + selectedIcon.name, "success", 3000);
                }, 800);
                return;
            }

            csInterface.evalScript("ozoImportIconSvg(" + JSON.stringify(JSON.stringify(params)) + ")", function (raw) {
                btnIconInsert.disabled = false;
                btnIconInsert.innerHTML = uiIcon("download") + (isKhmer() ? "បញ្ចូលរូប Vector (Insert Icon)" : "Insert Vector Icon");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "ok") {
                    var okMsg = isKhmer() ? "បានបញ្ចូលរូប " + res.name + " (" + res.width + "x" + res.height + " pt) លើ Layer " + res.layer : "Placed " + res.name + " (" + res.width + "x" + res.height + " pt) on layer " + res.layer;
                    setStatus(okMsg, "success", 4000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to place icon");
                    showError(isKhmer() ? "ការបញ្ចូលរូបសញ្ញាបរាជ័យ" : "Icon Import Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        updateHero(selectedIcon);
        renderGrid();
    }

    // -------------------------------------------------------------
    // In-Dock Script Launcher View
    // -------------------------------------------------------------
    function renderEmbeddedLauncher() {
        var html = [];

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-row-2col">');
        html.push('    <input type="text" id="launcherSearchInput" class="embed-input" placeholder="' + (isKhmer() ? "ស្វែងរកស្គ្រីប..." : "Search scripts...") + '" style="width:100%;">');
        html.push('    <button type="button" id="btnLauncherRefresh" class="btn-action-secondary" style="padding:4px 8px;">' + uiIcon("refresh", 12) + (isKhmer() ? "ផ្ទុកឡើងវិញ" : "Refresh") + '</button>');
        html.push('  </div>');
        html.push('  <div class="script-folder-bar" style="margin-top:8px;">');
        html.push('    <span class="script-folder-path" id="launcherFolderPath">Scanning scripts...</span>');
        html.push('    <button type="button" id="btnLauncherBrowse" class="btn-action-secondary" style="padding:2px 8px;font-size:10px;white-space:nowrap;">' + uiIcon("folder", 12) + (isKhmer() ? "ជ្រើស Folder" : "Browse...") + '</button>');
        html.push('  </div>');
        html.push('</div>');

        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span id="launcherCountHeader">' + (isKhmer() ? "បញ្ជីស្គ្រីប (Scripts List)" : "Available Scripts") + '</span></div>');
        html.push('  <div class="script-list" id="launcherScriptList">');
        html.push('    <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11px;">' + (isKhmer() ? "កំពុងស្កេនស្គ្រីប..." : "Scanning scripts...") + '</div>');
        html.push('  </div>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var launcherSearchInput = document.getElementById("launcherSearchInput");
        var btnLauncherRefresh = document.getElementById("btnLauncherRefresh");
        var launcherFolderPath = document.getElementById("launcherFolderPath");
        var btnLauncherBrowse = document.getElementById("btnLauncherBrowse");
        var launcherCountHeader = document.getElementById("launcherCountHeader");
        var launcherScriptList = document.getElementById("launcherScriptList");

        var allScripts = [];

        function renderScriptList() {
            var q = launcherSearchInput.value.trim().toLowerCase();
            var filtered = allScripts.filter(function (s) {
                return !q || s.name.toLowerCase().indexOf(q) !== -1 || s.fileName.toLowerCase().indexOf(q) !== -1;
            });

            launcherCountHeader.textContent = (isKhmer() ? "បញ្ជីស្គ្រីប (" + filtered.length + ")" : "Available Scripts (" + filtered.length + ")");

            if (filtered.length === 0) {
                launcherScriptList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11px;">' + (isKhmer() ? "រកមិនឃើញស្គ្រីបទេ" : "No scripts found matching search") + '</div>';
                return;
            }

            var sHtml = [];
            filtered.forEach(function (script) {
                var kb = Math.round((script.size || 0) / 1024);
                sHtml.push('<div class="script-item">');
                sHtml.push('  <div class="script-info">');
                sHtml.push('    <div class="script-name" title="' + escapeHtml(script.path) + '">' + uiIcon("file", 12) + escapeHtml(script.name) + '</div>');
                sHtml.push('    <div class="script-meta"><span>' + kb + ' KB</span><span>•</span><span>' + escapeHtml(script.fileName) + '</span></div>');
                sHtml.push('  </div>');
                sHtml.push('  <button type="button" class="script-run-btn" data-path="' + escapeHtml(script.path) + '">' + uiIcon("play", 10) + (isKhmer() ? "រត់" : "Run") + '</button>');
                sHtml.push('</div>');
            });
            launcherScriptList.innerHTML = sHtml.join("");
        }

        function loadScripts(customFolder) {
            launcherScriptList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11px;">' + (isKhmer() ? "កំពុងស្កេនស្គ្រីប..." : "Scanning scripts...") + '</div>';

            if (!csInterface) {
                setTimeout(function () {
                    launcherFolderPath.textContent = "D:/git/script/scripts";
                    allScripts = [
                        { name: "Batch Production Exporter", fileName: "Batch Production Exporter.jsx", path: "D:/git/script/scripts/Batch Production Exporter.jsx", size: 45000 },
                        { name: "CutContour Generator", fileName: "CutContour Generator.jsx", path: "D:/git/script/scripts/CutContour Generator.jsx", size: 32000 },
                        { name: "Generate QR Code", fileName: "Generate QR Code.jsx", path: "D:/git/script/scripts/Generate QR Code.jsx", size: 18000 },
                        { name: "Nesting", fileName: "Nesting.jsx", path: "D:/git/script/scripts/Nesting.jsx", size: 68000 },
                        { name: "Smart Dimension", fileName: "Smart Dimension.jsx", path: "D:/git/script/scripts/Smart Dimension.jsx", size: 28000 }
                    ];
                    renderScriptList();
                }, 500);
                return;
            }

            var arg = customFolder ? JSON.stringify(customFolder) : '""';
            csInterface.evalScript("ozoScanLauncherScripts(" + arg + ")", function (raw) {
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "ok") {
                    launcherFolderPath.textContent = res.folder || "Scripts Folder";
                    allScripts = res.scripts || [];
                    renderScriptList();
                } else {
                    var errMsg = (res && res.message) || String(raw || "Failed to scan scripts");
                    launcherScriptList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-error);font-size:11px;">Error: ' + escapeHtml(errMsg) + '</div>';
                }
            });
        }

        launcherSearchInput.addEventListener("input", renderScriptList);
        launcherSearchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                var firstBtn = launcherScriptList.querySelector(".script-run-btn");
                if (firstBtn) firstBtn.click();
            }
        });
        btnLauncherRefresh.addEventListener("click", function () { loadScripts(); });

        btnLauncherBrowse.addEventListener("click", function () {
            if (!csInterface) {
                loadScripts();
                return;
            }
            csInterface.evalScript('(function(){ var f = Folder.selectDialog("Select Scripts Directory"); return f ? f.fsName : ""; })()', function (chosen) {
                var p = String(chosen || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
                if (p && p !== "null" && p !== "undefined") {
                    loadScripts(p);
                }
            });
        });

        launcherScriptList.addEventListener("click", function (e) {
            var btn = closest(e.target, ".script-run-btn", launcherScriptList);
            if (!btn) return;
            var scriptPath = btn.getAttribute("data-path");
            if (!scriptPath) return;

            hideError();
            btn.disabled = true;
            btn.innerHTML = uiIcon("refresh", 10);
            setStatus(isKhmer() ? "កំពុងដំណើរការស្គ្រីប..." : "Executing script...", "running");

            if (!csInterface) {
                setTimeout(function () {
                    btn.disabled = false;
                    btn.innerHTML = uiIcon("play", 10) + (isKhmer() ? "រត់" : "Run");
                    setStatus("Simulated Script Executed: " + scriptPath, "success", 3000);
                }, 800);
                return;
            }

            csInterface.evalScript("ozoRunLauncherScript(" + JSON.stringify(scriptPath) + ")", function (raw) {
                btn.disabled = false;
                btn.innerHTML = uiIcon("play", 10) + (isKhmer() ? "រត់" : "Run");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}

                if (res && res.status === "ok") {
                    setStatus(isKhmer() ? "បានបញ្ចប់ស្គ្រីប " + res.file + " ដោយជោគជ័យ" : "Executed " + res.file + " successfully", "success", 4000);
                } else {
                    var errMsg = (res && res.message) || String(raw || "Script execution failed");
                    showError(isKhmer() ? "ការរត់ស្គ្រីបបរាជ័យ" : "Script Failed", errMsg);
                    setStatus(isKhmer() ? "បញ្ហា៖ " + errMsg : "Error: " + errMsg, "error", 6000);
                }
            });
        });

        loadScripts();
    }

    // -------------------------------------------------------------
    // In-Dock Rich Black Optimizer View
    // -------------------------------------------------------------
    function renderEmbeddedRichBlack() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_richblack_settings", "{}")); } catch (e) {}

        var PRESETS = [
            { id: "standard", name: isKhmer() ? "ស្តង់ដាររោងពុម្ព (Standard C60 M40 Y40 K100)" : "Standard Prepress (C60 M40 Y40 K100)", c: 60, m: 40, y: 40, k: 100, tic: 240 },
            { id: "cool",     name: isKhmer() ? "ខ្មៅត្រជាក់រលោង (Cool C60 M0 Y0 K100)" : "Cool Rich Black (C60 M0 Y0 K100)",     c: 60, m: 0,  y: 0,  k: 100, tic: 160 },
            { id: "warm",     name: isKhmer() ? "ខ្មៅកក់ក្តៅ (Warm C30 M60 Y60 K100)" : "Warm Rich Black (C30 M60 Y60 K100)",   c: 30, m: 60, y: 60, k: 100, tic: 250 },
            { id: "backlit",  name: isKhmer() ? "បដា & ប្រអប់ភ្លើង (Backlit C70 M50 Y30 K100)" : "Backlit & Signage (C70 M50 Y30 K100)", c: 70, m: 50, y: 30, k: 100, tic: 250 },
            { id: "custom",   name: isKhmer() ? "កំណត់ដោយខ្លួនឯង (Custom CMYK)" : "Custom CMYK Mix",                      c: 60, m: 40, y: 40, k: 100, tic: 240 }
        ];

        var state = {
            preset: saved.preset !== undefined ? saved.preset : 0,
            c: saved.c !== undefined ? saved.c : 60,
            m: saved.m !== undefined ? saved.m : 40,
            y: saved.y !== undefined ? saved.y : 40,
            k: saved.k !== undefined ? saved.k : 100,
            scope: saved.scope || "selection",
            targetFills: saved.targetFills !== false,
            targetStrokes: saved.targetStrokes === true,
            protectSmallText: saved.protectSmallText !== false,
            textThreshold: saved.textThreshold !== undefined ? saved.textThreshold : 24,
            autoOverprint: saved.autoOverprint !== false
        };

        var html = [];

        // 0. Live Prepress Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="rbLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Profile Preset Selector
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "កម្រិតពណ៌ខ្មៅដិត (Rich Black Profile)" : "Prepress Black Profile") + '</span></div>');
        html.push('  <select id="rbPresetSelect" class="embed-select" style="width:100%;">');
        for (var p = 0; p < PRESETS.length; p++) {
            html.push('    <option value="' + p + '" ' + (state.preset == p ? "selected" : "") + '>' + escapeHtml(PRESETS[p].name) + '</option>');
        }
        html.push('  </select>');

        // CMYK Mix Grid
        html.push('  <div class="embed-row-4col" style="margin-top:8px;">');
        html.push('    <div><label style="font-size:10px;color:var(--text-secondary);">C %</label><input type="number" id="rbCInput" class="embed-input" value="' + state.c + '" min="0" max="100" style="width:100%;margin-top:2px;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-secondary);">M %</label><input type="number" id="rbMInput" class="embed-input" value="' + state.m + '" min="0" max="100" style="width:100%;margin-top:2px;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-secondary);">Y %</label><input type="number" id="rbYInput" class="embed-input" value="' + state.y + '" min="0" max="100" style="width:100%;margin-top:2px;"></div>');
        html.push('    <div><label style="font-size:10px;color:var(--text-secondary);">K %</label><input type="number" id="rbKInput" class="embed-input" value="' + state.k + '" min="0" max="100" style="width:100%;margin-top:2px;"></div>');
        html.push('  </div>');
        html.push('  <div id="rbTicBadge" style="margin-top:6px;font-size:11px;color:var(--accent);font-weight:600;"></div>');
        html.push('</div>');

        // 2. Scope & Target Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "គោលដៅអនុវត្ត (Scope & Target)" : "Scope & Targets") + '</span></div>');
        html.push('  <div class="embed-segmented" id="rbScopeSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.scope === "selection" ? "active" : "") + '" data-scope="selection">' + (isKhmer() ? "វត្ថុជ្រើសរើស" : "Selection") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.scope === "document" ? "active" : "") + '" data-scope="document">' + (isKhmer() ? "ឯកសារទាំងមូល" : "Entire Document") + '</button>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkRbFills" ' + (state.targetFills ? "checked" : "") + '> ' + (isKhmer() ? "បម្លែងពណ៌ផ្ទៃក្នុង (Fill Colors)" : "Convert Fill Colors") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkRbStrokes" ' + (state.targetStrokes ? "checked" : "") + '> ' + (isKhmer() ? "បម្លែងពណ៌បន្ទាត់គែម (Stroke Colors)" : "Convert Stroke Outlines") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 3. Prepress Safety Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "សុវត្ថិភាពអក្សរ (Text Registration Safety)" : "Prepress Safety") + '</span></div>');
        html.push('  <div style="display:flex;flex-direction:column;gap:6px;">');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkRbProtectText" ' + (state.protectSmallText ? "checked" : "") + '> ' + (isKhmer() ? "ការពារអក្សរតូចៗ (រក្សា K:100% កុំឲ្យបែកព្រាល)" : "Protect Small Text (Keep K:100%)") + '</label>');
        html.push('    <label class="embed-check-row"><input type="checkbox" id="chkRbOverprint" ' + (state.autoOverprint ? "checked" : "") + '> ' + (isKhmer() ? "Overprint អក្សរខ្មៅស្វ័យប្រវត្តិ (Overprint Fill)" : "Auto-Overprint pure black text") + '</label>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Action Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnRbSubmit" class="btn-action-primary">' + uiIcon("refresh") + (isKhmer() ? "អនុវត្ត Rich Black លើគំនូរ" : "Apply Rich Black Optimizer") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var rbPresetSelect = $("rbPresetSelect");
        var rbCInput = $("rbCInput");
        var rbMInput = $("rbMInput");
        var rbYInput = $("rbYInput");
        var rbKInput = $("rbKInput");
        var rbTicBadge = $("rbTicBadge");
        var rbScopeBtns = embeddedContent.querySelectorAll("#rbScopeSegmented .embed-seg-btn");
        var chkRbFills = $("chkRbFills");
        var chkRbStrokes = $("chkRbStrokes");
        var chkRbProtectText = $("chkRbProtectText");
        var chkRbOverprint = $("chkRbOverprint");
        var btnRbSubmit = $("btnRbSubmit");

        function updateRbTicket() {
            var box = $("rbLiveTicket");
            if (!box) return;

            var c = parseInt(rbCInput.value, 10) || 0;
            var m = parseInt(rbMInput.value, 10) || 0;
            var y = parseInt(rbYInput.value, 10) || 0;
            var k = parseInt(rbKInput.value, 10) || 0;
            var tic = c + m + y + k;

            var pObj = PRESETS[state.preset] || PRESETS[0];
            var pName = (state.preset === 4) ? ("Custom (C" + c + " M" + m + " Y" + y + " K" + k + ")") : pObj.name;

            var safety = tic <= 260 ? "Safe for Press" : (tic <= 300 ? "Heavy Ink (Dry Time)" : "Warning: Over 300%");
            rbTicBadge.textContent = "Total Ink Coverage (TIC): " + tic + "% (" + safety + ")";
            rbTicBadge.style.color = tic > 300 ? "var(--danger)" : "var(--accent)";

            var targets = [];
            if (chkRbFills.checked) targets.push(isKhmer() ? "ផ្ទៃក្នុង" : "Fills");
            if (chkRbStrokes.checked) targets.push(isKhmer() ? "បន្ទាត់ក្រៅ" : "Strokes");
            var targetText = targets.length ? targets.join(" & ") : (isKhmer() ? "គ្មាន" : "None");
            var scopeText = state.scope === "selection" ? (isKhmer() ? "លើវត្ថុជ្រើសរើស" : "Selection") : (isKhmer() ? "ឯកសារទាំងមូល" : "Entire Document");

            var dimText = "TIC: " + tic + "% • " + targetText + " • " + scopeText;

            var noteParts = [];
            if (chkRbProtectText.checked) noteParts.push(isKhmer() ? "ការពារអក្សរ ≤ 24pt" : "Protect text ≤ 24pt");
            if (chkRbOverprint.checked) noteParts.push(isKhmer() ? "Auto Overprint K100" : "Auto-Overprint K100");

            var tHtml = '';
            tHtml += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' • Rich Black Optimizer</div>';
            tHtml += '<div class="ticket-line-mat">' + escapeHtml(pName) + '</div>';
            tHtml += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            tHtml += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" • ")) + '</div>';
            tHtml += '<button type="button" id="btnCopyKhqrPayload" class="btn-copy-ticket" style="margin-top:6px;width:100%;">';
            tHtml += uiIcon("copy", 11) + ' <span>' + (isKhmer() ? "ចម្លងកូដ KHQR Payload String" : "Copy KHQR Payload String") + '</span>';
            tHtml += '</button>';
            box.innerHTML = tHtml;

            var btnCopyPayload = box.querySelector("#btnCopyKhqrPayload");
            if (btnCopyPayload) {
                btnCopyPayload.onclick = function (e) {
                    e.stopPropagation();
                    function formatKhqrTag(tag, val) {
                        var str = String(val);
                        var l = str.length;
                        return tag + (l < 10 ? "0" + l : l) + str;
                    }
                    function calculateKhqrCRC16(str) {
                        var crc = 0xFFFF;
                        for (var i = 0; i < str.length; i++) {
                            var c = str.charCodeAt(i) & 0xFF;
                            crc ^= (c << 8);
                            for (var j = 0; j < 8; j++) {
                                if ((crc & 0x8000) !== 0) {
                                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                                } else {
                                    crc = (crc << 1) & 0xFFFF;
                                }
                            }
                        }
                        var hex = crc.toString(16).toUpperCase();
                        while (hex.length < 4) hex = "0" + hex;
                        return hex;
                    }
                    var amtNum = parseFloat(amt);
                    var isDyn = !isNaN(amtNum) && amtNum > 0;
                    var curCode = cur === "KHR" ? "116" : "840";
                    var bClean = (bId || "merchant@abab").replace(/\s+/g, "");
                    var mInfo = formatKhqrTag("00", "bakong@cbrd") + formatKhqrTag("01", bClean);
                    var p = "";
                    p += formatKhqrTag("00", "01");
                    p += formatKhqrTag("01", isDyn ? "12" : "11");
                    p += formatKhqrTag("29", mInfo);
                    p += formatKhqrTag("52", "5999");
                    p += formatKhqrTag("53", curCode);
                    if (isDyn) {
                        p += formatKhqrTag("54", curCode === "KHR" ? String(Math.round(amtNum)) : amtNum.toFixed(2));
                    }
                    p += formatKhqrTag("58", "KH");
                    p += formatKhqrTag("59", (mName || "OZO MERCHANT").substring(0, 25));
                    p += formatKhqrTag("60", "Phnom Penh");
                    var billNum = khqrBillInput ? khqrBillInput.value.trim() : state.billNumber;
                    if (billNum) {
                        p += formatKhqrTag("62", formatKhqrTag("01", String(billNum).substring(0, 25)));
                    }
                    var toChecksum = p + "6304";
                    var rawPayload = toChecksum + calculateKhqrCRC16(toChecksum);

                    copyToClipboard(rawPayload, function () {
                        btnCopyPayload.innerHTML = uiIcon("check", 11) + " <span>" + (isKhmer() ? "បានចម្លងរួចរាល់!" : "Copied Payload!") + "</span>";
                        setStatus(isKhmer() ? "បានចម្លង KHQR String ទៅ Clipboard!" : "KHQR payload copied to clipboard!", "success", 2000);
                        setTimeout(function () {
                            btnCopyPayload.innerHTML = uiIcon("copy", 11) + ' <span>' + (isKhmer() ? "ចម្លងកូដ KHQR Payload String" : "Copy KHQR Payload String") + '</span>';
                        }, 1600);
                    });
                };
            }
        }

        function saveRbState() {
            state.preset = parseInt(rbPresetSelect.value, 10) || 0;
            state.c = parseInt(rbCInput.value, 10) || 60;
            state.m = parseInt(rbMInput.value, 10) || 40;
            state.y = parseInt(rbYInput.value, 10) || 40;
            state.k = parseInt(rbKInput.value, 10) || 100;
            state.targetFills = chkRbFills.checked;
            state.targetStrokes = chkRbStrokes.checked;
            state.protectSmallText = chkRbProtectText.checked;
            state.autoOverprint = chkRbOverprint.checked;
            store.setDebounced("ozo_richblack_settings", JSON.stringify(state), 250);
            updateRbTicket();
        }

        rbPresetSelect.addEventListener("change", function () {
            var idx = parseInt(this.value, 10) || 0;
            state.preset = idx;
            if (idx !== 4) {
                var p = PRESETS[idx];
                rbCInput.value = p.c;
                rbMInput.value = p.m;
                rbYInput.value = p.y;
                rbKInput.value = p.k;
                rbCInput.disabled = true;
                rbMInput.disabled = true;
                rbYInput.disabled = true;
                rbKInput.disabled = true;
            } else {
                rbCInput.disabled = false;
                rbMInput.disabled = false;
                rbYInput.disabled = false;
                rbKInput.disabled = false;
            }
            saveRbState();
        });

        rbCInput.addEventListener("input", saveRbState);
        rbMInput.addEventListener("input", saveRbState);
        rbYInput.addEventListener("input", saveRbState);
        rbKInput.addEventListener("input", saveRbState);
        chkRbFills.addEventListener("change", saveRbState);
        chkRbStrokes.addEventListener("change", saveRbState);
        chkRbProtectText.addEventListener("change", saveRbState);
        chkRbOverprint.addEventListener("change", saveRbState);

        for (var sb = 0; sb < rbScopeBtns.length; sb++) {
            rbScopeBtns[sb].addEventListener("click", function () {
                for (var s = 0; s < rbScopeBtns.length; s++) rbScopeBtns[s].classList.remove("active");
                this.classList.add("active");
                state.scope = this.getAttribute("data-scope");
                saveRbState();
            });
        }

        btnRbSubmit.addEventListener("click", function () {
            if (!chkRbFills.checked && !chkRbStrokes.checked) {
                showError(isKhmer() ? "សូមជ្រើសរើស Fills ឬ Strokes ជាមុនសិន!" : "Please enable Fills or Strokes first!");
                return;
            }
            hideError();
            btnRbSubmit.disabled = true;
            btnRbSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងបម្លែង..." : "Converting to Rich Black...");
            setStatus(isKhmer() ? "កំពុងអនុវត្ត Rich Black..." : "Applying Rich Black Optimizer...", "running");

            var payload = {
                c: parseInt(rbCInput.value, 10) || 60,
                m: parseInt(rbMInput.value, 10) || 40,
                y: parseInt(rbYInput.value, 10) || 40,
                k: parseInt(rbKInput.value, 10) || 100,
                targetFills: chkRbFills.checked,
                targetStrokes: chkRbStrokes.checked,
                protectSmallText: chkRbProtectText.checked,
                textThreshold: 24,
                autoOverprint: chkRbOverprint.checked,
                scope: state.scope
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnRbSubmit.disabled = false;
                    btnRbSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "អនុវត្ត Rich Black លើគំនូរ" : "Apply Rich Black Optimizer");
                    setStatus(isKhmer() ? "បានបម្លែង 12 វត្ថុទៅជា Rich Black (Simulation)" : "Converted 12 items to Rich Black (Preview)", "success", 4000);
                }, 800);
                return;
            }

            csInterface.evalScript("ozoExecuteRichBlack(" + JSON.stringify(JSON.stringify(payload)) + ")", function (raw) {
                btnRbSubmit.disabled = false;
                btnRbSubmit.innerHTML = uiIcon("refresh") + (isKhmer() ? "អនុវត្ត Rich Black លើគំនូរ" : "Apply Rich Black Optimizer");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success") {
                    setStatus(res.message, "success", 4500);
                } else {
                    showError((res && res.message) || String(raw || "Rich Black optimization failed"));
                }
            });
        });

        // Initialize preset state
        var initPreset = parseInt(rbPresetSelect.value, 10) || 0;
        if (initPreset !== 4) {
            rbCInput.disabled = true;
            rbMInput.disabled = true;
            rbYInput.disabled = true;
            rbKInput.disabled = true;
        }
        updateRbTicket();
    }

    // -------------------------------------------------------------
    // In-Dock ABA KHQR Generator View
    // -------------------------------------------------------------
    function renderEmbeddedKHQR() {
        var saved = {};
        try { saved = JSON.parse(store.get("ozo_khqr_settings", "{}")); } catch (e) {}

        var state = {
            style: saved.style || "Bakong Red Standee",
            badgeSymbol: saved.badgeSymbol || "bakong",
            merchantName: saved.merchantName || "OZO PRINT SHOP",
            bakongId: saved.bakongId || "heng_zm@abab",
            currency: saved.currency || "USD",
            amount: saved.amount || "",
            billNumber: saved.billNumber || "",
            width: saved.width || 100,
            fitArtboard: (typeof saved.fitArtboard !== "undefined") ? !!saved.fitArtboard : true
        };

        var html = [];

        // 0. Live Prepress Ticket Card
        html.push('<div class="embed-card feature-ticket-card">');
        html.push('  <div class="embed-card-header" style="margin-bottom:6px;">');
        html.push('    <span>' + (isKhmer() ? "ទម្រង់បដាព័ត៌មាន (Live Ticket)" : "Live Job Ticket Preview") + '</span>');
        html.push('    <div style="display:flex;align-items:center;gap:6px;">');
        html.push('      <button type="button" class="btn-copy-ticket" title="' + (isKhmer() ? "ចម្លងព័ត៌មាន Ticket (Copy to Clipboard)" : "Copy Job Ticket to Clipboard") + '">📋 ' + (isKhmer() ? "ចម្លង" : "Copy") + '</button>');
        html.push('      <span class="live-badge"><span class="live-dot"></span>LIVE</span>');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="print-job-ticket-card" id="khqrLiveTicket" title="' + (isKhmer() ? "ចុចដើម្បីចម្លងព័ត៌មាន Ticket (Click to Copy)" : "Click anywhere on ticket to copy") + '"></div>');
        html.push('</div>');

        // 1. Template Style Segmented
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ទម្រង់កាតទូទាត់ (Output Template)" : "Template Style") + '</span></div>');
        html.push('  <div class="embed-segmented" id="khqrStyleSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "Bakong Red Standee" ? "active" : "") + '" data-style="Bakong Red Standee">Bakong Standee</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "ABA Navy Standee" ? "active" : "") + '" data-style="ABA Navy Standee">ABA Standee</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.style === "Vector QR Only" ? "active" : "") + '" data-style="Vector QR Only">QR Only</button>');
        html.push('  </div>');
        html.push('</div>');

        // 1b. Center Badge Emblem Selection
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "និមិត្តសញ្ញាកណ្តាល (Center Badge Emblem)" : "Center Badge Icon") + '</span></div>');
        html.push('  <div class="embed-segmented" id="khqrBadgeSegmented">');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.badgeSymbol === "bakong" ? "active" : "") + '" data-badge="bakong">' + (isKhmer() ? "ប្រាសាទបាគង (Bakong Temple)" : "Bakong Temple (Official)") + '</button>');
        html.push('    <button type="button" class="embed-seg-btn ' + (state.badgeSymbol === "currency" ? "active" : "") + '" data-badge="currency">' + (isKhmer() ? "សញ្ញារូបិយប័ណ្ណ ($ / ៛)" : "Currency Symbol ($ / ៛)") + '</button>');
        html.push('  </div>');
        html.push('</div>');

        // 2. Merchant Information Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ព័ត៌មានគណនី (Merchant Details)" : "Merchant Account") + '</span></div>');
        html.push('  <div style="margin-bottom:8px;">');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ឈ្មោះហាង / អាជីវកម្ម (Merchant Name):" : "Merchant Name:") + '</label>');
        html.push('    <input type="text" id="khqrNameInput" class="embed-input" value="' + escapeHtml(state.merchantName) + '" placeholder="OZO PRINT SHOP" style="width:100%;margin-top:2px;">');
        html.push('  </div>');
        html.push('  <div>');
        html.push('    <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "គណនីបាគង / ABA (Bakong ID / Phone):" : "Bakong ID (e.g. phone@abab):") + '</label>');
        html.push('    <input type="text" id="khqrIdInput" class="embed-input" value="' + escapeHtml(state.bakongId) + '" placeholder="heng_zm@abab" style="width:100%;margin-top:2px;">');
        html.push('  </div>');
        html.push('</div>');

        // 3. Payment Details Card
        html.push('<div class="embed-card">');
        html.push('  <div class="embed-card-header"><span>' + (isKhmer() ? "ចំនួនទឹកប្រាក់ (Amount & Currency)" : "Payment Options") + '</span></div>');
        html.push('  <div class="embed-row-2col">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "រូបិយប័ណ្ណ:" : "Currency:") + '</label>');
        html.push('      <select id="khqrCurSelect" class="embed-select" style="width:100%;margin-top:2px;">');
        html.push('        <option value="USD" ' + (state.currency === "USD" ? "selected" : "") + '>USD ($)</option>');
        html.push('        <option value="KHR" ' + (state.currency === "KHR" ? "selected" : "") + '>KHR (៛)</option>');
        html.push('      </select>');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទឹកប្រាក់ (ទទេ = ស្កេនតាមចិត្ត):" : "Amount (Optional):") + '</label>');
        html.push('      <input type="text" id="khqrAmtInput" class="embed-input" value="' + escapeHtml(state.amount) + '" placeholder="e.g. 5.00" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div class="embed-row-2col" style="margin-top:8px;">');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "ទទឹងកាត (Card Width):" : "Card Width (mm):") + '</label>');
        html.push('      <input type="number" id="khqrWidthInput" class="embed-input" value="' + state.width + '" min="30" max="500" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('    <div>');
        html.push('      <label style="font-size:10.5px;color:var(--text-secondary);">' + (isKhmer() ? "លេខវិក្កយបត្រ (Bill #):" : "Bill # (Optional):") + '</label>');
        html.push('      <input type="text" id="khqrBillInput" class="embed-input" value="' + escapeHtml(state.billNumber) + '" placeholder="INV-001" style="width:100%;margin-top:2px;">');
        html.push('    </div>');
        html.push('  </div>');
        html.push('  <div style="margin-top:8px;">');
        html.push('    <label style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;cursor:pointer;">');
        html.push('      <input type="checkbox" id="khqrFitArtboardCheck" ' + (state.fitArtboard ? "checked" : "") + '> ' + (isKhmer() ? "ពង្រីក/តម្រឹម Artboard ស្មើទំហំកាត Standee" : "Fit Active Artboard to Standee Card"));
        html.push('    </label>');
        html.push('  </div>');
        html.push('</div>');

        // 4. Action Wrap
        html.push('<div class="embed-action-wrap">');
        html.push('  <button type="button" id="btnKhqrSubmit" class="btn-action-primary">' + uiIcon("export") + (isKhmer() ? "បង្កើត ABA KHQR Vector" : "Generate KHQR Vector Artwork") + '</button>');
        html.push('</div>');

        embeddedContent.innerHTML = html.join("\n");

        var khqrStyleBtns = embeddedContent.querySelectorAll("#khqrStyleSegmented .embed-seg-btn");
        var khqrNameInput = $("khqrNameInput");
        var khqrIdInput = $("khqrIdInput");
        var khqrCurSelect = $("khqrCurSelect");
        var khqrAmtInput = $("khqrAmtInput");
        var khqrWidthInput = $("khqrWidthInput");
        var khqrBillInput = $("khqrBillInput");
        var btnKhqrSubmit = $("btnKhqrSubmit");

        function updateKhqrTicket() {
            var box = $("khqrLiveTicket");
            if (!box) return;

            var mName = (khqrNameInput ? khqrNameInput.value.trim() : state.merchantName) || "OZO MERCHANT";
            var bId = (khqrIdInput ? khqrIdInput.value.trim() : state.bakongId) || "merchant@abab";
            var cur = khqrCurSelect ? khqrCurSelect.value : state.currency;
            var amt = khqrAmtInput ? khqrAmtInput.value.trim() : state.amount;
            var w = parseFloat(khqrWidthInput ? khqrWidthInput.value : state.width) || 100;

            var amtDisplay = amt ? ((cur === "KHR" ? "៛ " : "$ ") + amt) : (isKhmer() ? "ស្កេនតាមចិត្ត (Any Amount)" : "Any Amount (Static)");
            var isCard = state.style.indexOf("Standee") !== -1 || state.style.indexOf("Card") !== -1;
            var dimText = isCard ? ("w" + w + "mm x h" + Math.round(w * 1.5) + "mm • " + amtDisplay) : ("w" + w + "mm x h" + w + "mm • Vector QR");

            var noteParts = [];
            noteParts.push(state.style);
            if (khqrBillInput && khqrBillInput.value.trim()) noteParts.push("Bill: " + khqrBillInput.value.trim());
            noteParts.push(isKhmer() ? "ស្តង់ដារបាគង EMVCo" : "EMVCo Compliant");

            var tHtml = '';
            tHtml += '<div class="ticket-line-date">' + escapeHtml(getTicketDateStr()) + ' • ABA KHQR Generator</div>';
            tHtml += '<div class="ticket-line-mat">' + escapeHtml(mName) + ' (' + escapeHtml(bId) + ')</div>';
            tHtml += '<div class="ticket-line-dim">' + escapeHtml(dimText) + '</div>';
            tHtml += '<div class="ticket-line-note">' + escapeHtml(noteParts.join(" • ")) + '</div>';
            box.innerHTML = tHtml;
        }

        var khqrBadgeBtns = embeddedContent.querySelectorAll("#khqrBadgeSegmented .embed-seg-btn");
        var khqrFitArtboardCheck = $("khqrFitArtboardCheck");

        function saveKhqrState() {
            state.merchantName = khqrNameInput.value.trim() || "OZO MERCHANT";
            state.bakongId = khqrIdInput.value.trim() || "merchant@abab";
            state.currency = khqrCurSelect.value;
            state.amount = khqrAmtInput.value.trim();
            state.width = parseFloat(khqrWidthInput.value) || 100;
            state.billNumber = khqrBillInput.value.trim();
            if (khqrFitArtboardCheck) state.fitArtboard = !!khqrFitArtboardCheck.checked;
            store.setDebounced("ozo_khqr_settings", JSON.stringify(state), 250);
            updateKhqrTicket();
        }

        for (var bIdx = 0; bIdx < khqrBadgeBtns.length; bIdx++) {
            khqrBadgeBtns[bIdx].addEventListener("click", function () {
                for (var bb = 0; bb < khqrBadgeBtns.length; bb++) khqrBadgeBtns[bb].classList.remove("active");
                this.classList.add("active");
                state.badgeSymbol = this.getAttribute("data-badge");
                saveKhqrState();
            });
        }
        if (khqrFitArtboardCheck) khqrFitArtboardCheck.addEventListener("change", saveKhqrState);

        for (var s = 0; s < khqrStyleBtns.length; s++) {
            khqrStyleBtns[s].addEventListener("click", function () {
                for (var sb = 0; sb < khqrStyleBtns.length; sb++) khqrStyleBtns[sb].classList.remove("active");
                this.classList.add("active");
                state.style = this.getAttribute("data-style");
                if (state.style === "Vector QR Only" && state.width > 60) {
                    khqrWidthInput.value = "50";
                } else if (state.style !== "Vector QR Only" && state.width < 80) {
                    khqrWidthInput.value = "100";
                }
                saveKhqrState();
            });
        }

        khqrNameInput.addEventListener("input", saveKhqrState);
        khqrIdInput.addEventListener("input", saveKhqrState);
        khqrCurSelect.addEventListener("change", saveKhqrState);
        khqrAmtInput.addEventListener("input", saveKhqrState);
        khqrWidthInput.addEventListener("input", saveKhqrState);
        khqrBillInput.addEventListener("input", saveKhqrState);

        btnKhqrSubmit.addEventListener("click", function () {
            hideError();
            btnKhqrSubmit.disabled = true;
            btnKhqrSubmit.innerHTML = uiIcon("refresh") + " " + (isKhmer() ? "កំពុងបង្កើត..." : "Generating KHQR...");
            setStatus(isKhmer() ? "កំពុងបង្កើត ABA KHQR Vector..." : "Building ABA KHQR Artwork...", "running");

            var chosenBadge = state.badgeSymbol;
            if (chosenBadge === "currency") {
                chosenBadge = (khqrCurSelect.value === "KHR") ? "KHR" : "USD";
            } else {
                chosenBadge = "bakong";
            }

            var payload = {
                merchantName: khqrNameInput.value.trim() || "OZO MERCHANT",
                bakongId: khqrIdInput.value.trim() || "merchant@abab",
                currency: khqrCurSelect.value,
                amount: khqrAmtInput.value.trim(),
                billNumber: khqrBillInput.value.trim(),
                style: state.style,
                width: parseFloat(khqrWidthInput.value) || 100,
                badgeSymbol: chosenBadge,
                fitArtboard: khqrFitArtboardCheck ? !!khqrFitArtboardCheck.checked : true
            };

            if (!csInterface) {
                setTimeout(function () {
                    btnKhqrSubmit.disabled = false;
                    btnKhqrSubmit.innerHTML = uiIcon("export") + (isKhmer() ? "បង្កើត ABA KHQR Vector" : "Generate KHQR Vector Artwork");
                    setStatus(isKhmer() ? "បានបង្កើត ABA KHQR Vector (Simulation)" : "Generated ABA KHQR Vector (Preview)", "success", 4000);
                }, 800);
                return;
            }

            csInterface.evalScript("ozoExecuteKHQR(" + JSON.stringify(JSON.stringify(payload)) + ")", function (raw) {
                btnKhqrSubmit.disabled = false;
                btnKhqrSubmit.innerHTML = uiIcon("export") + (isKhmer() ? "បង្កើត ABA KHQR Vector" : "Generate KHQR Vector Artwork");
                var res = null;
                try { res = JSON.parse(String(raw || "").replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "")); } catch (e) {}
                if (res && res.status === "success") {
                    setStatus(res.message, "success", 4500);
                } else {
                    showError((res && res.message) || String(raw || "Failed to generate ABA KHQR"));
                }
            });
        });

        updateKhqrTicket();
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
        html.push('    <button type="button" id="btnGenericRun" class="btn-action-primary">' + uiIcon("play") + (isKhmer() ? "ដំណើរការក្នុង Illustrator" : "Run in Illustrator") + '</button>');
        html.push('    <button type="button" id="btnGenericDialog" class="btn-action-secondary">' + uiIcon("export") + (isKhmer() ? "បើកផ្ទាំងបញ្ជា (Dialog)" : "Open Dialog Window") + '</button>');
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

        // Clicking category badge filters directly to that category
        var badge = closest(e.target, ".tool-badge", card);
        if (badge) {
            var targetBtn = tabsContainer.querySelector('.tab-btn[data-category="' + tool.category + '"]');
            if (targetBtn) {
                setCategory(targetBtn);
                return;
            }
        }

        if (closest(e.target, ".preview-card-btn", card)) { openPreviewPanel(card.getAttribute("data-id")); return; }
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
        } else if (key === "p" || key === "P") {
            e.preventDefault();
            if (tool) openPreviewPanel(tool.id);
        } else if (key === "ArrowDown" || key === "ArrowRight") {
            e.preventDefault();
            target = card.nextElementSibling;
            if (target && target.classList.contains("list-sep")) target = target.nextElementSibling;
        } else if (key === "ArrowUp" || key === "ArrowLeft") {
            e.preventDefault();
            target = card.previousElementSibling;
            if (target && target.classList.contains("list-sep")) target = target.previousElementSibling;
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

    tabsContainer.addEventListener("keydown", function (e) {
        var key = keyOf(e);
        var activeBtn = document.activeElement;
        if (!activeBtn || !activeBtn.classList || !activeBtn.classList.contains("tab-btn")) return;
        var btns = Array.prototype.slice.call(tabBtns);
        var idx = btns.indexOf(activeBtn);
        if (idx === -1) return;
        var nextIdx = -1;
        if (key === "ArrowRight") nextIdx = (idx + 1) % btns.length;
        else if (key === "ArrowLeft") nextIdx = (idx - 1 + btns.length) % btns.length;
        else if (key === "Home") nextIdx = 0;
        else if (key === "End") nextIdx = btns.length - 1;
        if (nextIdx !== -1) {
            e.preventDefault();
            btns[nextIdx].focus();
            setCategory(btns[nextIdx]);
        }
    });

    // Mousewheel horizontal scroll translation for chips
    function makeHorizontalScrollable(el) {
        if (!el) return;
        el.addEventListener("wheel", function (e) {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
    makeHorizontalScrollable(searchTagsWrap);
    makeHorizontalScrollable(recentToolsList);

    // Quick Search Suggestion Tags
    if (searchTagsWrap) {
        searchInput.addEventListener("focus", function () {
            if (!searchInput.value.trim() && !activeEmbeddedTool) {
                searchTagsWrap.hidden = false;
            }
        });
        searchTagsWrap.addEventListener("click", function (e) {
            var tag = closest(e.target, ".search-tag", searchTagsWrap);
            if (!tag) return;
            var q = tag.getAttribute("data-query");
            if (q === ":favorites") {
                if (tabBtns && tabBtns[1]) {
                    setCategory(tabBtns[1]);
                } else {
                    currentCategory = "favorites";
                    renderTools();
                }
                searchInput.value = "";
                setSearch("");
                renderTools();
                searchTagsWrap.hidden = true;
                return;
            }
            if (!q) {
                if (tabBtns && tabBtns[0]) {
                    setCategory(tabBtns[0]);
                } else {
                    currentCategory = "all";
                    renderTools();
                }
                searchInput.value = "";
                setSearch("");
                renderTools();
                searchTagsWrap.hidden = true;
                return;
            }
            if (tag.classList.contains("active")) {
                tag.classList.remove("active");
                searchInput.value = "";
                setSearch("");
                renderTools();
                return;
            }
            var allTags = searchTagsWrap.querySelectorAll(".search-tag");
            for (var t = 0; t < allTags.length; t++) allTags[t].classList.remove("active");
            tag.classList.add("active");
            searchInput.value = q;
            setSearch(q);
            renderTools();
            searchTagsWrap.hidden = true;
            searchInput.focus();
        });
    }

    // UI Density (Comfortable vs Compact)
    var currentDensity = store.get("ozo_density", "comfortable");
    function applyDensity(density) {
        currentDensity = density === "compact" ? "compact" : "comfortable";
        store.set("ozo_density", currentDensity);
        if (currentDensity === "compact") {
            document.body.classList.add("density-compact");
            if (densityToggleBtn) densityToggleBtn.classList.add("active");
        } else {
            document.body.classList.remove("density-compact");
            if (densityToggleBtn) densityToggleBtn.classList.remove("active");
        }
    }
    function toggleDensity() {
        var next = currentDensity === "compact" ? "comfortable" : "compact";
        applyDensity(next);
        showToast(next === "compact" ?
            (isKhmer() ? "ទិដ្ឋភាពបង្រួម (Compact)" : "Compact Density Enabled") :
            (isKhmer() ? "ទិដ្ឋភាពធម្មតា (Comfortable)" : "Comfortable Density Enabled"), "info", 1500);
    }
    if (densityToggleBtn) {
        densityToggleBtn.addEventListener("click", toggleDensity);
    }
    applyDensity(currentDensity);

    // Document Inspector Popover
    function openDocPopover() {
        if (!docPopover) return;
        var info = latestDocInfo;
        if (!info || !info.hasDoc) {
            docPopoverStats.innerHTML = isKhmer() ?
                '<div style="color:var(--text-muted);font-size:11px;">គ្មានឯកសារបើកក្នុង Illustrator ទេ។ បើកឯកសារដើម្បីប្រើប្រាស់ឧបករណ៍ស្វ័យប្រវត្តិ។</div>' :
                '<div style="color:var(--text-muted);font-size:11px;">No active document in Illustrator. Open or create a document to inspect.</div>';
        } else {
            var csClass = (info.colorSpace || "").toUpperCase().indexOf("CMYK") !== -1 ? "doc-stat-cmyk" : "doc-stat-rgb";
            var html = [];
            html.push('<div class="doc-popover-title-row">');
            html.push('  <div class="doc-file-name" title="' + escapeHtml(info.name) + '">' + escapeHtml(info.name) + '</div>');
            if (info.colorSpace) html.push('  <span class="doc-stat-badge ' + csClass + '">' + escapeHtml(info.colorSpace) + '</span>');
            html.push('</div>');

            // Artboard Pager Bar
            if (info.artboardsCount > 0) {
                var abIdx = (info.activeArtboardIndex || 0) + 1;
                var abName = info.activeArtboardName || ("Artboard " + abIdx);
                var abDim = (info.artboardWidthMm && info.artboardHeightMm) ?
                    (' (' + info.artboardWidthMm + ' × ' + info.artboardHeightMm + ' mm)') : '';
                html.push('<div class="doc-ab-pager">');
                html.push('  <button type="button" class="doc-ab-nav-btn" data-ab-nav="-1" title="' + (isKhmer() ? "ផ្ទាំងមុន (Previous Artboard)" : "Previous Artboard") + '">◀</button>');
                html.push('  <div class="doc-ab-label" title="' + escapeHtml(abName + abDim) + '">');
                html.push('    <span class="doc-ab-num">' + abIdx + '/' + info.artboardsCount + '</span> ');
                html.push('    <span class="doc-ab-text">' + escapeHtml(abName) + '</span>');
                html.push('  </div>');
                html.push('  <button type="button" class="doc-ab-nav-btn" data-ab-nav="1" title="' + (isKhmer() ? "ផ្ទាំងបន្ទាប់ (Next Artboard)" : "Next Artboard") + '">▶</button>');
                html.push('</div>');
            }

            // Live Dimension / Selection HUD
            html.push('<div class="doc-hud-row">');
            if (info.selectedCount > 0) {
                var selDim = (info.selWidthMm && info.selHeightMm) ? (' • <span class="doc-hud-dim">' + info.selWidthMm + ' × ' + info.selHeightMm + ' mm</span>') : '';
                html.push('  <span class="doc-hud-pill hud-sel">📐 ' + info.selectedCount + ' ' + (isKhmer() ? "វត្ថុបានជ្រើស" : "selected") + selDim + '</span>');
            } else {
                var abSizeText = (info.artboardWidthMm && info.artboardHeightMm) ? (info.artboardWidthMm + ' × ' + info.artboardHeightMm + ' mm') : (info.itemCount + ' items');
                html.push('  <span class="doc-hud-pill hud-canvas">📄 Artboard: ' + abSizeText + ' • ' + (info.itemCount || 0) + ' total</span>');
            }
            html.push('</div>');

            docPopoverStats.innerHTML = html.join("");
        }
        docPopover.hidden = false;
    }

    function closeDocPopover() {
        if (docPopover) docPopover.hidden = true;
    }

    if (docPopoverClose) docPopoverClose.addEventListener("click", closeDocPopover);

    if (docPopover) {
        docPopover.addEventListener("click", function (e) {
            var abBtn = closest(e.target, ".doc-ab-nav-btn", docPopover);
            if (abBtn) {
                var delta = parseInt(abBtn.getAttribute("data-ab-nav"), 10) || 0;
                if (csInterface) {
                    csInterface.evalScript("ozoSwitchArtboard(" + delta + ")", function (raw) {
                        refreshDocumentStatus();
                        setTimeout(openDocPopover, 120);
                        try {
                            var res = JSON.parse(raw);
                            if (res.status === "success") {
                                showToast((isKhmer() ? "ប្តូរទៅកាន់ " : "Switched to ") + res.name + " (" + (res.activeIndex + 1) + "/" + res.total + ")", "info", 1800);
                            }
                        } catch (eRes) {}
                    });
                } else {
                    showToast("Switched artboard (simulated)", "info", 1500);
                }
                return;
            }

            var btn = closest(e.target, ".doc-action-btn", docPopover);
            if (!btn) return;
            var cmd = btn.getAttribute("data-canvas-cmd");
            if (!cmd) return;
            if (csInterface) {
                csInterface.evalScript("ozoExecuteCanvasCommand('" + cmd + "')", function () {
                    refreshDocumentStatus();
                    setTimeout(openDocPopover, 120);
                });
            } else {
                setStatus("Simulated canvas command: " + cmd, "success", 1500);
            }
        });
    }

    searchInput.addEventListener("input", function (e) {
        if (searchTagsWrap && searchInput.value.trim()) searchTagsWrap.hidden = true;
        onSearchChanged(e);
    });

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

        // Submit form in embedded view with Ctrl+Enter or Cmd+Enter
        if ((e.ctrlKey || e.metaKey) && (key === "Enter" || key === "Return")) {
            if (activeEmbeddedTool && embeddedContent) {
                var primaryBtn = embeddedContent.querySelector(".btn-action-primary") ||
                                 embeddedContent.querySelector("#btnGenericRun");
                if (primaryBtn && !primaryBtn.disabled && primaryBtn.offsetParent !== null) {
                    e.preventDefault();
                    primaryBtn.click();
                    return;
                }
            }
        }

        // Toggle density: Alt+D
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "d" || e.key === "D")) {
            e.preventDefault();
            toggleDensity();
            return;
        }

        // Quick tab switching: Alt+1 to Alt+5
        if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= "1" && e.key <= "5") {
            var tabIdx = parseInt(e.key, 10) - 1;
            if (tabBtns[tabIdx]) {
                e.preventDefault();
                if (activeEmbeddedTool) closeEmbeddedView();
                tabBtns[tabIdx].focus();
                setCategory(tabBtns[tabIdx]);
                return;
            }
        }

        // Shortcuts cheat sheet: ? (when not editing)
        if (key === "?" && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (shortcutsModal && !shortcutsModal.hidden) closeShortcutsModal();
            else openShortcutsModal();
            return;
        }

        // Quick focus search: / (when not editing) or Ctrl+K / Ctrl+F (anywhere)
        var isSearchShortcut = (!editing && key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
                               ((e.ctrlKey || e.metaKey) && (key === "k" || key === "K" || key === "f" || key === "F"));

        if (isSearchShortcut) {
            e.preventDefault();
            if (activeEmbeddedTool) closeEmbeddedView();
            searchInput.focus();
            searchInput.select();
        } else if (activePreviewTool) {
            if (key === "Escape") {
                closePreviewPanel();
                return;
            } else if (key === "Enter") {
                e.preventDefault();
                var openBtn = document.getElementById("previewOpenBtn");
                if (openBtn) openBtn.click();
                return;
            } else if (key === "r" || key === "R") {
                e.preventDefault();
                var runBtn = document.getElementById("previewRunBtn");
                if (runBtn) runBtn.click();
                return;
            } else if (key === "ArrowRight" || key === "ArrowLeft") {
                e.preventDefault();
                var visibleList = getVisibleTools();
                var curIdx = -1;
                for (var v = 0; v < visibleList.length; v++) {
                    if (visibleList[v].id === activePreviewTool.id) { curIdx = v; break; }
                }
                if (curIdx !== -1) {
                    var nextIndex = key === "ArrowRight" ?
                        (curIdx + 1) % visibleList.length :
                        (curIdx - 1 + visibleList.length) % visibleList.length;
                    openPreviewPanel(visibleList[nextIndex].id);
                }
                return;
            }
        } else if (key === "Escape") {
            if (docPopover && !docPopover.hidden) {
                closeDocPopover();
                return;
            }
            if (shortcutsModal && !shortcutsModal.hidden) {
                closeShortcutsModal();
                return;
            }
            if (errorBanner && !errorBanner.hidden) {
                hideError();
                return;
            }
            if (activeEmbeddedTool) {
                if (editing) {
                    active.blur();
                } else {
                    closeEmbeddedView();
                }
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

    var embedHdrEl = $("embeddedHeader") || (embeddedBackBtn ? embeddedBackBtn.parentNode : null);
    if (embedHdrEl) {
        embedHdrEl.addEventListener("click", function (e) {
            var cBtn = closest(e.target, ".embed-canvas-btn", embedHdrEl);
            if (!cBtn) return;
            var cmd = cBtn.getAttribute("data-canvas-cmd");
            if (!cmd) return;
            if (csInterface) {
                csInterface.evalScript("ozoExecuteCanvasCommand('" + cmd + "')", function () {
                    refreshDocumentStatus();
                });
            }
            showToast(cmd === "fitin" ? "Fit Artboard (Ctrl+0)" : (cmd === "fitall" ? "Fit All (Ctrl+Alt+0)" : "100% Zoom"), "info", 1400);
        });
    }

    if (embeddedSelRibbon) {
        embeddedSelRibbon.addEventListener("click", function (e) {
            var rBtn = closest(e.target, ".sel-ribbon-btn", embeddedSelRibbon);
            if (!rBtn) return;
            var cmd = rBtn.getAttribute("data-canvas-cmd") || "fitin";
            if (csInterface) {
                csInterface.evalScript("ozoExecuteCanvasCommand('" + cmd + "')", function () {
                    refreshDocumentStatus();
                });
            }
            showToast("Fit Artboard (Ctrl+0)", "info", 1400);
        });
    }

    if (embeddedResetBtn) {
        embeddedResetBtn.addEventListener("click", function () {
            if (!activeEmbeddedTool) return;
            var keyMap = {
                exporter: "ozo_exporter_settings",
                qr: "ozo_qr_settings",
                cutcontour: "ozo_cutcontour_settings",
                dimension: "ozo_dim_settings",
                printjob: "ozo_printjob_settings",
                numbering: "ozo_numbering_settings",
                pathfinder: "ozo_pathfinder_settings",
                guide: "ozo_guide_settings",
                repeat: "ozo_repeat_settings",
                nesting: "ozo_nesting_settings",
                richblack: "ozo_richblack_settings",
                khqr: "ozo_khqr_settings"
            };
            var sKey = keyMap[activeEmbeddedTool.id];
            if (sKey) store.remove(sKey);
            var tId = activeEmbeddedTool.id;
            openEmbeddedView(tId);
            setStatus(t("reset.done", { name: toolName(activeEmbeddedTool) }), "success", 2500);
            playEnter();
        });
    }

    if (recentToolsList) {
        recentToolsList.addEventListener("click", function (e) {
            var chip = closest(e.target, ".recent-chip", recentToolsList);
            if (!chip) return;
            var id = chip.getAttribute("data-id");
            if (id && toolById[id]) openEmbeddedView(id);
        });
    }

    if (shortcutsBtn) shortcutsBtn.addEventListener("click", openShortcutsModal);
    if (shortcutsBackdrop) shortcutsBackdrop.addEventListener("click", closeShortcutsModal);
    if (shortcutsCloseBtn) shortcutsCloseBtn.addEventListener("click", closeShortcutsModal);

    if (embeddedContent) {
        // Fast numeric stepping with Shift (10x) and Alt (0.1x)
        embeddedContent.addEventListener("keydown", function (e) {
            var target = e.target;
            if (!target || target.tagName !== "INPUT" || target.type !== "number") return;
            var key = keyOf(e);
            if (key === "ArrowUp" || key === "ArrowDown") {
                if (!e.shiftKey && !e.altKey) return;
                e.preventDefault();
                var step = parseFloat(target.step) || 1;
                var mult = e.shiftKey ? 10 : 0.1;
                var delta = (key === "ArrowUp" ? 1 : -1) * step * mult;
                var val = parseFloat(target.value);
                if (isNaN(val)) val = parseFloat(target.min) || 0;
                var next = val + delta;
                if (target.min !== "" && !isNaN(parseFloat(target.min))) next = Math.max(parseFloat(target.min), next);
                if (target.max !== "" && !isNaN(parseFloat(target.max))) next = Math.min(parseFloat(target.max), next);
                var decimals = (e.altKey || step < 1) ? 2 : 0;
                target.value = decimals > 0 ? parseFloat(next.toFixed(decimals)) : Math.round(next);
                target.dispatchEvent(new Event("input", { bubbles: true }));
                target.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });

        embeddedContent.addEventListener("click", function (e) {
            var copyBtn = closest(e.target, ".btn-copy-ticket", embeddedContent);
            if (copyBtn) {
                var parentCard = closest(copyBtn, ".embed-card", embeddedContent);
                var ticketCard = parentCard ? parentCard.querySelector(".print-job-ticket-card") : null;
                if (ticketCard) {
                    copyJobTicket(ticketCard, copyBtn);
                }
                return;
            }
            var ticketCardDirect = closest(e.target, ".print-job-ticket-card", embeddedContent);
            if (ticketCardDirect) {
                var parentCard2 = closest(ticketCardDirect, ".embed-card", embeddedContent);
                var copyBtn2 = parentCard2 ? parentCard2.querySelector(".btn-copy-ticket") : null;
                copyJobTicket(ticketCardDirect, copyBtn2);
            }
        });
    }

    searchClearBtn.addEventListener("click", function () { clearSearch(true); });
    emptyClearBtn.addEventListener("click", function () {
        if (currentCategory !== "all" && matchesInAllCategories(searchTokens) > 0) {
            setCategory(tabBtns[0]);
        } else {
            clearSearch(true);
        }
    });

    var statusIndicator = statusDot ? statusDot.parentNode : null;
    if (statusIndicator) {
        statusIndicator.setAttribute("title", isKhmer() ? "ចុចដើម្បីមើលព័ត៌មានឯកសារ និងបញ្ជា Canvas" : "Click to inspect document & quick actions");
        statusIndicator.addEventListener("click", function () {
            playEnter();
            refreshDocumentStatus();
            statusDot.style.transform = "scale(1.4)";
            setTimeout(function () { statusDot.style.transform = ""; }, 250);
            if (docPopover && !docPopover.hidden) closeDocPopover();
            else openDocPopover();
        });
    }

    // Auto-refresh document status whenever user switches back into panel
    window.addEventListener("focus", function () {
        refreshDocumentStatus();
    });

    // Global Illustrator Canvas Shortcuts (Ctrl+0, Ctrl+Alt+0, Ctrl+1) from panel
    window.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "0" && !e.altKey) {
            if (csInterface) {
                e.preventDefault();
                csInterface.evalScript("ozoExecuteCanvasCommand('fitin')", function () {
                    refreshDocumentStatus();
                });
                showToast("Fit Artboard (Ctrl+0)", "info", 1200);
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "0" && e.altKey) {
            if (csInterface) {
                e.preventDefault();
                csInterface.evalScript("ozoExecuteCanvasCommand('fitall')", function () {
                    refreshDocumentStatus();
                });
                showToast("Fit All (Ctrl+Alt+0)", "info", 1200);
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "1" && !e.altKey && !e.shiftKey) {
            var aTag = (document.activeElement && document.activeElement.tagName) || "";
            if (aTag !== "INPUT" && aTag !== "TEXTAREA") {
                if (csInterface) {
                    e.preventDefault();
                    csInterface.evalScript("ozoExecuteCanvasCommand('actualsize')", function () {
                        refreshDocumentStatus();
                    });
                    showToast("Actual Size 100% (Ctrl+1)", "info", 1200);
                    return;
                }
            }
        }
    });

    // Mouse thumb button Back (button 3)
    window.addEventListener("mouseup", function (e) {
        if (e.button === 3) {
            if (activePreviewTool) {
                e.preventDefault();
                closePreviewPanel();
            } else if (activeEmbeddedTool) {
                e.preventDefault();
                closeEmbeddedView();
            }
        }
    });
    errorDismissBtn.addEventListener("click", hideError);

    viewToggleBtn.addEventListener("click", function () {
        viewMode = viewMode === "grid" ? "list" : "grid";
        store.set("ozo_view_mode", viewMode);
        updateViewMode();
        playEnter();
        setStatus(t(viewMode === "grid" ? "view.grid" : "view.list"), "ready", 1500);
    });

    langToggleBtn.addEventListener("click", function () {
        currentLang = isKhmer() ? "en" : "km";
        store.set("ozo_lang", currentLang);
        applyI18n();
        if (activePreviewTool) {
            openPreviewPanel(activePreviewTool.id);
        } else if (activeEmbeddedTool) {
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
        if (activePreviewTool) {
            openPreviewPanel(activePreviewTool.id);
        } else if (activeEmbeddedTool) {
            if (activeEmbeddedTool.id === "exporter") renderEmbeddedExporter();
            else if (activeEmbeddedTool.id === "qr") renderEmbeddedQR();
            else if (activeEmbeddedTool.id === "cutcontour") renderEmbeddedCutContour();
            else if (activeEmbeddedTool.id === "dimension") renderEmbeddedDimension();
            else if (activeEmbeddedTool.id === "printjob") renderEmbeddedPrintJob();
            else if (activeEmbeddedTool.id === "count") renderEmbeddedCount();
            else if (activeEmbeddedTool.id === "numbering") renderEmbeddedNumbering();
            else if (activeEmbeddedTool.id === "pathfinder") renderEmbeddedPathfinder();
            else if (activeEmbeddedTool.id === "guide" || activeEmbeddedTool.id === "guides") renderEmbeddedGuides();
            else if (activeEmbeddedTool.id === "repeat") renderEmbeddedRepeat();
            else if (activeEmbeddedTool.id === "nesting") renderEmbeddedNesting();
            else if (activeEmbeddedTool.id === "icons") renderEmbeddedIcons();
            else if (activeEmbeddedTool.id === "launcher") renderEmbeddedLauncher();
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

    // A long-running panel never reloads, so a release published after launch
    // would stay invisible. Re-apply the cached result periodically; the
    // network request itself is still throttled by UPDATE_CHECK_INTERVAL.
    var updatePollTimer = null;
    function startUpdateMonitor() {
        if (updatePollTimer) return;
        updatePollTimer = setInterval(function () {
            if (document.hidden || updateBusy) return;
            checkForUpdates(false);
        }, UPDATE_POLL_INTERVAL);
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
    // Welcome Splash Screen Animation
    // Returns a callback the init sequence fires once the UI is rendered,
    // so the splash gets out of the way as soon as the panel is usable.
    // ------------------------------------------------------------------
    function initWelcomeSplash() {
        var splash = $("welcomeSplash");
        if (!splash) {
            return function () { playEnter(); };
        }

        var splashVer = $("splashVersion");
        if (splashVer) splashVer.textContent = "v" + CURRENT_VERSION;

        var reduceMotion = window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) { // no animation to show, so don't make the user wait
            splash.style.display = "none";
            return function () { playEnter(); };
        }

        var shownAt = Date.now();
        var dismissed = false;
        var hidden = false;
        var hideTimer = null;

        function hideSplash() {
            if (hidden) return;
            hidden = true;
            splash.classList.add("is-leaving");
            playEnter(); // start the catalogue entrance while the splash fades
            setTimeout(function () {
                splash.style.display = "none";
            }, 400);
        }

        function dismissSplash(immediate) {
            if (hidden) return;
            // Readiness may have queued a dismissal already; an explicit user
            // click still cuts the remaining minimum wait short.
            if (dismissed && !immediate) return;
            dismissed = true;
            window.removeEventListener("keydown", onSplashDismiss);
            // User-initiated dismissal is instant; readiness waits for the
            // minimum display time so the animation never flashes past.
            var wait = immediate ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - shownAt));
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(hideSplash, wait);
        }

        function onSplashDismiss() { dismissSplash(true); }

        splash.addEventListener("click", onSplashDismiss);
        window.addEventListener("keydown", onSplashDismiss);

        // Safety net for a stalled init: the overlay still clears itself.
        setTimeout(function () { dismissSplash(false); }, SPLASH_MAX_MS);

        return function () { dismissSplash(false); };
    }

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    brandBadge.textContent = "v" + CURRENT_VERSION;

    if (csInterface) {
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);
        updateTheme();
    }

    // Restore saved category tab
    var savedTabBtn = tabsContainer.querySelector('.tab-btn[data-category="' + currentCategory + '"]');
    if (savedTabBtn) {
        each(tabBtns, function (b) {
            var on = b === savedTabBtn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
        });
    }

    applyI18n();
    var splashReady = initWelcomeSplash(); // early, so a later init error can never trap the user behind the overlay
    if (csInterface) initHost();
    updateCounts();
    updateViewMode();
    renderTools();
    if (splashReady) splashReady();
    moveTabIndicator();
    window.addEventListener("resize", moveTabIndicator);
    window.addEventListener("load", moveTabIndicator);
    refreshDocumentStatus();
    startDocumentMonitor();
    checkForUpdates(false);
    startUpdateMonitor();
})();
