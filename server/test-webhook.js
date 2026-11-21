/**
 * KHQRPay Webhook & Payment Test Suite
 * Tests all 11 required webhook scenarios + payment creation & idempotency validation.
 *
 * Scenarios:
 *  1. Valid signature -> 200, fulfilled
 *  2. Tampered body (change 1 character) -> 400 rejected
 *  3. Missing signature header -> 400 rejected
 *  4. Malformed signature header -> 400 rejected
 *  5. Unset or empty signing secret -> 400 rejected
 *  6. Old timestamp (> 5 min ago) -> 400 rejected
 *  7. Timestamp > 5 min in future -> 400 rejected
 *  8. Duplicate event ID -> 200, fulfilled only once
 *  9. Test event in production (livemode: false or test: true) -> 200, NOT fulfilled
 * 10. Late payment.completed (late: true) after payment.expired -> order fulfilled
 * 11. payment.expired after payment.completed -> order remains paid
 */

const crypto = require("crypto");
const {
    verifyWebhookSignature,
    createWebhookHandler,
    PaymentMemoryStore,
    createPayment,
    WebhookVerificationError
} = require("./khqrpay");

const TEST_SECRET = "whsec_test_secret_key_1234567890abcdef";

/**
 * Helper to generate valid X-KHQRPay-Signature header
 */
function generateSignatureHeader(rawBody, secret, timestamp) {
    var ts = typeof timestamp === "number" ? timestamp : Math.floor(Date.now() / 1000);
    var payload = ts + "." + rawBody;
    var sig = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return "t=" + ts + ",v1=" + sig;
}

/**
 * Mock HTTP request & response
 */
function createMockHttp(rawBody, headers) {
    var req = {
        rawBody: rawBody,
        headers: headers || {}
    };

    var res = {
        statusCode: 200,
        headers: {},
        body: "",
        writeHead: function (code, hdrs) {
            this.statusCode = code;
            if (hdrs) Object.assign(this.headers, hdrs);
        },
        end: function (data) {
            this.body = data || "";
        }
    };

    return { req: req, res: res };
}

// Simple test harness
var testsPassed = 0;
var testsFailed = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error("Assertion failed: " + message);
    }
}

async function runTest(name, fn) {
    try {
        await fn();
        console.log("  [PASS] " + name);
        testsPassed++;
    } catch (err) {
        console.error("  [FAIL] " + name);
        console.error("         Error: " + err.message);
        testsFailed++;
    }
}

