#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * ABA KHQR Vector Generator PRO
 * Official Bakong EMVCo compliant Vector QR Code & Table Standee Card Generator.
 * Built for Cambodian print shops, cafes, restaurants, hotels, and retail counters.
 */
(function () {
    var SCRIPT_NAME = "ABA KHQR Generator";
    var SCRIPT_VERSION = "1.0";
    var POINTS_PER_MM = 72 / 25.4;

    if (app.documents.length === 0) {
        if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams) {
            __ozoHeadlessResult = { status: "error", message: "No Illustrator document is open." };
            return;
        }
        alert(OZO.tr("Open an Illustrator document before generating ABA KHQR."));
        return;
    }

    var doc = app.activeDocument;

    // -------------------------------------------------------------
    // EMVCo KHQR String Builder & CRC-16 Checksum
    // -------------------------------------------------------------
    function formatTag(id, value) {
        if (value == null || value === "") return "";
        var str = String(value);
        var len = str.length;
        var lenStr = len < 10 ? "0" + len : String(len);
        return id + lenStr + str;
    }

    function calculateCRC16(str) {
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

    function buildKHQRPayload(opts) {
        var payload = "";
        payload += formatTag("00", "01"); // Payload Format Indicator

        var amtNum = parseFloat(opts.amount);
        var isDynamic = !isNaN(amtNum) && amtNum > 0;
        payload += formatTag("01", isDynamic ? "12" : "11"); // 11: Static, 12: Dynamic

        // Tag 29: Merchant Account Information (Bakong)
        var bId = (opts.bakongId || "merchant@abab").replace(/\s+/g, "");
        var mInfo = formatTag("00", "bakong@cbrd") + formatTag("01", bId);
        payload += formatTag("29", mInfo);

        // Tag 52: Merchant Category Code (General)
        payload += formatTag("52", "5999");

        // Tag 53: Transaction Currency (840 = USD, 116 = KHR)
        var curCode = (opts.currency === "KHR" || opts.currency === "116") ? "116" : "840";
        payload += formatTag("53", curCode);

        // Tag 54: Amount (if dynamic)
        if (isDynamic) {
            payload += formatTag("54", (curCode === "KHR" ? String(Math.round(amtNum)) : amtNum.toFixed(2)));
        }

        // Tag 58: Country Code
        payload += formatTag("58", "KH");

        // Tag 59: Merchant Name
        var mName = (opts.merchantName || "OZO MERCHANT").substring(0, 25);
        payload += formatTag("59", mName);

        // Tag 60: Merchant City
        var mCity = (opts.merchantCity || "Phnom Penh").substring(0, 15);
        payload += formatTag("60", mCity);

        // Tag 62: Additional Data Field (optional)
        var addData = "";
        if (opts.billNumber) addData += formatTag("01", String(opts.billNumber).substring(0, 25));
        if (opts.mobileNumber) addData += formatTag("02", String(opts.mobileNumber).substring(0, 25));
        if (opts.storeLabel) addData += formatTag("03", String(opts.storeLabel).substring(0, 25));
        if (addData) {
            payload += formatTag("62", addData);
        }

        // Tag 63: CRC16
        var toChecksum = payload + "6304";
        var crc = calculateCRC16(toChecksum);
        return toChecksum + crc;
    }

    // -------------------------------------------------------------
    // Compact Offline QR Code Matrix Generator
    // -------------------------------------------------------------
    function utf8Bytes(text) {
        var bytes = [];
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (c < 0x80) bytes.push(c);
            else if (c < 0x800) { bytes.push(0xC0 | (c >>> 6)); bytes.push(0x80 | (c & 0x3F)); }
            else { bytes.push(0xE0 | (c >>> 12)); bytes.push(0x80 | ((c >>> 6) & 0x3F)); bytes.push(0x80 | (c & 0x3F)); }
        }
        return bytes;
    }

    function BitBuffer() { this.buffer = []; this.length = 0; }
    BitBuffer.prototype.put = function (num, len) {
        for (var i = len - 1; i >= 0; i--) this.putBit(((num >>> i) & 1) === 1);
    };
    BitBuffer.prototype.putBit = function (bit) {
        var idx = Math.floor(this.length / 8);
        if (this.buffer.length <= idx) this.buffer.push(0);
        if (bit) this.buffer[idx] |= (0x80 >>> (this.length % 8));
        this.length++;
    };

    var EXP = []; var LOG = [];
    (function () {
        for (var i = 0; i < 8; i++) EXP[i] = 1 << i;
        for (var i2 = 8; i2 < 256; i2++) EXP[i2] = EXP[i2 - 4] ^ EXP[i2 - 5] ^ EXP[i2 - 6] ^ EXP[i2 - 8];
        for (var i3 = 0; i3 < 255; i3++) LOG[EXP[i3]] = i3;
    })();
    function gfExp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP[n]; }
    function gfLog(n) { return LOG[n]; }

    function polyMul(p1, p2) {
        var res = [];
        for (var i = 0; i < p1.length + p2.length - 1; i++) res[i] = 0;
        for (var i1 = 0; i1 < p1.length; i1++) {
            for (var i2 = 0; i2 < p2.length; i2++) {
                res[i1 + i2] ^= gfExp(gfLog(p1[i1]) + gfLog(p2[i2]));
            }
        }
        return res;
    }

    function getErrPoly(len) {
        var p = [1];
        for (var i = 0; i < len; i++) p = polyMul(p, [1, gfExp(i)]);
        return p;
    }

    function polyRemainder(data, div) {
        var res = data.slice(0);
        var off = 0;
        while (res.length - off >= div.length) {
            if (res[off] === 0) { off++; continue; }
            var r = gfLog(res[off]) - gfLog(div[0]);
            for (var i = 0; i < div.length; i++) res[off + i] ^= gfExp(gfLog(div[i]) + r);
            while (off < res.length && res[off] === 0) off++;
        }
        return res.slice(off);
    }

    var RS_BLOCKS = [
        [[1,26,19]], [[1,26,16]], [[1,26,13]], [[1,26,9]],
        [[1,44,34]], [[1,44,28]], [[1,44,22]], [[1,44,16]],
        [[1,70,55]], [[1,70,44]], [[2,35,17]], [[2,35,13]],
        [[1,100,80]], [[2,50,32]], [[2,50,24]], [[4,25,9]],
        [[1,134,108]], [[2,67,43]], [[2,33,15],[2,34,16]], [[2,33,11],[2,34,12]],
        [[2,86,68]], [[4,43,27]], [[4,43,19]], [[4,43,15]],
        [[2,98,78]], [[4,49,31]], [[2,32,14],[4,33,15]], [[4,39,13],[1,40,14]],
        [[2,121,97]], [[2,60,38],[2,61,39]], [[4,40,18],[2,41,19]], [[4,40,14],[2,41,15]],
        [[2,146,116]], [[3,58,36],[2,59,37]], [[4,36,16],[4,37,17]], [[4,36,12],[4,37,13]],
        [[2,86,68],[2,87,69]], [[4,69,43],[1,70,44]], [[6,43,19],[2,44,20]], [[6,43,15],[2,44,16]],
        [[4,101,81]], [[1,80,50],[4,81,51]], [[4,50,22],[4,51,23]], [[3,36,12],[8,37,13]],
        [[2,116,92],[2,117,93]], [[6,58,36],[2,59,37]], [[4,46,20],[6,47,21]], [[7,42,14],[4,43,15]],
        [[4,133,107]], [[8,59,37],[1,60,38]], [[8,44,20],[4,45,21]], [[12,33,11],[4,34,12]],
        [[3,145,115],[1,146,116]], [[4,64,40],[5,65,41]], [[11,36,16],[5,37,17]], [[11,36,12],[5,37,13]]
    ];

    function dataCap(v, l) {
        var idx = (v - 1) * 4 + l;
        var blks = RS_BLOCKS[idx];
        var total = 0;
        for (var b = 0; b < blks.length; b++) total += blks[b][0] * blks[b][2];
        return total;
    }

    var ALIGN_POS = [
        [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
        [6,30,54], [6,32,58], [6,34,62], [6,26,46,66]
    ];

    function createMatrix(size) {
        var m = [];
        for (var r = 0; r < size; r++) { m[r] = []; for (var c = 0; c < size; c++) m[r][c] = null; }
        return m;
    }

    function setupFinder(m, row, col) {
        var sz = m.length;
        for (var ro = -1; ro <= 7; ro++) {
            for (var co = -1; co <= 7; co++) {
                var tr = row + ro; var tc = col + co;
                if (tr < 0 || tr >= sz || tc < 0 || tc >= sz) continue;
                m[tr][tc] = (ro >= 0 && ro <= 6 && co >= 0 && co <= 6 && (ro === 0 || ro === 6 || co === 0 || co === 6 || (ro >= 2 && ro <= 4 && co >= 2 && co <= 4)));
            }
        }
    }

    function setupTiming(m) {
        var sz = m.length;
        for (var i = 8; i < sz - 8; i++) {
            if (m[i][6] === null) m[i][6] = (i % 2 === 0);
            if (m[6][i] === null) m[6][i] = (i % 2 === 0);
        }
    }

    function setupAlignment(m, v) {
        var pos = ALIGN_POS[v - 1];
        for (var p1 = 0; p1 < pos.length; p1++) {
            for (var p2 = 0; p2 < pos.length; p2++) {
                var r = pos[p1]; var c = pos[p2];
                if (m[r][c] !== null) continue;
                for (var ro = -2; ro <= 2; ro++) {
                    for (var co = -2; co <= 2; co++) {
                        m[r + ro][c + co] = Math.max(Math.abs(ro), Math.abs(co)) !== 1;
                    }
                }
            }
        }
    }

    function bchType(data) {
        var d = data << 10;
        while (d >= 0x400) {
            var msb = 0; while ((1 << msb) <= d) msb++;
            d ^= (0x537 << (msb - 11));
        }
        return ((data << 10) | d) ^ 0x5412;
    }

    function setupType(m, mask, levelIdx) {
        var bits = bchType((levelIdx << 3) | mask);
        var sz = m.length;
        for (var i = 0; i < 15; i++) {
            var dark = ((bits >> i) & 1) === 1;
            var vr = i < 6 ? i : (i < 8 ? i + 1 : sz - 15 + i);
            m[vr][8] = dark;
            var hc = i < 8 ? sz - i - 1 : (i < 9 ? 15 - i : 15 - i - 1);
            m[8][hc] = dark;
        }
        m[sz - 8][8] = true;
    }

    function maskCond(mask, r, c) {
        if (mask === 0) return (r + c) % 2 === 0;
        if (mask === 1) return r % 2 === 0;
        if (mask === 2) return c % 3 === 0;
        if (mask === 3) return (r + c) % 3 === 0;
        if (mask === 4) return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        if (mask === 5) return ((r * c) % 2) + ((r * c) % 3) === 0;
        if (mask === 6) return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }

    function mapCodewords(m, cw, mask) {
        var sz = m.length;
        var row = sz - 1; var dir = -1;
        var bi = 0; var bit = 7;
        for (var col = sz - 1; col > 0; col -= 2) {
            if (col === 6) col--;
            while (true) {
                for (var o = 0; o < 2; o++) {
                    var tc = col - o;
                    if (m[row][tc] !== null) continue;
                    var dark = false;
                    if (bi < cw.length) dark = ((cw[bi] >>> bit) & 1) === 1;
                    if (maskCond(mask, row, tc)) dark = !dark;
                    m[row][tc] = dark;
                    bit--;
                    if (bit < 0) { bi++; bit = 7; }
                }
                row += dir;
                if (row < 0 || row >= sz) { row -= dir; dir = -dir; break; }
            }
        }
    }

    function createCodewords(v, l, bytes) {
        var bb = new BitBuffer();
        bb.put(4, 4); // Byte mode indicator (0100)
        var countBits = v < 10 ? 8 : 16;
        bb.put(bytes.length, countBits);
        for (var i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);

        var cap = dataCap(v, l);
        var remBits = cap * 8 - bb.length;
        if (remBits > 0) bb.put(0, Math.min(4, remBits));
        while (bb.length % 8 !== 0) bb.putBit(false);
        var padBytes = [0xEC, 0x11]; var pi = 0;
        while (bb.length < cap * 8) { bb.put(padBytes[pi % 2], 8); pi++; }

        var idx = (v - 1) * 4 + l;
        var blks = RS_BLOCKS[idx];
        var totalBlocks = 0;
        for (var b = 0; b < blks.length; b++) totalBlocks += blks[b][0];

        var ecCount = blks[0][1] - blks[0][2];
        var poly = getErrPoly(ecCount);

        var dataBlocks = [];
        var ecBlocks = [];
        var dataOffset = 0;
        for (var b2 = 0; b2 < blks.length; b2++) {
            var bCount = blks[b2][0];
            var dLen = blks[b2][2];
            for (var bi = 0; bi < bCount; bi++) {
                var dChunk = bb.buffer.slice(dataOffset, dataOffset + dLen);
                dataBlocks.push(dChunk);
                var fullChunk = dChunk.concat(new Array(ecCount));
                for (var z = 0; z < ecCount; z++) fullChunk[dLen + z] = 0;
                var rem = polyRemainder(fullChunk, poly);
                while (rem.length < ecCount) rem.unshift(0);
                ecBlocks.push(rem);
                dataOffset += dLen;
            }
        }

        var interleaved = [];
        var maxData = 0;
        for (var db = 0; db < dataBlocks.length; db++) if (dataBlocks[db].length > maxData) maxData = dataBlocks[db].length;
        for (var di = 0; di < maxData; di++) {
            for (var db2 = 0; db2 < dataBlocks.length; db2++) {
                if (di < dataBlocks[db2].length) interleaved.push(dataBlocks[db2][di]);
            }
        }
        for (var ei = 0; ei < ecCount; ei++) {
            for (var eb = 0; eb < ecBlocks.length; eb++) {
                interleaved.push(ecBlocks[eb][ei]);
            }
        }
        return interleaved;
    }

    function buildMatrix(v, l, cw, mask) {
        var sz = 17 + 4 * v;
        var m = createMatrix(sz);
        setupFinder(m, 0, 0); setupFinder(m, 0, sz - 7); setupFinder(m, sz - 7, 0);
        setupTiming(m);
        setupAlignment(m, v);
        setupType(m, mask, l);
        mapCodewords(m, cw, mask);
        return m;
    }

    function encodeQrMatrix(text) {
        var bytes = utf8Bytes(text);
        var level = 1; // Level M (Standard for payment QR codes)
        var version = 1;
        for (version = 1; version <= 14; version++) {
            var countBits = version < 10 ? 8 : 16;
            if (4 + countBits + bytes.length * 8 <= dataCap(version, level) * 8) break;
        }
        if (version > 14) throw new Error("Payload too long for QR versions 1-14.");
        var cw = createCodewords(version, level, bytes);
        return { matrix: buildMatrix(version, level, cw, 0), version: version };
    }

    // -------------------------------------------------------------
    // Illustrator Vector Drawing Engine
    // -------------------------------------------------------------
    function cmyk(c, m, y, k) {
        var col = new CMYKColor();
        col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
        return col;
    }

    function rgb(r, g, b) {
        var col = new RGBColor();
        col.red = r; col.green = g; col.blue = b;
        return col;
    }

    var COLOR_BAKONG_RED = cmyk(0, 95, 90, 0);   // #E11927
    var COLOR_ABA_NAVY   = cmyk(100, 75, 20, 25); // #003E6B
    var COLOR_ABA_CYAN   = cmyk(75, 10, 0, 0);    // #00A3E0
    var COLOR_WHITE      = cmyk(0, 0, 0, 0);
    var COLOR_BLACK      = cmyk(0, 0, 0, 100);
    var COLOR_CARD_BORDER= cmyk(10, 5, 5, 0);    // subtle gray
    var COLOR_TEXT_MUTED = cmyk(40, 30, 30, 10);

    function drawVectorKHQR(opts) {
        var qrText = buildKHQRPayload(opts);
        var encoded = encodeQrMatrix(qrText);
        var matrix = encoded.matrix;
        var matrixSize = matrix.length;

        var style = opts.style || "Bakong Red Standee";
        var isCard = (style.indexOf("Standee") !== -1 || style.indexOf("Card") !== -1);
        var isAba = (style.indexOf("ABA") !== -1);

        var artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var abRect = artboard.artboardRect;
        var abCenterX = (abRect[0] + abRect[2]) / 2;
        var abCenterY = (abRect[1] + abRect[3]) / 2;

        var layer = doc.layers.add();
        layer.name = (isCard ? "ABA KHQR Standee" : "ABA KHQR Vector") + " - " + (opts.merchantName || "Payment");

        var mainGroup = layer.groupItems.add();

        if (isCard) {
            // Standard Table Standee Card: 100mm x 150mm
            var cardWidthMm = parseFloat(opts.width) || 100;
            var cardHeightMm = cardWidthMm * 1.5;
            var cardW = cardWidthMm * POINTS_PER_MM;
            var cardH = cardHeightMm * POINTS_PER_MM;
            var cardCorner = 8 * POINTS_PER_MM;

            var cardLeft = abCenterX - cardW / 2;
            var cardTop = abCenterY + cardH / 2;

            // 1. Card Background
            var cardBg = mainGroup.pathItems.roundedRectangle(cardTop, cardLeft, cardW, cardH, cardCorner, cardCorner);
            cardBg.filled = true;
            cardBg.fillColor = COLOR_WHITE;
            cardBg.stroked = true;
            cardBg.strokeColor = COLOR_CARD_BORDER;
            cardBg.strokeWidth = 1;

            // 2. Top Header Banner
            var headerHeight = cardH * 0.22;
            var headerBg = mainGroup.pathItems.roundedRectangle(cardTop, cardLeft, cardW, headerHeight + cardCorner, cardCorner, cardCorner);
            headerBg.filled = true;
            headerBg.fillColor = isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED;
            headerBg.stroked = false;

            // Header Banner Text
            var txtHeader = mainGroup.textFrames.add();
            txtHeader.contents = isAba ? "ABA' PAY" : "KHQR";
            txtHeader.top = cardTop - headerHeight * 0.35;
            txtHeader.left = abCenterX - (txtHeader.width / 2);
            var charAttr = txtHeader.textRange.characterAttributes;
            charAttr.size = isAba ? 22 : 26;
            charAttr.fillColor = COLOR_WHITE;
            try { charAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e) {}
            txtHeader.left = abCenterX - (txtHeader.width / 2); // re-center after font size

            // Sub-tag text on header
            if (isAba) {
                var txtKhqrSub = mainGroup.textFrames.add();
                txtKhqrSub.contents = "KHQR";
                txtKhqrSub.top = cardTop - headerHeight * 0.72;
                var subAttr = txtKhqrSub.textRange.characterAttributes;
                subAttr.size = 10;
                subAttr.fillColor = COLOR_ABA_CYAN;
                txtKhqrSub.left = abCenterX - (txtKhqrSub.width / 2);
            }

            // 3. Merchant Name
            var mNameTop = cardTop - headerHeight - 12 * POINTS_PER_MM;
            var txtName = mainGroup.textFrames.add();
            txtName.contents = (opts.merchantName || "OZO MERCHANT").toUpperCase();
            txtName.top = mNameTop;
            var nameAttr = txtName.textRange.characterAttributes;
            nameAttr.size = 13;
            nameAttr.fillColor = COLOR_BLACK;
            try { nameAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e) {}
            txtName.left = abCenterX - (txtName.width / 2);

            // 4. Center QR Code
            var qrSize = cardW * 0.62;
            var qrTop = mNameTop - 10 * POINTS_PER_MM;
            var qrLeft = abCenterX - qrSize / 2;

            drawQrModules(mainGroup, matrix, qrTop, qrLeft, qrSize);

            // Center Bakong Badge
            drawBakongBadge(mainGroup, abCenterX, qrTop - qrSize / 2, qrSize * 0.22);

            // 5. Amount / Currency Display
            var amtTop = qrTop - qrSize - 12 * POINTS_PER_MM;
            var txtAmt = mainGroup.textFrames.add();
            var amtNum = parseFloat(opts.amount);
            if (!isNaN(amtNum) && amtNum > 0) {
                var sym = (opts.currency === "KHR") ? "៛ " : "$ ";
                txtAmt.contents = sym + (opts.currency === "KHR" ? Math.round(amtNum) : amtNum.toFixed(2));
            } else {
                txtAmt.contents = "SCAN TO PAY";
            }
            txtAmt.top = amtTop;
            var amtAttr = txtAmt.textRange.characterAttributes;
            amtAttr.size = 16;
            amtAttr.fillColor = isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED;
            try { amtAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e) {}
            txtAmt.left = abCenterX - (txtAmt.width / 2);

            // 6. Account & Footer Info
            var txtAcc = mainGroup.textFrames.add();
            txtAcc.contents = (opts.bakongId || "merchant@abab");
            txtAcc.top = amtTop - 18;
            var accAttr = txtAcc.textRange.characterAttributes;
            accAttr.size = 9;
            accAttr.fillColor = COLOR_TEXT_MUTED;
            txtAcc.left = abCenterX - (txtAcc.width / 2);

            // Footer separator & label
            var footerLine = mainGroup.pathItems.add();
            var fY = cardTop - cardH + 16 * POINTS_PER_MM;
            footerLine.setEntirePath([[cardLeft + 15 * POINTS_PER_MM, fY], [cardLeft + cardW - 15 * POINTS_PER_MM, fY]]);
            footerLine.stroked = true;
            footerLine.strokeColor = COLOR_CARD_BORDER;
            footerLine.strokeWidth = 0.75;
            footerLine.filled = false;

            var txtFooter = mainGroup.textFrames.add();
            txtFooter.contents = "POWERED BY BAKONG";
            txtFooter.top = fY - 5;
            var footAttr = txtFooter.textRange.characterAttributes;
            footAttr.size = 7.5;
            footAttr.fillColor = COLOR_TEXT_MUTED;
            txtFooter.left = abCenterX - (txtFooter.width / 2);

        } else {
            // Minimal Vector QR Only (with Bakong center logo)
            var qrSizeMm = parseFloat(opts.width) || 50;
            var qrSz = qrSizeMm * POINTS_PER_MM;
            var qTop = abCenterY + qrSz / 2;
            var qLeft = abCenterX - qrSz / 2;

            drawQrModules(mainGroup, matrix, qTop, qLeft, qrSz);
            drawBakongBadge(mainGroup, abCenterX, abCenterY, qrSz * 0.22);
        }

        return {
            status: "success",
            payload: qrText,
            merchantName: opts.merchantName || "OZO MERCHANT",
            bakongId: opts.bakongId || "merchant@abab",
            currency: opts.currency || "USD",
            amount: opts.amount || "",
            message: "Successfully generated official ABA KHQR vector artwork."
        };
    }

    function drawQrModules(group, matrix, top, left, size) {
        var matrixSize = matrix.length;
        var quietZone = 4;
        var totalCells = matrixSize + quietZone * 2;
        var cellSize = size / totalCells;

        // White Quiet Zone Background
        var bg = group.pathItems.rectangle(top, left, size, size);
        bg.filled = true;
        bg.fillColor = COLOR_WHITE;
        bg.stroked = false;

        // Black Modules
        for (var r = 0; r < matrixSize; r++) {
            for (var c = 0; c < matrixSize; c++) {
                if (matrix[r][c]) {
                    var cellLeft = left + (c + quietZone) * cellSize;
                    var cellTop = top - (r + quietZone) * cellSize;
                    var mod = group.pathItems.rectangle(cellTop, cellLeft, cellSize + 0.05, cellSize + 0.05);
                    mod.filled = true;
                    mod.fillColor = COLOR_BLACK;
                    mod.stroked = false;
                }
            }
        }
    }

    function drawBakongBadge(group, centerX, centerY, diameter) {
        // 1. Outer White Pill
        var pill = group.pathItems.ellipse(centerY + diameter / 2, centerX - diameter / 2, diameter, diameter);
        pill.filled = true;
        pill.fillColor = COLOR_WHITE;
        pill.stroked = false;

        // 2. Inner Red Circle
        var innerDia = diameter * 0.85;
        var inner = group.pathItems.ellipse(centerY + innerDia / 2, centerX - innerDia / 2, innerDia, innerDia);
        inner.filled = true;
        inner.fillColor = COLOR_BAKONG_RED;
        inner.stroked = false;

        // 3. Crisp White "K" Symbol in center
        var kw = innerDia * 0.42;
        var kh = innerDia * 0.55;
        var kTop = centerY + kh / 2;
        var kLeft = centerX - kw / 2;

        // Stem
        var stem = group.pathItems.rectangle(kTop, kLeft, kw * 0.28, kh);
        stem.filled = true; stem.fillColor = COLOR_WHITE; stem.stroked = false;

        // Top Arm
        var arm1 = group.pathItems.add();
        arm1.setEntirePath([
            [kLeft + kw * 0.25, centerY + 1],
            [kLeft + kw, kTop],
            [kLeft + kw, kTop - kh * 0.3],
            [kLeft + kw * 0.25, centerY - kh * 0.1]
        ]);
        arm1.closed = true; arm1.filled = true; arm1.fillColor = COLOR_WHITE; arm1.stroked = false;

        // Bottom Arm
        var arm2 = group.pathItems.add();
        arm2.setEntirePath([
            [kLeft + kw * 0.35, centerY + 1],
            [kLeft + kw, centerY - kh * 0.5],
            [kLeft + kw - kw * 0.3, centerY - kh * 0.5],
            [kLeft + kw * 0.25, centerY - kh * 0.15]
        ]);
        arm2.closed = true; arm2.filled = true; arm2.fillColor = COLOR_WHITE; arm2.stroked = false;
    }

    // -------------------------------------------------------------
    // Headless Bridge Invocation (From CEP Panel)
    // -------------------------------------------------------------
    if (typeof __ozoHeadlessParams !== "undefined" && __ozoHeadlessParams !== null) {
        var params = __ozoHeadlessParams;
        var res = drawVectorKHQR(params);
        __ozoHeadlessResult = res;
        return;
    }

    // -------------------------------------------------------------
    // Standalone ScriptUI Dialog (When run directly from Scripts menu)
    // -------------------------------------------------------------
    var dlg = new Window("dialog", SCRIPT_NAME + " v" + SCRIPT_VERSION);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = 16;

    var pnlInfo = dlg.add("panel", undefined, OZO.tr("Bakong / ABA Merchant Account Details"));
    pnlInfo.orientation = "column";
    pnlInfo.alignChildren = ["fill", "top"];
    pnlInfo.margins = 12;

    function addRow(parent, label, defVal) {
        var g = parent.add("group");
        g.orientation = "row";
        var lbl = g.add("statictext", undefined, label);
        lbl.preferredSize.width = 110;
        var inp = g.add("edittext", undefined, defVal);
        inp.preferredSize.width = 220;
        return inp;
    }

    var inpName = addRow(pnlInfo, OZO.tr("Merchant Name:"), "OZO PRINT SHOP");
    var inpId   = addRow(pnlInfo, OZO.tr("Bakong Account:"), "heng_zm@abab");

    var grpCur = pnlInfo.add("group");
    grpCur.orientation = "row";
    var lblCur = grpCur.add("statictext", undefined, OZO.tr("Currency:"));
    lblCur.preferredSize.width = 110;
    var rbUsd = grpCur.add("radiobutton", undefined, "USD ($)");
    var rbKhr = grpCur.add("radiobutton", undefined, "KHR (៛)");
    rbUsd.value = true;

    var inpAmt  = addRow(pnlInfo, OZO.tr("Amount (Optional):"), "");
    var inpBill = addRow(pnlInfo, OZO.tr("Bill / Order No:"), "");

    var pnlStyle = dlg.add("panel", undefined, OZO.tr("Template Output Style"));
    pnlStyle.orientation = "column";
    pnlStyle.alignChildren = ["fill", "top"];
    pnlStyle.margins = 12;

    var ddlStyle = pnlStyle.add("dropdownlist", undefined, [
        "Bakong Red Standee (Table Card 100x150mm)",
        "ABA Navy Standee (Table Card 100x150mm)",
        "Vector QR Only (No Card Frame)"
    ]);
    ddlStyle.selection = 0;

    var grpBtns = dlg.add("group");
    grpBtns.orientation = "row";
    grpBtns.alignment = ["right", "bottom"];

    var btnCancel = grpBtns.add("button", undefined, OZO.tr("Cancel"), { name: "cancel" });
    var btnOk = grpBtns.add("button", undefined, OZO.tr("Generate KHQR"), { name: "ok" });

    btnCancel.onClick = function () { dlg.close(0); };
    btnOk.onClick = function () {
        var selectedStyle = ddlStyle.selection ? ddlStyle.selection.text : "Bakong Red Standee";
        var options = {
            merchantName: inpName.text.replace(/^\s+|\s+$/g, "") || "OZO MERCHANT",
            bakongId: inpId.text.replace(/^\s+|\s+$/g, "") || "merchant@abab",
            currency: rbKhr.value ? "KHR" : "USD",
            amount: inpAmt.text.replace(/^\s+|\s+$/g, ""),
            billNumber: inpBill.text.replace(/^\s+|\s+$/g, ""),
            style: selectedStyle,
            width: 100
        };
        var outcome = drawVectorKHQR(options);
        if (outcome.status === "error") {
            alert(outcome.message);
            return;
        }
        dlg.close(1);
    };

    dlg.show();
})();
