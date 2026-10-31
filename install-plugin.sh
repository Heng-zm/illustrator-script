#!/bin/bash
# =====================================================================
# Ozo Tools Plugin Installer for Adobe Illustrator (macOS)
# =====================================================================

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=========================================================="
echo "       Ozo Tools - Adobe Illustrator Plugin Installer      "
echo "=========================================================="
echo ""

# 1. Enable PlayerDebugMode for CSXS 6-16 on macOS
echo "[1/3] Configuring Adobe Extension Developer Mode (PlayerDebugMode)..."
for v in {6..16}; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done
echo "      ✓ PlayerDebugMode enabled for CSXS 6 through 16"

# 2. Install CEP Extension Panel into User Library
echo ""
echo "[2/3] Installing Dockable CEP Panel Plugin..."
CEP_TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.ozo.illustrator.tools"
CEP_SOURCE="$DIR/plugin/com.ozo.illustrator.tools"
SCRIPTS_SOURCE="$DIR/Script all"
LAUNCHER_SOURCE="$DIR/Script Launcher.jsx"

if [ -d "$CEP_SOURCE" ]; then
    if [ -d "$SCRIPTS_SOURCE" ]; then
        mkdir -p "$CEP_SOURCE/scripts"
        cp -R "$SCRIPTS_SOURCE"/* "$CEP_SOURCE/scripts"/
        if [ -f "$LAUNCHER_SOURCE" ]; then
            cp "$LAUNCHER_SOURCE" "$CEP_SOURCE/scripts/Script Launcher.jsx"
        fi
    fi
    mkdir -p "$(dirname "$CEP_TARGET")"
    rm -rf "$CEP_TARGET"
    cp -R "$CEP_SOURCE" "$CEP_TARGET"
    echo "      ✓ Dockable panel installed to:"
    echo "        $CEP_TARGET"
    echo "        (Accessible from: Window > Extensions > Ozo Tools)"
else
    echo "      ✗ Error: CEP source not found at: $CEP_SOURCE"
fi

# 3. Install Native Menu Scripts into Illustrator Presets
echo ""
echo "[3/3] Installing Native Menu Scripts (File > Scripts > Ozo Tools)..."
SCRIPTS_SOURCE="$DIR/Script all"
LAUNCHER_SOURCE="$DIR/Script Launcher.jsx"

shopt -s nullglob
AI_DIRS=(/Applications/Adobe\ Illustrator* /Applications/Adobe/Adobe\ Illustrator*)

for ai in "${AI_DIRS[@]}"; do
    for pName in "Presets.localized" "Presets"; do
        if [ -d "$ai/$pName" ]; then
            for loc in "$ai/$pName"/*; do
                if [ -d "$loc/Scripts" ]; then
                    TARGET_SCRIPTS="$loc/Scripts/Ozo Tools"
                    echo "      Installing into: $TARGET_SCRIPTS"
                    mkdir -p "$TARGET_SCRIPTS" 2>/dev/null || sudo mkdir -p "$TARGET_SCRIPTS"
                    cp -R "$SCRIPTS_SOURCE"/* "$TARGET_SCRIPTS"/ 2>/dev/null || sudo cp -R "$SCRIPTS_SOURCE"/* "$TARGET_SCRIPTS"/
                    if [ -f "$LAUNCHER_SOURCE" ]; then
                        cp "$LAUNCHER_SOURCE" "$TARGET_SCRIPTS/Script Launcher.jsx" 2>/dev/null || sudo cp "$LAUNCHER_SOURCE" "$TARGET_SCRIPTS/Script Launcher.jsx"
                    fi
                    echo "      ✓ Installed into: $TARGET_SCRIPTS"
                fi
            done
        fi
    done
done

echo ""
echo "=========================================================="
echo "              Installation Complete!                     "
echo "=========================================================="
echo "Next Steps:"
echo "1. Restart Adobe Illustrator."
echo "2. Open the dockable panel via: Window > Extensions > Ozo Tools"
echo "3. Or run scripts from: File > Scripts > Ozo Tools"
echo ""
