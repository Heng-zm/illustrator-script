/**
 * KHQRPay Server Module for Node.js
 * Implements KHQRPay REST API payment creation, webhook signature verification,
 * and event handling in accordance with the KHQRPay specification.
 *
 * Requirements:
 * 1. Raw body verification before JSON parsing
 * 2. Constant-time signature comparison (crypto.timingSafeEqual)
 * 3. Timestamp rejection > 5 minutes
 * 4. Fast 2xx response (< 10 seconds) with asynchronous processing
 * 5. Event deduplication on event.id
 * 6. Order fulfilment only on payment.completed
 * 7. Livemode & test event protection in production
 * 8. Late payment handling & payment.expired protection
 */

const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");

const KHQRPAY_BASE_URL = "https://khqrpay.dev";
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

class WebhookVerificationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "WebhookVerificationError";
        this.code = code || "INVALID_WEBHOOK";
    }
}

/**
 * Verifies a KHQRPay webhook signature against the raw request body.
 *
 * @param {string|Buffer} rawBody - Raw unparsed HTTP request body string or buffer.
 * @param {string} signatureHeader - Value of X-KHQRPay-Signature header ("t=<timestamp>,v1=<sig>").
 * @param {string} signingSecret - Webhook endpoint secret (e.g. "whsec_...").
 * @param {number} [toleranceSeconds=300] - Allowed timestamp drift in seconds (default 5 min).
 * @param {number} [nowUnixSeconds] - Optional override for current Unix timestamp in seconds (for testing).
 * @returns {object} { timestamp: number, signature: string, event: object }
 */
function verifyWebhookSignature(rawBody, signatureHeader, signingSecret, toleranceSeconds = TIMESTAMP_TOLERANCE_SECONDS, nowUnixSeconds) {
    // Requirement 2: If signing secret is unset or empty, refuse every event
    if (!signingSecret || typeof signingSecret !== "string" || signingSecret.trim() === "") {
        throw new WebhookVerificationError("Webhook signing secret is not configured or empty.", "MISSING_SECRET");
    }

    // Requirement 1 & 2: Raw body required; missing or malformed header gets 400
    if (rawBody === undefined || rawBody === null) {
        throw new WebhookVerificationError("Missing request body.", "MISSING_BODY");
    }
    var rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);

    if (!signatureHeader || typeof signatureHeader !== "string") {
        throw new WebhookVerificationError("Missing X-KHQRPay-Signature header.", "MISSING_SIGNATURE_HEADER");
    }

    // Parse "t=<unix_seconds>,v1=<hex_signature>"
    var parts = signatureHeader.split(",");
    var tVal = null;
    var v1Val = null;

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        var eqIdx = part.indexOf("=");
        if (eqIdx === -1) continue;
        var k = part.substring(0, eqIdx).trim();
        var v = part.substring(eqIdx + 1).trim();
        if (k === "t") tVal = v;
        else if (k === "v1") v1Val = v;
    }

    if (!tVal || !v1Val) {
        throw new WebhookVerificationError("Malformed X-KHQRPay-Signature header. Expected 't=...,v1=...'.", "MALFORMED_SIGNATURE_HEADER");
    }

    var timestamp = parseInt(tVal, 10);
    if (isNaN(timestamp) || timestamp <= 0) {
        throw new WebhookVerificationError("Invalid timestamp in signature header.", "MALFORMED_TIMESTAMP");
    }

    // Requirement 3: Reject timestamps more than 5 minutes from current time (both past and future)
    var now = typeof nowUnixSeconds === "number" ? nowUnixSeconds : Math.floor(Date.now() / 1000);
    var diff = Math.abs(now - timestamp);
    if (diff > toleranceSeconds) {
        throw new WebhookVerificationError("Webhook timestamp is out of tolerance (> " + toleranceSeconds + "s difference).", "TIMESTAMP_OUT_OF_TOLERANCE");
    }

    // Compute expected v1 signature: hex HMAC-SHA256 of "<t>.<raw body>", keyed with signingSecret as UTF-8
    var payloadToSign = timestamp + "." + rawBodyStr;
    var expectedSigHex = crypto.createHmac("sha256", signingSecret).update(payloadToSign, "utf8").digest("hex");

    // Requirement 2: Compare signatures in constant time
    var expectedBuf = Buffer.from(expectedSigHex, "utf8");
    var actualBuf = Buffer.from(v1Val, "utf8");

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        throw new WebhookVerificationError("Invalid webhook signature.", "INVALID_SIGNATURE");
    }

    // Parse event JSON payload after verifying signature
    var event;
    try {
        event = JSON.parse(rawBodyStr);
    } catch (err) {
        throw new WebhookVerificationError("Malformed JSON event payload.", "MALFORMED_JSON");
    }

    if (!event || typeof event !== "object" || !event.id) {
        throw new WebhookVerificationError("Event payload missing required 'id' property.", "INVALID_EVENT_STRUCTURE");
    }

    return {
        timestamp: timestamp,
        signature: v1Val,
        event: event
    };
}

