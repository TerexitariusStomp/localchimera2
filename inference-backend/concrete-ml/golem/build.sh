#!/bin/bash
set -e
sudo docker build -t fhe-gpu-benchmark /home/user/CascadeProjects/localchimera/inference-backend/concrete-ml/golem/ 2>&1 | tail -n 30
exit ${PIPESTATUS[0]}
