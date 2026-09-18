document.addEventListener("DOMContentLoaded", function () {
    const tableBody = document.getElementById("transactionTableBody");
    const historyStatus = document.getElementById("historyStatus");
    const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
    const exportBtn = document.getElementById("exportBtn");

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatAmount(value) {
        if (value === null || value === undefined || value === "") {
            return "₹0.00";
        }

        const amount = Number(value);

        if (Number.isNaN(amount)) {
            return "₹0.00";
        }

        return `₹${amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function getRiskClass(value) {
        const risk = String(value || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-");

        if (risk.includes("high")) {
            return "risk-high";
        }

        if (risk.includes("medium")) {
            return "risk-medium";
        }

        if (risk.includes("low")) {
            return "risk-low";
        }

        return `risk-${risk}`;
    }

    function getDecisionClass(value) {
        const decision = String(value || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-");

        if (
            decision.includes("block") ||
            decision.includes("reject") ||
            decision.includes("fraud")
        ) {
            return "decision-block";
        }

        if (
            decision.includes("hold") ||
            decision.includes("review")
        ) {
            return "decision-hold";
        }

        if (
            decision.includes("allow") ||
            decision.includes("approve") ||
            decision.includes("success")
        ) {
            return "decision-allow";
        }

        return `decision-${decision}`;
    }

    function getFirstValue(object, keys, defaultValue = "-") {
        for (const key of keys) {
            if (
                object[key] !== undefined &&
                object[key] !== null &&
                object[key] !== ""
            ) {
                return object[key];
            }
        }

        return defaultValue;
    }

    function formatDateTime(value) {
        if (!value || value === "-") {
            return "-";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString("en-IN");
    }

    function showMessage(message) {
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8">${escapeHTML(message)}</td>
                </tr>
            `;
        }
    }

    async function loadTransactionHistory() {
        if (!tableBody) {
            console.error("transactionTableBody was not found.");
            return;
        }

        showMessage("Loading transactions...");

        if (historyStatus) {
            historyStatus.textContent = "Loading transactions...";
        }

        try {
            const response = await fetch(
                `/api/live-transactions?time=${Date.now()}`,
                {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    cache: "no-store"
                }
            );

            const responseText = await response.text();

            let data;

            try {
                data = JSON.parse(responseText);
            } catch (error) {
                throw new Error(
                    `Invalid server response. HTTP ${response.status}`
                );
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.message ||
                    `Request failed. HTTP ${response.status}`
                );
            }

            let transactions = [];

            if (Array.isArray(data)) {
                transactions = data;
            } else if (Array.isArray(data.transactions)) {
                transactions = data.transactions;
            } else if (Array.isArray(data.data)) {
                transactions = data.data;
            } else if (Array.isArray(data.results)) {
                transactions = data.results;
            }

            if (transactions.length === 0) {
                showMessage("No transactions available.");

                if (historyStatus) {
                    historyStatus.textContent = "No transactions found.";
                }

                return;
            }

            tableBody.innerHTML = transactions.map(function (transaction) {
                const transactionId = getFirstValue(
                    transaction,
                    [
                        "transaction_id",
                        "transactionId",
                        "id",
                        "reference_id"
                    ]
                );

                const userId = getFirstValue(
                    transaction,
                    [
                        "user_id",
                        "userId",
                        "customer_id",
                        "customerId"
                    ]
                );

                const amount = getFirstValue(
                    transaction,
                    [
                        "transaction_amount",
                        "amount",
                        "value"
                    ],
                    0
                );

                const paymentMode = getFirstValue(
                    transaction,
                    [
                        "payment_mode",
                        "paymentMode",
                        "payment_method",
                        "mode"
                    ]
                );

                const riskScore = getFirstValue(
                    transaction,
                    [
                        "risk_score",
                        "riskScore",
                        "fraud_score",
                        "score"
                    ]
                );

                const riskLevel = getFirstValue(
                    transaction,
                    [
                        "risk_level",
                        "riskLevel",
                        "risk"
                    ],
                    "Unknown"
                );

                const decision = getFirstValue(
                    transaction,
                    [
                        "decision",
                        "status",
                        "action",
                        "result"
                    ],
                    "Unknown"
                );

                const timestamp = getFirstValue(
                    transaction,
                    [
                        "timestamp",
                        "date_time",
                        "dateTime",
                        "created_at",
                        "createdAt",
                        "datetime"
                    ]
                );

                return `
                    <tr>
                        <td>
                            ${escapeHTML(transactionId)}
                        </td>

                        <td>
                            ${escapeHTML(userId)}
                        </td>

                        <td>
                            ${formatAmount(amount)}
                        </td>

                        <td>
                            ${escapeHTML(paymentMode)}
                        </td>

                        <td>
                            ${escapeHTML(riskScore)}
                        </td>

                        <td>
                            <span class="risk-badge ${getRiskClass(riskLevel)}">
                                ${escapeHTML(riskLevel)}
                            </span>
                        </td>

                        <td>
                            <span class="decision-badge ${getDecisionClass(decision)}">
                                ${escapeHTML(decision)}
                            </span>
                        </td>

                        <td>
                            ${escapeHTML(formatDateTime(timestamp))}
                        </td>
                    </tr>
                `;
            }).join("");

            if (historyStatus) {
                historyStatus.textContent =
                    `${transactions.length} transaction(s) found`;
            }

        } catch (error) {
            console.error("Transaction history error:", error);

            showMessage(`Unable to load transactions: ${error.message}`);

            if (historyStatus) {
                historyStatus.textContent =
                    "Failed to load transactions.";
            }
        }
    }

    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener(
            "click",
            loadTransactionHistory
        );
    }

    if (exportBtn) {
        exportBtn.addEventListener("click", function () {
            window.location.href = "/api/export-transactions";
        });
    }

    loadTransactionHistory();

    setInterval(loadTransactionHistory, 10000);
});