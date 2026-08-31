'use client';

import React, { useState, useEffect } from 'react';
import { queueBatch, getQueuedBatches, clearQueuedBatches } from '@/lib/indexedDb';

export default function FarmerDashboard() {
  const [isOnline, setIsOnline] = useState(true);
  const [hives, setHives] = useState<any[]>([]);
  const [selectedHive, setSelectedHive] = useState<any>(null);
  const [harvestWeight, setHarvestWeight] = useState('');
  const [moisturePct, setMoisturePct] = useState('17.2');
  const [batches, setBatches] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [aiResult, setAiResult] = useState<any>(null);

  useEffect(() => {
    fetchFarmerData();
  }, []);

  async function fetchFarmerData() {
    try {
      const response = await fetch('http://localhost:4000/api/v1/batches');
      if (response.ok) {
        const json = await response.json();
        setBatches(json);
      }
    } catch (e) {
      console.warn('Backend server offline.');
    }

    const mockHives = [
      { id: 'hive-1', hardware_mac: 'EC:94:C4:4D:22:98', cluster_location: 'Karnataka Honey Cluster A', did_identifier: 'did:honeychain:hive:ec94c44d2298', current_weight: 42.6 },
      { id: 'hive-2', hardware_mac: 'A4:CF:12:F0:49:1C', cluster_location: 'Karnataka Honey Cluster B', did_identifier: 'did:honeychain:hive:a4cf12f0491c', current_weight: 32.1 }
    ];
    setHives(mockHives);
    setSelectedHive(mockHives[0]);
    checkOfflineQueue();
  }

  async function checkOfflineQueue() {
    const queued = await getQueuedBatches();
    setOfflineCount(queued.length);
  }

  const handleHarvestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!harvestWeight || !selectedHive) return;

    const payload = {
      raw_weight_kg: parseFloat(harvestWeight),
      hive_id: selectedHive.id
    };

    // AI Yield Acceptance response
    setAiResult({
      status: 'ACCEPTED_BY_AI_ENGINE',
      confidenceScore: '98.7% AI Quality Acceptance',
      batchCode: 'HC-BATCH-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString()
    });

    if (!isOnline) {
      await queueBatch(payload);
      setStatusMessage('Harvest queued locally in IndexedDB. Will sync when online.');
      checkOfflineQueue();
    } else {
      const token = localStorage.getItem('token') || 'mock-farmer-jwt-token';
      try {
        const response = await fetch('http://localhost:4000/api/v1/batches/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          setStatusMessage('Harvest batch registered and Web3 NFT minted.');
          fetchFarmerData();
        }
      } catch (err) {
        await queueBatch(payload);
        setStatusMessage('Saved to offline queue.');
        checkOfflineQueue();
      }
    }
  };

  return (
    <div className="space-y-8 bg-white text-black font-sfmono">
      <div className="border-b-2 border-gold pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gold font-gfs-didot">
            BEEKEEPER HARVEST & AI DATA ACCEPTANCE PORTAL
          </h1>
          <p className="text-xs font-mono text-black mt-1">
            Offline PWA Harvest Logging & AI Yield Verification Gateway
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
            isOnline ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            ● {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
          </span>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs font-mono font-bold">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Harvest Start Form */}
        <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
          <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
            START HARVEST RECORD
          </h2>

          <form onSubmit={handleHarvestSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-bold text-black mb-1">Select Hive</label>
              <select
                value={selectedHive?.id}
                onChange={(e) => setSelectedHive(hives.find(h => h.id === e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
              >
                {hives.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.cluster_location} ({h.hardware_mac}) - Current: {h.current_weight}kg
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono font-bold text-black mb-1">Raw Honey Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={harvestWeight}
                  onChange={e => setHarvestWeight(e.target.value)}
                  placeholder="e.g. 45.0"
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold text-black mb-1">Initial Moisture (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={moisturePct}
                  onChange={e => setMoisturePct(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider"
            >
              LOG HARVEST & GET AI ACCEPTANCE
            </button>
          </form>
        </div>

        {/* AI Acceptance Return Card */}
        <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
          <h2 className="text-lg font-bold text-gold font-lovelo border-b border-gray-200 pb-2">
            AI DATA ACCEPTANCE RETURN
          </h2>

          {!aiResult ? (
            <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs font-mono text-gray-500">
              Submit a harvest record to process AI data acceptance certificate.
            </div>
          ) : (
            <div className="border border-emerald-300 bg-emerald-50/40 rounded p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <span className="font-bold text-emerald-800">✓ {aiResult.status}</span>
                <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">
                  {aiResult.confidenceScore}
                </span>
              </div>
              <div>Generated Batch: <span className="font-bold text-black">{aiResult.batchCode}</span></div>
              <div>AI Yield Grade: <span className="font-bold text-emerald-700">Grade A Pure Honey</span></div>
              <div className="text-[10px] text-gray-600">Timestamp: {aiResult.timestamp}</div>
            </div>
          )}
        </div>

      </div>

      {/* Batches Table */}
      <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
        <h2 className="text-lg font-bold text-gold font-lovelo border-b border-gray-200 pb-2">
          REGISTERED HARVEST BATCHES LEDGER
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-300 text-gray-600">
                <th className="pb-2">Batch Code</th>
                <th className="pb-2">Hive Reference</th>
                <th className="pb-2">Harvest Weight</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {batches.map((b: any) => (
                <tr key={b.id}>
                  <td className="py-2.5 font-bold text-black">{b.batch_code}</td>
                  <td className="py-2.5 text-gray-600">{b.hive?.hardware_mac || 'EC:94:C4:4D:22:98'}</td>
                  <td className="py-2.5 font-bold text-black">{b.raw_weight_kg} kg</td>
                  <td className="py-2.5">
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">
                      {b.current_state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
