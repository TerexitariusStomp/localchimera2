#!/bin/bash
echo "============================================"
echo "  localchimera Provider Status Dashboard"
echo "  Untrusted-safe: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium"
echo "  Self-managed:   BTFS, ZCN"
echo "============================================"
echo ""

echo "--- Self-Managed Storage Provider Processes ---"
ps aux | grep -E "btfs.*daemon|blobber" | grep -v grep | grep -v "status.sh" || echo "  No storage provider processes running"
echo ""

echo "--- QVAC Native Miner Processes ---"
ps aux | grep -E "chutes|routstr" | grep -v grep | grep -v "status.sh" || echo "  No QVAC miner processes running"
echo ""

echo "--- Docker Containers ---"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -E "yagna-provider|anon-relay|myst" || echo "  No proxy/relay containers running"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -10 || echo "  Docker: no containers or docker unavailable"
echo ""

echo "--- Key / Config Files (Self-Managed) ---"
[ -d ~/.btfs ] && echo "  BTFS: ~/.btfs repo exists"
[ -f ~/.zcn/config/0chain_blobber.yaml ] && echo "  ZCN: ~/.zcn/config/0chain_blobber.yaml exists"
[ -d ~/.local/share/golem ] && echo "  Golem: ~/.local/share/golem data dir exists"
echo ""

echo "============================================"
