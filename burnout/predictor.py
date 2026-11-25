"""Loads the burnout model once and gives it to the services.

The model and the files it needs are in burnout/ml:
  burnout_regression_model.joblib   the trained model with its preprocessing
  burnout_model_meta.json           feature names and categories
  burnout_predictor.py              runs the model and explains it with SHAP
preprocessing.py stays in the project root (next to manage.py): the joblib file
looks for it under exactly that name.
"""
import sys
from functools import lru_cache
from pathlib import Path

from django.conf import settings

ML_DIR = Path(__file__).resolve().parent / 'ml'


@lru_cache(maxsize=1)
def get_predictor():
    """The model, loaded the first time it is needed and kept in memory."""
    root = str(Path(settings.BASE_DIR))
    if root not in sys.path:
        sys.path.insert(0, root)            # so that `import preprocessing` works
    from .ml.burnout_predictor import BurnoutPredictor
    return BurnoutPredictor(
        model_path=str(ML_DIR / 'burnout_regression_model.joblib'),
        meta_path=str(ML_DIR / 'burnout_model_meta.json'),
    )
