let riskChart = null;

async function fetchJSON(url) {
    const separator = url.includes("?") ? "&" : "?";

    const response = await fetch(
        url + separator + "t=" + Date.now(),
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
        throw new Error("Invalid JSON response from server");
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            "API Error: " + response.status
        );
    }

    return data;
}

function formatAmount(amount) {
    const value = Number(amount || 0);

    return "₹" + value.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function updateElement(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getValue(object, keys, defaultValue = null) {
    if (!object || typeof object !== "object") {
        return defaultValue;
    }

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

function getRiskClass(value) {
    const risk = String(value || "waiting")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");

    return "risk-" + risk;
}

function getDecisionClass(value) {
    const decision = String(value || "waiting")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");

    return "decision-" + decision;
}

async function loadDashboard() {
    try {
        const data = await fetchJSON("/api/analytics");

        updateElement(
            "totalTransactions",
            getValue(
                data,
                ["total_transactions", "totalTransactions"],
                0
            )
        );

        updateElement(
            "fraudTransactions",
            getValue(
                data,
                ["fraud_transactions", "fraudTransactions"],
                0
            )
        );

        updateElement(
            "approvedTransactions",
            getValue(
                data,
                ["approved_transactions", "approvedTransactions"],
                0
            )
        );

        updateElement(
            "blockedTransactions",
            getValue(
                data,
                ["blocked_transactions", "blockedTransactions"],
                0
            )
        );

        updateElement(
            "heldTransactions",
            getValue(
                data,
                ["held_transactions", "heldTransactions"],
                0
            )
        );

        const fraudPercentage = Number(
            getValue(
                data,
                ["fraud_percentage", "fraudPercentage"],
                0
            )
        ) || 0;

        updateElement(
            "fraudPercentage",
            fraudPercentage.toFixed(2) + "%"
        );

        const distribution = getValue(
            data,
            ["risk_distribution", "riskDistribution"],
            {}
        );

        const chartElement = document.getElementById("riskChart");

        if (
            chartElement &&
            typeof Chart !== "undefined" &&
            distribution &&
            typeof distribution === "object"
        ) {
            if (riskChart) {
                riskChart.destroy();
            }

            const labels = Object.keys(distribution);
            const values = Object.values(distribution);

            riskChart = new Chart(chartElement, {
                type: "doughnut",

                data: {
                    labels: labels,

                    datasets: [
                        {
                            label: "Risk Distribution",
                            data: values
                        }
                    ]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            position: "bottom"
                        }
                    }
                }
            });
        }

    } catch (error) {
        console.error("Dashboard analytics error:", error);
    }
}

async function loadLatestTransaction() {
    try {
        const data = await fetchJSON("/api/latest-transaction");

        console.log("Latest transaction response:", data);

        let transaction = null;

        if (data.transaction) {
            transaction = data.transaction;
        } else if (data.latest_transaction) {
            transaction = data.latest_transaction;
        } else if (
            data.data &&
            !Array.isArray(data.data)
        ) {
            transaction = data.data;
        } else if (
            data.transaction_id ||
            data.transactionId
        ) {
            transaction = data;
        }

        if (!transaction) {
            updateLatestTransactionAsEmpty();
            return;
        }

        const transactionId = getValue(
            transaction,
            [
                "transaction_id",
                "transactionId",
                "id"
            ],
            "No transaction"
        );

        const amount = getValue(
            transaction,
            [
                "transaction_amount",
                "amount",
                "value"
            ],
            0
        );

        const paymentMode = getValue(
            transaction,
            [
                "payment_mode",
                "paymentMode",
                "payment_method",
                "mode"
            ],
            "-"
        );

        const city = getValue(
            transaction,
            [
                "transaction_city",
                "location",
                "city"
            ],
            "-"
        );

        const riskScoreValue = getValue(
            transaction,
            [
                "risk_score",
                "riskScore",
                "score"
            ],
            0
        );

        const riskScore = Number(riskScoreValue) || 0;

        /*
         * Read fraud probability from the backend.
         */
        const rawFraudProbability = getValue(
            transaction,
            [
                "fraud_probability",
                "fraudProbability",
                "fraud_percentage",
                "fraudPercentage"
            ],
            null
        );

        let fraudProbability = Number(rawFraudProbability);

        /*
         * Use risk score as a fallback if the probability is:
         * - Missing
         * - Empty
         * - Invalid
         * - Zero
         */
        if (
            rawFraudProbability === null ||
            rawFraudProbability === undefined ||
            rawFraudProbability === "" ||
            Number.isNaN(fraudProbability) ||
            fraudProbability <= 0
        ) {
            fraudProbability = riskScore;
        }

        fraudProbability = Math.min(
            100,
            Math.max(0, fraudProbability)
        );

        let riskLevel = getValue(
            transaction,
            [
                "risk_level",
                "riskLevel",
                "risk"
            ],
            null
        );

        /*
         * Calculate risk level if backend does not provide it.
         */
        if (
            !riskLevel ||
            String(riskLevel).toLowerCase() === "unknown"
        ) {
            if (riskScore >= 75) {
                riskLevel = "HIGH";
            } else if (riskScore >= 40) {
                riskLevel = "MEDIUM";
            } else {
                riskLevel = "LOW";
            }
        }

        riskLevel = String(riskLevel).toUpperCase();

        const decision = String(
            getValue(
                transaction,
                [
                    "decision",
                    "status",
                    "action",
                    "result"
                ],
                "WAITING"
            )
        ).toUpperCase();

        updateElement(
            "latestTransactionId",
            transactionId
        );

        updateElement(
            "latestAmount",
            formatAmount(amount)
        );

        updateElement(
            "latestPaymentMode",
            paymentMode
        );

        updateElement(
            "latestLocation",
            city
        );

        updateElement(
            "latestFraudProbability",
            fraudProbability.toFixed(2) + "%"
        );

        updateElement(
            "latestRiskScore",
            riskScore.toFixed(2) + " / 100"
        );

        updateElement(
            "latestRiskLevel",
            riskLevel
        );

        updateElement(
            "latestDecision",
            decision
        );

        const progressBar = document.getElementById(
            "latestRiskProgress"
        );

        if (progressBar) {
            progressBar.style.width =
                Math.min(100, Math.max(0, riskScore)) + "%";
        }

        const riskBadge = document.getElementById(
            "latestRiskLevel"
        );

        if (riskBadge) {
            riskBadge.className =
                "risk-badge " + getRiskClass(riskLevel);

            riskBadge.textContent = riskLevel;
        }

        const decisionElement = document.getElementById(
            "latestDecision"
        );

        if (decisionElement) {
            decisionElement.className =
                "decision-badge " + getDecisionClass(decision);

            decisionElement.textContent = decision;
        }

        const alertBox = document.getElementById(
            "dashboardAlertBox"
        );

        const isSuspicious =
            riskLevel === "HIGH" ||
            riskLevel === "CRITICAL" ||
            decision === "BLOCK" ||
            decision === "HOLD";

        if (alertBox) {
            if (isSuspicious) {
                alertBox.textContent =
                    "⚠️ Suspicious transaction detected: " +
                    transactionId +
                    " | Risk: " +
                    riskLevel +
                    " | Decision: " +
                    decision;

                alertBox.classList.add("active");
            } else {
                alertBox.textContent = "";
                alertBox.classList.remove("active");
            }
        }

    } catch (error) {
        console.error("Latest transaction error:", error);
        updateLatestTransactionAsEmpty();
    }
}

function updateLatestTransactionAsEmpty() {
    updateElement(
        "latestTransactionId",
        "No transaction"
    );

    updateElement(
        "latestAmount",
        "₹0.00"
    );

    updateElement(
        "latestPaymentMode",
        "-"
    );

    updateElement(
        "latestLocation",
        "-"
    );

    updateElement(
        "latestFraudProbability",
        "0.00%"
    );

    updateElement(
        "latestRiskScore",
        "0.00 / 100"
    );

    updateElement(
        "latestRiskLevel",
        "WAITING"
    );

    updateElement(
        "latestDecision",
        "WAITING"
    );

    const progressBar = document.getElementById(
        "latestRiskProgress"
    );

    if (progressBar) {
        progressBar.style.width = "0%";
    }
}

async function loadRecentTransactions() {
    try {
        const data = await fetchJSON(
            "/api/live-transactions"
        );

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

        const tableBody = document.getElementById(
            "recentTransactionsBody"
        );

        if (!tableBody) {
            return;
        }

        if (transactions.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        No transactions available
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = "";

        transactions.slice(0, 10).forEach(function (transaction) {
            const row = document.createElement("tr");

            const transactionId = getValue(
                transaction,
                [
                    "transaction_id",
                    "transactionId",
                    "id"
                ],
                "-"
            );

            const userId = getValue(
                transaction,
                [
                    "user_id",
                    "userId",
                    "customer_id"
                ],
                "-"
            );

            const amount = getValue(
                transaction,
                [
                    "transaction_amount",
                    "amount"
                ],
                0
            );

            const riskScore = getValue(
                transaction,
                [
                    "risk_score",
                    "riskScore",
                    "score"
                ],
                0
            );

            const riskLevel = getValue(
                transaction,
                [
                    "risk_level",
                    "riskLevel",
                    "risk"
                ],
                "LOW"
            );

            const decision = getValue(
                transaction,
                [
                    "decision",
                    "status",
                    "action"
                ],
                "APPROVE"
            );

            const timestamp = getValue(
                transaction,
                [
                    "timestamp",
                    "date_time",
                    "dateTime",
                    "created_at",
                    "createdAt"
                ],
                "-"
            );

            row.innerHTML = `
                <td>${escapeHTML(transactionId)}</td>
                <td>${escapeHTML(userId)}</td>
                <td>${escapeHTML(formatAmount(amount))}</td>
                <td>${escapeHTML(riskScore)}</td>
                <td>
                    <span class="table-badge">
                        ${escapeHTML(
                            String(riskLevel).toUpperCase()
                        )}
                    </span>
                </td>
                <td>
                    ${escapeHTML(
                        String(decision).toUpperCase()
                    )}
                </td>
                <td>${escapeHTML(timestamp)}</td>
            `;

            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error(
            "Recent transactions error:",
            error
        );
    }
}

async function refreshDashboard() {
    const status = document.getElementById(
        "dashboardStatus"
    );

    if (status) {
        status.textContent = "Refreshing dashboard...";
    }

    await Promise.all([
        loadDashboard(),
        loadLatestTransaction(),
        loadRecentTransactions()
    ]);

    if (status) {
        status.textContent =
            "Dashboard updated successfully at " +
            new Date().toLocaleTimeString();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    function () {
        refreshDashboard();

        setInterval(
            refreshDashboard,
            10000
        );
    }
);