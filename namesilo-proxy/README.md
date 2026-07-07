# NameSilo Proxy

Tiny proxy for NameSilo API calls.

Cloudflare Workers are blocked by NameSilo's Cloudflare configuration, so this proxy runs on a VPS and forwards requests to NameSilo.

## Deploy

```bash
# On the VPS
sudo mkdir -p /opt/namesilo-proxy
sudo cp -r /path/to/namesilo-proxy/* /opt/namesilo-proxy/
cd /opt/namesilo-proxy
npm install
sudo cp namesilo-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now namesilo-proxy
```

Set `NAMESILO_KEY` in the service file or as a secret before starting.

## Usage

Cloudflare Worker calls:

```
https://proxy.example.com/api/namesilo/getAccountBalance
```

The proxy appends the key and forwards to `https://www.namesilo.com/api/<operation>`.
