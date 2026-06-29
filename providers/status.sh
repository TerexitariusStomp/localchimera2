#!/bin/bash
echo "============================================"
echo "  localchimera Provider Status Dashboard"
echo "  Untrusted-safe: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium, Casper, Earnidle, BTFS"
echo "============================================"
echo ""

echo "--- QVAC Native Miner Processes ---"
ps aux | grep -E "chutes|routstr|casper|earnidle" | grep -v grep | grep -v "status.sh" || echo "  No QVAC miner processes running"
echo ""

echo "--- Docker Containers ---"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -E "yagna-provider|anon-relay|myst|go-btfs" || echo "  No proxy/relay containers running"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -10 || echo "  Docker: no containers or docker unavailable"
echo ""

echo "--- Key / Config Files (Self-Managed) ---"
[ -d ~/.local/share/golem ] && echo "  Golem: ~/.local/share/golem data dir exists"
echo ""

echo "============================================"
