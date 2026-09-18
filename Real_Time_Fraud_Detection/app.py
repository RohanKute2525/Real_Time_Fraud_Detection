
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from services.fraud_detection import detect_fraud

import pandas as pd
from datetime import datetime
import os
import uuid
import traceback
import json


app = Flask(__name__, static_folder="frontend")
CORS(app)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

RAW_DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "raw",
    "transactions.csv"
)

LIVE_DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "live_transactions.csv"
)

EXPORT_DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "fraud_transactions_export.csv"
)

os.makedirs(
    os.path.dirname(LIVE_DATA_PATH),
    exist_ok=True
)


LIVE_COLUMNS = [
    "transaction_id",
    "user_id",
    "device_id",
    "transaction_amount",
    "currency",
    "payment_mode",
    "merchant_category",
    "transaction_city",
    "transaction_hour",
    "new_device",
    "location_change",
    "failed_attempts_24h",
    "transactions_last_1h",
    "ip_risk_score",
    "vpn_used",
    "international_transaction",
    "fraud_probability",
    "risk_score",
    "risk_level",
    "decision",
    "is_fraud",
    "risk_reasons",
    "recommendation",
    "timestamp"
]


def safe_read_csv(file_path):
    if not os.path.exists(file_path):
        return pd.DataFrame()

    try:
        return pd.read_csv(
            file_path,
            engine="python",
            on_bad_lines="skip"
        )

    except Exception as error:
        print(f"CSV reading error: {error}")
        return pd.DataFrame()


def normalize_value(value):
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass

    if hasattr(value, "item"):
        return value.item()

    return value


def safe_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clean_dataframe(data):
    if data.empty:
        return data

    data = data.copy()

    data.columns = [
        str(column).strip()
        for column in data.columns
    ]

    data = data.loc[
        :,
        ~data.columns.duplicated()
    ]

    data = data.fillna("")

    if "transaction_id" in data.columns:
        data["transaction_id"] = (
            data["transaction_id"]
            .astype(str)
            .str.strip()
        )

        data = data[
            data["transaction_id"] != ""
        ]

        data = data.drop_duplicates(
            subset=["transaction_id"],
            keep="last"
        )

    return data


def load_all_transactions():
    raw_data = safe_read_csv(RAW_DATA_PATH)
    live_data = safe_read_csv(LIVE_DATA_PATH)

    dataframes = []

    if not raw_data.empty:
        dataframes.append(raw_data)

    if not live_data.empty:
        dataframes.append(live_data)

    if not dataframes:
        return pd.DataFrame()

    combined_data = pd.concat(
        dataframes,
        ignore_index=True,
        sort=False
    )

    combined_data = clean_dataframe(
        combined_data
    )

    return combined_data


def save_live_transaction(transaction_record):
    transaction_df = pd.DataFrame(
        [transaction_record],
        columns=LIVE_COLUMNS
    )

    if not os.path.exists(LIVE_DATA_PATH):
        transaction_df.to_csv(
            LIVE_DATA_PATH,
            index=False
        )
        return

    existing_data = safe_read_csv(
        LIVE_DATA_PATH
    )

    if existing_data.empty:
        transaction_df.to_csv(
            LIVE_DATA_PATH,
            index=False
        )
        return

    existing_data = existing_data.reindex(
        columns=LIVE_COLUMNS,
        fill_value=""
    )

    transaction_df = transaction_df.reindex(
        columns=LIVE_COLUMNS,
        fill_value=""
    )

    if "transaction_id" in existing_data.columns:
        existing_data = existing_data[
            existing_data["transaction_id"].astype(str)
            != str(transaction_record["transaction_id"])
        ]

    updated_data = pd.concat(
        [
            existing_data,
            transaction_df
        ],
        ignore_index=True
    )

    updated_data.to_csv(
        LIVE_DATA_PATH,
        index=False
    )


def convert_records_to_json(data):
    if data.empty:
        return []

    data = data.copy().fillna("")

    records = data.to_dict(
        orient="records"
    )

    cleaned_records = []

    for record in records:
        cleaned_record = {
            str(key): normalize_value(value)
            for key, value in record.items()
        }

        cleaned_records.append(
            cleaned_record
        )

    return cleaned_records


@app.route("/")
def home():
    return send_from_directory(
        FRONTEND_DIR,
        "index.html"
    )


