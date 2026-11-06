# Ozo Tools - Adobe Illustrator Plugin Suite (v2.6.45)

<p align="center">
  <img src="assets/logo.png" alt="Ozo Tools Logo" width="520">
</p>

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

### Method 1: Suite Manager (Recommended)
- **Windows**: Double-click `setup.bat` and select **[1] Install** (or right-click and choose **Run as administrator** for both Extensions and Scripts menu).
- **macOS**: Double-click `setup.command` (or run `./setup.command` in Terminal) and select **[1] Install Suite**.
- Restart Adobe Illustrator.

### Method 2: In-Illustrator Installer (Cross-Platform)
1. Open Adobe Illustrator.
2. Go to `File > Scripts > Other Script...` (or press `Ctrl+F12` / `Cmd+F12`).
3. Select `Install as Plugin.jsx` and click **Open**.
4. Choose your options and click **Install Now**.
5. Restart Adobe Illustrator.

---

## How to Update the Plugin

### Option 1: Automatic In-Panel Notification (Recommended)
When running the dockable CEP panel in Illustrator (`Window > Extensions > Ozo Tools`), it automatically queries GitHub for the latest release. When a new version is published:
- An update banner appears at the top of the panel with a one-click **Update** button.
- The version badge lights up as an indicator.

### Option 2: Command-Line / One-Click Online Update
- Windows: Double-click `setup.bat` and select **[3] Check & Update from GitHub**, or run `setup.bat online-update`.
- macOS: Double-click `setup.command` and select **[3] Download & Apply Latest Release from GitHub**.
This automatically fetches the latest release `.zip` from GitHub, verifies version integrity, updates your files, and refreshes the installation with automated rollback protection.

### Option 3: Local Sync / Offline Update
Whenever you make local edits to scripts:
- Windows: Double-click `setup.bat` and choose **[2] Update** (or run `setup.bat update`).
- macOS: Run `setup.command` and select **[2] Update**.

### Inside Illustrator (Cross-Platform):
- Run `Install as Plugin.jsx` from `File > Scripts > Other Script...` anytime to refresh the installed files.

---

## Developer Automation: Auto-Push to GitHub

When working on scripts or updating tools, sync and push changes to GitHub in 1 click:

### Option 1: 1-Click Auto Push (`push.bat`)
Double-click `push.bat` (or run `push.bat` in CMD):
- Automatically stages all modified and new files (`git add -A`).
- Prompts for a commit message (or press **Enter** for an automatic timestamped summary).
- Automatically pushes to `origin/main` on GitHub.

### Option 2: Live Watcher Mode (Continuous Push on Save)
Run:
```cmd
push.bat --watch
```
- Continuously monitors the workspace for file changes.
- Automatically commits and pushes to GitHub whenever scripts or files are saved!
- Press `Ctrl+C` anytime to stop watching.

### Option 3: Via Suite Manager (`setup.bat`)
Double-click `setup.bat` and choose:
- `[5] Auto Commit & Push to GitHub`
- `[6] Auto-Push Watcher Mode`

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
  - **One-Click Run**: Click **Run** on a card to execute the script immediately, or press `R` on a focused card. Clicking the card itself (or pressing `Enter`) opens its in-panel settings.
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
- On Windows: Run `setup.bat uninstall` or double-click `setup.bat` and choose **[3] Uninstall**.
- On macOS: Delete `~/Library/Application Support/Adobe/CEP/extensions/com.ozo.illustrator.tools`.
