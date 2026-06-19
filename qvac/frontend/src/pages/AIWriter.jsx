import React, { useState, useEffect } from 'react';

const API_BASE = (typeof window !== 'undefined' && (window.Capacitor || window.__TAURI__))
  ? 'http://localhost:3002/api'
  : (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? '/api'
    : 'http://localhost:3002/api';

export default function AIWriter() {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchStatus();
    fetchDocs();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/ai-status`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch (e) {
      setStatus({ available: false, error: e.message });
    }
  };

  const fetchDocs = async () => {
    try {
      const res = await fetch(`${API_BASE}/ai-docs`);
      const json = await res.json();
      if (json.success) setDocs(json.data);
    } catch (e) {
      // ignore
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/ai-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, title })
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        fetchDocs();
      } else {
        setError(json.error || 'Generation failed');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = () => {
    if (!status) return <span style={styles.badgeGray}>Checking...</span>;
    if (status.qvacAvailable) return <span style={styles.badgeGreen}>QVAC ({status.model})</span>;
    return <span style={styles.badgeOrange}>Demo Mode</span>;
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>AI Writer</h1>
      <p style={styles.sub}>Local AI running in QVAC. Generated docs are stored in Hypercore and synced via Pear P2P.</p>

      <div style={styles.statusBar}>
        <span style={styles.statusLabel}>Backend:</span>
        {statusBadge()}
        <button style={styles.refreshBtn} onClick={fetchStatus} disabled={loading}>Refresh</button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Title (optional)</label>
          <input
            style={styles.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Auto-generated from prompt"
            disabled={loading}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Prompt / Topic</label>
          <textarea
            style={styles.textarea}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Write a comprehensive guide on Python decorators..."
            rows={4}
            required
            disabled={loading}
          />
        </div>
        <button type="submit" style={styles.btn} disabled={loading}>
          {loading ? 'Generating...' : 'Generate & Save'}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      {result && (
        <div style={styles.result}>
          <h2 style={styles.resultTitle}>{result.title}</h2>
          <div style={styles.meta}>Source: {result.source} | Model: {result.model}</div>
          <pre style={styles.body}>{result.body}</pre>
        </div>
      )}

      {docs.length > 0 && (
        <div style={styles.docs}>
          <h2 style={styles.docsTitle}>Generated Docs ({docs.length})</h2>
          <ul style={styles.docList}>
            {docs.map(d => (
              <li key={d.id} style={styles.docItem}>
                <strong>{d.title}</strong>
                <span style={styles.docDate}>{new Date(d.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' },
  heading: { fontSize: 28, marginBottom: 8, color: '#f8fafc' },
  sub: { color: '#94a3b8', marginBottom: 20, fontSize: 14 },
  statusBar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 14px', background: '#12121c', borderRadius: 6, border: '1px solid #1e1e2e' },
  statusLabel: { color: '#64748b', fontSize: 13 },
  badgeGreen: { background: '#166534', color: '#86efac', padding: '3px 10px', borderRadius: 4, fontSize: 12 },
  badgeBlue: { background: '#1e3a8a', color: '#93c5fd', padding: '3px 10px', borderRadius: 4, fontSize: 12 },
  badgeOrange: { background: '#7c2d12', color: '#fdba74', padding: '3px 10px', borderRadius: 4, fontSize: 12 },
  badgeGray: { background: '#374151', color: '#d1d5db', padding: '3px 10px', borderRadius: 4, fontSize: 12 },
  refreshBtn: { marginLeft: 'auto', background: '#1e1e2e', color: '#94a3b8', border: '1px solid #2e2e3e', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  input: { background: '#0a0a14', border: '1px solid #1e1e2e', borderRadius: 6, padding: '10px 12px', color: '#e2e2e2', fontSize: 14 },
  textarea: { background: '#0a0a14', border: '1px solid #1e1e2e', borderRadius: 6, padding: '10px 12px', color: '#e2e2e2', fontSize: 14, resize: 'vertical' },
  btn: { background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 6, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' },
  error: { background: '#7f1d1d', color: '#fecaca', padding: 12, borderRadius: 6, marginTop: 16 },
  result: { marginTop: 20, background: '#12121c', border: '1px solid #1e1e2e', borderRadius: 8, padding: 20 },
  resultTitle: { margin: '0 0 8px', fontSize: 20, color: '#f8fafc' },
  meta: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  body: { background: '#0a0a14', padding: 16, borderRadius: 6, overflow: 'auto', fontSize: 14, lineHeight: 1.7, color: '#e2e2e2', whiteSpace: 'pre-wrap', wordWrap: 'break-word', border: '1px solid #1e1e2e' },
  docs: { marginTop: 24 },
  docsTitle: { fontSize: 18, marginBottom: 12, color: '#f8fafc' },
  docList: { listStyle: 'none', padding: 0, margin: 0 },
  docItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#12121c', border: '1px solid #1e1e2e', borderRadius: 6, marginBottom: 8, color: '#e2e2e2' },
  docDate: { color: '#64748b', fontSize: 12 }
};