@app.route("/<path:filename>")
def serve_frontend(filename):
    file_path = os.path.join(
        FRONTEND_DIR,
        filename
    )

    if os.path.isfile(file_path):
        return send_from_directory(
            FRONTEND_DIR,
            filename
        )

    return jsonify({
        "status": "error",
        "message": "Frontend file not found"
    }), 404


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "success",
        "message": "Fraud detection server is running",
        "model": "Random Forest",
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/transaction", methods=["POST"])
def analyze_transaction():
    try:
        data = request.get_json(silent=True)

        if not isinstance(data, dict):
            return jsonify({
                "status": "error",
                "error": "No valid transaction data received"
            }), 400

        required_fields = [
            "user_id",
            "device_id",
            "transaction_amount",
            "payment_mode",
            "merchant_category",
            "transaction_city"
        ]

        missing_fields = [
            field
            for field in required_fields
            if field not in data
            or str(data[field]).strip() == ""
        ]

        if missing_fields:
            return jsonify({
                "status": "error",
                "error": "Missing required fields",
                "missing_fields": missing_fields
            }), 400

        transaction_amount = safe_float(
            data.get("transaction_amount"),
            -1
        )

        if transaction_amount <= 0:
            return jsonify({
                "status": "error",
                "error": "Transaction amount must be greater than zero"
            }), 400

        transaction_data = {
            "user_id": str(
                data.get("user_id", "")
            ).strip(),

            "device_id": str(
                data.get("device_id", "")
            ).strip(),

            "transaction_amount": transaction_amount,

            "currency": str(
                data.get("currency", "INR")
            ).strip(),

            "payment_mode": str(
                data.get("payment_mode", "UPI")
            ).strip(),

            "merchant_category": str(
                data.get("merchant_category", "Other")
            ).strip(),

            "transaction_city": str(
                data.get("transaction_city", "Unknown")
            ).strip(),

            "transaction_hour": safe_int(
                data.get("transaction_hour", 12),
                12
            ),

            "new_device": safe_int(
                data.get("new_device", 0)
            ),

            "location_change": safe_int(
                data.get("location_change", 0)
            ),

            "failed_attempts_24h": safe_int(
                data.get("failed_attempts_24h", 0)
            ),

            "transactions_last_1h": safe_int(
                data.get("transactions_last_1h", 0)
            ),

            "ip_risk_score": safe_float(
                data.get("ip_risk_score", 0)
            ),

            "vpn_used": safe_int(
                data.get("vpn_used", 0)
            ),

            "international_transaction": safe_int(
                data.get("international_transaction", 0)
            )
        }

        result = detect_fraud(
            transaction_data
        )

        if not isinstance(result, dict):
            return jsonify({
                "status": "error",
                "error": "Invalid model response"
            }), 500

        fraud_probability = safe_float(
            result.get("fraud_probability", 0)
        )

        risk_score = safe_float(
            result.get(
                "risk_score",
                fraud_probability
            )
        )

        risk_level = str(
            result.get("risk_level", "UNKNOWN")
        ).upper()

        decision = str(
            result.get("decision", "UNKNOWN")
        ).upper()

        reasons = result.get(
            "risk_reasons",
            result.get("reasons", [])
        )

        if reasons is None:
            reasons = []

        if isinstance(reasons, str):
            try:
                parsed_reasons = json.loads(
                    reasons
                )

                if isinstance(parsed_reasons, list):
                    reasons = parsed_reasons
                else:
                    reasons = [reasons]

            except Exception:
                reasons = [
                    item.strip()
                    for item in reasons.split("|")
                    if item.strip()
                ]

        if not isinstance(reasons, list):
            reasons = [str(reasons)]

        reasons = [
            str(reason).strip()
            for reason in reasons
            if str(reason).strip()
        ]

        recommendation = str(
            result.get(
                "recommendation",
                ""
            )
        ).strip()

        if not recommendation:
            if (
                decision == "BLOCK"
                or risk_level in ["HIGH", "CRITICAL"]
            ):
                recommendation = (
                    "Block this transaction and "
                    "perform additional verification."
                )

            elif (
                decision == "HOLD"
                or risk_level == "MEDIUM"
            ):
                recommendation = (
                    "Temporarily hold this transaction "
                    "and request additional verification."
                )

            else:
                recommendation = (
                    "Transaction appears low risk. "
                    "Continue monitoring."
                )

        transaction_id = str(
            data.get(
                "transaction_id",
                f"TXN-{uuid.uuid4().hex[:10].upper()}"
            )
        ).strip()

        timestamp = datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        is_fraud = int(
            risk_level in ["HIGH", "CRITICAL"]
            or decision in ["BLOCK", "HOLD"]
        )

        transaction_record = {
            "transaction_id": transaction_id,
            "user_id": transaction_data["user_id"],
            "device_id": transaction_data["device_id"],
            "transaction_amount": transaction_data[
                "transaction_amount"
            ],
            "currency": transaction_data["currency"],
            "payment_mode": transaction_data["payment_mode"],
            "merchant_category": transaction_data[
                "merchant_category"
            ],
            "transaction_city": transaction_data[
                "transaction_city"
            ],
            "transaction_hour": transaction_data[
                "transaction_hour"
            ],
            "new_device": transaction_data["new_device"],
            "location_change": transaction_data[
                "location_change"
            ],
            "failed_attempts_24h": transaction_data[
                "failed_attempts_24h"
            ],
            "transactions_last_1h": transaction_data[
                "transactions_last_1h"
            ],
            "ip_risk_score": transaction_data[
                "ip_risk_score"
            ],
            "vpn_used": transaction_data["vpn_used"],
            "international_transaction": transaction_data[
                "international_transaction"
            ],
            "fraud_probability": round(
                fraud_probability,
                2
            ),
            "risk_score": round(
                risk_score,
                2
            ),
            "risk_level": risk_level,
            "decision": decision,
            "is_fraud": is_fraud,
            "risk_reasons": " | ".join(
                reasons
            ),
            "recommendation": recommendation,
            "timestamp": timestamp
        }

        save_live_transaction(
            transaction_record
        )

        return jsonify({
            "status": "success",
            "message": "Transaction analyzed successfully",
            "transaction_id": transaction_id,
            "fraud_probability": round(
                fraud_probability,
                2
            ),
            "risk_score": round(
                risk_score,
                2
            ),
            "risk_level": risk_level,
            "decision": decision,
            "risk_reasons": reasons,
            "recommendation": recommendation,
            "is_fraud": is_fraud,
            "timestamp": timestamp
        })

    except Exception as error:
        print("\nTransaction analysis error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/analytics", methods=["GET"])
