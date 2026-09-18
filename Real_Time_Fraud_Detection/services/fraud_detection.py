import pandas as pd
import joblib
import os

MODEL_PATH = os.path.join("models", "fraud_model.pkl")

model = joblib.load(MODEL_PATH)


def detect_fraud(transaction_data):
    transaction_data = dict(transaction_data)

    input_data = pd.DataFrame([transaction_data])

    try:
        if hasattr(model, "feature_names_in_"):
            required_features = list(model.feature_names_in_)

            for feature in required_features:
                if feature not in input_data.columns:
                    input_data[feature] = 0

            input_data = input_data[required_features]

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(input_data)[0]

            if len(probabilities) > 1:
                model_probability = float(probabilities[1] * 100)
            else:
                model_probability = 0.0
        else:
            prediction = model.predict(input_data)[0]
            model_probability = 100.0 if int(prediction) == 1 else 0.0

    except Exception as error:
        print("Model prediction error:", error)
        model_probability = 0.0

    reasons = []
    rule_score = 0

    if int(transaction_data.get("new_device", 0)) == 1:
        reasons.append("New device detected")
        rule_score += 10

    if int(transaction_data.get("location_change", 0)) == 1:
        reasons.append("Unusual location change detected")
        rule_score += 10

    if int(transaction_data.get("vpn_used", 0)) == 1:
        reasons.append("VPN usage detected")
        rule_score += 10

    if int(transaction_data.get("international_transaction", 0)) == 1:
        reasons.append("International transaction detected")
        rule_score += 10

    if int(transaction_data.get("failed_attempts_24h", 0)) >= 3:
        reasons.append("Multiple failed attempts detected")
        rule_score += 15

    if int(transaction_data.get("transactions_last_1h", 0)) >= 5:
        reasons.append("High transaction frequency detected")
        rule_score += 15

    if float(transaction_data.get("ip_risk_score", 0)) >= 70:
        reasons.append("High IP risk score")
        rule_score += 15

    if float(transaction_data.get("transaction_amount", 0)) >= 50000:
        reasons.append("Unusually high transaction amount")
        rule_score += 15

    final_risk_score = min(100, max(model_probability, rule_score))

    if final_risk_score >= 70:
        risk_level = "HIGH"
        decision = "BLOCK"
        recommendation = "Block this transaction and perform manual verification."

    elif final_risk_score >= 40:
        risk_level = "MEDIUM"
        decision = "HOLD"
        recommendation = "Hold the transaction and request additional verification."

    else:
        risk_level = "LOW"
        decision = "APPROVE"
        recommendation = "Transaction appears low risk. Continue monitoring."

    if not reasons:
        reasons = ["No significant risk indicators detected"]

    return {
        "fraud_probability": round(model_probability, 2),
        "risk_score": round(final_risk_score, 2),
        "risk_level": risk_level,
        "decision": decision,
        "risk_reasons": reasons,
        "recommendation": recommendation
    }
