import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';

export function ScanEntryPage() {
  const { token } = useAuth();
  const [scanToken, setScanToken] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const mutation = useMutation({
    mutationFn: () => entryExitApi.scanEntry(token!, scanToken),
  });

  return (
    <div className="scan-layout">
      <section className="scan-camera-panel">
        <div className="scan-panel-header">
          <div>
            <h2>Camera Scanner</h2>
            <p className="muted">Use the device camera to scan the QR at the reception desk.</p>
          </div>
        </div>
        <div className="scan-camera-stage">
          <div className={cameraActive ? 'scan-camera-frame active' : 'scan-camera-frame'}>
            <div className="scan-target-box" />
          </div>
          <div className="scan-camera-actions">
            <button className="scan-light-button" type="button" onClick={() => setCameraActive(true)}>
              Open Camera Scanner
            </button>
            <button className="scan-dark-button" type="button" onClick={() => setCameraActive(false)}>
              Stop Camera
            </button>
          </div>
        </div>
      </section>

      <section className="scan-manual-panel">
        <div className="scan-manual-header">
          <div>
            <h2>Manual Token Entry</h2>
            <p className="muted">Use this if the camera is unavailable or the QR is damaged.</p>
          </div>
          <span className="scan-fallback-badge">Fallback</span>
        </div>

        <label>
          Pass Token
          <input value={scanToken} onChange={(event) => setScanToken(event.target.value)} placeholder="Paste or scan token here" />
        </label>

        <button className="scan-action-button entry" onClick={() => mutation.mutate()} disabled={!scanToken || mutation.isPending}>
          {mutation.isPending ? 'Validating Entry...' : 'Validate Entry'}
        </button>

        {mutation.isError ? (
          <StatusBanner tone="danger" message={mutation.error instanceof Error ? mutation.error.message : 'Entry scan failed.'} />
        ) : null}
        {mutation.data?.message ? <StatusBanner tone="success" message={mutation.data.message} /> : null}
      </section>
    </div>
  );
}
