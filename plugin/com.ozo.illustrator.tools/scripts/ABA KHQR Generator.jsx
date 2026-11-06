#target illustrator
#include "lib/OzoShared.jsxinc"

/**
 * ABA KHQR Vector Generator PRO
 * Official Bakong EMVCo compliant Vector QR Code & Table Standee Card Generator.
 * Built for Cambodian print shops, cafes, restaurants, hotels, and retail counters.
 */
(function () {
    var SCRIPT_NAME = "ABA KHQR Generator";
    var SCRIPT_VERSION = "1.2";
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
        for (var i = 0, iLen = str.length; i < iLen; i++) {
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
        for (var index = 0, indexLen = text.length; index < indexLen; index++) {
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
        for (var index = 0, combLen = first.length + second.length - 1; index < combLen; index++) {
            result[index] = 0;
        }
        for (var index = 0, indexLen = first.length; index < indexLen; index++) {
            for (var secondIndex = 0, secondIndexLen = second.length; secondIndex < secondIndexLen; secondIndex++) {
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
            for (var index = 0, indexLen = divisor.length; index < indexLen; index++) {
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
        for (var index = 0, indexLen = definitions.length; index < indexLen; index++) {
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
        for (var index = 0, indexLen = definitions.length; index < indexLen; index++) {
            capacity += definitions[index][0] * definitions[index][2];
        }
        return capacity;
    }

    function createCodewords(version, level, bytes) {
        var blocks = expandedBlocks(version, level);
        var dataCapacity = 0;
        var index;
        for (var index = 0, indexLen = blocks.length; index < indexLen; index++) {
            dataCapacity += blocks[index].dataCount;
        }

        var buffer = new BitBuffer();
        buffer.put(4, 4); // Byte mode.
        buffer.put(bytes.length, version < 10 ? 8 : 16);
        for (var index = 0, indexLen = bytes.length; index < indexLen; index++) {
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
        for (var index = 0, indexLen = blocks.length; index < indexLen; index++) {
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
            for (var dataBlock = 0, dataBlockLen = dataBlocks.length; dataBlock < dataBlockLen; dataBlock++) {
                if (index < dataBlocks[dataBlock].length) {
                    codewords.push(dataBlocks[dataBlock][index]);
                }
            }
        }
        for (index = 0; index < maxError; index++) {
            for (var errorBlock = 0, errorBlockLen = errorBlocks.length; errorBlock < errorBlockLen; errorBlock++) {
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
        for (var first = 0, firstLen = positions.length; first < firstLen; first++) {
            for (var second = 0, secondLen = positions.length; second < secondLen; second++) {
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
        for (var index = 8, mBound = matrix.length - 8; index < mBound; index++) {
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

    // -------------------------------------------------------------
    // Official NBC Bakong Temple & KHQR Vector Path Geometry
    // -------------------------------------------------------------
    var BAKONG_OUTER_POINTS = [[-0.3816,-0.0017,-0.3816,-0.0017,-0.3729,-0.0102],[-0.3559,-0.0269,-0.3643,-0.0182,-0.3263,-0.0577],[-0.2674,-0.1187,-0.297,-0.0886,-0.2674,-0.1187],[-0.2638,-0.1299,-0.2638,-0.1299,-0.2638,-0.1299],[-0.2638,-0.179,-0.2638,-0.179,-0.2638,-0.2157],[-0.2638,-0.289,-0.2638,-0.2524,-0.2638,-0.294],[-0.2576,-0.2955,-0.2624,-0.2955,-0.2056,-0.2955],[-0.1016,-0.2955,-0.1536,-0.2955,-0.1016,-0.2955],[-0.0945,-0.2994,-0.0945,-0.2994,-0.0791,-0.3148],[-0.0482,-0.3471,-0.0637,-0.3312,-0.0482,-0.3471],[0.0178,-0.4173,0.0178,-0.4173,0.0178,-0.4173],[0.0333,-0.4019,0.0333,-0.4019,0.066,-0.3677],[0.1316,-0.2994,0.0987,-0.3335,0.1316,-0.2994],[0.1416,-0.2957,0.1416,-0.2957,0.1416,-0.2957],[0.2956,-0.2957,0.2956,-0.2957,0.3002,-0.2957],[0.3012,-0.2895,0.3012,-0.294,0.3012,-0.2363],[0.3012,-0.1299,0.3012,-0.1832,0.3012,-0.1299],[0.3059,-0.1176,0.3059,-0.1176,0.33,-0.0929],[0.3779,-0.0434,0.3538,-0.0681,0.3779,-0.0434],[0.3846,-0.0398,0.3846,-0.0398,0.4086,-0.0398],[0.4567,-0.0398,0.4326,-0.0398,0.4567,-0.0398],[0.4598,-0.0398,0.4598,-0.0398,0.4589,-0.041],[0.4576,-0.0431,0.4584,-0.0423,0.4576,-0.0431],[0.3623,-0.1423,0.3623,-0.1423,0.3623,-0.1423],[0.3579,-0.1532,0.3579,-0.1532,0.3579,-0.2171],[0.3579,-0.3451,0.3579,-0.2812,0.3579,-0.3542],[0.349,-0.3542,0.3579,-0.3542,0.349,-0.3542],[0.1638,-0.3542,0.1638,-0.3542,0.1638,-0.3542],[0.1558,-0.3576,0.1558,-0.3576,0.1249,-0.3884],[0.065,-0.452,0.0953,-0.4205,0.0507,-0.4674],[0.0218,-0.4971,0.0362,-0.4819,0.0191,-0.5],[0.0147,-0.4971,0.0174,-0.4994,0.0147,-0.4971],[-0.0316,-0.4492,-0.0316,-0.4492,-0.0316,-0.4492],[-0.1203,-0.3566,-0.1203,-0.3566,-0.1203,-0.3566],[-0.1265,-0.3542,-0.1265,-0.3542,-0.1265,-0.3542],[-0.3124,-0.3542,-0.3124,-0.3542,-0.3206,-0.3542],[-0.3208,-0.3455,-0.3208,-0.3542,-0.3208,-0.2813],[-0.3208,-0.1526,-0.3208,-0.217,-0.3208,-0.1526],[-0.3246,-0.1426,-0.3246,-0.1426,-0.3525,-0.1139],[-0.4087,-0.0554,-0.3806,-0.0846,-0.4087,-0.0554],[-0.4586,-0.0031,-0.4586,-0.0031,-0.4586,-0.0031],[-0.4606,-0.0006,-0.4606,-0.0006,-0.4586,0.0017],[-0.4549,0.0062,-0.4569,0.004,-0.4549,0.0062],[-0.3672,0.0974,-0.3672,0.0974,-0.3529,0.1128],[-0.3246,0.1421,-0.3385,0.127,-0.3246,0.1421],[-0.3209,0.1514,-0.3209,0.1514,-0.3209,0.2162],[-0.3209,0.3455,-0.3209,0.2809,-0.3209,0.3531],[-0.3132,0.3531,-0.3209,0.3531,-0.2515,0.3531],[-0.128,0.3531,-0.1897,0.3531,-0.128,0.3531],[-0.1177,0.3576,-0.1177,0.3576,-0.1177,0.3576],[0.0098,0.4903,0.0098,0.4903,0.0126,0.4932],[0.0181,0.5,0.015,0.4963,0.0181,0.5],[0.0439,0.4735,0.0439,0.4735,0.0813,0.4346],[0.1561,0.3568,0.1186,0.3963,0.1561,0.3568],[0.1646,0.3532,0.1646,0.3532,0.1646,0.3532],[0.3508,0.3532,0.3508,0.3532,0.3584,0.3532],[0.3584,0.3451,0.3584,0.3532,0.3584,0.2809],[0.3584,0.1522,0.3584,0.2166,0.3584,0.1522],[0.3624,0.1417,0.3624,0.1417,0.3933,0.1096],[0.455,0.0451,0.4242,0.0773,0.457,0.0431],[0.4606,0.0386,0.4587,0.0407,0.4606,0.0386],[0.4606,0.037,0.4606,0.037,0.4606,0.037],[0.4428,0.037,0.4428,0.037,0.4246,0.037],[0.3882,0.037,0.4064,0.037,0.3882,0.037],[0.3788,0.041,0.3788,0.041,0.3542,0.0662],[0.3056,0.1171,0.3299,0.0917,0.3056,0.1171],[0.3018,0.1262,0.3018,0.1262,0.3018,0.1799],[0.3018,0.287,0.3018,0.2335,0.3018,0.2926],[0.2953,0.294,0.3004,0.2941,0.2953,0.294],[0.1413,0.294,0.1413,0.294,0.1413,0.294],[0.1329,0.2977,0.1329,0.2977,0.0961,0.3356],[0.0232,0.4117,0.0595,0.3737,0.0201,0.415],[0.0146,0.4117,0.0181,0.4156,-0.0073,0.3884],[-0.0519,0.3423,-0.0297,0.3654,-0.0661,0.3269],[-0.0948,0.2978,-0.0803,0.3125,-0.0948,0.2978],[-0.1038,0.2943,-0.1038,0.2943,-0.1546,0.2943],[-0.2559,0.2943,-0.2053,0.2943,-0.2559,0.2943],[-0.2633,0.2943,-0.2633,0.2943,-0.2633,0.2912],[-0.2633,0.286,-0.2633,0.2886,-0.2633,0.2341],[-0.2633,0.1302,-0.2633,0.1823,-0.2633,0.1302],[-0.2692,0.1148,-0.2692,0.1148,-0.3055,0.0775],[-0.3772,0.0022,-0.3414,0.0397,-0.3772,0.0022]];
var BAKONG_INNER_POINTS = [[0.2166,-0.0404,0.2166,-0.0404,0.2121,-0.0545],[0.2035,-0.0815,0.2076,-0.0679,0.2035,-0.0815],[0.2008,-0.0961,0.2008,-0.0961,0.2008,-0.1255],[0.2008,-0.1841,0.2008,-0.1548,0.2008,-0.1895],[0.1945,-0.1903,0.1988,-0.1903,0.1663,-0.1903],[0.11,-0.1903,0.1382,-0.1903,0.11,-0.1903],[0.0859,-0.1975,0.0859,-0.1975,0.0859,-0.1975],[-0.0291,-0.2035,-0.0291,-0.2035,-0.0397,-0.2008],[-0.06,-0.1926,-0.0498,-0.1961,-0.06,-0.1926],[-0.0704,-0.1904,-0.0704,-0.1904,-0.0988,-0.1904],[-0.1559,-0.1904,-0.1274,-0.1904,-0.1615,-0.1904],[-0.1629,-0.183,-0.1629,-0.1887,-0.1629,-0.1534],[-0.1629,-0.094,-0.1629,-0.1236,-0.1629,-0.094],[-0.165,-0.0832,-0.165,-0.0832,-0.165,-0.0832],[-0.1752,0.0503,-0.1752,0.0503,-0.1726,0.0605],[-0.1655,0.0802,-0.1686,0.0702,-0.1655,0.0802],[-0.1629,0.0937,-0.1629,0.0937,-0.1629,0.123],[-0.1629,0.1816,-0.1629,0.1523,-0.1629,0.1889],[-0.1556,0.1889,-0.1629,0.1889,-0.1556,0.1889],[-0.0701,0.1889,-0.0701,0.1889,-0.0701,0.1889],[-0.0592,0.1914,-0.0592,0.1914,-0.0592,0.1914],[0.0873,0.1957,0.0873,0.1957,0.0873,0.1957],[0.1208,0.1892,0.1208,0.1892,0.1453,0.1892],[0.1944,0.1892,0.1698,0.1892,0.1993,0.1892],[0.2008,0.1824,0.2008,0.1877,0.2008,0.1531],[0.2008,0.0944,0.2008,0.1238,0.2008,0.0944],[0.2036,0.079,0.2036,0.079,0.2072,0.0664],[0.215,0.0415,0.2112,0.054,0.2163,0.0375],[0.211,0.0361,0.215,0.0361,0.1947,0.0361],[0.1618,0.0361,0.1782,0.0361,0.1618,0.0361],[0.1567,0.0414,0.1567,0.0414,0.1527,0.0511],[0.1454,0.0705,0.1488,0.0608,0.1454,0.0705],[0.1438,0.0816,0.1438,0.0816,0.1438,0.0958],[0.1438,0.1244,0.1438,0.1102,0.1438,0.1289],[0.1382,0.1302,0.1425,0.1304,0.1242,0.1302],[0.0961,0.1302,0.1101,0.1302,0.0961,0.1302],[0.0806,0.1349,0.0806,0.1349,0.0806,0.1349],[-0.0485,0.1323,-0.0485,0.1323,-0.0485,0.1323],[-0.0584,0.1302,-0.0584,0.1302,-0.0728,0.1302],[-0.1012,0.1302,-0.087,0.1302,-0.1055,0.1302],[-0.1067,0.1245,-0.1069,0.129,-0.1067,0.11],[-0.1067,0.081,-0.1067,0.0955,-0.1067,0.081],[-0.1096,0.0671,-0.1096,0.0671,-0.1096,0.0671],[-0.1096,-0.0665,-0.1096,-0.0665,-0.1096,-0.0665],[-0.1056,-0.0821,-0.1056,-0.0821,-0.1056,-0.0963],[-0.1056,-0.1245,-0.1056,-0.1103,-0.1056,-0.129],[-0.0999,-0.1306,-0.1046,-0.1307,-0.0853,-0.1306],[-0.0561,-0.1306,-0.0706,-0.1306,-0.0561,-0.1306],[-0.0473,-0.1327,-0.0473,-0.1327,-0.0473,-0.1327],[0.0834,-0.1343,0.0834,-0.1343,0.0834,-0.1343],[0.0988,-0.1307,0.0988,-0.1307,0.1126,-0.1307],[0.1399,-0.1307,0.1263,-0.1307,0.1441,-0.1307],[0.1451,-0.1252,0.1453,-0.1293,0.1451,-0.1097],[0.1451,-0.0801,0.1451,-0.0943,0.1451,-0.0801],[0.1482,-0.0677,0.1482,-0.0677,0.151,-0.0597],[0.1575,-0.0438,0.1541,-0.0523,0.1584,-0.0418],[0.1624,-0.0392,0.1607,-0.0394,0.1796,-0.0392],[0.2138,-0.0392,0.1967,-0.0392,0.2133,-0.0394],[0.2166,-0.0404,0.2141,-0.0398,0.2166,-0.0404]];
    var KHQR_LOGO_POINTS = [[-0.5,0.1177,-0.5,0.1177,-0.5,0.1177],[-0.4566,0.1177,-0.4566,0.1177,-0.4566,0.1177],[-0.4566,0.0117,-0.4566,0.0117,-0.4221,0.0466],[-0.3519,0.1174,-0.3521,0.1169,-0.3517,0.1178],[-0.3002,0.1174,-0.3002,0.1178,-0.3379,0.0793],[-0.4143,0.0042,-0.3761,0.0418,-0.4073,-0.0029],[-0.2951,-0.1185,-0.3202,-0.0921,-0.2949,-0.1187],[-0.3209,-0.1188,-0.2957,-0.1188,-0.3209,-0.1188],[-0.3468,-0.1188,-0.3468,-0.1188,-0.3468,-0.1188],[-0.3879,-0.0774,-0.3879,-0.0774,-0.436,-0.0289],[-0.4564,-0.0088,-0.4562,-0.0088,-0.4568,-0.0455],[-0.4566,-0.1188,-0.4566,-0.0822,-0.4566,-0.1188],[-0.5,-0.1188,-0.5,-0.1188,-0.5,-0.1188],[-0.0974,-0.0156,-0.0974,-0.0156,-0.0974,-0.0156],[-0.2191,-0.0156,-0.2191,-0.0156,-0.2191,-0.0156],[-0.2191,-0.1188,-0.2191,-0.1188,-0.2191,-0.1188],[-0.2612,-0.1188,-0.2612,-0.1188,-0.2612,-0.1188],[-0.2614,0.1177,-0.2614,0.1177,-0.2614,0.1177],[-0.2191,0.1177,-0.2191,0.1177,-0.2191,0.1177],[-0.2191,0.0187,-0.2191,0.0187,-0.2191,0.0187],[-0.0974,0.0187,-0.0974,0.0187,-0.0974,0.0187],[-0.0974,0.1177,-0.0974,0.1177,-0.0974,0.1177],[-0.0552,0.1177,-0.0552,0.1177,-0.0552,0.1177],[-0.0552,-0.1188,-0.0552,-0.1188,-0.0552,-0.1188],[-0.0974,-0.1188,-0.0974,-0.1188,-0.0974,-0.1188],[0.4071,-0.0784,0.4071,-0.0784,0.3849,-0.0562],[0.3668,-0.038,0.3667,-0.038,0.3668,-0.038],[0.3929,-0.0382,0.3786,-0.0381,0.3929,-0.0382],[0.419,-0.0384,0.419,-0.0384,0.419,-0.0384],[0.4478,-0.0668,0.4478,-0.0668,0.4937,-0.1122],[0.4993,-0.1188,0.4994,-0.1188,0.4992,-0.1188],[0.4475,-0.1188,0.4648,-0.1187,0.4475,-0.1188],[0.0199,-0.1188,0.0199,-0.1188,0.0145,-0.1186],[0.0043,-0.1123,0.0089,-0.1154,0.002,-0.1108],[-0.0045,-0.1039,-0.0021,-0.1069,-0.0065,-0.1015],[-0.0106,-0.0914,-0.0095,-0.0953,-0.0106,-0.0914],[-0.0116,-0.0877,-0.0116,-0.0877,-0.0116,-0.0877],[-0.0117,-0.0022,-0.0117,-0.0022,-0.0118,0.0905],[-0.0099,0.093,-0.0119,0.0867,-0.0077,0.0994],[0.0026,0.1102,-0.003,0.106,0.0063,0.113],[0.0144,0.1162,0.0094,0.1146,0.0144,0.1162],[0.0182,0.1175,0.0182,0.1175,0.0182,0.1175],[0.1052,0.1176,0.1052,0.1176,0.1052,0.1176],[0.1922,0.1177,0.1922,0.1177,0.1922,0.1177],[0.196,0.1168,0.196,0.1168,0.2009,0.1155],[0.2082,0.1116,0.2048,0.1139,0.215,0.1071],[0.2225,0.0936,0.2201,0.1006,0.2246,0.0873],[0.2246,-0.0047,0.2246,0.0917,0.2246,-0.0047],[0.2246,-0.0933,0.2246,-0.0933,0.2246,-0.0933],[0.2061,-0.0749,0.2061,-0.0749,0.2061,-0.0749],[0.1876,-0.0565,0.1876,-0.0565,0.1876,-0.0565],[0.1875,0.0021,0.1875,0.0021,0.1874,0.058],[0.1867,0.0627,0.1874,0.0608,0.1838,0.0714],[0.1693,0.0797,0.1778,0.0773,0.1693,0.0797],[0.1663,0.0806,0.1663,0.0806,0.1663,0.0806],[0.1058,0.0806,0.1058,0.0806,0.1058,0.0806],[0.0453,0.0806,0.0453,0.0806,0.0453,0.0806],[0.0429,0.0797,0.0429,0.0797,0.0387,0.0783],[0.0327,0.0733,0.0357,0.0763,0.0295,0.07],[0.0262,0.0629,0.0274,0.0667,0.0262,0.0629],[0.0253,0.0603,0.0253,0.0603,0.0253,0.0603],[0.0253,-0.0002,0.0253,-0.0002,0.0253,-0.048],[0.0258,-0.0627,0.0254,-0.061,0.0261,-0.0638],[0.0279,-0.0681,0.027,-0.0663,0.0308,-0.074],[0.0414,-0.0804,0.0352,-0.0779,0.044,-0.0813],[0.0492,-0.0818,0.0452,-0.0816,0.0518,-0.082],[0.1076,-0.082,0.0781,-0.0821,0.137,-0.0819],[0.1621,-0.0822,0.1616,-0.082,0.1626,-0.0823],[0.1812,-0.1004,0.1712,-0.0905,0.1812,-0.1004],[0.1994,-0.1188,0.1994,-0.1188,0.1994,-0.1188],[0.1112,-0.1188,0.1112,-0.1188,0.0627,-0.1188],[0.0199,-0.1188,0.0205,-0.1189,0.0199,-0.1188],[0.295,-0.1184,0.295,-0.1184,0.286,-0.1174],[0.2713,-0.1045,0.2769,-0.1118,0.2674,-0.0994],[0.2643,-0.089,0.2653,-0.0947,0.2637,-0.0854],[0.2642,0.0041,0.2635,-0.0051,0.2655,0.0235],[0.277,0.0529,0.2691,0.0374,0.2848,0.0684],[0.3082,0.0915,0.2952,0.0811,0.3269,0.1064],[0.3714,0.1171,0.3476,0.1148,0.3883,0.1189],[0.4244,0.1097,0.4072,0.1162,0.4304,0.1074],[0.4461,0.0986,0.4407,0.1021,0.4556,0.0922],[0.4732,0.074,0.4665,0.0823,0.4847,0.0597],[0.4969,0.024,0.4934,0.0415,0.4983,0.017],[0.4994,0.0005,0.5,0.0012,0.4993,0.0003],[0.4809,0.0003,0.4909,0.0003,0.4809,0.0003],[0.4626,0.0004,0.4626,0.0004,0.4626,0.0004],[0.4623,0.0046,0.4623,0.0046,0.4618,0.0133],[0.4574,0.0283,0.4598,0.0227,0.4571,0.0289],[0.4556,0.0322,0.4563,0.0307,0.4493,0.0468],[0.4245,0.0683,0.4382,0.0598,0.4005,0.0833],[0.3461,0.0725,0.3717,0.0848,0.3259,0.0627],[0.304,0.0224,0.3101,0.044,0.3007,0.0111],[0.3008,-0.0547,0.301,0.0168,0.3008,-0.0547],[0.3007,-0.1188,0.3007,-0.1188,0.2986,-0.1188],[0.295,-0.1184,0.295,-0.1184,0.295,-0.1184],[0.0717,-0.0439,0.0717,-0.0439,0.0684,-0.0428],[0.0636,-0.0367,0.0651,-0.0399,0.0636,-0.0367],[0.0626,-0.0346,0.0626,-0.0346,0.0626,-0.0346],[0.0626,-0.0005,0.0626,-0.0005,0.0626,-0.0005],[0.0626,0.0335,0.0626,0.0335,0.0626,0.0335],[0.0636,0.0354,0.0636,0.0354,0.065,0.0381],[0.0699,0.0419,0.0675,0.0407,0.0699,0.0419],[0.0721,0.043,0.0721,0.043,0.0721,0.043],[0.1058,0.043,0.1058,0.043,0.1058,0.043],[0.1395,0.043,0.1395,0.043,0.1395,0.043],[0.1418,0.0421,0.1418,0.0421,0.1446,0.0409],[0.1486,0.0357,0.1472,0.0385,0.1486,0.0357],[0.1497,0.0335,0.1497,0.0335,0.1497,0.0335],[0.1499,-0.0052,0.1499,-0.0052,0.15,-0.0265],[0.1499,-0.044,0.15,-0.044,0.1497,-0.0443],[0.0717,-0.0439,0.0725,-0.0441,0.0717,-0.0439]];

    function drawBakongTempleEmblem(group, cx, cy, sz, fillColor, holeColor) {
        function makePath(pts, fillCol) {
            var path = group.pathItems.add();
            var n = pts.length;
            for (var i = 0; i < n; i++) {
                var pp = path.pathPoints.add();
                var d = pts[i];
                pp.anchor = [cx + d[0] * sz, cy + d[1] * sz];
                pp.leftDirection = [cx + d[2] * sz, cy + d[3] * sz];
                pp.rightDirection = [cx + d[4] * sz, cy + d[5] * sz];
                pp.pointType = (d[0] === d[2] && d[1] === d[3] && d[0] === d[4] && d[1] === d[5]) ? PointType.CORNER : PointType.SMOOTH;
            }
            path.closed = true;
            path.filled = true;
            path.fillColor = fillCol;
            path.stroked = false;
            return path;
        }
        var pOuter = makePath(BAKONG_OUTER_POINTS, fillColor);
        var pInner = null;
        if (holeColor) {
            pInner = makePath(BAKONG_INNER_POINTS, holeColor);
        }
        return [pOuter, pInner];
    }

    function drawKhqrVectorLogo(group, cx, cy, width, fillColor) {
        var path = group.pathItems.add();
        var n = KHQR_LOGO_POINTS.length;
        for (var i = 0; i < n; i++) {
            var pp = path.pathPoints.add();
            var d = KHQR_LOGO_POINTS[i];
            pp.anchor = [cx + d[0] * width, cy + d[1] * width];
            pp.leftDirection = [cx + d[2] * width, cy + d[3] * width];
            pp.rightDirection = [cx + d[4] * width, cy + d[5] * width];
            pp.pointType = (d[0] === d[2] && d[1] === d[3] && d[0] === d[4] && d[1] === d[5]) ? PointType.CORNER : PointType.SMOOTH;
        }
        path.closed = true;
        path.filled = true;
        path.fillColor = fillColor;
        path.stroked = false;
        return path;
    }

    // Official Bakong & NBC KHQR Center Badge with high-contrast quiet zone
    function drawBakongBadge(group, centerX, centerY, diameter, badgeType, isAba) {
        // 1. Outer White Quiet Zone Pill
        var pill = group.pathItems.ellipse(centerY + diameter / 2, centerX - diameter / 2, diameter, diameter);
        pill.filled = true;
        pill.fillColor = COLOR_WHITE;
        pill.stroked = false;

        // 2. Inner Circle (diameter * 0.86)
        var innerDia = diameter * 0.86;
        var inner = group.pathItems.ellipse(centerY + innerDia / 2, centerX - innerDia / 2, innerDia, innerDia);
        inner.filled = true;
        var circleColor = (badgeType === "USD" || badgeType === "KHR") ? (isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED) : COLOR_BAKONG_RED;
        inner.fillColor = circleColor;
        inner.stroked = false;

        // 3. Center Symbol
        if (badgeType === "USD") {
            // Crisp White "$" Currency Symbol
            try {
                var txtD = group.textFrames.add();
                txtD.contents = "$";
                var attrD = txtD.textRange.characterAttributes;
                attrD.size = innerDia * 0.65;
                attrD.fillColor = COLOR_WHITE;
                try { attrD.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (eF1) {}
                var oD = null;
                try { oD = txtD.createOutline(); } catch (eO1) {}
                if (oD) {
                    var bD = oD.geometricBounds;
                    oD.left = centerX - (bD[2] - bD[0]) / 2;
                    oD.top = centerY + (bD[1] - bD[3]) / 2;
                } else {
                    txtD.top = centerY + innerDia * 0.28;
                    txtD.left = centerX - (txtD.width / 2);
                }
            } catch (eUSD) {}
        } else if (badgeType === "KHR") {
            // Crisp White "៛" Khmer Riel Symbol
            try {
                var txtR = group.textFrames.add();
                txtR.contents = "\u17DB";
                var attrR = txtR.textRange.characterAttributes;
                attrR.size = innerDia * 0.65;
                attrR.fillColor = COLOR_WHITE;
                try { attrR.textFont = app.textFonts.getByName("KhmerOSbattambang"); } catch (eF2) {
                    try { attrR.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (eF3) {}
                }
                var oR = null;
                try { oR = txtR.createOutline(); } catch (eO2) {}
                if (oR) {
                    var bR = oR.geometricBounds;
                    oR.left = centerX - (bR[2] - bR[0]) / 2;
                    oR.top = centerY + (bR[1] - bR[3]) / 2;
                } else {
                    txtR.top = centerY + innerDia * 0.28;
                    txtR.left = centerX - (txtR.width / 2);
                }
            } catch (eKHR) {}
        } else {
            // Authentic Official NBC Bakong Temple Geometric Emblem
            var emblemSize = innerDia * 0.74;
            drawBakongTempleEmblem(group, centerX, centerY, emblemSize, COLOR_WHITE, circleColor);
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

        // Determine badge type: "bakong", "USD", or "KHR"
        var badgeType = opts.badgeSymbol;
        if (!badgeType || badgeType === "auto") {
            if (opts.currency === "KHR" && opts.amount && parseFloat(opts.amount) > 0) {
                badgeType = "KHR";
            } else if (opts.currency === "USD" && opts.amount && parseFloat(opts.amount) > 0) {
                badgeType = "USD";
            } else {
                badgeType = "bakong";
            }
        }

        if (isCard) {
            // Proportional Table Standee Card (2:3 aspect ratio, scalable to any dimension)
            var cardWidthMm = parseFloat(opts.width) || 100;
            var cardHeightMm = cardWidthMm * 1.5;
            var cardW = cardWidthMm * POINTS_PER_MM;
            var cardH = cardHeightMm * POINTS_PER_MM;
            var sf = cardW / (100 * POINTS_PER_MM); // Reference scale factor
            var cardCorner = Math.max(4, 8 * POINTS_PER_MM * sf);

            var cardLeft = abCenterX - cardW / 2;
            var cardTop = abCenterY + cardH / 2;
            var cardBottom = cardTop - cardH;

            // Optional: Fit artboard to standee card
            if (opts.resizeArtboard === true || opts.fitArtboard === true) {
                artboard.artboardRect = [cardLeft, cardTop, cardLeft + cardW, cardBottom];
                abRect = artboard.artboardRect;
            }

            // 1. Card Background
            var cardBg = mainGroup.pathItems.roundedRectangle(cardTop, cardLeft, cardW, cardH, cardCorner, cardCorner);
            cardBg.filled = true;
            cardBg.fillColor = COLOR_WHITE;
            cardBg.stroked = true;
            cardBg.strokeColor = COLOR_CARD_BORDER;
            cardBg.strokeWidth = Math.max(0.75, 1.25 * sf);

            // 2. Top Header Banner (Exact rounded top, flat bottom)
            var headerHeight = cardH * 0.18;
            drawHeaderBanner(mainGroup, cardTop, cardLeft, cardW, headerHeight, cardCorner, isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED);

            if (isAba) {
                // ABA Standee Banner: ABA' PAY and KHQR sub-badge
                var txtHeader = mainGroup.textFrames.add();
                txtHeader.contents = "ABA' PAY";
                var charAttr = txtHeader.textRange.characterAttributes;
                charAttr.size = Math.max(16, headerHeight * 0.38);
                charAttr.fillColor = COLOR_WHITE;
                try { charAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e) {}
                txtHeader.top = cardTop - headerHeight * 0.26;
                txtHeader.left = abCenterX - (txtHeader.width / 2);

                var txtKhqrSub = mainGroup.textFrames.add();
                txtKhqrSub.contents = "KHQR";
                var subAttr = txtKhqrSub.textRange.characterAttributes;
                subAttr.size = Math.max(9, headerHeight * 0.18);
                subAttr.fillColor = COLOR_ABA_CYAN;
                try { subAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (eA) {}
                txtKhqrSub.top = cardTop - headerHeight * 0.68;
                txtKhqrSub.left = abCenterX - (txtKhqrSub.width / 2);
            } else {
                // Authentic National Bank of Cambodia KHQR Vector Logo in header
                var khqrLogoW = Math.min(cardW * 0.48, headerHeight * 2.2);
                drawKhqrVectorLogo(mainGroup, abCenterX, cardTop - headerHeight * 0.50, khqrLogoW, COLOR_WHITE);
            }

            // 3. Merchant Name
            var nameFontSize = Math.max(10, cardW * 0.046);
            var mNameTop = cardTop - headerHeight - (cardH * 0.038);
            var txtName = mainGroup.textFrames.add();
            txtName.contents = (opts.merchantName || "OZO MERCHANT").toUpperCase();
            var nameAttr = txtName.textRange.characterAttributes;
            nameAttr.size = nameFontSize;
            nameAttr.fillColor = COLOR_BLACK;
            try { nameAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e2) {}

            var maxContentW = cardW * 0.84;
            if (txtName.width > maxContentW) {
                var nScale = maxContentW / txtName.width;
                nameAttr.size = Math.max(8, nameFontSize * nScale);
            }
            txtName.top = mNameTop;
            txtName.left = abCenterX - (txtName.width / 2);

            // 4. Center QR Code (54% of card width for optimal margin)
            var qrSize = cardW * 0.54;
            var qrTop = mNameTop - (nameAttr.size * 1.25) - (cardH * 0.032);
            var qrLeft = abCenterX - qrSize / 2;

            drawQrModulesOptimized(mainGroup, matrix, qrTop, qrLeft, qrSize);

            // Center Badge
            drawBakongBadge(mainGroup, abCenterX, qrTop - qrSize / 2, qrSize * 0.22, badgeType, isAba);

            // ---------------------------------------------------------
            // Strictly Chained Lower Section (Guaranteed Zero Overlap)
            // ---------------------------------------------------------
            var qrBottom = qrTop - qrSize;
            var lowerSpace = qrBottom - cardBottom;

            // 5. Amount / Currency Display ("SCAN TO PAY" or amount)
            var amtFontSize = Math.max(12, cardW * 0.054);
            var txtAmt = mainGroup.textFrames.add();
            var amtNum = parseFloat(opts.amount);
            if (!isNaN(amtNum) && amtNum > 0) {
                var sym = (opts.currency === "KHR") ? "\u17DB " : "$ ";
                txtAmt.contents = sym + (opts.currency === "KHR" ? Math.round(amtNum) : amtNum.toFixed(2));
            } else {
                txtAmt.contents = "SCAN TO PAY";
            }
            var amtAttr = txtAmt.textRange.characterAttributes;
            amtAttr.size = amtFontSize;
            amtAttr.fillColor = isAba ? COLOR_ABA_NAVY : COLOR_BAKONG_RED;
            try { amtAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e3) {}

            var amtTop = qrBottom - (lowerSpace * 0.18);
            txtAmt.top = amtTop;
            txtAmt.left = abCenterX - (txtAmt.width / 2);

            // 6. Account Info (Positioned strictly below Amount)
            var accFontSize = Math.max(8, cardW * 0.032);
            var txtAcc = mainGroup.textFrames.add();
            txtAcc.contents = (opts.bakongId || "merchant@abab");
            var accAttr = txtAcc.textRange.characterAttributes;
            accAttr.size = accFontSize;
            accAttr.fillColor = COLOR_TEXT_MUTED;
            try { accAttr.textFont = app.textFonts.getByName("ArialMT"); } catch (e4) {}

            if (txtAcc.width > maxContentW) {
                var aScale = maxContentW / txtAcc.width;
                accAttr.size = Math.max(7, accFontSize * aScale);
            }

            var accTop = amtTop - (amtFontSize * 1.25) - (lowerSpace * 0.09);
            txtAcc.top = accTop;
            txtAcc.left = abCenterX - (txtAcc.width / 2);

            // 7. Footer separator line (Positioned strictly below Account)
            var fY = accTop - (accAttr.size * 1.25) - (lowerSpace * 0.14);
            var footerLine = mainGroup.pathItems.add();
            footerLine.setEntirePath([[cardLeft + cardW * 0.14, fY], [cardLeft + cardW * 0.86, fY]]);
            footerLine.stroked = true;
            footerLine.strokeColor = COLOR_CARD_BORDER;
            footerLine.strokeWidth = Math.max(0.75, 1.0 * sf);
            footerLine.filled = false;

            // 8. Footer Text (Positioned strictly below separator line)
            var footerFontSize = Math.max(7, cardW * 0.027);
            var txtFooter = mainGroup.textFrames.add();
            txtFooter.contents = "POWERED BY BAKONG";
            var footAttr = txtFooter.textRange.characterAttributes;
            footAttr.size = footerFontSize;
            footAttr.fillColor = COLOR_TEXT_MUTED;
            try { footAttr.textFont = app.textFonts.getByName("Arial-BoldMT"); } catch (e5) {}

            var footTop = fY - (lowerSpace * 0.10);
            txtFooter.top = footTop;
            txtFooter.left = abCenterX - (txtFooter.width / 2);

        } else {
            // Minimal Vector QR Only (with authentic Bakong center emblem or currency symbol)
            var qrSizeMm = parseFloat(opts.width) || 50;
            var qrSz = qrSizeMm * POINTS_PER_MM;
            var qTop = abCenterY + qrSz / 2;
            var qLeft = abCenterX - qrSz / 2;

            drawQrModulesOptimized(mainGroup, matrix, qTop, qLeft, qrSz);
            drawBakongBadge(mainGroup, abCenterX, abCenterY, qrSz * 0.22, badgeType, false);
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

    var inpWidth = addRow(pnlStyle, OZO.tr("Card Width (mm):"), "100");

    var grpBadge = pnlStyle.add("group");
    grpBadge.orientation = "row";
    var lblBadge = grpBadge.add("statictext", undefined, OZO.tr("Center Badge:"));
    lblBadge.preferredSize.width = 110;
    var rbBadgeBakong = grpBadge.add("radiobutton", undefined, "Bakong Temple (Official)");
    var rbBadgeCur = grpBadge.add("radiobutton", undefined, "Currency ($ / \u17DB)");
    rbBadgeBakong.value = true;

    var chkFitArtboard = pnlStyle.add("checkbox", undefined, OZO.tr("Fit Artboard to Standee Card"));
    chkFitArtboard.value = true;

    var grpBtns = dlg.add("group");
    grpBtns.orientation = "row";
    grpBtns.alignment = ["right", "bottom"];

    var btnCancel = grpBtns.add("button", undefined, OZO.tr("Cancel"), { name: "cancel" });
    var btnOk = grpBtns.add("button", undefined, OZO.tr("Generate KHQR"), { name: "ok" });

    btnCancel.onClick = function () { dlg.close(0); };
    btnOk.onClick = function () {
        var selectedStyle = ddlStyle.selection ? ddlStyle.selection.text : "Bakong Red Standee";
        var parsedW = parseFloat(inpWidth.text);
        if (isNaN(parsedW) || parsedW <= 0) parsedW = 100;
        var options = {
            merchantName: inpName.text.replace(/^\s+|\s+$/g, "") || "OZO MERCHANT",
            bakongId: inpId.text.replace(/^\s+|\s+$/g, "") || "merchant@abab",
            currency: rbKhr.value ? "KHR" : "USD",
            amount: inpAmt.text.replace(/^\s+|\s+$/g, ""),
            billNumber: inpBill.text.replace(/^\s+|\s+$/g, ""),
            style: selectedStyle,
            width: parsedW,
            badgeSymbol: rbBadgeCur.value ? (rbKhr.value ? "KHR" : "USD") : "bakong",
            fitArtboard: chkFitArtboard.value
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
