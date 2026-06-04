# -*- coding: utf-8 -*-
"""
PreVis NLP Pipeline Service
============================
Flask microservice that performs explicit NLP preprocessing on user messages.
All chat is still handled by the LLM — this service enriches the prompt with
structured NLP analysis (intent, entities, processed tokens).

Pipeline stages:
  1. Tokenization        (NLTK word_tokenize)
  2. Normalization       (lowercase, punctuation removal)
  3. Stop Word Removal   (English)
  4. Stemming            (NLTK Porter for English)
  5. TF-IDF Vectorization(scikit-learn)
  6. Intent Classification(Multinomial Naive Bayes)
  7. Entity Extraction   (regex-based)

Usage:
    cd ml/
    python nlp_service.py
"""

import os
import re
import json
import string
import logging
from datetime import datetime

from thefuzz import process, fuzz

import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords as nltk_stopwords


from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline as SkPipeline

from flask import Flask, request, jsonify, render_template

# ─── Setup ────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Download NLTK data (one-time)
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAINING_DATA_PATH = os.path.join(BASE_DIR, "nlp_training_data.json")

# ─── Stop Words (English) ─────────────────────────────────────────────

ENGLISH_STOPWORDS = set(nltk_stopwords.words("english"))
# Keep words that are important for our domain even if they appear in stopword lists
KEEP_WORDS = {"no", "how", "what", "when", "which"}
ENGLISH_STOPWORDS -= KEEP_WORDS

# ─── Stemmers ────────────────────────────────────────────────────────

from nltk.stem import PorterStemmer
_porter_stemmer = PorterStemmer()


def stem_word(word: str) -> str:
    """Stem a single word using Porter (EN) stemmer."""
    return _porter_stemmer.stem(word)


# ─── Entity Extraction Patterns ──────────────────────────────────────

MACHINE_ID_PATTERN = re.compile(r"\bM-?(\d{1,2})\b", re.IGNORECASE)
SENSOR_MAP = {
    "temperature": "temperature", "temp": "temperature",
    "vibration": "vibration", "vib": "vibration",
    "pressure": "pressure",
    "rpm": "rpm",
    "power": "power",
}
SENSOR_PATTERN = re.compile(r"\b(" + "|".join(SENSOR_MAP.keys()) + r")\b", re.IGNORECASE)


def extract_entities(text: str) -> dict:
    """Extract machine IDs and sensor types from raw text."""
    entities = {}

    # Machine IDs
    machine_matches = MACHINE_ID_PATTERN.findall(text)
    if machine_matches:
        entities["machine_ids"] = [f"M-{int(m):02d}" for m in machine_matches]

    # Sensor types (with fuzzy matching)
    found_sensors = set()
    text_lower = text.lower()
    
    # Check exact regex first
    sensor_matches = SENSOR_PATTERN.findall(text_lower)
    for s in sensor_matches:
        found_sensors.add(SENSOR_MAP[s])
        
    # If no exact match, try fuzzy matching on the tokens
    if not found_sensors:
        tokens = word_tokenize(text_lower)
        choices = list(SENSOR_MAP.keys())
        for token in tokens:
            # Only fuzzy match longer words to avoid false positives on short stop words
            if len(token) > 3:
                best_match, score = process.extractOne(token, choices, scorer=fuzz.ratio)
                if score >= 80: # Confidence threshold
                    found_sensors.add(SENSOR_MAP[best_match])

    if found_sensors:
        entities["sensor_types"] = list(found_sensors)

    return entities


# ─── NLP Pipeline Class ──────────────────────────────────────────────