async function runAllTests() {
    console.log("==================================================");
    console.log("Running KHQRPay Webhook Test Suite (11 Scenarios)");
    console.log("==================================================\n");

    // Scenario 1: Valid signature
    await runTest("1. Valid signature -> accepted & verified", async function () {
        var rawBody = JSON.stringify({
            id: "evt_test_valid_001",
            type: "payment.completed",
            livemode: true,
            data: {
                payment: {
                    id: "pay_001",
                    status: "paid",
                    amount: "5.00",
                    currency: "USD",
                    reference_id: "DONATE-101",
                    approved_at: new Date().toISOString()
                }
            }
        });

        var sigHeader = generateSignatureHeader(rawBody, TEST_SECRET);
        var result = verifyWebhookSignature(rawBody, sigHeader, TEST_SECRET);
        assert(result && result.event && result.event.id === "evt_test_valid_001", "Event ID must match");

        // Also test dispatch through createWebhookHandler
        var fulfilled = false;
        var store = new PaymentMemoryStore();
        var handler = createWebhookHandler({
            signingSecret: TEST_SECRET,
            store: store,
            isProduction: true,
            onFulfillOrder: async function (orderId) {
                if (orderId === "DONATE-101") fulfilled = true;
            }
        });

        var mock = createMockHttp(rawBody, { "x-khqrpay-signature": sigHeader });
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 200, "HTTP status must be 200");

        // Allow microtask/setImmediate to complete
        await new Promise(function (r) { setTimeout(r, 20); });
        assert(fulfilled === true, "Order must be fulfilled");
        assert(store.getOrder("DONATE-101").status === "paid", "Store order status must be paid");
    });

    // Scenario 2: Tampered body
    await runTest("2. Tampered body (change 1 character) -> 400 rejected", async function () {
        var originalBody = JSON.stringify({
            id: "evt_test_tampered_002",
            type: "payment.completed",
            data: { payment: { id: "pay_002", amount: "10.00", reference_id: "DONATE-102" } }
        });
        var sigHeader = generateSignatureHeader(originalBody, TEST_SECRET);

        // Tamper 1 character in amount ("10.00" -> "90.00")
        var tamperedBody = originalBody.replace("10.00", "90.00");

        var thrown = false;
        try {
            verifyWebhookSignature(tamperedBody, sigHeader, TEST_SECRET);
        } catch (e) {
            thrown = true;
            assert(e.code === "INVALID_SIGNATURE", "Error code should be INVALID_SIGNATURE");
        }
        assert(thrown, "Tampered body must throw WebhookVerificationError");

        var handler = createWebhookHandler({ signingSecret: TEST_SECRET });
        var mock = createMockHttp(tamperedBody, { "x-khqrpay-signature": sigHeader });
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 400, "Handler must return HTTP 400 on tampered body");
    });

    // Scenario 3: Missing signature header
    await runTest("3. Missing signature header -> 400 rejected", async function () {
        var body = JSON.stringify({ id: "evt_003" });
        var thrown = false;
        try {
            verifyWebhookSignature(body, null, TEST_SECRET);
        } catch (e) {
            thrown = true;
            assert(e.code === "MISSING_SIGNATURE_HEADER", "Expected MISSING_SIGNATURE_HEADER code");
        }
        assert(thrown, "Missing signature header must throw");

        var handler = createWebhookHandler({ signingSecret: TEST_SECRET });
        var mock = createMockHttp(body, {});
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 400, "Handler must return 400 for missing header");
    });

    // Scenario 4: Malformed signature header
    await runTest("4. Malformed signature header -> 400 rejected", async function () {
        var body = JSON.stringify({ id: "evt_004" });
        var malformedHeaders = [
            "invalid_header_value",
            "t=12345678", // missing v1
            "v1=abcdef0123", // missing t
            "t=not_a_number,v1=abcdef"
        ];

        for (var i = 0; i < malformedHeaders.length; i++) {
            var hdr = malformedHeaders[i];
            var thrown = false;
            try {
                verifyWebhookSignature(body, hdr, TEST_SECRET);
            } catch (e) {
                thrown = true;
            }
            assert(thrown, "Malformed header '" + hdr + "' must throw");

            var handler = createWebhookHandler({ signingSecret: TEST_SECRET });
            var mock = createMockHttp(body, { "x-khqrpay-signature": hdr });
            handler(mock.req, mock.res);
            assert(mock.res.statusCode === 400, "Handler must return 400 for malformed header '" + hdr + "'");
        }
    });

    // Scenario 5: Unset or empty signing secret
    await runTest("5. Unset or empty signing secret -> 400 rejected", async function () {
        var body = JSON.stringify({ id: "evt_005" });
        var sigHeader = "t=1700000000,v1=abcdef";

        var emptySecrets = [null, undefined, "", "   "];
        for (var i = 0; i < emptySecrets.length; i++) {
            var sec = emptySecrets[i];
            var thrown = false;
            try {
                verifyWebhookSignature(body, sigHeader, sec);
            } catch (e) {
                thrown = true;
                assert(e.code === "MISSING_SECRET", "Expected MISSING_SECRET code");
            }
            assert(thrown, "Empty secret must throw error");

            var handler = createWebhookHandler({ signingSecret: sec });
            var mock = createMockHttp(body, { "x-khqrpay-signature": sigHeader });
            handler(mock.req, mock.res);
            assert(mock.res.statusCode === 400, "Handler must return 400 when secret is unset or empty");
        }
    });

    // Scenario 6: Old timestamp (> 5 min ago)
    await runTest("6. Old timestamp (> 5 min ago) -> 400 rejected", async function () {
        var body = JSON.stringify({ id: "evt_006" });
        var now = Math.floor(Date.now() / 1000);
        var oldTimestamp = now - 305; // 5 min 5 sec ago (> 300s)

        var sigHeader = generateSignatureHeader(body, TEST_SECRET, oldTimestamp);
        var thrown = false;
        try {
            verifyWebhookSignature(body, sigHeader, TEST_SECRET, 300, now);
        } catch (e) {
            thrown = true;
            assert(e.code === "TIMESTAMP_OUT_OF_TOLERANCE", "Expected TIMESTAMP_OUT_OF_TOLERANCE code");
        }
        assert(thrown, "Old timestamp must be rejected");

        var handler = createWebhookHandler({ signingSecret: TEST_SECRET });
        var mock = createMockHttp(body, { "x-khqrpay-signature": sigHeader });
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 400, "Handler must return 400 for expired timestamp");
    });

    // Scenario 7: Timestamp > 5 min in future
    await runTest("7. Timestamp > 5 min in future -> 400 rejected", async function () {
        var body = JSON.stringify({ id: "evt_007" });
        var now = Math.floor(Date.now() / 1000);
        var futureTimestamp = now + 305; // 5 min 5 sec in future

        var sigHeader = generateSignatureHeader(body, TEST_SECRET, futureTimestamp);
        var thrown = false;
        try {
            verifyWebhookSignature(body, sigHeader, TEST_SECRET, 300, now);
        } catch (e) {
            thrown = true;
            assert(e.code === "TIMESTAMP_OUT_OF_TOLERANCE", "Expected TIMESTAMP_OUT_OF_TOLERANCE code");
        }
        assert(thrown, "Future timestamp must be rejected");

        var handler = createWebhookHandler({ signingSecret: TEST_SECRET });
        var mock = createMockHttp(body, { "x-khqrpay-signature": sigHeader });
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 400, "Handler must return 400 for far future timestamp");
    });

    // Scenario 8: Duplicate event ID
    await runTest("8. Duplicate event -> 200, fulfilled only once", async function () {
        var fulfillCount = 0;
        var store = new PaymentMemoryStore();
        var handler = createWebhookHandler({
            signingSecret: TEST_SECRET,
            store: store,
            onFulfillOrder: async function () {
                fulfillCount++;
            }
        });

        var body = JSON.stringify({
            id: "evt_duplicate_008",
            type: "payment.completed",
            livemode: true,
            data: { payment: { id: "pay_dup_008", reference_id: "DONATE-DUP", amount: "5.00" } }
        });
        var sigHeader = generateSignatureHeader(body, TEST_SECRET);

        // First delivery
        var mock1 = createMockHttp(body, { "x-khqrpay-signature": sigHeader });
        handler(mock1.req, mock1.res);
        assert(mock1.res.statusCode === 200, "First delivery should return 200");

        // Second delivery (duplicate event.id)
        var mock2 = createMockHttp(body, { "x-khqrpay-signature": sigHeader });
        handler(mock2.req, mock2.res);
        assert(mock2.res.statusCode === 200, "Duplicate delivery should return 200");
        var resp2 = JSON.parse(mock2.res.body);
        assert(resp2.duplicate === true, "Duplicate response should flag duplicate: true");

        await new Promise(function (r) { setTimeout(r, 20); });
        assert(fulfillCount === 1, "Order fulfillment callback must be executed exactly once, got: " + fulfillCount);
    });

    // Scenario 9: Test event in production
    await runTest("9. Test event in production -> 200, NOT fulfilled", async function () {
        var fulfilled = false;
        var store = new PaymentMemoryStore();
        var handler = createWebhookHandler({
            signingSecret: TEST_SECRET,
            store: store,
            isProduction: true, // PRODUCTION MODE
            onFulfillOrder: async function () {
                fulfilled = true;
            }
        });

        // Test event from dashboard: livemode=false or test=true
        var testBody = JSON.stringify({
            id: "evt_test_prod_009",
            type: "payment.completed",
            livemode: false,
            test: true,
            data: {
                payment: {
                    id: "pay_test_009",
                    reference_id: "DONATE-TEST-PROD",
                    amount: "10.00",
                    livemode: false
                }
            }
        });
        var sigHeader = generateSignatureHeader(testBody, TEST_SECRET);

        var mock = createMockHttp(testBody, { "x-khqrpay-signature": sigHeader });
        handler(mock.req, mock.res);
        assert(mock.res.statusCode === 200, "Test event in prod must still return 200");

        await new Promise(function (r) { setTimeout(r, 20); });
        assert(fulfilled === false, "Test event in production must NOT trigger fulfillment");
        assert(store.getOrder("DONATE-TEST-PROD") === null, "Order should not be marked paid");
    });

    // Scenario 10: Late payment.completed (late: true) after payment.expired
    await runTest("10. Late payment.completed after payment.expired -> order fulfilled", async function () {
        var fulfilled = false;
        var fulfilledLateFlag = null;
        var store = new PaymentMemoryStore();
        var handler = createWebhookHandler({
            signingSecret: TEST_SECRET,
            store: store,
            isProduction: false,
            onFulfillOrder: async function (orderId, payment, isLate) {
                fulfilled = true;
                fulfilledLateFlag = isLate;
            }
        });

        var orderId = "DONATE-LATE-10";

        // Step 1: payment.expired arrives first
        var expiredBody = JSON.stringify({
            id: "evt_expired_010",
            type: "payment.expired",
            data: { payment: { id: "pay_010", reference_id: orderId } }
        });
        var expiredSig = generateSignatureHeader(expiredBody, TEST_SECRET);
        var mock1 = createMockHttp(expiredBody, { "x-khqrpay-signature": expiredSig });
        handler(mock1.req, mock1.res);
        assert(mock1.res.statusCode === 200, "Expired event returns 200");

        await new Promise(function (r) { setTimeout(r, 20); });
        assert(store.getOrder(orderId).status === "expired", "Order status should initially be expired");

        // Step 2: Bank approval catches in window -> payment.completed arrives with late: true
        var completedBody = JSON.stringify({
            id: "evt_completed_late_010",
            type: "payment.completed",
            data: {
                payment: {
                    id: "pay_010",
                    reference_id: orderId,
                    amount: "20.00",
                    currency: "USD",
                    late: true
                }
            }
        });
        var completedSig = generateSignatureHeader(completedBody, TEST_SECRET);
        var mock2 = createMockHttp(completedBody, { "x-khqrpay-signature": completedSig });
        handler(mock2.req, mock2.res);
        assert(mock2.res.statusCode === 200, "Completed late event returns 200");

        await new Promise(function (r) { setTimeout(r, 20); });
        assert(fulfilled === true, "Late payment MUST be fulfilled");
        assert(fulfilledLateFlag === true, "Late payment flag should be true");
        assert(store.getOrder(orderId).status === "paid", "Order status must transition to paid");
        assert(store.getOrder(orderId).late === true, "Store order must preserve late: true");
    });

    // Scenario 11: payment.expired after payment.completed
    await runTest("11. payment.expired after payment.completed -> order remains paid", async function () {
        var store = new PaymentMemoryStore();
        var handler = createWebhookHandler({
            signingSecret: TEST_SECRET,
            store: store,
            isProduction: false
        });

        var orderId = "DONATE-OUT-OF-ORDER-11";

        // Step 1: payment.completed arrives
        var completedBody = JSON.stringify({
            id: "evt_completed_011",
            type: "payment.completed",
            data: {
                payment: {
                    id: "pay_011",
                    reference_id: orderId,
                    amount: "15.00",
                    currency: "USD"
                }
            }
        });
        var completedSig = generateSignatureHeader(completedBody, TEST_SECRET);
        var mock1 = createMockHttp(completedBody, { "x-khqrpay-signature": completedSig });
        handler(mock1.req, mock1.res);
        assert(mock1.res.statusCode === 200, "Completed event returns 200");

        await new Promise(function (r) { setTimeout(r, 20); });
        assert(store.getOrder(orderId).status === "paid", "Order status must be paid");

        // Step 2: payment.expired arrives out-of-order
        var expiredBody = JSON.stringify({
            id: "evt_expired_out_of_order_011",
            type: "payment.expired",
            data: { payment: { id: "pay_011", reference_id: orderId } }
        });
        var expiredSig = generateSignatureHeader(expiredBody, TEST_SECRET);
        var mock2 = createMockHttp(expiredBody, { "x-khqrpay-signature": expiredSig });
        handler(mock2.req, mock2.res);
        assert(mock2.res.statusCode === 200, "Expired event returns 200");

        await new Promise(function (r) { setTimeout(r, 20); });
        // Crucial requirement 8: payment.expired must NEVER undo an already paid order
        assert(store.getOrder(orderId).status === "paid", "Order status must REMAIN paid despite subsequent expired event");
    });

    // Bonus validation: Idempotency-Key & Parameter validation on createPayment
    await runTest("12. createPayment parameter & idempotency-key validation", async function () {
        // Missing Idempotency-Key
        var threwMissing = false;
        try {
            await createPayment({ amount: "5.00" }, { apiKey: "kp_test_dummy" });
        } catch (e) {
            threwMissing = true;
            assert(e.message.indexOf("Idempotency-Key is required") !== -1, "Expected missing idempotency error");
        }
        assert(threwMissing, "createPayment must reject missing idempotency key");

        // Idempotency-Key > 255 chars
        var threwLong = false;
        try {
            await createPayment({ amount: "5.00", idempotency_key: "x".repeat(256) }, { apiKey: "kp_test_dummy" });
        } catch (e) {
            threwLong = true;
            assert(e.message.indexOf("must not exceed 255 characters") !== -1, "Expected length error");
        }
        assert(threwLong, "createPayment must reject idempotency keys > 255 chars");

        // Missing API key
        var threwKey = false;
        var oldEnv = process.env.KHQRPAY_API_KEY;
        delete process.env.KHQRPAY_API_KEY;
        try {
            await createPayment({ amount: "5.00", idempotency_key: "test_key" });
        } catch (e) {
            threwKey = true;
            assert(e.message.indexOf("API key is not configured") !== -1, "Expected missing API key error");
        } finally {
            if (oldEnv) process.env.KHQRPAY_API_KEY = oldEnv;
        }
        assert(threwKey, "createPayment must reject missing API key");
    });

    console.log("\n==================================================");
    console.log("Test Summary: " + testsPassed + " passed, " + testsFailed + " failed.");
    console.log("==================================================");

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runAllTests();
