let riskChart = null;

async function loadAnalytics() {
    const statusElement = document.getElementById("analyticsStatus");

    try {
        const response = await fetch("/api/analytics");
        const result = await response.json();

        if (!response.ok || result.status !== "success") {
            throw new Error(
                result.error || "Unable to load analytics."
            );
        }

        document.getElementById("totalTransactions").textContent =
            result.total_transactions ?? 0;

        document.getElementById("fraudTransactions").textContent =
            result.fraud_transactions ?? 0;

        document.getElementById("fraudPercentage").textContent =
            `${result.fraud_percentage ?? 0}%`;

        document.getElementById("approvedTransactions").textContent =
            result.approved_transactions ?? 0;

        document.getElementById("heldTransactions").textContent =
            result.held_transactions ?? 0;

        document.getElementById("blockedTransactions").textContent =
            result.blocked_transactions ?? 0;

        const distribution = result.risk_distribution || {};

        const labels = Object.keys(distribution);
        const values = Object.values(distribution);

        const canvas = document.getElementById("riskChart");

        if (riskChart) {
            riskChart.destroy();
        }

        riskChart = new Chart(canvas, {
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
                plugins: {
                    legend: {
                        position: "bottom"
                    }
                }
            }
        });

        statusElement.textContent =
            "Analytics updated successfully.";

    } catch (error) {
        console.error("Analytics error:", error);

        statusElement.textContent =
            "Unable to load analytics. Check whether Flask is running.";
    }
}

loadAnalytics();

setInterval(loadAnalytics, 10000);