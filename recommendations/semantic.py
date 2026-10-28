"""Meaning-based match between the new task and each employee's past work.

Sentence Transformers turns each text into a vector of numbers. Texts with a
similar meaning get vectors that point the same way, so "Build the sales
dashboard" is close to "Created the monthly revenue report" even though they
share no words. The similarity is a number from 0 (unrelated) to 1 (same meaning).
"""
import logging

MODEL_NAME = 'all-MiniLM-L6-v2'  # small (~90 MB), English, no training needed

logger = logging.getLogger(__name__)
_model = None


def get_model():
    """Loads the model once, the first time it is needed, then reuses it."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def similarities(task_text, histories):
    """histories = {employee_id: text of their finished tasks}.
    Returns {employee_id: similarity 0..1}. Employees with no history are left out.
    Returns {} when there is nothing to compare or the model is not available,
    so the recommendation still works without this factor."""
    task_text = (task_text or '').strip()
    ids = [emp_id for emp_id, text in histories.items() if text.strip()]
    if not task_text or not ids:
        return {}
    try:
        model = get_model()
    except Exception:  # library not installed or model could not be downloaded
        logger.warning('Sentence Transformers is not available; ranking without it.')
        return {}
    vectors = model.encode([task_text] + [histories[i] for i in ids], normalize_embeddings=True)
    task_vector = vectors[0]
    return {emp_id: max(0.0, float(task_vector @ vector)) for emp_id, vector in zip(ids, vectors[1:])}