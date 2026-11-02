# illustrator-script

> **Ozo Tools — Professional Adobe Illustrator Plugin & Automation Script Suite (v2.2)**  
> Production-ready ExtendScript (ES3) tools and dockable CEP extension panel for print shops, signage, vinyl cutters, packaging, and design automation.

---

## Features Overview

- **Dockable CEP Extension Panel**: HTML5 panel accessible via `Window > Extensions > Ozo Tools` that docks alongside Layers, Properties, and Tools.
- **Native Menu Integration**: Access scripts directly via `File > Scripts > Ozo Tools > ...` with custom keyboard shortcut support (`Ctrl+F12` / custom shortcuts).
- **Dual Language Support**: Instant toggle between **English** and **Khmer (ភាសាខ្មែរ)**.
- **Adaptive Theme Synchronization**: Matches Illustrator's interface brightness (Dark, Medium Dark, Medium Light, Light).
- **Reversible Previews**: High-precision interactive previews across major prepress and layout tools.

---

## Included Tools (13 Tools)

| Tool | Category | Description |
| :--- | :--- | :--- |
| **Generate QR Code** | Prepress | Offline vector QR code generator (Standard & Telegram 2026 styles). |
| **CutContour Generator** | Prepress | Automated die-cut paths, bleed offset & spot color registration (Roland, Mimaki, Summa). |
| **Print Job Info** | Prepress | Production metadata banner, dimensions, active ink separations & color slugs. |
| **Nesting** | Prepress | High-efficiency shape packing to minimize sheet and vinyl material waste. |
| **Batch Production Exporter** | Prepress | Batch export artboards to separate files or multi-page PDF (PDF, TIFF CMYK/LZW, PNG, JPEG) with dynamic naming. |
| **Smart Dimension** | Layout | Automatic linear, radial, and bounding box technical dimensioning. |
| **Pathfinder Pro** | Layout | Advanced vector boolean operations, shape merging & path cleanup. |
| **New Guide Layout** | Layout | Precision grid guide system with columns, rows, margins & gutter control. |
| **Object Repeat** | Layout | Linear grid repeat, radial circular arrays & step-and-repeat distribution. |
| **Icon Importer** | Utilities | Search and place thousands of crisp SVG icons directly into artwork. |
| **Sequential Numbering** | Utilities | Serialized batch number stamping on labels, tickets, and artboards. |
| **Object Count** | Utilities | Detailed object statistics, selection count & layer breakdown. |
| **Script Launcher** | Utilities | Floating modeless palette browser with favorites and custom folder browsing. |

---

## Installation

### Method 1: Automatic Installer (Windows)
1. Double-click `setup.bat` (or right-click and choose **Run as administrator**).
2. Restart Adobe Illustrator.
3. Access via:
   - **Dockable Panel**: `Window > Extensions > Ozo Tools`
   - **Menu Scripts**: `File > Scripts > Ozo Tools`

### Method 2: Check & Update from GitHub (Online Update)
- **Automatic Online Update**: Double-click `setup.bat` and select `[3] Check & Update from GitHub`, or run:
  ```cmd
  setup.bat online-update
  ```
  This automatically checks GitHub for the latest release, downloads the `.zip` package, extracts it, and installs the updated panel & scripts.

- **Local Update / Sync**: Double-click `setup.bat` and select `[2] Update`, or run:
  ```cmd
  setup.bat update
  ```

- **In-Panel Notification**: When inside Illustrator, the dockable panel (`Window > Extensions > Ozo Tools`) automatically checks GitHub for updates and displays a banner whenever a new release is available with a 1-click update button.

---

## License & Credits
Created by **Ozo. Designer | CHUO Kimheng**.  
Distributed for Adobe Illustrator production automation.
