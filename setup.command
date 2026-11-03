#!/bin/bash
# ==============================================================================
# Ozo Tools - Plugin Suite Manager for macOS
# ==============================================================================

set -e
cd "$(dirname "$0")"
SCRIPT_ROOT="$(pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

CEP_SOURCE="$SCRIPT_ROOT/plugin/com.ozo.illustrator.tools"
CEP_TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.ozo.illustrator.tools"
SCRIPTS_SOURCE="$SCRIPT_ROOT/Script all"
LIB_SOURCE="$SCRIPT_ROOT/lib"
LAUNCHER_SOURCE="$SCRIPT_ROOT/Script Launcher.jsx"

show_header() {
    clear 2>/dev/null || true
    echo -e "${CYAN}==========================================================${NC}"
    echo -e "${CYAN}     Ozo Tools - Adobe Illustrator Suite Manager (macOS)   ${NC}"
    echo -e "${CYAN}==========================================================${NC}"
    echo ""
}

enable_player_debug_mode() {
    echo -e "${YELLOW}[*] Configuring Adobe Extension Developer Mode (PlayerDebugMode)...${NC}"
    for ver in {6..16}; do
        defaults write com.adobe.CSXS.$ver PlayerDebugMode 1 2>/dev/null || true
    done
    echo -e "${GREEN}    [OK] PlayerDebugMode enabled for CSXS 6 through 16${NC}"
}

sync_plugin_bundle() {
    echo -e "${YELLOW}[*] Synchronizing script files into plugin bundle...${NC}"
    if [ ! -d "$SCRIPTS_SOURCE" ]; then
        echo -e "${RED}    [ERROR] 'Script all' directory not found at: $SCRIPTS_SOURCE${NC}"
        return 1
    fi

    mkdir -p "$CEP_SOURCE/scripts"
    if [ -d "$LIB_SOURCE" ]; then
        mkdir -p "$SCRIPTS_SOURCE/lib"
        mkdir -p "$CEP_SOURCE/scripts/lib"
        cp -R "$LIB_SOURCE/"* "$SCRIPTS_SOURCE/lib/" 2>/dev/null || true
        cp -R "$LIB_SOURCE/"* "$CEP_SOURCE/scripts/lib/" 2>/dev/null || true
    fi

    cp -R "$SCRIPTS_SOURCE/"* "$CEP_SOURCE/scripts/" 2>/dev/null || true
    if [ -f "$LAUNCHER_SOURCE" ]; then
        cp -f "$LAUNCHER_SOURCE" "$CEP_SOURCE/scripts/Script Launcher.jsx" 2>/dev/null || true
    fi

    echo -e "${GREEN}    [OK] Plugin script bundle synchronized.${NC}"
    return 0
}

install_cep_panel() {
    echo -e "${YELLOW}[*] Updating Dockable CEP Extension Panel...${NC}"
    BACKUP_DIR="/tmp/ozo_cep_backup_$$"
    rm -rf "$BACKUP_DIR"

    if [ -d "$CEP_TARGET" ]; then
        cp -R "$CEP_TARGET" "$BACKUP_DIR" 2>/dev/null || true
    fi

    mkdir -p "$CEP_TARGET"

    # Prune stale files that do not exist in the source
    if [ -d "$CEP_TARGET" ]; then
        (
            cd "$CEP_TARGET"
            find . -type f | while read -r file; do
                rel="${file#./}"
                if [ ! -f "$CEP_SOURCE/$rel" ]; then
                    rm -f "$file" 2>/dev/null || true
                fi
            done
        ) || true
    fi

    if cp -R "$CEP_SOURCE/"* "$CEP_TARGET/" 2>/dev/null; then
        rm -rf "$BACKUP_DIR"
        echo -e "${GREEN}    [OK] Dockable panel installed/updated at:${NC}"
        echo -e "${GRAY}         $CEP_TARGET${NC}"
        echo -e "${GREEN}         (Access in Illustrator: Window -> Extensions -> Ozo Tools)${NC}"
    else
        echo -e "${RED}    [ERROR] Failed to install CEP panel. Rolling back...${NC}"
        if [ -d "$BACKUP_DIR" ]; then
            rm -rf "$CEP_TARGET"
            cp -R "$BACKUP_DIR" "$CEP_TARGET" 2>/dev/null || true
            rm -rf "$BACKUP_DIR"
        fi
        return 1
    fi
}

