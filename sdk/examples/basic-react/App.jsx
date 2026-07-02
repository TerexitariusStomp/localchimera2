import React from 'react';
import { ChimeraPrivyProvider } from '../../src/useChimera.js';
import MiningPanel from './MiningPanel';

/**
 * Example app integrating the Chimera SDK.
 * Wrap your app in <ChimeraPrivyProvider> and use the useChimera hook.
 * Wallet and earnings are managed on the Chimera dashboard.
 */
export default function App() {
  return (
    <ChimeraPrivyProvider>
      <div style={{
        minHeight: '100vh',
        background: '#030308',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}>
        <MiningPanel />
      </div>
    </ChimeraPrivyProvider>
  );
}
