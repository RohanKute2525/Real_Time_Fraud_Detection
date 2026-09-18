import pandas as pd
import joblib
import os

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score

df = pd.read_csv("data/raw/transactions.csv")

target = "is_fraud"

categorical_columns = [
    "currency",
    "payment_mode",
    "merchant_category",
    "transaction_city"
]

numeric_columns = [
    "transaction_amount",
    "transaction_hour",
    "new_device",
    "location_change",
    "failed_attempts_24h",
    "transactions_last_1h",
    "ip_risk_score",
    "vpn_used",
    "international_transaction"
]

feature_columns = categorical_columns + numeric_columns

X = df[feature_columns].copy()
y = pd.to_numeric(df[target], errors="coerce").fillna(0).astype(int)

# Clean categorical columns completely
for column in categorical_columns:
    X[column] = X[column].fillna("Unknown").astype(str)

# Clean numerical columns completely
for column in numeric_columns:
    X[column] = pd.to_numeric(X[column], errors="coerce")
    X[column] = X[column].fillna(0)

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(
        handle_unknown="ignore",
        dtype="float64"
    ))
])

numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="constant", fill_value=0))
])

preprocessor = ColumnTransformer([
    ("categorical", categorical_pipeline, categorical_columns),
    ("numeric", numeric_pipeline, numeric_columns)
])

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=15,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("model", model)
])

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

pipeline.fit(X_train, y_train)

predictions = pipeline.predict(X_test)
probabilities = pipeline.predict_proba(X_test)[:, 1]

print("\n========== MODEL RESULTS ==========")
print("ROC-AUC:", roc_auc_score(y_test, probabilities))

print("\nClassification Report:")
print(classification_report(
    y_test,
    predictions,
    zero_division=0
))

os.makedirs("models", exist_ok=True)

joblib.dump(
    pipeline,
    "models/fraud_model.pkl"
)

print("\nModel trained successfully!")
print("New model saved to: models/fraud_model.pkl")