install_menu_scripts() {
    echo -e "${YELLOW}[*] Searching for Adobe Illustrator installations...${NC}"
    FOUND_ANY=0

    for ai_app in /Applications/Adobe\ Illustrator*; do
        if [ -d "$ai_app" ]; then
            PRESETS_DIR=""
            if [ -d "$ai_app/Presets.localized" ]; then
                PRESETS_DIR="$ai_app/Presets.localized"
            elif [ -d "$ai_app/Presets" ]; then
                PRESETS_DIR="$ai_app/Presets"
            fi

            if [ -n "$PRESETS_DIR" ]; then
                for loc in "$PRESETS_DIR"/*; do
                    if [ -d "$loc" ]; then
                        SCRIPTS_DIR="$loc/Scripts/Ozo Tools"
                        mkdir -p "$SCRIPTS_DIR" 2>/dev/null || true
                        if [ -w "$SCRIPTS_DIR" ]; then
                            cp -R "$SCRIPTS_SOURCE/"* "$SCRIPTS_DIR/" 2>/dev/null || true
                            if [ -f "$LAUNCHER_SOURCE" ]; then
                                cp -f "$LAUNCHER_SOURCE" "$SCRIPTS_DIR/Script Launcher.jsx" 2>/dev/null || true
                            fi
                            echo -e "${GREEN}    [OK] Installed menu scripts to: $SCRIPTS_DIR${NC}"
                            FOUND_ANY=1
                        else
                            echo -e "${YELLOW}    [INFO] Administrator permissions required to write to: $SCRIPTS_DIR${NC}"
                        fi
                    fi
                done
            fi
        fi
    done

    if [ "$FOUND_ANY" -eq 0 ]; then
        echo -e "${GRAY}    [INFO] Note: Dockable panel is fully installed for your user.${NC}"
        echo -e "${GRAY}           To install native menu scripts into File -> Scripts, run with sudo:${NC}"
        echo -e "${GRAY}           sudo ./setup.command${NC}"
    fi
}

do_install() {
    show_header
    enable_player_debug_mode
    echo ""
    sync_plugin_bundle || return 1
    echo ""
    install_cep_panel || return 1
    echo ""
    install_menu_scripts
    echo ""
    echo -e "${CYAN}==========================================================${NC}"
    echo -e "${CYAN}              Installation Complete!                     ${NC}"
    echo -e "${CYAN}==========================================================${NC}"
    echo "Restart Adobe Illustrator to load the Ozo Tools suite."
}

do_update() {
    show_header
    echo -e "${YELLOW}Updating Ozo Tools plugin bundle and installed extensions...${NC}"
    echo ""
    enable_player_debug_mode
    echo ""
    sync_plugin_bundle || return 1
    echo ""
    install_cep_panel || return 1
    echo ""
    install_menu_scripts
    echo ""
    echo -e "${CYAN}==========================================================${NC}"
    echo -e "${CYAN}                 Update Complete!                        ${NC}"
    echo -e "${CYAN}==========================================================${NC}"
    echo "Restart Adobe Illustrator to reload the updated scripts & panel."
}

do_online_update() {
    show_header
    echo -e "${YELLOW}[*] Checking for the latest release on GitHub...${NC}"
    echo -e "${GRAY}    Repository: Heng-zm/illustrator-script${NC}"

    API_URL="https://api.github.com/repos/Heng-zm/illustrator-script/releases/latest"
    RELEASE_JSON=$(curl -s -L -H "User-Agent: OzoTools-Setup-macOS" "$API_URL" || true)

    LATEST_TAG=$(echo "$RELEASE_JSON" | grep '"tag_name":' | head -n 1 | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/')
    if [ -z "$LATEST_TAG" ]; then
        echo -e "${RED}    [ERROR] Failed to fetch latest release from GitHub.${NC}"
        return 1
    fi

    CURRENT_TAG="unknown"
    if [ -f "$SCRIPT_ROOT/version.json" ]; then
        CURRENT_TAG=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/v\1/p' "$SCRIPT_ROOT/version.json" | head -n 1)
    fi

    echo -e "${GRAY}    Current version : $CURRENT_TAG${NC}"
    echo -e "${CYAN}    Latest release  : $LATEST_TAG${NC}"
    echo ""

    NORM_LATEST="${LATEST_TAG#v}"
    NORM_CURRENT="${CURRENT_TAG#v}"

    if [ "$NORM_CURRENT" = "$NORM_LATEST" ]; then
        echo -e "${GREEN}    [OK] This installation is already up to date ($LATEST_TAG).${NC}"
        echo -e "${GRAY}         Use menu option [2] to re-sync local files without downloading.${NC}"
        return 0
    fi

    ZIP_URL=$(echo "$RELEASE_JSON" | grep '"browser_download_url":' | grep '\.zip"' | head -n 1 | sed -E 's/.*"browser_download_url":[[:space:]]*"([^"]+)".*/\1/')
    if [ -z "$ZIP_URL" ]; then
        echo -e "${RED}    [ERROR] No release zip archive found in the latest release.${NC}"
        return 1
    fi

    echo -e "${YELLOW}[*] Downloading: $LATEST_TAG...${NC}"
    TEMP_ZIP="/tmp/Ozo-Tools-Latest-$$.zip"
    TEMP_DIR="/tmp/Ozo-Tools-Update-$$"
    rm -rf "$TEMP_ZIP" "$TEMP_DIR"

    curl -s -L -A "OzoTools-Setup-macOS" "$ZIP_URL" -o "$TEMP_ZIP"
    if [ ! -f "$TEMP_ZIP" ] || [ $(wc -c <"$TEMP_ZIP") -lt 1000 ]; then
        echo -e "${RED}    [ERROR] Downloaded zip is corrupt or empty.${NC}"
        rm -f "$TEMP_ZIP"
        return 1
    fi

    echo -e "${GREEN}    [OK] Download complete.${NC}"
    echo -e "${YELLOW}[*] Extracting update files...${NC}"
    mkdir -p "$TEMP_DIR"
    unzip -q -o "$TEMP_ZIP" -d "$TEMP_DIR"

    EXTRACTED_CONTENT="$TEMP_DIR"
    SUBFOLDER=$(find "$TEMP_DIR" -type d -name "Script all" -exec dirname {} \; | head -n 1 || true)
    if [ -n "$SUBFOLDER" ] && [ -d "$SUBFOLDER" ]; then
        EXTRACTED_CONTENT="$SUBFOLDER"
    fi

    # Verify version.json inside zip matches release tag
    PKG_VERSION_FILE=$(find "$TEMP_DIR" -type f -name "version.json" | head -n 1 || true)
    if [ -z "$PKG_VERSION_FILE" ]; then
        echo -e "${RED}    [ERROR] Release package is missing version.json.${NC}"
        rm -rf "$TEMP_ZIP" "$TEMP_DIR"
        return 1
    fi

    PKG_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PKG_VERSION_FILE" | head -n 1)
    if [ "$PKG_VERSION" != "$NORM_LATEST" ]; then
        echo -e "${RED}    [ERROR] Package version ($PKG_VERSION) does not match release tag ($NORM_LATEST).${NC}"
        rm -rf "$TEMP_ZIP" "$TEMP_DIR"
        return 1
    fi

    echo -e "${YELLOW}[*] Applying update files...${NC}"
    cp -R "$EXTRACTED_CONTENT/"* "$SCRIPT_ROOT/" 2>/dev/null || true
    rm -rf "$TEMP_ZIP" "$TEMP_DIR"

    do_update
}