/**
 * Creates a payment with KHQRPay REST API.
 *
 * @param {object} params
 * @param {string|number} params.amount - Required. Number or string (USD up to 2 decimals, KHR whole riel).
 * @param {string} [params.currency="USD"] - "USD" or "KHR".
 * @param {string} params.reference_id - Order or donation ID as string (up to 255 chars).
 * @param {object} [params.metadata] - Optional metadata (up to 50 keys, 4 KB).
 * @param {string} params.idempotency_key - Unique key per checkout attempt.
 * @param {object} [options]
 * @param {string} [options.apiKey] - Secret API key (defaults to process.env.KHQRPAY_API_KEY).
 * @param {string} [options.baseUrl] - Base API URL (defaults to https://khqrpay.dev).
 * @returns {Promise<object>} Returns the payment object ({ id, checkout_url, qr_string, expires_at, ... }).
 */
function createPayment(params, options) {
    options = options || {};
    var apiKey = options.apiKey || process.env.KHQRPAY_API_KEY;
    if (!apiKey) {
        return Promise.reject(new Error("KHQRPay API key is not configured. Set KHQRPAY_API_KEY environment variable."));
    }

    var baseUrl = options.baseUrl || KHQRPAY_BASE_URL;
    var idempotencyKey = params.idempotency_key || params.idempotencyKey;
    if (!idempotencyKey) {
        return Promise.reject(new Error("Idempotency-Key is required for createPayment (Requirement 9)."));
    }
    if (String(idempotencyKey).length > 255) {
        return Promise.reject(new Error("Idempotency-Key must not exceed 255 characters."));
    }

    var payload = {
        amount: String(params.amount),
        currency: (params.currency || "USD").toUpperCase(),
        reference_id: String(params.reference_id || params.referenceId || ("DONATE-" + Date.now())),
        metadata: params.metadata || {}
    };

    var bodyStr = JSON.stringify(payload);
    var parsedUrl = new URL("/v1/payments", baseUrl);

    return new Promise(function (resolve, reject) {
        var req = https.request(parsedUrl, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Idempotency-Key": String(idempotencyKey),
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
                "User-Agent": "KHQRPay-Client/1.0"
            }
        }, function (res) {
            var chunks = [];
            res.on("data", function (chunk) { chunks.push(chunk); });
            res.on("end", function () {
                var responseBody = Buffer.concat(chunks).toString("utf8");
                var json = null;
                try {
                    json = JSON.parse(responseBody);
                } catch (e) {
                    json = { error: "unparseable_response", message: responseBody };
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        payment: json,
                        statusCode: res.statusCode,
                        isReplay: res.statusCode === 200,
                        rateLimit: {
                            limit: res.headers["x-ratelimit-limit"],
                            remaining: res.headers["x-ratelimit-remaining"],
                            reset: res.headers["x-ratelimit-reset"]
                        }
                    });
                } else {
                    var err = new Error(json.message || ("KHQRPay request failed with status " + res.statusCode));
                    err.statusCode = res.statusCode;
                    err.code = json.error || "request_failed";
                    err.retryAfter = res.headers["retry-after"] ? parseInt(res.headers["retry-after"], 10) : null;
                    err.response = json;
                    reject(err);
                }
            });
        });

        req.on("error", function (err) {
            reject(err);
        });

        req.write(bodyStr);
        req.end();
    });
}

