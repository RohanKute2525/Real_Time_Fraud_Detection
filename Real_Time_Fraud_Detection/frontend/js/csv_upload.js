async function uploadCSV() {
    const fileInput = document.getElementById("csvFile");
    const status = document.getElementById("uploadStatus");
    const resultsBody = document.getElementById("resultsBody");
    const summary = document.getElementById("summary");

    if (!fileInput.files.length) {
        status.textContent = "Please select a CSV file.";
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    status.textContent = "Analyzing transactions...";
    resultsBody.innerHTML = "";
    summary.innerHTML = "";

    try {
        const response = await fetch("/api/upload-csv", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error(data.message || "CSV analysis failed");
        }

        summary.innerHTML = `
            <h3>Analysis Summary</h3>
            <p>Total Transactions: ${data.total_transactions}</p>
            <p>Fraudulent Transactions: ${data.fraud_transactions}</p>
            <p>Safe Transactions: ${data.safe_transactions}</p>
        `;

        data.results.forEach(transaction => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${transaction.transaction_id || "N/A"}</td>
                <td>${transaction.transaction_amount || transaction.amount || 0}</td>
                <td>${Number(transaction.fraud_probability || 0).toFixed(2)}%</td>
                <td>${Number(transaction.risk_score || 0).toFixed(2)}</td>
                <td>${transaction.risk_level || "N/A"}</td>
                <td>${transaction.decision || "N/A"}</td>
            `;

            resultsBody.appendChild(row);
        });

        status.textContent = "CSV analysis completed successfully.";

    } catch (error) {
        console.error(error);
        status.textContent = `Error: ${error.message}`;
    }
}