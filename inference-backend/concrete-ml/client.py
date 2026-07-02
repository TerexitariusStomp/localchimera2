"""
Concrete-ML FHE Client for the QVAC inference stack.

This client handles:
1. Downloading client artifacts (client.zip) from the FHE server
2. Generating FHE keys (evaluation keys)
3. Encrypting user input (text → features → encrypted)
4. Sending encrypted input to the server for FHE inference
5. Decrypting the server's encrypted response

Usage:
    from client import FHEClient
    client = FHEClient("http://localhost:8001")
    client.setup()  # Downloads client.zip, generates keys
    encrypted = client.encrypt("how do i write a python function")
    result = client.predict(encrypted)
    prediction = client.decrypt(result)
    print(f"Predicted class: {prediction}")
"""

import os
import base64
import pickle
import urllib.request
import json
import numpy as np

from concrete.ml.deployment import FHEModelClient


class FHEClient:
    """Client for encrypted inference with the Concrete-ML FHE server."""

    def __init__(self, server_url: str = "http://localhost:8001", model_dir: str = None):
        self.server_url = server_url
        self.model_dir = model_dir or os.path.join(os.path.dirname(__file__), "deployment", "fhe_model")
        self.fhe_client = None
        self.evaluation_keys = None
        self.vectorizer = None
        self.metadata = None
        self._ready = False

    def setup(self):
        """Initialize the client: download artifacts, generate keys."""
        # Download client.zip if not present
        client_zip = os.path.join(self.model_dir, "client.zip")
        if not os.path.exists(client_zip):
            os.makedirs(self.model_dir, exist_ok=True)
            print(f"Downloading client.zip from {self.server_url}...")
            urllib.request.urlretrieve(
                f"{self.server_url}/client.zip", client_zip
            )
            print(f"Saved to {client_zip}")

        # Load metadata
        meta_url = f"{self.server_url}/metadata"
        try:
            with urllib.request.urlopen(meta_url) as resp:
                self.metadata = json.loads(resp.read())
        except Exception:
            self.metadata = {}

        # Load vectorizer if available
        vectorizer_path = os.path.join(os.path.dirname(__file__), "deployment", "vectorizer.pkl")
        if os.path.exists(vectorizer_path):
            with open(vectorizer_path, "rb") as f:
                self.vectorizer = pickle.load(f)

        # Initialize FHE client
        self.fhe_client = FHEModelClient(self.model_dir)

        # Generate evaluation keys
        print("Generating FHE evaluation keys...")
        self.evaluation_keys = self.fhe_client.get_serialized_evaluation_keys()
        print(f"Keys generated ({len(self.evaluation_keys)} bytes)")

        self._ready = True

    def _text_to_features(self, text: str) -> np.ndarray:
        """Convert text to feature vector using the same vectorizer as training."""
        if self.vectorizer is not None:
            features = self.vectorizer.transform([text]).toarray()
        else:
            # Fallback: simple bag-of-words hash
            features = np.zeros((1, self.metadata.get("n_features", 128)), dtype=np.float32)
            words = text.lower().split()
            for word in words:
                idx = hash(word) % features.shape[1]
                features[0, idx] += 1.0
        return features

    def encrypt(self, text: str):
        """Encrypt a text prompt for FHE inference."""
        if not self._ready:
            self.setup()

        features = self._text_to_features(text)
        encrypted = self.fhe_client.quantize_encrypt_serialize(features)
        return encrypted

    def predict(self, encrypted_input):
        """Send encrypted input to the FHE server and get encrypted prediction."""
        if not self._ready:
            raise RuntimeError("Client not ready. Call setup() first.")

        encrypted_b64 = base64.b64encode(encrypted_input).decode()
        eval_key_b64 = base64.b64encode(self.evaluation_keys).decode()

        data = json.dumps({
            "encrypted_input": encrypted_b64,
            "evaluation_key": eval_key_b64,
        }).encode()

        req = urllib.request.Request(
            f"{self.server_url}/predict",
            data=data,
            headers={"Content-Type": "application/json"},
        )

        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())

        return base64.b64decode(result["encrypted_prediction"])

    def decrypt(self, encrypted_prediction):
        """Decrypt the server's encrypted prediction."""
        if not self._ready:
            raise RuntimeError("Client not ready. Call setup() first.")

        prediction = self.fhe_client.deserialize_decrypt_dequantize(encrypted_prediction)
        return prediction

    def predict_text(self, text: str):
        """Full flow: encrypt → server predict → decrypt."""
        encrypted = self.encrypt(text)
        encrypted_result = self.predict(encrypted)
        prediction = self.decrypt(encrypted_result)
        return prediction

    def get_class_name(self, class_idx: int) -> str:
        """Get human-readable class name."""
        if self.metadata and "class_names" in self.metadata:
            names = self.metadata["class_names"]
            if 0 <= class_idx < len(names):
                return names[class_idx]
        return f"class_{class_idx}"


if __name__ == "__main__":
    import sys

    server_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"

    client = FHEClient(server_url)
    client.setup()

    test_prompts = [
        "how do i write a python function",
        "write a poem about the ocean",
        "calculate 15 times 27",
        "write a react component for a button",
    ]

    print("\n--- FHE Inference Test ---")
    for prompt in test_prompts:
        prediction = client.predict_text(prompt)
        class_idx = int(np.argmax(prediction, axis=1)[0]) if prediction.ndim > 1 else int(np.argmax(prediction))
        class_name = client.get_class_name(class_idx)
        print(f"  Input:  {prompt}")
        print(f"  Class:  {class_name} (idx={class_idx})")
        print(f"  Probs:  {prediction}")
        print()
