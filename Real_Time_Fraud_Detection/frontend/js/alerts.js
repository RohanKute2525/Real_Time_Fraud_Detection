async function loadFraudAlerts() {
    const tableBody = document.getElementById("alertsTableBody");

    try {
        const response = await fetch("/api/alerts");
        const result = await response.json();

        if (!response.ok || result.status !== "success") {
            throw new Error(
                result.error || "Unable to load fraud alerts."
            );
        }

        const alerts = result.alerts || [];

        tableBody.innerHTML = "";

        if (alerts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8">
                        ✅ No suspicious transactions detected.
                    </td>
                </tr>
            `;
            return;
        }

        alerts.reverse().forEach(function (alert) {
            const row = document.createElement("tr");

            const riskLevel = String(
                alert.risk_level || "UNKNOWN"
            ).toUpperCase();

            const decision = String(
                alert.decision || "UNKNOWN"
            ).toUpperCase();

            row.innerHTML = `
                <td>${escapeHTML(alert.transaction_id)}</td>

                <td>${escapeHTML(alert.user_id)}</td>

                <td>₹${Number(
                    alert.transaction_amount || 0
                ).toFixed(2)}</td>

                <td>${Number(
                    alert.fraud_probability || 0
                ).toFixed(2)}%</td>

                <td>${Number(
                    alert.risk_score || 0
                ).toFixed(2)}</td>

                <td>
                    <span class="risk-badge ${riskLevel.toLowerCase()}">
                        ${escapeHTML(riskLevel)}
                    </span>
                </td>

                <td>
                    <span class="decision-badge ${decision.toLowerCase()}">
                        ${escapeHTML(decision)}
                    </span>
                </td>

                <td>${escapeHTML(
                    alert.timestamp || "N/A"
                )}</td>
            `;

            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error("Fraud alert error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    Unable to load fraud alerts.
                </td>
            </tr>
        `;
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

loadFraudAlerts();

setInterval(loadFraudAlerts, 10000);