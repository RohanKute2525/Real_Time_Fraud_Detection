const transactionForm = document.getElementById("transactionForm");
const recommendationText = document.getElementById("recommendationText");

if (transactionForm) {
    transactionForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = transactionForm.querySelector(
            'button[type="submit"]'
        );

        const resultMessage = document.getElementById("resultMessage");
        const reasonsList = document.getElementById("riskReasonsList");
        const fraudAlertBox = document.getElementById("fraudAlertBox");

        resultMessage.textContent = "Analyzing transaction...";

        if (reasonsList) {
            reasonsList.innerHTML =
                "<li>Analyzing risk indicators...</li>";
        }

        if (recommendationText) {
            recommendationText.textContent =
                "Generating recommendation...";
        }

        if (fraudAlertBox) {
            fraudAlertBox.classList.remove("active");
            fraudAlertBox.textContent = "";
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Analyzing...";
        }

        const transactionData = {
            user_id: document.getElementById("user_id").value.trim(),

            device_id: document.getElementById("device_id").value.trim(),

            transaction_amount: Number(
                document.getElementById("transaction_amount").value
            ),

            payment_mode: document.getElementById("payment_mode").value,

            merchant_category: document.getElementById(
                "merchant_category"
            ).value,

            transaction_city: document
                .getElementById("transaction_city")
                .value.trim(),

            transaction_hour: Number(
                document.getElementById("transaction_hour").value
            ),

            failed_attempts_24h: Number(
                document.getElementById("failed_attempts_24h").value
            ),

            transactions_last_1h: Number(
                document.getElementById("transactions_last_1h").value
            ),

            ip_risk_score: Number(
                document.getElementById("ip_risk_score").value
            ),

            new_device: document.getElementById("new_device").checked
                ? 1
                : 0,

            location_change: document.getElementById("location_change")
                .checked
                ? 1
                : 0,

            vpn_used: document.getElementById("vpn_used").checked
                ? 1
                : 0,

            international_transaction: document.getElementById(
                "international_transaction"
            ).checked
                ? 1
                : 0
        };

        if (
            !transactionData.user_id ||
            !transactionData.device_id ||
            !transactionData.transaction_amount ||
            transactionData.transaction_amount <= 0 ||
            !transactionData.payment_mode ||
            !transactionData.merchant_category ||
            !transactionData.transaction_city
        ) {
            resultMessage.textContent =
                "Please fill in all required fields correctly.";

            if (reasonsList) {
                reasonsList.innerHTML =
                    "<li>Invalid transaction details.</li>";
            }

            if (recommendationText) {
                recommendationText.textContent =
                    "Please correct the transaction details and try again.";
            }

            resetButton(submitButton);
            return;
        }

        try {
            const response = await fetch("/api/transaction", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(transactionData)
            });

            const responseText = await response.text();

            let result;

            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error(
                    "Invalid server response. Please check the Flask terminal."
                );
            }

            if (!response.ok || result.status !== "success") {
                resultMessage.textContent =
                    result.error || "Transaction analysis failed.";

                if (reasonsList) {
                    reasonsList.innerHTML =
                        "<li>Risk reasons are unavailable.</li>";
                }

                if (recommendationText) {
                    recommendationText.textContent =
                        "No recommendation available.";
                }

                resetButton(submitButton);
                return;
            }

            resultMessage.textContent =
                result.message ||
                "Transaction analyzed successfully.";

            document.getElementById("resultProbability").textContent =
                `${Number(result.fraud_probability ?? 0).toFixed(2)}%`;

            document.getElementById("resultRiskScore").textContent =
                `${Number(result.risk_score ?? 0).toFixed(2)} / 100`;

            const riskLevel = String(
                result.risk_level || "UNKNOWN"
            ).toUpperCase();

            const decision = String(
                result.decision || "UNKNOWN"
            ).toUpperCase();

            document.getElementById("resultRiskLevel").textContent =
                riskLevel;

            document.getElementById("resultDecision").textContent =
                decision;

            if (reasonsList) {
                reasonsList.innerHTML = "";

                const reasons = Array.isArray(result.risk_reasons)
                    ? result.risk_reasons
                    : Array.isArray(result.reasons)
                        ? result.reasons
                        : [];

                if (reasons.length === 0) {
                    const listItem = document.createElement("li");
                    listItem.textContent =
                        "No major risk indicators detected.";
                    reasonsList.appendChild(listItem);
                } else {
                    reasons.forEach(function (reason) {
                        const listItem = document.createElement("li");
                        listItem.textContent = `⚠️ ${reason}`;
                        reasonsList.appendChild(listItem);
                    });
                }
            }

            if (recommendationText) {
                if (
                    decision === "BLOCK" ||
                    riskLevel === "HIGH" ||
                    riskLevel === "CRITICAL"
                ) {
                    recommendationText.textContent =
                        "Block this transaction and perform additional verification.";
                } else if (
                    decision === "HOLD" ||
                    riskLevel === "MEDIUM"
                ) {
                    recommendationText.textContent =
                        "Temporarily hold this transaction and request additional verification.";
                } else {
                    recommendationText.textContent =
                        "Transaction appears low risk. Continue monitoring.";
                }
            }

            showFraudNotification(result);

        } catch (error) {
            console.error("Transaction error:", error);

            resultMessage.textContent =
                error.message ||
                "Unable to connect to the fraud detection server.";

            if (reasonsList) {
                reasonsList.innerHTML =
                    "<li>Server connection failed.</li>";
            }

            if (recommendationText) {
                recommendationText.textContent =
                    "Unable to generate a recommendation.";
            }
        } finally {
            resetButton(submitButton);
        }
    });
}


