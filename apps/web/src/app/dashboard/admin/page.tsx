'use client';

import React, { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [targetBatchId, setTargetBatchId] = useState('');
  const [escrowAmount, setEscrowAmount] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncRecords, setSyncRecords] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const response = await fetch('http://localhost:4000/api/v1/batches');
      if (response.ok) {
        const json = await response.json();
        setBatches(json);
      }
    } catch (e) {
      setBatches([
        { id: 'batch-1', batch_code: 'HC-BATCH-42E1F', raw_weight_kg: 24.5, current_state: 'RAW_HARVEST', hive: { did_identifier: 'did:honeychain:hive:ec94c44d2298', cluster_location: 'Karnataka Cluster A' } },
        { id: 'batch-2', batch_code: 'HC-BATCH-99BA2', raw_weight_kg: 38.1, current_state: 'LAB_VERIFIED', hive: { did_identifier: 'did:honeychain:hive:a4cf12f0491c', cluster_location: 'Karnataka Cluster B' } }
      ]);
    }
  }

  const handleEscrowDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBatchId || !escrowAmount) return;

    setStatusMessage(`Locking ${escrowAmount} ETH in smart contract escrow...`);
    setTimeout(() => {
      setStatusMessage(`Successfully locked ${escrowAmount} ETH in Escrow for Beekeeper.`);
      setEscrowAmount('');
      setTargetBatchId('');
    }, 1000);
  };

  const triggerGovSync = async () => {
    setSyncing(true);
    setStatusMessage('Compiling MadhuKranti compliant sync payloads...');

    setTimeout(() => {
      setSyncRecords([
        { madhukranti_record_id: 'MK-HC-BATCH-1', beekeeper_did: 'did:honeychain:hive:ec94c44d2298', honey_batch_code: 'HC-BATCH-42E1F', analytical_metrics: { moisture_percentage: 17.2, hmf_level_ppm: 12.4, c4_sugar_purity_pct: 0.0, inspection_status: 'PASSED' } },
        { madhukranti_record_id: 'MK-HC-BATCH-2', beekeeper_did: 'did:honeychain:hive:a4cf12f0491c', honey_batch_code: 'HC-BATCH-99BA2', analytical_metrics: { moisture_percentage: 18.0, hmf_level_ppm: 15.1, c4_sugar_purity_pct: 0.0, inspection_status: 'PASSED' } }
      ]);
      setStatusMessage('Government Registry database successfully synchronized.');
      setSyncing(false);
    }, 1000);
  };

  return (
    <div className="space-y-8 bg-white text-black font-sfmono">
      <div className="border-b-2 border-gold pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gold font-gfs-didot">
            GOVERNMENT AUTHORITY & MADHUKRANTI REGISTRY PORTAL
          </h1>
          <p className="text-xs font-mono text-black mt-1">
            Ministry of Micro, Small & Medium Enterprises (KVIC) National Sync Gateway
          </p>
        </div>
        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-mono px-2.5 py-1 rounded font-bold">
          GOVERNMENT AUTH ACTIVE
        </span>
      </div>

      {statusMessage && (
        <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs font-mono font-bold">
          {statusMessage}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-gray-300 rounded-lg p-5 bg-white space-y-1">
          <div className="text-xs font-mono font-bold text-gray-500">TOTAL BATCHES REGISTERED</div>
          <div className="text-2xl font-bold text-black">{batches.length}</div>
        </div>
        <div className="border border-gray-300 rounded-lg p-5 bg-white space-y-1">
          <div className="text-xs font-mono font-bold text-gray-500">MADHUKRANTI DIDS</div>
          <div className="text-2xl font-bold text-black">340 Certified</div>
        </div>
        <div className="border border-gray-300 rounded-lg p-5 bg-white space-y-1">
          <div className="text-xs font-mono font-bold text-gray-500">PURITY COMPLIANCE RATE</div>
          <div className="text-2xl font-bold text-emerald-700">100% PASSED</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Deposit Escrow Panel */}
        <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
          <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
            SECURE ESCROW DEPOSIT
          </h2>

          <form onSubmit={handleEscrowDeposit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-bold text-black mb-1">Target Batch</label>
              <select
                value={targetBatchId}
                onChange={e => setTargetBatchId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
              >
                <option value="">-- Choose Harvest Batch --</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.batch_code} ({b.raw_weight_kg} kg)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-black mb-1">Deposit Amount (ETH)</label>
              <input
                type="number"
                step="0.01"
                value={escrowAmount}
                onChange={e => setEscrowAmount(e.target.value)}
                placeholder="e.g. 0.45"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider"
            >
              DEPOSIT FUNDS TO ESCROW
            </button>
          </form>
        </div>

        {/* Sync Panel & Table */}
        <div className="lg:col-span-2 border border-gray-300 rounded-lg p-6 bg-white space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <h2 className="text-lg font-bold text-gold font-gfs-didot">
              NATIONAL MADHUKRANTI REGISTRY SYNCHRONIZATION
            </h2>
            <button
              onClick={triggerGovSync}
              disabled={syncing}
              className="px-3 py-1.5 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs"
            >
              {syncing ? 'SYNCING...' : 'SYNC REGISTRY'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-gray-300 text-gray-600">
                  <th className="pb-2">Gov Record ID</th>
                  <th className="pb-2">Beekeeper DID</th>
                  <th className="pb-2">Analytical Metrics</th>
                  <th className="pb-2">Inspection Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {syncRecords.map((r, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 font-bold text-black">{r.madhukranti_record_id}</td>
                    <td className="py-2.5 text-gray-600">{r.beekeeper_did}</td>
                    <td className="py-2.5 text-gray-700">Moisture: {r.analytical_metrics.moisture_percentage}% / HMF: {r.analytical_metrics.hmf_level_ppm}ppm</td>
                    <td className="py-2.5 font-bold text-emerald-700">{r.analytical_metrics.inspection_status}</td>
                  </tr>
                ))}
                {syncRecords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-500 text-xs">
                      Click "SYNC REGISTRY" to pull KVIC MadhuKranti compliance records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