class NLPPipeline:
    """
    Full NLP pipeline with explicit stages:
      1. Tokenize  →  2. Normalize  →  3. Remove stop words
      4. Stem  →  5. TF-IDF  →  6. Classify intent  →  7. Extract entities
    """

    def __init__(self):
        self.classifier = None
        self.tfidf = None
        self.intent_labels = []
        self._trained = False

    # ── Training ──────────────────────────────────────────────────

    def train(self, data_path: str = TRAINING_DATA_PATH):
        """Train the intent classifier from the JSON training data."""
        logger.info(f"Loading training data from {data_path}")

        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        texts = []
        labels = []
        for intent_group in data["intents"]:
            intent = intent_group["intent"]
            for example in intent_group["examples"]:
                processed = self._preprocess(example)
                texts.append(processed)
                labels.append(intent)

        self.intent_labels = sorted(set(labels))

        # Build sklearn pipeline: TF-IDF → Multinomial Naive Bayes
        self.classifier = SkPipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 2),
                max_features=500,
                sublinear_tf=True,
            )),
            ("clf", MultinomialNB(alpha=0.1)),
        ])
        self.classifier.fit(texts, labels)
        self.tfidf = self.classifier.named_steps["tfidf"]
        self._trained = True

        logger.info(f"Classifier trained — {len(texts)} examples, {len(self.intent_labels)} intents")

    # ── Preprocessing (stages 1-4) ────────────────────────────────

    def _preprocess(self, text: str) -> str:
        """Run stages 1-4 and return a single preprocessed string."""
        tokens = self.tokenize(text)
        normalized = self.normalize(tokens)
        filtered = self.remove_stopwords(normalized)
        stemmed = self.stem(filtered)
        return " ".join(stemmed)

    @staticmethod
    def tokenize(text: str) -> list[str]:
        """Stage 1 — Tokenization using NLTK."""
        return word_tokenize(text)

    @staticmethod
    def normalize(tokens: list[str]) -> list[str]:
        """Stage 2 — Lowercase + remove punctuation tokens."""
        result = []
        for t in tokens:
            t_lower = t.lower().strip()
            # Keep machine IDs like M-03
            if re.match(r"m-?\d+", t_lower):
                result.append(t_lower)
            elif t_lower and t_lower not in string.punctuation:
                result.append(t_lower)
        return result

    @staticmethod
    def remove_stopwords(tokens: list[str]) -> list[str]:
        """Stage 3 — Remove English stop words."""
        return [t for t in tokens if t not in ENGLISH_STOPWORDS]

    @staticmethod
    def stem(tokens: list[str]) -> list[str]:
        """Stage 4 — Stem using Porter (EN) stemmer."""
        result = []
        for t in tokens:
            # Don't stem machine IDs or short tokens
            if re.match(r"m-?\d+", t) or len(t) <= 2:
                result.append(t)
            else:
                result.append(stem_word(t))
        return result

    # ── Full Analysis ─────────────────────────────────────────────

    def analyze(self, text: str) -> dict:
        """
        Run the complete pipeline and return structured results
        including debug information for every stage.
        """
        if not self._trained:
            raise RuntimeError("Pipeline not trained. Call train() first.")

        # Stage 1: Tokenization
        tokens = self.tokenize(text)

        # Stage 2: Normalization
        normalized = self.normalize(tokens)

        # Stage 3: Stop word removal
        after_stopwords = self.remove_stopwords(normalized)

        # Stage 4: Stemming
        after_stemming = self.stem(after_stopwords)

        # Stage 5: TF-IDF vectorization
        preprocessed_text = " ".join(after_stemming)
        tfidf_vector = self.tfidf.transform([preprocessed_text])
        feature_names = self.tfidf.get_feature_names_out()
        tfidf_scores = tfidf_vector.toarray()[0]
        # Get top features with non-zero scores
        nonzero_indices = tfidf_scores.nonzero()[0]
        tfidf_top = sorted(
            [(feature_names[i], round(float(tfidf_scores[i]), 4)) for i in nonzero_indices],
            key=lambda x: x[1],
            reverse=True,
        )[:10]

        # Stage 6: Intent classification
        intent = self.classifier.predict([preprocessed_text])[0]
        probabilities = self.classifier.predict_proba([preprocessed_text])[0]
        intent_scores = {
            label: round(float(prob), 4)
            for label, prob in zip(self.classifier.classes_, probabilities)
        }
        confidence = round(float(max(probabilities)), 4)

        # Stage 7: Entity extraction
        entities = extract_entities(text)

        return {
            "original": text,
            "pipeline": {
                "step_1_tokens": tokens,
                "step_2_normalized": normalized,
                "step_3_after_stopwords": after_stopwords,
                "step_4_after_stemming": after_stemming,
                "step_5_tfidf_top_features": tfidf_top,
                "step_6_intent": intent,
                "step_6_confidence": confidence,
                "step_6_all_scores": intent_scores,
                "step_7_entities": entities,
            },
            "intent": intent,
            "confidence": confidence,
            "entities": entities,
        }


# ─── Flask App ────────────────────────────────────────────────────────

app = Flask(__name__)
pipeline = NLPPipeline()
analysis_history = []


@app.route("/analyze", methods=["POST"])
def analyze():
    """Run NLP pipeline on a message and return full analysis."""
    body = request.get_json(force=True)
    message = body.get("message", "").strip()

    if not message:
        return jsonify({"error": "message is required"}), 400

    try:
        result = pipeline.analyze(message)
        
        # Add timestamp and store in history
        result["timestamp"] = datetime.now().isoformat()
        analysis_history.append(result)
        # Keep only the last 50 items
        if len(analysis_history) > 50:
            analysis_history.pop(0)
            
        return jsonify(result)
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "trained": pipeline._trained,
        "intents": pipeline.intent_labels,
    })

@app.route("/", methods=["GET"])
def index():
    """Render the NLP debug interface."""
    return render_template("index.html")

@app.route("/history", methods=["GET"])
def history():
    """Return the recent NLP analysis logs."""
    return jsonify({"history": analysis_history})

# ─── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pipeline.train()
    logger.info("Starting NLP service on port 5001...")
    app.run(host="0.0.0.0", port=5001, debug=False)
