import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface HealthData {
  status: string;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    adapter: string;
    status: string;
  };
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/health');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: HealthData = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to backend';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-title">
          <Activity size={20} />
          <span>Smart Campus (SmartTT)</span>
          <span className="brand-badge">Phase 1: Foundation</span>
        </div>
        <div>
          <button 
            onClick={fetchHealth} 
            disabled={loading}
            className="btn btn-secondary"
            title="Refresh system status"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Check Connection
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="card">
          <h2 className="card-title">System Infrastructure Status</h2>
          <p className="card-desc">
            Phase 1, Step 1 project scaffolding verification. The frontend communicates with the Express backend service via the Vite reverse proxy.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            {loading && !health && (
              <span className="status-pill" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                <span className="status-dot"></span>
                Checking backend service...
              </span>
            )}

            {!loading && health && (
              <span className="status-pill success">
                <CheckCircle2 size={14} />
                Backend Operational ({health.status})
              </span>
            )}

            {!loading && error && (
              <span className="status-pill danger">
                <XCircle size={14} />
                Connection Error ({error})
              </span>
            )}
          </div>

          {health && (
            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Service</span>
                <span className="meta-value">{health.service}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Environment</span>
                <span className="meta-value">{health.environment}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Database Adapter</span>
                <span className="meta-value">{health.database.adapter} ({health.database.status})</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Uptime</span>
                <span className="meta-value">{health.uptimeSeconds}s</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Server Time</span>
                <span className="meta-value">{new Date(health.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Version</span>
                <span className="meta-value">v{health.version}</span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '4px', fontSize: '0.875rem', color: '#9f1239' }}>
              Ensure the backend server is running on port 5000 (<code>npm run dev:backend</code>) and reachable through the proxy.
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        Smart Campus (SmartTT) &bull; Phase 1: Academic Master Data &amp; Authentication Foundation
      </footer>
    </div>
  );
}
export default App;
