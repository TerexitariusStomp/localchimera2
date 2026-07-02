"""
Pluggable FHE model training and compilation using Concrete-ML.

This module provides a pluggable interface for training and compiling
ML models to FHE circuits. The default model is a text classifier
(XGBoost on transformer embeddings) but the architecture supports
swapping in larger models as FHE hardware improves.

Usage:
    python model.py compile          # Train, compile, and save the FHE circuit
    python model.py compile --model tfidf  # Use TF-IDF features instead of transformer
    python model.py info             # Print circuit info
"""

import os
import sys
import pickle
import argparse
import numpy as np

from concrete.ml.deployment import FHEModelDev

MODEL_DIR = os.path.join(os.path.dirname(__file__), "deployment", "fhe_model")
DEPLOY_DIR = os.path.join(os.path.dirname(__file__), "deployment")

# ─── Default training data ──────────────────────────────────────────────────
# General-purpose text classification: intent/category detection
TRAINING_DATA = [
    ("how do i fix a bug in python", 0),
    ("explain how neural networks work", 0),
    ("what is the capital of france", 0),
    ("write a function to sort an array", 0),
    ("how to deploy a docker container", 0),
    ("explain quantum computing simply", 0),
    ("what is the meaning of life", 0),
    ("how to optimize database queries", 0),
    ("translate hello to spanish", 0),
    ("what is blockchain technology", 0),
    ("write a poem about the ocean", 1),
    ("create a story about a dragon", 1),
    ("write a song about rain", 1),
    ("compose a haiku about autumn", 1),
    ("generate a creative essay on time", 1),
    ("write a short fiction about space", 1),
    ("create a limerick about coding", 1),
    ("write a narrative about a journey", 1),
    ("generate a metaphor for friendship", 1),
    ("write a ballad about the mountains", 1),
    ("calculate 15 times 27", 2),
    ("what is the square root of 144", 2),
    ("solve for x: 2x + 5 = 15", 2),
    ("compute the factorial of 7", 2),
    ("what is 30 percent of 250", 2),
    ("find the derivative of x squared", 2),
    ("what is the area of a circle with radius 5", 2),
    ("solve the system: x + y = 10, x - y = 4", 2),
    ("compute 2 to the power of 10", 2),
    ("what is the integral of 3x dx", 2),
    ("write a python web scraper", 3),
    ("create a react component for a button", 3),
    ("implement binary search in javascript", 3),
    ("write a sql query to join two tables", 3),
    ("create a dockerfile for node.js", 3),
    ("write a regex to validate email", 3),
    ("implement a linked list in java", 3),
    ("create a git commit message template", 3),
    ("write a terraform script for s3", 3),
    ("implement quicksort in c++", 3),
]

CLASS_NAMES = ["question", "creative", "math", "code"]
N_BITS = 6


def get_tfidf_features(texts, max_features=128):
    """Simple TF-IDF vectorizer - no heavy dependencies."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    vectorizer = TfidfVectorizer(
        max_features=max_features,
        stop_words="english",
        ngram_range=(1, 2),
        sublinear_tf=True,
    )
    return vectorizer.fit_transform(texts).toarray(), vectorizer


def get_transformer_features(texts):
    """Use HuggingFace transformer embeddings - better quality but heavier."""
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    model_name = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = model.to(device)

    embeddings = []
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        tokens = tokenizer.batch_encode_plus(batch, return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            output = model(tokens["input_ids"].to(device), output_hidden_states=True)
            hidden = output[1][-1].mean(dim=1).detach().cpu().numpy()
            embeddings.append(hidden)

    return np.concatenate(embeddings, axis=0), None


def train_and_compile(model_type="tfidf"):
    os.makedirs(DEPLOY_DIR, exist_ok=True)

    texts = [t for t, _ in TRAINING_DATA]
    labels = np.array([l for _, l in TRAINING_DATA])
    n_classes = len(CLASS_NAMES)

    print(f"Dataset: {len(texts)} samples, {n_classes} classes")
    print(f"Classes: {CLASS_NAMES}")
    print(f"Class distribution: {np.bincount(labels)}")

    # Feature extraction
    if model_type == "transformer":
        print("Extracting transformer embeddings...")
        X, vectorizer = get_transformer_features(texts)
    else:
        print("Extracting TF-IDF features...")
        X, vectorizer = get_tfidf_features(texts)

    print(f"Feature shape: {X.shape}")

    # Train FHE model
    from concrete.ml.sklearn import XGBClassifier
    fhe_model = XGBClassifier(
        n_estimators=10,
        max_depth=4,
        n_bits=N_BITS,
        random_state=42,
    )

    print("Training FHE model...")
    fhe_model.fit(X, y=labels)

    print("Compiling to FHE circuit...")
    fhe_model.compile(X)

    accuracy = fhe_model.score(X, labels)
    print(f"Training accuracy (clear): {accuracy:.4f}")

    # Save vectorizer if TF-IDF
    if vectorizer is not None:
        with open(os.path.join(DEPLOY_DIR, "vectorizer.pkl"), "wb") as f:
            pickle.dump(vectorizer, f)

    # Save FHE model artifacts (client.zip + server.zip)
    print("Saving FHE model artifacts...")
    dev = FHEModelDev(fhe_model, MODEL_DIR)
    dev.save()

    # Save metadata
    import json
    metadata = {
        "model_type": model_type,
        "n_classes": n_classes,
        "class_names": CLASS_NAMES,
        "n_bits": N_BITS,
        "n_features": X.shape[1],
        "n_samples": len(texts),
        "training_accuracy": float(accuracy),
    }
    with open(os.path.join(DEPLOY_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nFHE model saved to {MODEL_DIR}")
    print(f"  client.zip: {os.path.join(MODEL_DIR, 'client.zip')}")
    print(f"  server.zip: {os.path.join(MODEL_DIR, 'server.zip')}")
    print_circuit_info()


def print_circuit_info():
    import json
    meta_path = os.path.join(DEPLOY_DIR, "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
        print(f"\nFHE Circuit Info:")
        print(f"  Model type: {meta['model_type']}")
        print(f"  Input bits: {meta['n_bits']}")
        print(f"  Features: {meta['n_features']}")
        print(f"  Classes: {meta['n_classes']} ({meta['class_names']})")
        print(f"  Training accuracy: {meta['training_accuracy']:.4f}")
        print(f"  Artifacts: {MODEL_DIR}")
    else:
        print("No model found. Run 'python model.py compile' first.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FHE model training and compilation")
    parser.add_argument("command", choices=["compile", "info"], help="Command to run")
    parser.add_argument("--model", choices=["tfidf", "transformer"], default="tfidf",
                        help="Feature extraction method (default: tfidf)")
    args = parser.parse_args()

    if args.command == "compile":
        train_and_compile(args.model)
    elif args.command == "info":
        print_circuit_info()
