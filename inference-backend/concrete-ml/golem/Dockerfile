FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgmp-dev libmpfr-dev libmpc-dev \
    wget curl gnupg \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir concrete-ml safetensors huggingface_hub numpy

RUN --mount=type=cache,target=/root/.cache/pip \
    pip uninstall -y concrete-python && \
    pip install --no-cache-dir concrete-python==2.10.0 \
    --extra-index-url https://pypi.zama.ai/gpu \
    --trusted-host pypi.zama.ai

COPY golem_fhe_benchmark.py /golem/work/golem_fhe_benchmark.py

WORKDIR /golem/work