do_uninstall() {
    show_header
    echo -e "${YELLOW}[*] Uninstalling Ozo Tools Suite...${NC}"
    if [ -d "$CEP_TARGET" ]; then
        rm -rf "$CEP_TARGET"
        echo -e "${GREEN}    [OK] Removed dockable panel: $CEP_TARGET${NC}"
    fi

    for ai_app in /Applications/Adobe\ Illustrator*; do
        if [ -d "$ai_app" ]; then
            for loc in "$ai_app"/Presets*/*/Scripts/Ozo\ Tools; do
                if [ -d "$loc" ]; then
                    rm -rf "$loc" 2>/dev/null || true
                    echo -e "${GREEN}    [OK] Removed menu scripts: $loc${NC}"
                fi
            done
        fi
    done
    echo ""
    echo -e "${GREEN}Uninstallation complete.${NC}"
}

# Main Interactive Loop
while true; do
    show_header
    echo "  [1] Install Suite (Developer Mode + CEP Panel + Scripts)"
    echo "  [2] Update Suite (Sync Local Files & Refresh Extension)"
    echo "  [3] Download & Apply Latest Release from GitHub"
    echo "  [4] Uninstall Suite"
    echo "  [0] Exit"
    echo ""
    read -p "Select an option [0-4]: " choice
    case "$choice" in
        1) do_install; read -p "Press Enter to continue..." ;;
        2) do_update; read -p "Press Enter to continue..." ;;
        3) do_online_update; read -p "Press Enter to continue..." ;;
        4) do_uninstall; read -p "Press Enter to continue..." ;;
        0) exit 0 ;;
        *) echo "Invalid option"; sleep 1 ;;
    esac
done