function resetButton(button) {
    if (button) {
        button.disabled = false;
        button.textContent = "🔍 Analyze Transaction";
    }
}


function showFraudNotification(result) {
    const riskLevel = String(
        result.risk_level || ""
    ).toUpperCase();

    const decision = String(
        result.decision || ""
    ).toUpperCase();

    const isSuspicious =
        ["HIGH", "CRITICAL"].includes(riskLevel) ||
        ["BLOCK", "HOLD"].includes(decision);

    const fraudAlertBox = document.getElementById("fraudAlertBox");

    if (!isSuspicious) {
        if (fraudAlertBox) {
            fraudAlertBox.classList.remove("active");
            fraudAlertBox.textContent = "";
        }

        return;
    }

    const message =
        `🚨 Suspicious transaction detected! ` +
        `Risk Level: ${riskLevel} | Decision: ${decision}`;

    if (fraudAlertBox) {
        fraudAlertBox.textContent = message;
        fraudAlertBox.classList.add("active");
    }

    if (!("Notification" in window)) {
        alert(message);
        return;
    }

    if (Notification.permission === "granted") {
        new Notification("🚨 FraudGuard AI Alert", {
            body:
                `Risk: ${riskLevel} | Decision: ${decision}\n` +
                `Transaction ID: ${result.transaction_id || "N/A"}`
        });
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
            if (permission === "granted") {
                new Notification("🚨 FraudGuard AI Alert", {
                    body:
                        `Risk: ${riskLevel} | Decision: ${decision}\n` +
                        `Transaction ID: ${result.transaction_id || "N/A"}`
                });
            }
        });
    }
}
const exportBtn = document.getElementById("exportBtn");

if (exportBtn) {
    exportBtn.addEventListener("click", async function () {
        const originalText = exportBtn.textContent;

        exportBtn.disabled = true;
        exportBtn.textContent = "⏳ Preparing CSV...";

        try {
            const response = await fetch("/api/export-transactions");

            if (!response.ok) {
                let errorMessage = "Export failed";

                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (error) {
                    console.log("Unable to read error response");
                }

                throw new Error(errorMessage);
            }

            const blob = await response.blob();

            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = downloadUrl;
            link.download = "fraud_transactions_export.csv";

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(downloadUrl);

            exportBtn.textContent = "✅ CSV Downloaded";

        } catch (error) {
            console.error("Export error:", error);
            alert(error.message);

            exportBtn.textContent = "❌ Export Failed";

        } finally {
            setTimeout(function () {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }, 2000);
        }
    });
}