/**
 * In-memory or pluggable store for deduplicating webhook event IDs (Requirement 5)
 * and order state (Requirements 6, 7, 8) with bounded memory limits.
 */
class PaymentMemoryStore {
    constructor(maxEvents = 5000) {
        this.maxEvents = maxEvents;
        this.processedEventIds = new Set();
        this.orders = new Map(); // reference_id -> { status: "pending"|"paid"|"expired", paidAt, amount, currency, late }
    }

    hasEvent(eventId) {
        return this.processedEventIds.has(eventId);
    }

    recordEvent(eventId) {
        if (this.processedEventIds.size >= this.maxEvents) {
            // Prune oldest 20% entries when capacity is reached to prevent unbounded memory growth
            const toDelete = Math.floor(this.maxEvents * 0.2);
            let count = 0;
            for (const id of this.processedEventIds) {
                this.processedEventIds.delete(id);
                if (++count >= toDelete) break;
            }
        }
        this.processedEventIds.add(eventId);
    }

    getOrder(orderId) {
        return this.orders.get(orderId) || null;
    }

    saveOrder(orderId, orderData) {
        this.orders.set(orderId, Object.assign({}, this.orders.get(orderId) || {}, orderData));
    }
}

/**
 * Creates an Express / Node.js HTTP request handler that processes KHQRPay webhook events
 * meeting requirements 1 through 8.
 *
 * @param {object} options
 * @param {string} [options.signingSecret] - Webhook signing secret (defaults to process.env.KHQRPAY_WEBHOOK_SECRET).
 * @param {boolean} [options.isProduction] - Whether environment is production (defaults to process.env.NODE_ENV === "production").
 * @param {PaymentMemoryStore} [options.store] - Store for deduplication & order state.
 * @param {Function} [options.onFulfillOrder] - Async callback function (orderId, paymentData, isLate) => Promise<void>.
 * @returns {Function} Express/Connect middleware function (req, res, next)
 */
function createWebhookHandler(options) {
    options = options || {};
    var store = options.store || new PaymentMemoryStore();
    var onFulfillOrder = options.onFulfillOrder || function () { return Promise.resolve(); };

    return function webhookHandler(req, res) {
        // Requirement 1: Read raw body. Supports pre-captured req.rawBody or stream.
        function processRawBody(rawBody) {
            var secret = options.signingSecret || process.env.KHQRPAY_WEBHOOK_SECRET;
            var sigHeader = req.headers["x-khqrpay-signature"];

            var verified;
            try {
                // Requirements 2 & 3: constant time compare, reject > 5 min, throw 400 on error
                verified = verifyWebhookSignature(rawBody, sigHeader, secret);
            } catch (vErr) {
                // Requirement 2: Catch missing, malformed, old or wrong signature and answer 400
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "bad_request", message: vErr.message, code: vErr.code }));
                return;
            }

            var event = verified.event;
            var eventId = event.id;

            // Requirement 5: Deduplicate on event id (event.id), NOT payment id
            if (store.hasEvent(eventId)) {
                // Already processed, acknowledge 200 immediately
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ received: true, duplicate: true }));
                return;
            }

            // Record event id to deduplicate subsequent retries
            store.recordEvent(eventId);

            // Requirement 4: Answer 2xx within 10 seconds.
            // Acknowledge receipt first, do slow work asynchronously.
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true }));

            // Asynchronous processing (Requirement 4)
            setImmediate(function () {
                try {
                    handleVerifiedEvent(event, {
                        store: store,
                        isProduction: typeof options.isProduction === "boolean" ? options.isProduction : (process.env.NODE_ENV === "production"),
                        onFulfillOrder: onFulfillOrder
                    });
                } catch (e) {
                    console.error("[KHQRPay Webhook] Async handling error:", e);
                }
            });
        }

        if (req.rawBody) {
            processRawBody(req.rawBody);
        } else if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
            processRawBody(req.body);
        } else {
            // Buffer stream if body-parser has not already captured it
            var chunks = [];
            req.on("data", function (chunk) { chunks.push(chunk); });
            req.on("end", function () {
                processRawBody(Buffer.concat(chunks).toString("utf8"));
            });
        }
    };
}