def analytics():
    try:
        data = load_all_transactions()

        if data.empty:
            return jsonify({
                "status": "success",
                "total_transactions": 0,
                "fraud_transactions": 0,
                "fraud_percentage": 0,
                "approved_transactions": 0,
                "held_transactions": 0,
                "blocked_transactions": 0,
                "risk_distribution": {}
            })

        total_transactions = len(data)

        fraud_transactions = 0

        if "is_fraud" in data.columns:
            fraud_values = pd.to_numeric(
                data["is_fraud"],
                errors="coerce"
            ).fillna(0)

            fraud_transactions = int(
                fraud_values.sum()
            )

        approved_transactions = 0
        held_transactions = 0
        blocked_transactions = 0

        if "decision" in data.columns:
            decisions = data[
                "decision"
            ].astype(str).str.upper()

            approved_transactions = int(
                (decisions == "APPROVE").sum()
            )

            held_transactions = int(
                (decisions == "HOLD").sum()
            )

            blocked_transactions = int(
                (decisions == "BLOCK").sum()
            )

        risk_distribution = {}

        if "risk_level" in data.columns:
            risk_values = data[
                "risk_level"
            ].astype(str).str.upper()

            risk_distribution = {
                str(key): int(value)
                for key, value in risk_values.value_counts().items()
            }

        fraud_percentage = round(
            (
                fraud_transactions / total_transactions
            ) * 100,
            2
        ) if total_transactions else 0

        return jsonify({
            "status": "success",
            "total_transactions": total_transactions,
            "fraud_transactions": fraud_transactions,
            "fraud_percentage": fraud_percentage,
            "approved_transactions": approved_transactions,
            "held_transactions": held_transactions,
            "blocked_transactions": blocked_transactions,
            "risk_distribution": risk_distribution
        })

    except Exception as error:
        print("\nAnalytics error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/latest-transaction", methods=["GET"])
