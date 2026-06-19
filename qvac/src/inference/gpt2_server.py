#!/usr/bin/env python3
"""
Lightweight GPT-2 inference server for QVAC Chimera.
Loads model once at startup; serves via HTTP on port 3005.
"""
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_NAME = "gpt2"
PORT = 3005

print(f"[inference] Loading {MODEL_NAME}...", flush=True)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
pipe = pipeline("text-generation", model=model, tokenizer=tokenizer)
print(f"[inference] {MODEL_NAME} ready on port {PORT}", flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress logs

    def do_POST(self):
        if self.path != "/infer":
            self._send(404, {"error": "unknown endpoint"})
            return
        try:
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len).decode('utf-8')
            data = json.loads(body)
            prompt = data.get("prompt", "Hello")
            max_len = data.get("max_length", 100)

            results = pipe(prompt, max_length=max_len, num_return_sequences=1, do_sample=True, temperature=0.7)
            output = results[0]["generated_text"]
            # Strip prompt repetition if present
            if output.lower().startswith(prompt.lower()):
                output = output[len(prompt):].strip()

            self._send(200, {"output": output, "model": MODEL_NAME, "success": True})
        except Exception as e:
            self._send(500, {"error": str(e), "success": False})

    def _send(self, code, obj):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[inference] Server running at http://127.0.0.1:{PORT}/infer", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
