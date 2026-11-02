# Ozo Tools - Adobe Illustrator Plugin Suite (v2.2)

Transform all your Illustrator scripts into an official, native Illustrator plugin with:
1. **Dockable CEP Panel Plugin**: An HTML5/CEP panel accessible from `Window > Extensions > Ozo Tools` that docks directly into your Illustrator workspace alongside Layers, Pathfinder, and Properties (supports narrow docks down to 200px width).
2. **Native Menu Integration**: Appears in `File > Scripts > Ozo Tools > ...` with full support for Illustrator custom keyboard shortcuts (`Edit > Keyboard Shortcuts`).
3. **Bilingual Support**: Instant toggle between English & Khmer (ភាសាខ្មែរ).
4. **4-Tier Adaptive Theme Synchronization**: Automatically matches Illustrator's interface brightness (Dark, Medium Dark, Medium Light, Light) dynamically reading CEP skin color.
5. **Favorites, Search & View Modes**: Pin favorites with dynamic count badge, category color tags, instant search (`/` to focus, `Enter` to launch the first match, `Esc` to clear), and a persistent grid/list view toggle.

---

## Included Tools (13 Tools)

| Tool | Category | Description |
| :--- | :--- | :--- |
| **Generate QR Code** | Prepress | High-speed offline vector QR code generator (Standard & Telegram 2026 styles). |
| **CutContour Generator** | Prepress | Automated die-cut paths, bleed offset & spot color registration. |
| **Print Job Info** | Prepress | Production metadata banner, dimensions, active ink separations & color slugs. |
| **Nesting** | Prepress | High-efficiency shape packing to minimize sheet and vinyl material waste. |
| **Batch Production Exporter** | Prepress | Batch export artboards to separate files or a single multi-page PDF (PDF, TIFF CMYK/LZW, PNG & JPEG) with dynamic naming and optional text outlining. |
| **Smart Dimension** | Layout | Automatic linear, radial, and bounding box technical dimensioning. |
| **Pathfinder Pro** | Layout | Advanced vector boolean operations, shape merging & path cleanup. |
| **New Guide Layout** | Layout | Precision grid guide system with columns, rows, margins & gutting. |
| **Object Repeat** | Layout | Linear grid repeat, radial circular arrays & step-and-repeat distribution. |
| **Icon Importer** | Utilities | Search and place thousands of crisp SVG icons directly into your document. |
| **Sequential Numbering**| Utilities | Serialized batch number stamping on labels, tickets & barcode prep. |
| **Object Count** | Utilities | Detailed object statistics, selection count & layer breakdown. |
| **Script Launcher** | Utilities | Floating modeless palette browser with favorites and custom folder browsing. |

> **Batch Production Exporter note:** PDF export and text outlining require a saved `.ai` document. The exporter reopens the original file afterward, preserving live text and the original document path.

---

## How to Install

You have **3 simple installation methods**:

### Method 1: One-Click Installer (Windows) — Recommended
1. Double-click `install-plugin.bat`.
2. Click **Yes** if Windows prompts for Administrator permissions (this installs into both `Window > Extensions` and `File > Scripts`).
   - *Note*: If administrator elevation is declined, it automatically proceeds with user-level installation into `Window > Extensions > Ozo Tools`.
3. Restart Adobe Illustrator.

### Method 2: In-Illustrator Installer (Cross-Platform)
1. Open Adobe Illustrator.
2. Go to `File > Scripts > Other Script...` (or press `Ctrl+F12` / `Cmd+F12`).
3. Select `Install as Plugin.jsx` and click **Open**.
4. Choose your options and click **Install Now**.
5. Restart Adobe Illustrator.

### Method 3: macOS Terminal
1. Open Terminal in the repository directory.
2. Run:
   ```bash
   bash install-plugin.sh
   ```
3. Restart Adobe Illustrator.

---

## How to Update the Plugin

Whenever you update or edit scripts in the repository:

### Windows:
- Double-click `update-plugin.bat` (or run `powershell -ExecutionPolicy Bypass -File update-plugin.ps1`).
- This automatically synchronizes all scripts, copies them to the CEP extension folder, and updates the native `File > Scripts` menu.

### Inside Illustrator (Cross-Platform):
- Run `Install as Plugin.jsx` from `File > Scripts > Other Script...` anytime to refresh the installed files.

### macOS:
- Re-run `bash install-plugin.sh`.

---

## How to Use in Adobe Illustrator

### 1. Dockable Panel Plugin
- In Illustrator's top menu, go to:
  `Window > Extensions > Ozo Tools`
- You can drag and dock this panel anywhere in your Illustrator workspace (next to Properties, Layers, Swatches, etc.).
- Features:
  - **Live Search**: Instant keyword search in English or Khmer. Press `/` to focus the search box, `Enter` to run the first matched tool, or `Esc` to reset.
  - **Category Tabs**: Filter by *All*, *Favorites*, *Prepress*, *Layout*, or *Utilities*.
  - **Grid / List View**: Toggle the compact grid or detailed list layout with the view button; your choice is remembered.
  - **Pin Favorites**: Click the star icon (★) on any tool to pin it to your favorites list.
  - **Language Toggle**: Click `EN` / `KM` at top-right to switch between English and Khmer.

### 2. Native Menu Commands
- In Illustrator's top menu, go to:
  `File > Scripts > Ozo Tools > [Tool Name]`

### 3. Assign Custom Keyboard Shortcuts
1. In Illustrator, open `Edit > Keyboard Shortcuts`.
2. Change the dropdown from *Tools* to *Menu Commands*.
3. Expand `File > Scripts > Ozo Tools`.
4. Click next to any tool (e.g. `Generate QR Code` or `CutContour Generator`) and press your desired shortcut key (e.g. `Ctrl+Alt+Q`).
5. Click **OK** to save!

---

## How to Uninstall

If you ever wish to remove the plugin:
- On Windows: Run `uninstall-plugin.bat`.
- On macOS: Delete `~/Library/Application Support/Adobe/CEP/extensions/com.ozo.illustrator.tools`.