def latest_transaction():
    try:
        data = safe_read_csv(
            LIVE_DATA_PATH
        )

        if data.empty:
            return jsonify({
                "status": "success",
                "transaction": None
            })

        if "timestamp" in data.columns:
            data["_sort_time"] = pd.to_datetime(
                data["timestamp"],
                errors="coerce"
            )

            data = data.sort_values(
                by="_sort_time",
                ascending=False,
                na_position="last"
            )

        latest = data.iloc[0].to_dict()

        latest = {
            str(key): normalize_value(value)
            for key, value in latest.items()
            if key != "_sort_time"
        }

        return jsonify({
            "status": "success",
            "transaction": latest
        })

    except Exception as error:
        print("\nLatest transaction error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/live-transactions", methods=["GET"])
def live_transactions():
    try:
        data = load_all_transactions()

        if data.empty:
            return jsonify({
                "status": "success",
                "transactions": []
            })

        if "timestamp" in data.columns:
            data["_sort_time"] = pd.to_datetime(
                data["timestamp"],
                errors="coerce"
            )

            data = data.sort_values(
                by="_sort_time",
                ascending=False,
                na_position="last"
            )

            data = data.drop(
                columns=["_sort_time"]
            )

        data = data.head(100)

        transactions = convert_records_to_json(
            data
        )

        return jsonify({
            "status": "success",
            "transactions": transactions
        })

    except Exception as error:
        print("\nTransaction history error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/export-transactions", methods=["GET"])
def export_transactions():
    try:
        data = load_all_transactions()

        if data.empty:
            return jsonify({
                "status": "error",
                "error": "No transactions available for export"
            }), 404

        data.to_csv(
            EXPORT_DATA_PATH,
            index=False
        )

        return send_file(
            EXPORT_DATA_PATH,
            as_attachment=True,
            download_name="fraud_transactions_export.csv",
            mimetype="text/csv"
        )

    except Exception as error:
        print("\nExport error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/alerts", methods=["GET"])
def alerts():
    try:
        data = load_all_transactions()

        if data.empty:
            return jsonify({
                "status": "success",
                "alerts": []
            })

        if "risk_level" not in data.columns:
            return jsonify({
                "status": "success",
                "alerts": []
            })

        risk_levels = data[
            "risk_level"
        ].astype(str).str.upper()

        if "decision" in data.columns:
            decisions = data[
                "decision"
            ].astype(str).str.upper()
        else:
            decisions = pd.Series(
                "",
                index=data.index
            )

        suspicious_data = data[
            risk_levels.isin(
                ["HIGH", "CRITICAL"]
            )
            | decisions.isin(
                ["BLOCK", "HOLD"]
            )
        ].copy()

        if "timestamp" in suspicious_data.columns:
            suspicious_data["_sort_time"] = pd.to_datetime(
                suspicious_data["timestamp"],
                errors="coerce"
            )

            suspicious_data = suspicious_data.sort_values(
                by="_sort_time",
                ascending=False,
                na_position="last"
            )

            suspicious_data = suspicious_data.drop(
                columns=["_sort_time"]
            )

        suspicious_data = suspicious_data.head(50)

        alerts_data = convert_records_to_json(
            suspicious_data
        )

        return jsonify({
            "status": "success",
            "alerts": alerts_data
        })

    except Exception as error:
        print("\nAlerts error:")
        traceback.print_exc()

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.errorhandler(404)
def page_not_found(error):
    return jsonify({
        "status": "error",
        "error": "Route not found"
    }), 404


if __name__ == "__main__":
    print("=" * 60)
    print("REAL-TIME FRAUD DETECTION SYSTEM")
    print("=" * 60)
    print("Server: http://127.0.0.1:5000")
    print("Health: http://127.0.0.1:5000/api/health")
    print("Transaction API: http://127.0.0.1:5000/api/transaction")
    print("History API: http://127.0.0.1:5000/api/live-transactions")
    print("Alerts API: http://127.0.0.1:5000/api/alerts")
    print("Analytics API: http://127.0.0.1:5000/api/analytics")
    print("Export API: http://127.0.0.1:5000/api/export-transactions")
    print("Dashboard: http://127.0.0.1:5000/dashboard.html")
    print("=" * 60)

    app.run(host="0.0.0.0", port=5000, debug=True)


Close
