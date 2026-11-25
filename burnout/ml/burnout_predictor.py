"""
Loads the saved burnout regression model and explains each prediction with SHAP.
Used by the Bayyinah backend.
"""

import json

import joblib
import numpy as np
import pandas as pd
import shap

# same cut-offs as burnout_level in the dataset
LEVELS = [(3.5, "Low"), (5.5, "Moderate"), (7.0, "High")]


def score_to_level(score):
    for upper, name in LEVELS:
        if score <= upper:
            return name
    return "Severe"


class BurnoutPredictor:
    def __init__(self, model_path="burnout_regression_model.joblib",
                 meta_path="burnout_model_meta.json"):
        pipeline = joblib.load(model_path)
        with open(meta_path) as f:
            self.meta = json.load(f)

        self.prep = pipeline.named_steps["prep"]
        self.model = pipeline.named_steps["model"]
        self.columns = self.meta["features"]
        self.explainer = shap.TreeExplainer(self.model)

        # map every one-hot column back to its original feature so SHAP values can be summed per feature
        ct = self.prep.named_steps["columns"]
        num_cols = ct.transformers_[0][2]
        cat_cols = ct.transformers_[1][2]
        ohe = ct.named_transformers_["cat"].named_steps["onehot"]
        self.original = list(num_cols) + [c for c, cats in zip(cat_cols, ohe.categories_) for _ in cats]

    def predict(self, employee, top_n=3):
        # missing fields are filled by the pipeline's imputers (less accurate, but still works)
        row = pd.DataFrame([{c: employee.get(c, np.nan) for c in self.columns}])
        missing = [c for c in self.columns if c not in employee]

        xt = self.prep.transform(row)
        score = float(np.clip(self.model.predict(xt)[0], 0, 10))

        explanation = self.explainer(xt)
        impact = pd.Series(explanation.values[0]).groupby(self.original).sum()
        top = impact.reindex(impact.abs().sort_values(ascending=False).index).head(top_n)

        factors = []
        for feature, value in top.items():
            raw = employee.get(feature)
            factors.append({
                "feature": feature,
                "value": raw.item() if hasattr(raw, "item") else raw,
                "impact": round(float(value), 2),
                "effect": "increases" if value > 0 else "decreases",
            })

        return {
            "burnout_score": round(score, 2),
            "burnout_level": score_to_level(score),
            "average_score": round(float(explanation.base_values[0]), 2),
            "top_factors": factors,
            "missing_fields": missing,
        }
