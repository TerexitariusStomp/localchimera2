import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const NAMESILO_KEY = process.env.NAMESILO_KEY;
const API_BASE = 'https://www.namesilo.com/api';

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, keyConfigured: !!NAMESILO_KEY });
});

app.all('/api/namesilo/:operation', async (req, res) => {
  if (!NAMESILO_KEY) {
    return res.status(500).json({ success: false, error: 'NAMESILO_KEY not configured on proxy' });
  }

  const operation = req.params.operation;
  const params = { ...req.query, ...req.body };
  const query = new URLSearchParams({
    version: '1',
    type: 'json',
    key: NAMESILO_KEY,
    ...params,
  });

  const url = `${API_BASE}/${operation}?${query.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const text = await response.text();
    res.status(response.status).type('json').send(text);
  } catch (err) {
    res.status(502).json({ success: false, error: `Proxy failed: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`NameSilo proxy listening on port ${PORT}`);
});
