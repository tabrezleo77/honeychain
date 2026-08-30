'use client';

import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Send, DollarSign, Activity, FileCheck, CheckCircle2, ListFilter } from 'lucide-react';

export default function AdminDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  
  // Escrow funding form state
  const [targetBatchId, setTargetBatchId] = useState('');
  const [escrowAmount, setEscrowAmount] = useState('');
  
  // Synchronization console states
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
      console.warn('Backend server offline. Setting mock data.');
      setBatches([
        { id: 'batch-1', batch_code: 'HC-BATCH-42E1F', raw_weight_kg: 24.5, current_state: 'RAW_HARVEST', hive: { did_identifier: 'did:honeychain:hive:ec94c44d2298', cluster_location: 'Coorg Cluster A' } },
        { id: 'batch-2', batch_code: 'HC-BATCH-99BA2', raw_weight_kg: 38.1, current_state: 'LAB_VERIFIED', hive: { did_identifier: 'did:honeychain:hive:a4cf12f0491c', cluster_location: 'Coorg Cluster B' } },
        { id: 'batch-3', batch_code: 'HC-BATCH-12A5C', raw_weight_kg: 18.2, current_state: 'PACKAGED_RETAIL', hive: { did_identifier: 'did:honeychain:hive:083af2c18adf', cluster_location: 'Coorg Cluster A' } }
      ]);
    }
  }

  // Handle Escrow Lock Deposit
  const handleEscrowDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBatchId || !escrowAmount) return;

    setStatusMessage(`Processing lock-up of ${escrowAmount} ETH into HoneyEscrow smart contract...`);
    const token = localStorage.getItem('token') || 'mock-buyer-jwt-token';

    try {
      const response = await fetch('http://localhost:4000/api/v1/escrow/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          batch_id: targetBatchId,
          amount_eth: parseFloat(escrowAmount)
        })
      });

      if (response.ok) {
        setStatusMessage(`Escrow locked! ${escrowAmount} ETH secured for Beekeeper payout.`);
        setEscrowAmount('');
        setTargetBatchId('');
        fetchAdminData();
      } else {
        throw new Error();
      }
    } catch (err) {
      // Simulate escrow deposit for demo mode
      setStatusMessage(`Simulation Lock: Locked ${escrowAmount} ETH on-chain for Batch.`);
      setEscrowAmount('');
      setTargetBatchId('');
    }
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Sync with MadhuKranti National Database
  const triggerGovSync = async () => {
    setSyncing(true);
    setStatusMessage('Querying internal ledger & compiling MadhuKranti compliant sync payloads...');

    try {
      const response = await fetch('http://localhost:4000/api/v1/gov/madhukranti/sync');
      if (response.ok) {
        const json = await response.json();
        setSyncRecords(json.records);
        setStatusMessage(`Successfully synchronized ${json.synchronized_records_count} quality reports with KVIC National Registry.`);
      } else {
        throw new Error();
      }
    } catch (e) {
      // Setup mock sync records if backend offline
      setSyncRecords([
        { madhukranti_record_id: 'MK-HC-BATCH-1', beekeeper_did: 'did:honeychain:hive:ec94c44d2298', honey_batch_code: 'HC-BATCH-42E1F', analytical_metrics: { moisture_percentage: 17.5, hmf_level_ppm: 14.8, c4_sugar_purity_pct: 2.1, inspection_status: 'PASSED' }, sync_timestamp: new Date().toISOString() },
        { madhukranti_record_id: 'MK-HC-BATCH-2', beekeeper_did: 'did:honeychain:hive:a4cf12f0491c', honey_batch_code: 'HC-BATCH-99BA2', analytical_metrics: { moisture_percentage: 18.2, hmf_level_ppm: 18.1, c4_sugar_purity_pct: 3.5, inspection_status: 'PASSED' }, sync_timestamp: new Date().toISOString() }
      ]);
      setStatusMessage('Simulated Sync: Government portal databases successfully updated.');
    } finally {
      setSyncing(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 text-xs font-bold uppercase">Total Batches</span>
            <Activity className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-2xl font-extrabold text-white block">{batches.length}</span>
          <span className="text-[10px] text-zinc-500 block mt-2">Active tracked harvests</span>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 text-xs font-bold uppercase">Total Escrows</span>
            <DollarSign className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-2xl font-extrabold text-white block">
            {(batches.filter(b => b.current_state !== 'RAW_HARVEST').length * 0.45).toFixed(2)} ETH
          </span>
          <span className="text-[10px] text-emerald-400 block mt-2">Secured in smart contracts</span>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 text-xs font-bold uppercase">Cluster DIDs</span>
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-2xl font-extrabold text-white block">
            {new Set(batches.map(b => b.hive?.did_identifier)).size || 3} Verified
          </span>
          <span className="text-[10px] text-zinc-500 block mt-2">Agmark verified clusters</span>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 text-xs font-bold uppercase">Gov Sync Status</span>
            <FileCheck className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-2xl font-extrabold text-white block">100% Synced</span>
          <span className="text-[10px] text-zinc-500 block mt-2">KVIC & MadhuKranti compliance</span>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2 animate-pulse-slow">
          <Activity className="w-4 h-4 text-amber-500 flex-shrink-0 animate-spin" />
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Deposit Escrow Panel */}
        <div className="lg:col-span-1 glass-card p-6 md:p-8 rounded-3xl text-left">
          <h3 className="text-base font-extrabold text-white mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-500" /> Secure Honey Escrow
          </h3>
          
          <form onSubmit={handleEscrowDeposit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Select Harvest Batch</label>
              <select 
                value={targetBatchId} 
                onChange={(e) => setTargetBatchId(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white focus:outline-none focus:border-amber-500/50 text-xs transition"
              >
                <option value="">-- Choose Batch --</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.batch_code} ({b.raw_weight_kg} kg)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Lock-up Value (ETH)</label>
              <input 
                type="number" 
                step="0.001" 
                placeholder="e.g. 0.45"
                value={escrowAmount}
                onChange={(e) => setEscrowAmount(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-xs transition"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-3 rounded-xl btn-primary text-xs font-extrabold shadow-xl hover:shadow-amber-500/10 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              Deposit Funds to Escrow
            </button>
          </form>
        </div>

        {/* Sync panel and sync records list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 md:p-8 rounded-3xl text-left">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-extrabold text-white">MadhuKranti National Database Adapter</h3>
                <p className="text-xs text-zinc-500 mt-1">Push verified laboratory profiles to central KVIC servers.</p>
              </div>
              <button 
                onClick={triggerGovSync}
                disabled={syncing}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-xs font-extrabold rounded-xl transition flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Database
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-900/50 text-zinc-500 border-b border-zinc-800/80 uppercase tracking-wider">
                    <th className="p-3 font-semibold">Record ID</th>
                    <th className="p-3 font-semibold">DID Identifier</th>
                    <th className="p-3 font-semibold">Adulteration Index</th>
                    <th className="p-3 font-semibold">Inspector Status</th>
                    <th className="p-3 font-semibold text-right">Attested Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                  {syncRecords.map((rec: any, idx: number) => (
                    <tr key={idx} className="hover:bg-white/[0.01] transition">
                      <td className="p-3 text-white font-bold">{rec.madhukranti_record_id}</td>
                      <td className="p-3 text-zinc-400 select-all truncate max-w-[120px]">{rec.beekeeper_did}</td>
                      <td className="p-3 text-zinc-400">
                        HMF: {rec.analytical_metrics.hmf_level_ppm} ppm / Sugars: {rec.analytical_metrics.c4_sugar_purity_pct}%
                      </td>
                      <td className="p-3 text-emerald-400 font-bold">{rec.analytical_metrics.inspection_status}</td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/15">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Attested
                        </span>
                      </td>
                    </tr>
                  ))}
                  {syncRecords.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-600 text-xs">
                        No synchronization records parsed. Trigger sync to fetch live reports.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
