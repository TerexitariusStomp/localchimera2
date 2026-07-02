#!/bin/bash
set -e

echo "=== Installing Concrete-ML with GPU support ==="
apt-get update && apt-get install -y libgmp-dev libmpfr-dev libmpc-dev cmake build-essential pkg-config git wget
pip install concrete-ml torch safetensors huggingface_hub numpy
pip uninstall -y concrete-python
pip install concrete-python==2.10.0 --extra-index-url https://pypi.zama.ai/gpu --trusted-host pypi.zama.ai

echo "=== Verifying GPU ==="
nvidia-smi
python -c "import concrete.compiler; print('GPU enabled:', concrete.compiler.check_gpu_enabled()); print('GPU available:', concrete.compiler.check_gpu_available())"

echo "=== Setup complete ==="
