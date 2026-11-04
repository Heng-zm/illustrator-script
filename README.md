# illustrator-script

<p align="center">
  <img src="assets/logo.png" alt="Ozo Tools Logo" width="520">
</p>

> **Ozo Tools — Professional Adobe Illustrator Plugin & Automation Script Suite (v2.6.13)**  
> Production-ready ExtendScript (ES3) tools and dockable CEP extension panel for print shops, signage, vinyl cutters, packaging, and design automation.

---

## Features Overview

- **In-Dock Embedded Execution**: Run and configure batch artboard exporter, vector QR generator, etc., directly inside the dock panel with zero modal dialogs.
- **Dockable CEP Extension Panel**: HTML5 panel accessible via `Window > Extensions > Ozo Tools` that docks alongside Layers, Properties, and Tools.
- **Native Menu Integration**: Access scripts directly via `File > Scripts > Ozo Tools > ...` with custom keyboard shortcut support (`Ctrl+F12` / custom shortcuts).
- **Dual Language Support**: Instant toggle between **English** and **Khmer (ភាសាខ្មែរ)**.
- **Adaptive Theme Synchronization**: Matches Illustrator's interface brightness (Dark, Medium Dark, Medium Light, Light).
- **Reversible Previews**: High-precision interactive previews across major prepress and layout tools.

---

## Included Tools (15 Tools)

| Tool | Category | Description |
| :--- | :--- | :--- |
| **Generate QR Code** | Prepress | Offline vector QR code generator (Standard & Telegram 2026 styles). |
| **CutContour Generator** | Prepress | Automated die-cut paths, bleed offset & spot color registration (Roland, Mimaki, Summa). |
| **Print Job Info** | Prepress | Production metadata banner, dimensions, active ink separations & color slugs. |
| **Nesting** | Prepress | High-efficiency shape packing to minimize sheet and vinyl material waste. |
| **Batch Production Exporter** | Prepress | Batch export artboards to separate files or multi-page PDF (PDF, TIFF CMYK/LZW, PNG, JPEG) with dynamic naming. |
| **Rich Black Optimizer** | Prepress | Prepress rich black conversion (C60 M40 Y40 K100), TIC gauge, small text protection & overprint. |
| **Smart Dimension** | Layout | Automatic linear, radial, and bounding box technical dimensioning. |
| **Pathfinder Pro** | Layout | Advanced vector boolean operations, shape merging & path cleanup. |
| **New Guide Layout** | Layout | Precision grid guide system with columns, rows, margins & gutter control. |
| **Object Repeat** | Layout | Linear grid repeat, radial circular arrays & step-and-repeat distribution. |
| **Icon Importer** | Utilities | Search and place thousands of crisp SVG icons directly into artwork. |
| **Sequential Numbering** | Utilities | Serialized batch number stamping on labels, tickets, and artboards. |
| **Object Count** | Utilities | Detailed object statistics, selection count & layer breakdown. |
| **ABA KHQR Generator** | Utilities | Official Bakong EMVCo compliant vector QR codes & table standee card templates (Bakong Red & ABA Navy). |
| **Script Launcher** | Utilities | Floating modeless palette browser with favorites and custom folder browsing. |

---

## Installation

### Method 1: Suite Manager (Recommended)
- **Windows**: Double-click `setup.bat` and select `[1] Install Suite`.
  - For full menu integration into `File > Scripts`, right-click `setup.bat` and choose **Run as administrator**.
  - (User-level dock panel installation requires no admin privileges).
- **macOS**: Double-click `setup.command` (or run `./setup.command` in Terminal) and select `[1] Install Suite`.
- **Restart Adobe Illustrator**:
  - **Dockable Panel**: `Window > Extensions > Ozo Tools`
  - **Menu Scripts**: `File > Scripts > Ozo Tools`

### Method 2: In-Illustrator Script Installer (Cross-Platform)
1. In Adobe Illustrator, navigate to `File > Scripts > Other Script...` (or `Ctrl+F12` / `Cmd+F12`).
2. Choose `Install as Plugin.jsx` and click **Open**.
3. Choose installation options and click **Install Now**.
4. Restart Illustrator.

### Method 3: Check & Update from GitHub (Online Update)
- **Automatic Online Update**:
  - Windows: Double-click `setup.bat` and select `[3] Check & Update from GitHub`, or run `setup.bat online-update`.
  - macOS: Double-click `setup.command` and select `[3] Download & Apply Latest Release from GitHub`.
  This automatically checks GitHub for the latest release, downloads the `.zip` package, verifies version integrity, and updates the panel & scripts with automated backup/rollback protection.

- **Local Update / Sync**:
  - Windows: Run `setup.bat update` (or option `[2]`).
  - macOS: Run `setup.command` and select `[2]`.

- **In-Panel Notification**: When inside Illustrator, the dockable panel (`Window > Extensions > Ozo Tools`) automatically queries GitHub for updates and displays a banner whenever a new release is available with a 1-click update button.

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

## License & Credits
Created by **Ozo. Designer | CHUO Kimheng**. Licensed under the [MIT License](LICENSE).  
Distributed for Adobe Illustrator production automation.