/**
 * Handles verified event logic enforcing Requirements 6, 7, and 8.
 */
function handleVerifiedEvent(event, ctx) {
    var store = ctx.store;
    var isProduction = ctx.isProduction;
    var onFulfillOrder = ctx.onFulfillOrder;

    var eventType = event.type;
    var data = event.data || {};
    var payment = data.payment || {};
    var orderId = payment.reference_id;

    if (!orderId) return;

    // Requirement 7: In production, if livemode is false or test is true, fulfil nothing.
    if (isProduction) {
        if (event.livemode === false || event.test === true || payment.livemode === false) {
            console.log("[KHQRPay Webhook] Test event received in production; skipping fulfilment (Requirement 7). Event ID:", event.id);
            return;
        }
    }

    var existingOrder = store.getOrder(orderId);
    var isAlreadyPaid = existingOrder && existingOrder.status === "paid";

    if (eventType === "payment.completed") {
        // Requirement 6: Fulfil order ONLY on payment.completed.
        // Requirement 8: Honour a payment.completed with data.payment.late = true even after payment.expired.
        var isLate = !!payment.late;
        store.saveOrder(orderId, {
            status: "paid",
            amount: payment.amount,
            currency: payment.currency,
            requested_amount: payment.requested_amount,
            requested_currency: payment.requested_currency,
            paidAt: payment.approved_at || new Date().toISOString(),
            late: isLate
        });

        Promise.resolve(onFulfillOrder(orderId, payment, isLate)).catch(function (err) {
            console.error("[KHQRPay Webhook] Fulfilment callback error for order:", orderId, err);
        });
    } else if (eventType === "payment.expired") {
        // Requirement 8: Never let a payment.expired undo an order already marked paid:
        // events can arrive out of order!
        if (isAlreadyPaid) {
            console.log("[KHQRPay Webhook] Ignoring payment.expired because order is already marked paid (Requirement 8):", orderId);
            return;
        }
        store.saveOrder(orderId, {
            status: "expired",
            expiredAt: new Date().toISOString()
        });
    } else if (eventType === "payment.scanned") {
        // Requirement 6: Never fulfil on payment.scanned
        if (!isAlreadyPaid) {
            store.saveOrder(orderId, { status: "scanned" });
        }
    } else if (eventType === "payment.failed") {
        if (!isAlreadyPaid) {
            store.saveOrder(orderId, { status: "failed" });
        }
    }
}

module.exports = {
    KHQRPAY_BASE_URL: KHQRPAY_BASE_URL,
    TIMESTAMP_TOLERANCE_SECONDS: TIMESTAMP_TOLERANCE_SECONDS,
    WebhookVerificationError: WebhookVerificationError,
    verifyWebhookSignature: verifyWebhookSignature,
    createPayment: createPayment,
    PaymentMemoryStore: PaymentMemoryStore,
    createWebhookHandler: createWebhookHandler,
    handleVerifiedEvent: handleVerifiedEvent
};
