"""
End-to-end test for the FHE LLM pipeline.

Tests the full flow:
  1. Start FHE LLM server (or connect to existing)
  2. Initialize FHE LLM client
  3. Send encrypted prompt
  4. Receive encrypted response
  5. Decrypt and display

Usage:
  python test_e2e.py --server-url http://localhost:8001
  python test_e2e.py --server-url http://localhost:8001 --speculative
"""

import sys
import time
import argparse

def test_server_health(server_url):
    """Check if the FHE server is running."""
    import requests
    try:
        resp = requests.get(f"{server_url}/health", timeout=5)
        data = resp.json()
        print(f"Server health: {data}")
        return data.get("status") in ("ok", "standby")
    except Exception as e:
        print(f"Server not available: {e}")
        return False


def test_session_lifecycle(server_url):
    """Test session creation and cleanup."""
    import requests

    # Create session
    resp = requests.post(f"{server_url}/session/init", json={})
    assert resp.status_code == 200, f"Session init failed: {resp.text}"
    session_id = resp.json()["session_id"]
    print(f"Session created: {session_id}")

    # List sessions
    resp = requests.get(f"{server_url}/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert sessions["active"] >= 1
    print(f"Active sessions: {sessions['active']}")

    # End session
    resp = requests.delete(f"{server_url}/session/{session_id}")
    assert resp.status_code == 200
    print(f"Session ended: {session_id}")

    return True


def test_forward_pass(server_url):
    """Test a single FHE forward pass."""
    import requests
    import numpy as np
    import base64

    # Create session
    resp = requests.post(f"{server_url}/session/init", json={})
    session_id = resp.json()["session_id"]

    # Create dummy encrypted embedding (placeholder)
    embedding = np.random.randn(1, 1, 1024).astype(np.float32)
    encrypted = embedding.tobytes()

    # Forward pass
    resp = requests.post(
        f"{server_url}/session/forward",
        json={
            "session_id": session_id,
            "encrypted_embedding": base64.b64encode(encrypted).decode(),
            "position": 0,
        },
    )
    assert resp.status_code == 200, f"Forward failed: {resp.text}"
    result = resp.json()
    print(f"Forward pass: {result['processing_time_ms']:.1f}ms")

    # Cleanup
    requests.delete(f"{server_url}/session/{session_id}")
    return True


def test_full_generation(server_url, prompt, max_tokens, speculative=False):
    """Test full FHE LLM generation."""
    from fhe_llm_client import FHELLMClient

    client = FHELLMClient(server_url)

    if speculative:
        result = client.generate_with_speculative(
            prompt,
            max_new_tokens=max_tokens,
            draft_k=4,
        )
    else:
        result = client.generate(
            prompt,
            max_new_tokens=max_tokens,
            system_prompt="You are a helpful AI assistant. Answer concisely.",
        )

    client.close()
    return result


def main():
    parser = argparse.ArgumentParser(description="FHE LLM End-to-End Test")
    parser.add_argument("--server-url", default="http://localhost:8001")
    parser.add_argument("--prompt", default="What is machine learning?")
    parser.add_argument("--max-tokens", type=int, default=50)
    parser.add_argument("--speculative", action="store_true")
    parser.add_argument("--skip-generation", action="store_true",
                        help="Skip generation test (only test server endpoints)")
    args = parser.parse_args()

    print("=" * 60)
    print("FHE LLM End-to-End Test")
    print("=" * 60)

    # Test 1: Server health
    print("\n1. Testing server health...")
    if not test_server_health(args.server_url):
        print("   ❌ Server not available. Start it with:")
        print(f"      python fhe_llm_server.py --port 8001")
        sys.exit(1)
    print("   ✅ Server is running")

    # Test 2: Session lifecycle
    print("\n2. Testing session lifecycle...")
    if test_session_lifecycle(args.server_url):
        print("   ✅ Session lifecycle works")
    else:
        print("   ❌ Session lifecycle failed")
        sys.exit(1)

    # Test 3: Forward pass
    print("\n3. Testing FHE forward pass...")
    if test_forward_pass(args.server_url):
        print("   ✅ Forward pass works")
    else:
        print("   ❌ Forward pass failed")
        sys.exit(1)

    if args.skip_generation:
        print("\n✅ All server tests passed (generation skipped)")
        return

    # Test 4: Full generation
    print(f"\n4. Testing full FHE generation...")
    print(f"   Prompt: {args.prompt}")
    print(f"   Max tokens: {args.max_tokens}")
    print(f"   Speculative: {args.speculative}")

    start_time = time.time()
    result = test_full_generation(
        args.server_url, args.prompt, args.max_tokens, args.speculative
    )
    total_time = time.time() - start_time

    print(f"\n{'=' * 60}")
    print(f"✅ End-to-End Test Complete")
    print(f"{'=' * 60}")
    print(f"  Total time: {total_time:.1f}s")
    print(f"  Response: {result}")


if __name__ == "__main__":
    main()
