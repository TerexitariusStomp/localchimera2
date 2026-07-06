FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04 AS cuda-runtime

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install binutils for the ld linker required by concrete-python to emit shared libraries
RUN apt-get update && apt-get install -y --no-install-recommends binutils && rm -rf /var/lib/apt/lists/*

# Copy CUDA 11.8 runtime libraries from the official NVIDIA image
COPY --from=cuda-runtime /usr/local/cuda /usr/local/cuda
ENV PATH=/usr/local/cuda/bin:$PATH
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Install torch from the CUDA 11.8 index first, then concrete-ml and other deps
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cu118 \
    torch==2.3.1+cu118 && \
    pip install --no-cache-dir \
    concrete-ml==1.9.0 \
    transformers \
    safetensors \
    huggingface-hub \
    fastapi \
    uvicorn \
    python-multipart && \
    pip uninstall -y concrete-python && \
    pip install --no-cache-dir --force-reinstall \
    --trusted-host pypi.zama.ai \
    --extra-index-url https://pypi.zama.ai/gpu \
    concrete-python==2.10.0

# Copy FHE model server artifacts. server.py supports either a single server.zip or
# a two-phase layout with phase1/server.zip and phase2/server.zip.
COPY server_files /app/server_files

# Copy inference server
COPY server.py /app/server.py

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
