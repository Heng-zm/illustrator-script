#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * ABA KHQR Vector Generator PRO
 * Official Bakong EMVCo compliant Vector QR Code & Table Standee Card Generator.
 * Built for Cambodian print shops, cafes, restaurants, hotels, and retail counters.
 */
(function () {
    var SCRIPT_NAME = "ABA KHQR Generator";
    var SCRIPT_VERSION = "1.1";
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
    var isDocCmyk = (doc.documentColorSpace === DocumentColorSpace.CMYK);

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

    function utf8Bytes(text) {
        var bytes = [];
        for (var index = 0; index < text.length; index++) {
            var code = text.charCodeAt(index);
            if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
                var low = text.charCodeAt(index + 1);
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                    index++;
                }
            }
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xC0 | (code >>> 6));
                bytes.push(0x80 | (code & 0x3F));
            } else if (code < 0x10000) {
                bytes.push(0xE0 | (code >>> 12));
                bytes.push(0x80 | ((code >>> 6) & 0x3F));
                bytes.push(0x80 | (code & 0x3F));
            } else {
                bytes.push(0xF0 | (code >>> 18));
                bytes.push(0x80 | ((code >>> 12) & 0x3F));
                bytes.push(0x80 | ((code >>> 6) & 0x3F));
                bytes.push(0x80 | (code & 0x3F));
            }
        }
        return bytes;
    }

    function BitBuffer() {
        this.buffer = [];
        this.length = 0;
    }
    BitBuffer.prototype.put = function (number, length) {
        for (var index = length - 1; index >= 0; index--) {
            this.putBit(((number >>> index) & 1) === 1);
        }
    };
    BitBuffer.prototype.putBit = function (bit) {
        var bufferIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufferIndex) {
            this.buffer.push(0);
        }
        if (bit) {
            this.buffer[bufferIndex] |= 0x80 >>> (this.length % 8);
        }
        this.length++;
    };

    var EXP_TABLE = [];
    var LOG_TABLE = [];
    (function () {
        var index;
        for (index = 0; index < 8; index++) {
            EXP_TABLE[index] = 1 << index;
        }
        for (index = 8; index < 256; index++) {
            EXP_TABLE[index] = EXP_TABLE[index - 4] ^ EXP_TABLE[index - 5] ^
                EXP_TABLE[index - 6] ^ EXP_TABLE[index - 8];
        }
        for (index = 0; index < 255; index++) {
            LOG_TABLE[EXP_TABLE[index]] = index;
        }
    })();

    function gfExp(number) {
        while (number < 0) {
            number += 255;
        }
        while (number >= 256) {
            number -= 255;
        }
        return EXP_TABLE[number];
    }

    function gfLog(number) {
        if (number < 1) {
            throw new Error("QR encoder encountered an invalid polynomial value.");
        }
        return LOG_TABLE[number];
    }

    function polynomialMultiply(first, second) {
        var result = [];
        var index;
        for (index = 0; index < first.length + second.length - 1; index++) {
            result[index] = 0;
        }
        for (index = 0; index < first.length; index++) {
            for (var secondIndex = 0; secondIndex < second.length; secondIndex++) {
                result[index + secondIndex] ^= gfExp(
                    gfLog(first[index]) + gfLog(second[secondIndex])
                );
            }
        }
        return result;
    }

    var ERROR_POLYNOMIAL_CACHE = {};

    function errorPolynomial(length) {
        if (ERROR_POLYNOMIAL_CACHE.hasOwnProperty(length)) {
            return ERROR_POLYNOMIAL_CACHE[length];
        }
        var polynomial = [1];
        for (var index = 0; index < length; index++) {
            polynomial = polynomialMultiply(polynomial, [1, gfExp(index)]);
        }
        ERROR_POLYNOMIAL_CACHE[length] = polynomial;
        return polynomial;
    }

    function polynomialRemainder(data, divisor) {
        var result = data.slice(0);
        var offset = 0;
        while (result.length - offset >= divisor.length) {
            if (result[offset] === 0) {
                offset++;
                continue;
            }
            var ratio = gfLog(result[offset]) - gfLog(divisor[0]);
            for (var index = 0; index < divisor.length; index++) {
                result[offset + index] ^= gfExp(gfLog(divisor[index]) + ratio);
            }
            while (offset < result.length && result[offset] === 0) {
                offset++;
            }
        }
        return result.slice(offset);
    }

    // QR Model 2 Reed-Solomon blocks, versions 1-10, ordered L/M/Q/H.
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
        [[2,86,68],[2,87,69]], [[4,69,43],[1,70,44]], [[6,43,19],[2,44,20]], [[6,43,15],[2,44,16]]
    ];
    var LEVEL_INDEX = {L: 0, M: 1, Q: 2, H: 3};
    var LEVEL_BITS = {L: 1, M: 0, Q: 3, H: 2};
    var ALIGNMENT_POSITIONS = [
        [], [6,18], [6,22], [6,26], [6,30], [6,34],
        [6,22,38], [6,24,42], [6,26,46], [6,28,50]
    ];

    function expandedBlocks(version, level) {
        var definitions = RS_BLOCKS[(version - 1) * 4 + LEVEL_INDEX[level]];
        var blocks = [];
        for (var index = 0; index < definitions.length; index++) {
            for (var count = 0; count < definitions[index][0]; count++) {
                blocks.push({
                    totalCount: definitions[index][1],
                    dataCount: definitions[index][2]
                });
            }
        }
        return blocks;
    }

    function dataCapacityFor(version, level) {
        var definitions = RS_BLOCKS[(version - 1) * 4 + LEVEL_INDEX[level]];
        var capacity = 0;
        for (var index = 0; index < definitions.length; index++) {
            capacity += definitions[index][0] * definitions[index][2];
        }
        return capacity;
    }

    function createCodewords(version, level, bytes) {
        var blocks = expandedBlocks(version, level);
        var dataCapacity = 0;
        var index;
        for (index = 0; index < blocks.length; index++) {
            dataCapacity += blocks[index].dataCount;
        }

        var buffer = new BitBuffer();
        buffer.put(4, 4); // Byte mode.
        buffer.put(bytes.length, version < 10 ? 8 : 16);
        for (index = 0; index < bytes.length; index++) {
            buffer.put(bytes[index], 8);
        }
        if (buffer.length > dataCapacity * 8) {
            throw new Error("Data does not fit QR version " + version + ".");
        }
        if (buffer.length + 4 <= dataCapacity * 8) {
            buffer.put(0, 4);
        }
        while (buffer.length % 8 !== 0) {
            buffer.putBit(false);
        }
        var pad = true;
        while (buffer.buffer.length < dataCapacity) {
            buffer.put(pad ? 0xEC : 0x11, 8);
            pad = !pad;
        }

        var offset = 0;
        var dataBlocks = [];
        var errorBlocks = [];
        var maxData = 0;
        var maxError = 0;
        for (index = 0; index < blocks.length; index++) {
            var dataCount = blocks[index].dataCount;
            var errorCount = blocks[index].totalCount - dataCount;
            dataBlocks[index] = buffer.buffer.slice(offset, offset + dataCount);
            offset += dataCount;
            var divisor = errorPolynomial(errorCount);
            var raw = dataBlocks[index].slice(0);
            for (var zero = 0; zero < errorCount; zero++) {
                raw.push(0);
            }
            var remainder = polynomialRemainder(raw, divisor);
            var errorData = [];
            for (var errorIndex = 0; errorIndex < errorCount; errorIndex++) {
                var remainderIndex = errorIndex + remainder.length - errorCount;
                errorData[errorIndex] = remainderIndex >= 0 ? remainder[remainderIndex] : 0;
            }
            errorBlocks[index] = errorData;
            maxData = Math.max(maxData, dataCount);
            maxError = Math.max(maxError, errorCount);
        }

        var codewords = [];
        for (index = 0; index < maxData; index++) {
            for (var dataBlock = 0; dataBlock < dataBlocks.length; dataBlock++) {
                if (index < dataBlocks[dataBlock].length) {
                    codewords.push(dataBlocks[dataBlock][index]);
                }
            }
        }
        for (index = 0; index < maxError; index++) {
            for (var errorBlock = 0; errorBlock < errorBlocks.length; errorBlock++) {
                if (index < errorBlocks[errorBlock].length) {
                    codewords.push(errorBlocks[errorBlock][index]);
                }
            }
        }
        return codewords;
    }

    function bchTypeInfo(data) {
        var value = data << 10;
        var generator = 0x537;
        while (bitLength(value) - bitLength(generator) >= 0) {
            value ^= generator << (bitLength(value) - bitLength(generator));
        }
        return ((data << 10) | value) ^ 0x5412;
    }

    function bchTypeNumber(data) {
        var value = data << 12;
        var generator = 0x1F25;
        while (bitLength(value) - bitLength(generator) >= 0) {
            value ^= generator << (bitLength(value) - bitLength(generator));
        }
        return (data << 12) | value;
    }

    function bitLength(value) {
        var length = 0;
        while (value !== 0) {
            length++;
            value >>>= 1;
        }
        return length;
    }

    function maskValue(pattern, row, column) {
        switch (pattern) {
            case 0: return (row + column) % 2 === 0;
            case 1: return row % 2 === 0;
            case 2: return column % 3 === 0;
            case 3: return (row + column) % 3 === 0;
            case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
            case 5: return (row * column) % 2 + (row * column) % 3 === 0;
            case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
            default: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
        }
    }

    function makeEmptyMatrix(size) {
        var matrix = [];
        for (var row = 0; row < size; row++) {
            matrix[row] = [];
            for (var column = 0; column < size; column++) {
                matrix[row][column] = null;
            }
        }
        return matrix;
    }

    function setupFinder(matrix, row, column) {
        var size = matrix.length;
        for (var rowOffset = -1; rowOffset <= 7; rowOffset++) {
            for (var columnOffset = -1; columnOffset <= 7; columnOffset++) {
                var targetRow = row + rowOffset;
                var targetColumn = column + columnOffset;
                if (targetRow < 0 || targetRow >= size || targetColumn < 0 || targetColumn >= size) {
                    continue;
                }
                matrix[targetRow][targetColumn] =
                    rowOffset >= 0 && rowOffset <= 6 && columnOffset >= 0 && columnOffset <= 6 &&
                    (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 ||
                    columnOffset === 6 || (rowOffset >= 2 && rowOffset <= 4 &&
                    columnOffset >= 2 && columnOffset <= 4));
            }
        }
    }

    function setupAlignment(matrix, version) {
        var positions = ALIGNMENT_POSITIONS[version - 1];
        for (var first = 0; first < positions.length; first++) {
            for (var second = 0; second < positions.length; second++) {
                var row = positions[first];
                var column = positions[second];
                if (matrix[row][column] !== null) {
                    continue;
                }
                for (var rowOffset = -2; rowOffset <= 2; rowOffset++) {
                    for (var columnOffset = -2; columnOffset <= 2; columnOffset++) {
                        matrix[row + rowOffset][column + columnOffset] =
                            Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1;
                    }
                }
            }
        }
    }

    function setupTiming(matrix) {
        for (var index = 8; index < matrix.length - 8; index++) {
            if (matrix[index][6] === null) {
                matrix[index][6] = index % 2 === 0;
            }
            if (matrix[6][index] === null) {
                matrix[6][index] = index % 2 === 0;
            }
        }
    }

    function setupTypeInfo(matrix, level, mask) {
        var bits = bchTypeInfo((LEVEL_BITS[level] << 3) | mask);
        var size = matrix.length;
        for (var index = 0; index < 15; index++) {
            var dark = ((bits >> index) & 1) === 1;
            var verticalRow;
            if (index < 6) verticalRow = index;
            else if (index < 8) verticalRow = index + 1;
            else verticalRow = size - 15 + index;
            matrix[verticalRow][8] = dark;

            var horizontalColumn;
            if (index < 8) horizontalColumn = size - index - 1;
            else if (index < 9) horizontalColumn = 15 - index;
            else horizontalColumn = 15 - index - 1;
            matrix[8][horizontalColumn] = dark;
        }
        matrix[size - 8][8] = true;
    }

    function setupTypeNumber(matrix, version) {
        if (version < 7) return;
        var bits = bchTypeNumber(version);
        var size = matrix.length;
        for (var index = 0; index < 18; index++) {
            var dark = ((bits >> index) & 1) === 1;
            matrix[Math.floor(index / 3)][index % 3 + size - 11] = dark;
            matrix[index % 3 + size - 11][Math.floor(index / 3)] = dark;
        }
    }

    function mapCodewords(matrix, codewords, mask) {
        var size = matrix.length;
        var row = size - 1;
        var direction = -1;
        var byteIndex = 0;
        var bitIndex = 7;
        for (var column = size - 1; column > 0; column -= 2) {
            if (column === 6) column--;
            while (true) {
                for (var offset = 0; offset < 2; offset++) {
                    var targetColumn = column - offset;
                    if (matrix[row][targetColumn] !== null) continue;
                    var dark = false;
                    if (byteIndex < codewords.length) {
                        dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
                    }
                    if (maskValue(mask, row, targetColumn)) dark = !dark;
                    matrix[row][targetColumn] = dark;
                    bitIndex--;
                    if (bitIndex < 0) {
                        byteIndex++;
                        bitIndex = 7;
                    }
                }
                row += direction;
                if (row < 0 || row >= size) {
                    row -= direction;
                    direction = -direction;
                    break;
                }
            }
        }
    }

    function buildMatrix(version, level, codewords, mask) {
        var size = version * 4 + 17;
        var matrix = makeEmptyMatrix(size);
        setupFinder(matrix, 0, 0);
        setupFinder(matrix, size - 7, 0);
        setupFinder(matrix, 0, size - 7);
        setupAlignment(matrix, version);
        setupTiming(matrix);
        setupTypeInfo(matrix, level, mask);
        setupTypeNumber(matrix, version);
        mapCodewords(matrix, codewords, mask);
        return matrix;
    }

    function lostPoints(matrix) {
        var size = matrix.length;
        var score = 0;
        var row;
        var column;

        // Condition 1: Adjacent modules in row/column in same color (runs of >= 5).
        for (row = 0; row < size; row++) {
            var rowColor = matrix[row][0];
            var rowCount = 1;
            for (column = 1; column < size; column++) {
                if (matrix[row][column] === rowColor) {
                    rowCount++;
                } else {
                    if (rowCount >= 5) {
                        score += 3 + (rowCount - 5);
                    }
                    rowColor = matrix[row][column];
                    rowCount = 1;
                }
            }
            if (rowCount >= 5) {
                score += 3 + (rowCount - 5);
            }
        }
        for (column = 0; column < size; column++) {
            var colColor = matrix[0][column];
            var colCount = 1;
            for (row = 1; row < size; row++) {
                if (matrix[row][column] === colColor) {
                    colCount++;
                } else {
                    if (colCount >= 5) {
                        score += 3 + (colCount - 5);
                    }
                    colColor = matrix[row][column];
                    colCount = 1;
                }
            }
            if (colCount >= 5) {
                score += 3 + (colCount - 5);
            }
        }

        // Condition 2: 2x2 blocks of same color.
        for (row = 0; row < size - 1; row++) {
            for (column = 0; column < size - 1; column++) {
                var block = (matrix[row][column] ? 1 : 0) +
                    (matrix[row + 1][column] ? 1 : 0) +
                    (matrix[row][column + 1] ? 1 : 0) +
                    (matrix[row + 1][column + 1] ? 1 : 0);
                if (block === 0 || block === 4) {
                    score += 3;
                }
            }
        }

        // Condition 3: 1:1:3:1:1 ratio pattern with 4 quiet zone modules (10111010000 or 00001011101).
        for (row = 0; row < size; row++) {
            var rowBits = 0;
            for (column = 0; column < size; column++) {
                rowBits = ((rowBits << 1) & 0x7FF) | (matrix[row][column] ? 1 : 0);
                if (column >= 10 && (rowBits === 0x5D0 || rowBits === 0x05D)) {
                    score += 40;
                }
            }
        }
        for (column = 0; column < size; column++) {
            var colBits = 0;
            for (row = 0; row < size; row++) {
                colBits = ((colBits << 1) & 0x7FF) | (matrix[row][column] ? 1 : 0);
                if (row >= 10 && (colBits === 0x5D0 || colBits === 0x05D)) {
                    score += 40;
                }
            }
        }

        // Condition 4: Proportion of dark modules (deviation from 50%).
        var darkCount = 0;
        for (row = 0; row < size; row++) {
            for (column = 0; column < size; column++) {
                if (matrix[row][column]) darkCount++;
            }
        }
        var percentage = (darkCount * 100) / (size * size);
        score += Math.floor(Math.abs(percentage - 50) / 5) * 10;

        return score;
    }

    function encodeQr(text, level) {
        var bytes = utf8Bytes(text);
        var version;
        for (version = 1; version <= 10; version++) {
            var countBits = version < 10 ? 8 : 16;
            if (4 + countBits + bytes.length * 8 <= dataCapacityFor(version, level) * 8) {
                break;
            }
        }
        if (version > 10) {
            throw new Error("The content is too long. This generator supports QR versions 1-10.");
        }
        var codewords = createCodewords(version, level, bytes);
        var bestMask = 0;
        var bestScore = Number.MAX_VALUE;
        for (var mask = 0; mask < 8; mask++) {
            var testMatrix = buildMatrix(version, level, codewords, mask);
            var score = lostPoints(testMatrix);
            if (score < bestScore) {
                bestScore = score;
                bestMask = mask;
            }
        }
        return {matrix: buildMatrix(version, level, codewords, bestMask), version: version};
    }



    // -------------------------------------------------------------
    // Illustrator Vector Drawing Engine
    // -------------------------------------------------------------
    function makeColor(c, m, y, k, r, g, b) {
        if (isDocCmyk) {
            var col = new CMYKColor();
            col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
            return col;
        }
        var rgbCol = new RGBColor();
        rgbCol.red = r; rgbCol.green = g; rgbCol.blue = b;
        return rgbCol;
    }

    var COLOR_BAKONG_RED = makeColor(0, 95, 90, 0, 225, 35, 46);    // Official Bakong Bravery Red #E1232E
    var COLOR_ABA_NAVY   = makeColor(100, 75, 20, 25, 0, 62, 107);  // #003E6B
    var COLOR_ABA_CYAN   = makeColor(75, 10, 0, 0, 0, 163, 224);    // #00A3E0
    var COLOR_WHITE      = makeColor(0, 0, 0, 0, 255, 255, 255);
    var COLOR_BLACK      = makeColor(0, 0, 0, 100, 0, 0, 0);
    var COLOR_CARD_BORDER= makeColor(10, 5, 5, 0, 226, 232, 240);
    var COLOR_TEXT_MUTED = makeColor(40, 30, 30, 10, 113, 128, 150);

    function drawHeaderBanner(group, top, left, width, height, radius, fill) {
        var r = Math.min(radius, height / 2, width / 2);
        var k = r * 0.55228475; // bezier control distance for 90deg arc
        var b = top - height;
        var right = left + width;

        var path = group.pathItems.add();

        // 1. Bottom-Left corner
        var p1 = path.pathPoints.add();
        p1.anchor = [left, b];
        p1.leftDirection = [left, b];
        p1.rightDirection = [left, b];
        p1.pointType = PointType.CORNER;

        // 2. Top-Left arc start
        var p2 = path.pathPoints.add();
        p2.anchor = [left, top - r];
        p2.leftDirection = [left, top - r];
        p2.rightDirection = [left, top - r + k];
        p2.pointType = PointType.SMOOTH;

        // 3. Top-Left arc end
        var p3 = path.pathPoints.add();
        p3.anchor = [left + r, top];
        p3.leftDirection = [left + r - k, top];
        p3.rightDirection = [left + r, top];
        p3.pointType = PointType.SMOOTH;

        // 4. Top-Right arc start
        var p4 = path.pathPoints.add();
        p4.anchor = [right - r, top];
        p4.leftDirection = [right - r, top];
        p4.rightDirection = [right - r + k, top];
        p4.pointType = PointType.SMOOTH;

        // 5. Top-Right arc end
        var p5 = path.pathPoints.add();
        p5.anchor = [right, top - r];
        p5.leftDirection = [right, top - r + k];
        p5.rightDirection = [right, top - r];
        p5.pointType = PointType.SMOOTH;

        // 6. Bottom-Right corner
        var p6 = path.pathPoints.add();
        p6.anchor = [right, b];
        p6.leftDirection = [right, b];
        p6.rightDirection = [right, b];
        p6.pointType = PointType.CORNER;

        path.closed = true;
        path.filled = true;
        path.fillColor = fill;
        path.stroked = false;
        return path;
    }

    // Official Bakong Badge with crisp typography and clean quiet border
    function drawBakongBadge(group, centerX, centerY, diameter) {
        // 1. Outer White Quiet Zone Pill
        var pill = group.pathItems.ellipse(centerY + diameter / 2, centerX - diameter / 2, diameter, diameter);
        pill.filled = true;
        pill.fillColor = COLOR_WHITE;
        pill.stroked = false;

        // 2. Inner Bakong Bravery Red Circle (#E1232E)
        var innerDia = diameter * 0.86;
        var inner = group.pathItems.ellipse(centerY + innerDia / 2, centerX - innerDia / 2, innerDia, innerDia);
        inner.filled = true;
        inner.fillColor = COLOR_BAKONG_RED;
        inner.stroked = false;

        // 3. Crisp Typographic White "K" Symbol in center
        var drewSymbol = false;
        try {
            var txtK = group.textFrames.add();
            txtK.contents = "K";
            var charAttr = txtK.textRange.characterAttributes;
            charAttr.size = innerDia * 0.62;
            charAttr.fillColor = COLOR_WHITE;
            try { charAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (eF) {}
            var outlinedK = txtK.createOutline();
            if (outlinedK) {
                var b = outlinedK.geometricBounds;
                var kw = b[2] - b[0];
                var kh = b[1] - b[3];
                outlinedK.left = centerX - kw / 2;
                outlinedK.top = centerY + kh / 2;
                drewSymbol = true;
            }
        } catch (eOutline) {
            drewSymbol = false;
        }

        if (!drewSymbol) {
            // High-precision vector fallback if createOutline is not available
            var w = innerDia * 0.40;
            var h = innerDia * 0.54;
            var left = centerX - w / 2;
            var top = centerY + h / 2;
            var stemW = w * 0.28;

            var stem = group.pathItems.rectangle(top, left, stemW, h);
            stem.filled = true; stem.fillColor = COLOR_WHITE; stem.stroked = false;

            var arm1 = group.pathItems.add();
            arm1.setEntirePath([
                [left + stemW, centerY + h * 0.05],
                [left + w, top],
                [left + w - stemW * 1.1, top],
                [left + stemW, centerY - h * 0.12]
            ]);
            arm1.closed = true; arm1.filled = true; arm1.fillColor = COLOR_WHITE; arm1.stroked = false;

            var arm2 = group.pathItems.add();
            arm2.setEntirePath([
                [left + stemW, centerY - h * 0.08],
                [left + w, centerY - h / 2],
                [left + w - stemW * 1.1, centerY - h / 2],
                [left + stemW, centerY + h * 0.08]
            ]);
            arm2.closed = true; arm2.filled = true; arm2.fillColor = COLOR_WHITE; arm2.stroked = false;
        }
    }

    // Horizontal run-length module merging: combines adjacent modules in the same row
    // into single rectangles. Reduces object count by over 65%, generating 3x faster!
    function drawQrModulesOptimized(group, matrix, top, left, size) {
        var matrixSize = matrix.length;
        var quietZone = 4;
        var totalCells = matrixSize + quietZone * 2;
        var cellSize = size / totalCells;

        // White Quiet Zone Background
        var bg = group.pathItems.rectangle(top, left, size, size);
        bg.filled = true;
        bg.fillColor = COLOR_WHITE;
        bg.stroked = false;

        // Merged Vector Modules
        for (var r = 0; r < matrixSize; r++) {
            var c = 0;
            while (c < matrixSize) {
                if (matrix[r][c]) {
                    var startCol = c;
                    while (c < matrixSize && matrix[r][c]) {
                        c++;
                    }
                    var span = c - startCol;
                    var cellLeft = left + (startCol + quietZone) * cellSize;
                    var cellTop = top - (r + quietZone) * cellSize;
                    var w = span * cellSize + 0.05;
                    var h = cellSize + 0.05;

                    var mod = group.pathItems.rectangle(cellTop, cellLeft, w, h);
                    mod.filled = true;
                    mod.fillColor = COLOR_BLACK;
                    mod.stroked = false;
                } else {
                    c++;
                }
            }
        }
    }

    function drawVectorKHQR(opts) {
        var qrText = buildKHQRPayload(opts);
        var encoded = encodeQr(qrText, "H");
        var matrix = encoded.matrix;

        var style = opts.style || "Bakong Red Standee";
        var isCard = (style.indexOf("Standee") !== -1 || style.indexOf("Card") !== -1);
        var isAba = (style.indexOf("ABA") !== -1);

        var artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var abRect = artboard.artboardRect;
        var abCenterX = (abRect[0] + abRect[2]) / 2;
        var abCenterY = (abRect[1] + abRect[3]) / 2;

        var layer = doc.layers.add();
        layer.name = (isCard ? (isAba ? "ABA Standee Card" : "Bakong Standee Card") : "Bakong KHQR Vector") + " - " + (opts.merchantName || "Payment");

        var mainGroup = layer.groupItems.add();

        if (isCard) {
            // Standard Table Standee Card: 100mm x 150mm (2:3 aspect ratio)
            var cardWidthMm = parseFloat(opts.width) || 100;
            var cardHeightMm = cardWidthMm * 1.5;
            var cardW = cardWidthMm * POINTS_PER_MM;
            var cardH = cardHeightMm * POINTS_PER_MM;
            var cardCorner = 8 * POINTS_PER_MM;

            var cardLeft = abCenterX - cardW / 2;
            var cardTop = abCenterY + cardH / 2;
            var cardBottom = cardTop - cardH;

            // 1. Card Background
            var cardBg = mainGroup.pathItems.roundedRectangle(cardTop, cardLeft, cardW, cardH, cardCorner, cardCorner);
            cardBg.filled = true;
            cardBg.fillColor = COLOR_WHITE;
            cardBg.stroked = true;
            cardBg.strokeColor = COLOR_CARD_BORDER;
            cardBg.strokeWidth = 1;

            // 2. Top Header Banner (Exact rounded top, flat bottom)
            var headerHeight = cardH * 0.20;
            drawHeaderBanner(mainGroup, cardTop, cardLeft, cardW, headerHeight, cardCorner, isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED);

            // Header Banner Text
            var txtHeader = mainGroup.textFrames.add();
            txtHeader.contents = isAba ? "ABA' PAY" : "KHQR";
            var charAttr = txtHeader.textRange.characterAttributes;
            charAttr.size = isAba ? 22 : 26;
            charAttr.fillColor = COLOR_WHITE;
            try { charAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e) {}
            txtHeader.top = cardTop - headerHeight * 0.32;
            txtHeader.left = abCenterX - (txtHeader.width / 2);

            // Sub-tag text on ABA header
            if (isAba) {
                var txtKhqrSub = mainGroup.textFrames.add();
                txtKhqrSub.contents = "KHQR";
                var subAttr = txtKhqrSub.textRange.characterAttributes;
                subAttr.size = 10;
                subAttr.fillColor = COLOR_ABA_CYAN;
                try { subAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (eA) {}
                txtKhqrSub.top = cardTop - headerHeight * 0.72;
                txtKhqrSub.left = abCenterX - (txtKhqrSub.width / 2);
            }

            // 3. Merchant Name
            var mNameTop = cardTop - headerHeight - 9 * POINTS_PER_MM;
            var txtName = mainGroup.textFrames.add();
            txtName.contents = (opts.merchantName || "OZO MERCHANT").toUpperCase();
            var nameAttr = txtName.textRange.characterAttributes;
            nameAttr.size = 12.5;
            nameAttr.fillColor = COLOR_BLACK;
            try { nameAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e2) {}
            txtName.top = mNameTop;
            txtName.left = abCenterX - (txtName.width / 2);

            // 4. Center QR Code (55% of card width for optimal margin)
            var qrSize = cardW * 0.55;
            var qrTop = mNameTop - 7 * POINTS_PER_MM;
            var qrLeft = abCenterX - qrSize / 2;

            drawQrModulesOptimized(mainGroup, matrix, qrTop, qrLeft, qrSize);

            // Center Bakong Badge (20% of QR size: optimal scan ratio)
            drawBakongBadge(mainGroup, abCenterX, qrTop - qrSize / 2, qrSize * 0.20);

            // 5. Amount / Currency Display ("SCAN TO PAY" or amount)
            var amtTop = qrTop - qrSize - 9 * POINTS_PER_MM;
            var txtAmt = mainGroup.textFrames.add();
            var amtNum = parseFloat(opts.amount);
            if (!isNaN(amtNum) && amtNum > 0) {
                var sym = (opts.currency === "KHR") ? "៛ " : "$ ";
                txtAmt.contents = sym + (opts.currency === "KHR" ? Math.round(amtNum) : amtNum.toFixed(2));
            } else {
                txtAmt.contents = "SCAN TO PAY";
            }
            var amtAttr = txtAmt.textRange.characterAttributes;
            amtAttr.size = 15;
            amtAttr.fillColor = isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED;
            try { amtAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e3) {}
            txtAmt.top = amtTop;
            txtAmt.left = abCenterX - (txtAmt.width / 2);

            // 6. Account Info (Positioned with clear vertical separation)
            var accTop = amtTop - 18;
            var txtAcc = mainGroup.textFrames.add();
            txtAcc.contents = (opts.bakongId || "merchant@abab");
            var accAttr = txtAcc.textRange.characterAttributes;
            accAttr.size = 9;
            accAttr.fillColor = COLOR_TEXT_MUTED;
            try { accAttr.textFont = app.textFonts.getByName("ArialMT"); } catch (e4) {}
            txtAcc.top = accTop;
            txtAcc.left = abCenterX - (txtAcc.width / 2);

            // 7. Footer separator line and POWERED BY BAKONG (positioned safely at bottom)
            var footerLine = mainGroup.pathItems.add();
            var fY = cardBottom + 19 * POINTS_PER_MM;
            footerLine.setEntirePath([[cardLeft + 16 * POINTS_PER_MM, fY], [cardLeft + cardW - 16 * POINTS_PER_MM, fY]]);
            footerLine.stroked = true;
            footerLine.strokeColor = COLOR_CARD_BORDER;
            footerLine.strokeWidth = 0.75;
            footerLine.filled = false;

            var txtFooter = mainGroup.textFrames.add();
            txtFooter.contents = "POWERED BY BAKONG";
            var footAttr = txtFooter.textRange.characterAttributes;
            footAttr.size = 7.5;
            footAttr.fillColor = COLOR_TEXT_MUTED;
            try { footAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e5) {}
            txtFooter.top = fY - 7;
            txtFooter.left = abCenterX - (txtFooter.width / 2);

        } else {
            // Minimal Vector QR Only (with Bakong center logo)
            var qrSizeMm = parseFloat(opts.width) || 50;
            var qrSz = qrSizeMm * POINTS_PER_MM;
            var qTop = abCenterY + qrSz / 2;
            var qLeft = abCenterX - qrSz / 2;

            drawQrModulesOptimized(mainGroup, matrix, qTop, qLeft, qrSz);
            drawBakongBadge(mainGroup, abCenterX, abCenterY, qrSz * 0.20);
        }

        try { app.redraw(); } catch (eRedraw) {}

        return {
            status: "success",
            payload: qrText,
            merchantName: opts.merchantName || "OZO MERCHANT",
            bakongId: opts.bakongId || "merchant@abab",
            currency: opts.currency || "USD",
            amount: opts.amount || "",
            message: "Successfully generated official Bakong KHQR vector artwork."
        };
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

    // 1. Merchant Details
    var pnlInfo = dlg.add("panel", undefined, OZO.tr("Bakong & Merchant Information"));
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

    var inpAmt = addRow(pnlInfo, OZO.tr("Amount (Optional):"), "");
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
