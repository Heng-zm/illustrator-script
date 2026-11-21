/**
 * Standalone KHQRPay Donation & Webhook Server
 * Zero external dependencies (uses Node.js standard library: http, https, crypto, url)
 */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
    createPayment,
    createWebhookHandler,
    PaymentMemoryStore
} = require("./khqrpay");

// Lightweight zero-dependency .env loader
(function loadEnv() {
    const envPaths = [
        path.join(__dirname, ".env"),
        path.join(process.cwd(), ".env")
    ];
    for (var i = 0; i < envPaths.length; i++) {
        var envPath = envPaths[i];
        if (fs.existsSync(envPath)) {
            try {
                var content = fs.readFileSync(envPath, "utf8");
                var lines = content.split(/\r?\n/);
                for (var j = 0; j < lines.length; j++) {
                    var trimmed = lines[j].trim();
                    if (!trimmed || trimmed.startsWith("#")) continue;
                    var eqIdx = trimmed.indexOf("=");
                    if (eqIdx !== -1) {
                        var key = trimmed.substring(0, eqIdx).trim();
                        var val = trimmed.substring(eqIdx + 1).trim();
                        if (process.env[key] === undefined) {
                            process.env[key] = val;
                        }
                    }
                }
                break;
            } catch (e) {}
        }
    }
})();

// Configuration from environment variables
const PORT = parseInt(process.env.PORT, 10) || 3000;
const API_KEY = process.env.KHQRPAY_API_KEY;
const WEBHOOK_SECRET = process.env.KHQRPAY_WEBHOOK_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";

// In-memory store for orders and deduplicating webhook events
const store = new PaymentMemoryStore();

// Fulfill callback when payment is verified completed
async function handleOrderFulfillment(orderId, payment, isLate) {
    console.log("==================================================");
    console.log(`[DONATION SUCCESS] Order: ${orderId}`);
    console.log(`Amount: ${payment.amount} ${payment.currency}`);
    if (isLate) {
        console.log(`[NOTE] This payment was approved in the late window (Requirement 8)`);
    }
    console.log(`Payment ID: ${payment.id} | Approved At: ${payment.approved_at}`);
    console.log("==================================================");
}

// Instantiate webhook middleware handler
const webhookHandler = createWebhookHandler({
    signingSecret: WEBHOOK_SECRET,
    isProduction: IS_PROD,
    store: store,
    onFulfillOrder: handleOrderFulfillment
});

// Helper to send JSON responses
function sendJson(res, statusCode, data, headers = {}) {
    res.writeHead(statusCode, Object.assign({ "Content-Type": "application/json" }, headers));
    res.end(JSON.stringify(data, null, 2));
}

// Create HTTP server
const server = http.createServer(function (req, res) {
    // Enable CORS for CEP panel or web client
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-KHQRPay-Signature");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // 1. Health & status check
    if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
        sendJson(res, 200, {
            status: "online",
            service: "KHQRPay Donation Server",
            apiKeyConfigured: !!API_KEY,
            mode: API_KEY ? (API_KEY.startsWith("kp_live_") ? "live" : "test") : "unconfigured",
            webhookSecretConfigured: !!WEBHOOK_SECRET,
            environment: IS_PROD ? "production" : "development",
            uptimeSeconds: Math.floor(process.uptime())
        });
        return;
    }

    // 2. Webhook endpoint (POST /webhook or /api/webhook)
    if (req.method === "POST" && (pathname === "/webhook" || pathname === "/api/webhook")) {
        webhookHandler(req, res);
        return;
    }

    // 3. Donation payment creation (POST /api/donate)
    if (req.method === "POST" && pathname === "/api/donate") {
        var bodyChunks = [];
        req.on("data", function (chunk) { bodyChunks.push(chunk); });
        req.on("end", async function () {
            var rawBody = Buffer.concat(bodyChunks).toString("utf8");
            var params = {};
            if (rawBody.trim()) {
                try {
                    params = JSON.parse(rawBody);
                } catch (e) {
                    sendJson(res, 400, { error: "invalid_request", message: "Malformed JSON body" });
                    return;
                }
            }

            // Read or generate Idempotency-Key
            var idempotencyKey = req.headers["idempotency-key"] ||
                                 params.idempotency_key ||
                                 ("donate-" + crypto.randomUUID());

            var amount = params.amount || "1.00";
            var currency = params.currency || "USD";
            var referenceId = params.reference_id || ("DONATION-" + Date.now());

            try {
                var result = await createPayment({
                    amount: amount,
                    currency: currency,
                    reference_id: referenceId,
                    metadata: Object.assign({ source: "illustrator-script-panel" }, params.metadata || {}),
                    idempotency_key: idempotencyKey
                }, { apiKey: API_KEY });

                var p = result.payment;
                var khqrCardSvg = p.qr_string
                    ? `https://khqrpay.dev/api/render/khqr/${encodeURIComponent(p.qr_string)}.svg`
                    : null;

                // Track order in pending status
                store.saveOrder(referenceId, {
                    id: p.id,
                    reference_id: referenceId,
                    amount: p.amount,
                    currency: p.currency,
                    status: p.status || "pending",
                    checkout_url: p.checkout_url,
                    expires_at: p.expires_at,
                    createdAt: new Date().toISOString()
                });

                sendJson(res, result.statusCode === 200 ? 200 : 201, {
                    success: true,
                    payment: {
                        id: p.id,
                        status: p.status,
                        amount: p.amount,
                        currency: p.currency,
                        checkout_url: p.checkout_url,
                        qr_string: p.qr_string,
                        expires_at: p.expires_at,
                        reference_id: p.reference_id,
                        card_svg_url: khqrCardSvg
                    },
                    rateLimit: result.rateLimit
                });
            } catch (err) {
                console.error("[CreatePayment Error]", err);
                var statusCode = err.statusCode || 500;
                var errorBody = {
                    error: err.code || "internal_error",
                    message: err.message
                };
                if (err.retryAfter) {
                    errorBody.retry_after = err.retryAfter;
                }
                sendJson(res, statusCode, errorBody);
            }
        });
        return;
    }

    // 4. Check order status (GET /api/donate/:orderId)
    if (req.method === "GET" && pathname.startsWith("/api/donate/")) {
        var orderId = pathname.substring("/api/donate/".length);
        var order = store.getOrder(orderId);
        if (!order) {
            sendJson(res, 404, { error: "order_not_found", message: "No donation found with that ID" });
            return;
        }
        sendJson(res, 200, { success: true, order: order });
        return;
    }

    // Default 404
    sendJson(res, 404, { error: "not_found", message: "Endpoint not found" });
});

if (require.main === module) {
    server.listen(PORT, function () {
        console.log(`KHQRPay Server running at http://localhost:${PORT}`);
        console.log(`- Webhook endpoint:  POST http://localhost:${PORT}/webhook`);
        console.log(`- Create donation:   POST http://localhost:${PORT}/api/donate`);
        console.log(`- Health check:      GET  http://localhost:${PORT}/health`);
        if (!API_KEY) {
            console.warn("WARNING: KHQRPAY_API_KEY is not set in environment.");
        } else {
            console.log(`API Key configured: ${API_KEY.substring(0, 10)}... (${API_KEY.startsWith("kp_live_") ? "LIVE MODE" : "TEST MODE"})`);
        }
        if (!WEBHOOK_SECRET) {
            console.warn("WARNING: KHQRPAY_WEBHOOK_SECRET is not set in environment.");
        }
    });
}

module.exports = { server, store };
