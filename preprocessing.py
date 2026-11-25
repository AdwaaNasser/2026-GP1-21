"""
Preprocessing for the burnout models (shared by the regression and classification notebooks).
Dataset: Mental Health & Burnout in Tech Workers 2026 (Kaggle)
"""

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

DATA_PATH = "mental_health_burnout_tech_2026.csv"
TARGET = "burnout_score"
SEED = 42

# burnout_level is just the target split into groups -> leakage.
# phq9/gad7 are depression/anxiety scores measured at the same time as burnout,
# and the last two columns are results of burnout, not causes.
DROP_COLS = [
    "employee_id", "burnout_level",
    "phq9_score", "phq9_category", "gad7_score", "gad7_category",
    "seeks_mental_health_support", "job_change_intention",
]

GENDER_RECODE = {"Non-binary": "Prefer not to say"}


def load_data(path=DATA_PATH):
    df = pd.read_csv(path)
    df["gender"] = df["gender"].replace(GENDER_RECODE)
    return df


def fix_logic(X):
    # experience can't exceed working-age years, and tenure can't exceed experience
    X = X.copy()
    if {"age", "years_experience"}.issubset(X.columns):
        X["years_experience"] = X["years_experience"].clip(upper=X["age"] - 18)
    if {"years_experience", "years_at_company"}.issubset(X.columns):
        X["years_at_company"] = X["years_at_company"].clip(upper=X["years_experience"])
    return X


def clean_gender(X):
    # missing gender gets its own category instead of the most common one (Male),
    # and gender values outside the form's options are treated the same way
    X = X.copy()
    if "gender" in X.columns:
        X["gender"] = X["gender"].replace(GENDER_RECODE).replace("", None).fillna("Prefer not to say")
    return X


def load_and_split(path=DATA_PATH):
    df = load_data(path)
    X = df.drop(columns=DROP_COLS + [TARGET])
    y = df[TARGET]

    # no date column, so a random split is fine.
    # burnout_score is continuous, so we group it into 10 bins to stratify the split
    y_bins = pd.qcut(y, q=10, labels=False, duplicates="drop")
    return train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y_bins)


def build_preprocessor(X):
    num_cols = X.select_dtypes("number").columns.tolist()
    cat_cols = X.select_dtypes(exclude="number").columns.tolist()

    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    categorical = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    columns = ColumnTransformer([
        ("num", numeric, num_cols),
        ("cat", categorical, cat_cols),
    ])

    # fix the logic rules and gender values first, then impute / scale / encode
    return Pipeline([
        ("fix", FunctionTransformer(fix_logic)),
        ("gender", FunctionTransformer(clean_gender)),
        ("columns", columns),
    ])
