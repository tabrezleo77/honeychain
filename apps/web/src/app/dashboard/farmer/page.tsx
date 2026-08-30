'use client';

import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { queueBatch, getQueuedBatches, clearQueuedBatches, initDb } from '@/lib/indexedDb';
import { Wifi, WifiOff, RefreshCw, PlusCircle, AlertTriangle, CloudSun, Check, Weight } from 'lucide-react';

export default function FarmerDashboard() {
  const [isOnline, setIsOnline] = useState(true);
  const [hives, setHives] = useState<any[]>([]);
  const [selectedHive, setSelectedHive] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  
  // Form states
  const [harvestWeight, setHarvestWeight] = useState('');
  const [activeTab, setActiveTab] = useState<'hives' | 'harvests'>('hives');
  const [batches, setBatches] = useState<any[]>([]);
  
  // Notification states
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);

  // Load Hives and Batches
  useEffect(() => {
    fetchFarmerData();
  }, []);

  useEffect(() => {
    if (selectedHive) {
      fetchTelemetry(selectedHive.id);
    }
  }, [selectedHive]);

  async function fetchFarmerData() {
    try {
      const response = await fetch('http://localhost:4000/api/v1/batches');
      if (response.ok) {
        const json = await response.json();
        setBatches(json);
      }
    } catch (e) {
      console.warn('Backend server offline. Showing mock batch records.');
    }

    // Default mock hives if empty
    const mockHives = [
      { id: 'hive-1', hardware_mac: 'EC:94:C4:4D:22:98', cluster_location: 'Coorg Cluster A', did_identifier: 'did:honeychain:hive:ec94c44d2298', current_weight: 42.6 },
      { id: 'hive-2', hardware_mac: 'A4:CF:12:F0:49:1C', cluster_location: 'Coorg Cluster B', did_identifier: 'did:honeychain:hive:a4cf12f0491c', current_weight: 32.1 },
      { id: 'hive-3', hardware_mac: '08:3A:F2:C1:8A:DF', cluster_location: 'Coorg Cluster A', did_identifier: 'did:honeychain:hive:083af2c18adf', current_weight: 18.2 }
    ];
    setHives(mockHives);
    setSelectedHive(mockHives[0]);
    checkOfflineQueue();
  }

  async function checkOfflineQueue() {
    const queued = await getQueuedBatches();
    setOfflineCount(queued.length);
  }

  async function fetchTelemetry(hiveId: string) {
    try {
      const res = await fetch(`http://localhost:4000/api/v1/hives/${hiveId}/telemetry`);
      if (res.ok) {
        const json = await res.json();
        setTelemetry(json);
      } else {
        throw new Error();
      }
    } catch (e) {
      // Generate mock weight logs for this hive
      const baseWeight = hiveId === 'hive-1' ? 42.6 : hiveId === 'hive-2' ? 32.1 : 18.2;
      const mockHistory = [];
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        mockHistory.push({
          timestamp: new Date(now - (15 - i) * 10 * 60000).toISOString(),
          weight_kg: parseFloat((baseWeight - 3 + (i * 0.2) + Math.random() * 0.1).toFixed(2)),
          temperature_c: parseFloat((29 + Math.random() * 2).toFixed(1)),
          humidity_pct: parseFloat((60 + Math.random() * 5).toFixed(1))
        });
      }
      setTelemetry(mockHistory);
    }
  }

  // Handle Offline Simulation Toggle
  const toggleNetworkMode = async () => {
    const nextMode = !isOnline;
    setIsOnline(nextMode);
    if (nextMode) {
      setStatusMessage('Device back online. Synchronizing queues...');
      await syncOfflineQueue();
    } else {
      setStatusMessage('Connection lost. PWA switched to offline-first IndexedDB buffer.');
    }
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Sync Offline Queue
  const syncOfflineQueue = async () => {
    const queued = await getQueuedBatches();
    if (queued.length === 0) return;

    let successCount = 0;
    const token = localStorage.getItem('token') || 'mock-farmer-jwt-token';

    for (const batch of queued) {
      try {
        const response = await fetch('http://localhost:4000/api/v1/batches/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            raw_weight_kg: batch.raw_weight_kg,
            hive_id: batch.hive_id
          })
        });
        if (response.ok) {
          successCount++;
        }
      } catch (err) {
        console.error('Failed to sync offline record:', err);
      }
    }

    if (successCount > 0) {
      // Clear successfully synced items
      await clearQueuedBatches(queued.map(q => q.id));
      setStatusMessage(`Successfully synchronized ${successCount} offline harvest record(s) to ledger.`);
      fetchFarmerData();
    }
    checkOfflineQueue();
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Trigger Harvest submission
  const handleHarvestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!harvestWeight || !selectedHive) return;

    const payload = {
      raw_weight_kg: parseFloat(harvestWeight),
      hive_id: selectedHive.id
    };

    if (!isOnline) {
      // Store in IndexedDB
      await queueBatch(payload);
      setStatusMessage('Harvest queued locally in IndexedDB. Will sync when online.');
      checkOfflineQueue();
      setHarvestWeight('');
    } else {
      // Send directly to API
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
          setStatusMessage('Harvest batch successfully registered and NFT minted.');
          fetchFarmerData();
          setHarvestWeight('');
        } else {
          throw new Error();
        }
      } catch (err) {
        // Fallback to queue if API fails
        await queueBatch(payload);
        setStatusMessage('Network timeout. Harvest saved to offline queue.');
        checkOfflineQueue();
        setHarvestWeight('');
      }
    }
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Yield warning calculations (simulated XGBoost prediction)
  const currentWeight = selectedHive ? selectedHive.current_weight : 0;
  const isOptimal = currentWeight >= 40; // Over 40 kg is prime for harvest

  return (
    <div>
      {/* Network banner status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md mb-8 gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-rose-500 shadow-lg shadow-rose-500/30 animate-pulse'}`} />
          <div>
            <span className="font-bold text-sm text-white block">
              {isOnline ? 'PWA Online Mode' : 'PWA Offline Mode'}
            </span>
            <span className="text-xs text-zinc-500">
              {isOnline ? 'Connected to core blockchain middleware' : `${offlineCount} batch transactions buffered in IndexedDB`}
            </span>
          </div>
        </div>
        
        <button 
          onClick={toggleNetworkMode}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 justify-center ${
            isOnline ? 'bg-amber-500/10 text-amber-500 border border-amber-500/25 hover:bg-amber-500/20' : 'bg-emerald-500 text-black hover:bg-emerald-600'
          }`}
        >
          {isOnline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
          {isOnline ? 'Simulate Offline' : 'Re-connect Sync'}
        </button>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2 animate-pulse-slow">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-zinc-800 mb-8 text-sm">
        <button 
          onClick={() => setActiveTab('hives')}
          className={`pb-4 px-2 font-bold transition ${activeTab === 'hives' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Hive Telemetry & Harvest
        </button>
        <button 
          onClick={() => setActiveTab('harvests')}
          className={`pb-4 px-2 font-bold transition ${activeTab === 'harvests' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Active Batches Ledger ({batches.length})
        </button>
      </div>

      {activeTab === 'hives' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Hives List */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">My Active Hives</h3>
            {hives.map(hive => (
              <div 
                key={hive.id}
                onClick={() => setSelectedHive(hive)}
                className={`p-4 rounded-2xl cursor-pointer border transition ${
                  selectedHive?.id === hive.id 
                    ? 'bg-amber-500/5 border-amber-500/40 shadow-lg shadow-amber-500/5' 
                    : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-white text-sm">{hive.cluster_location}</h4>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">MAC: {hive.hardware_mac}</span>
                  </div>
                  <span className="px-2 py-1 rounded bg-white/5 text-amber-500 font-extrabold text-xs">
                    {hive.current_weight} kg
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Details and Live Chart */}
          {selectedHive && (
            <div className="lg:col-span-2 space-y-6">
              {/* Telemetry Chart */}
              <div className="glass-card p-6 rounded-3xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
                  <div>
                    <span className="text-xs text-amber-500 font-semibold uppercase">Real-Time Monitoring</span>
                    <h3 className="text-lg font-extrabold text-white mt-0.5">{selectedHive.cluster_location} ({selectedHive.hardware_mac})</h3>
                  </div>
                  
                  {/* ML Yield prediction alert */}
                  {isOptimal ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                      <CloudSun className="w-3.5 h-3.5" /> Harvest Ready (ML Optimal)
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                      <Weight className="w-3.5 h-3.5 animate-bounce" /> Under target: Optimal in ~14 days
                    </div>
                  )}
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={telemetry} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="farmerWeight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="timestamp" 
                        tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        stroke="#52525b"
                        fontSize={10}
                      />
                      <YAxis stroke="#52525b" fontSize={10} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                        labelFormatter={(label) => new Date(label).toLocaleString()}
                        formatter={(value: any) => [`${value} kg`, 'Hive Weight']}
                      />
                      <Area type="monotone" dataKey="weight_kg" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#farmerWeight)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Log Harvest Form */}
              <div className="glass-card p-6 rounded-3xl">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-amber-500" /> Log Harvest & Mint NFT
                </h3>
                
                <form onSubmit={handleHarvestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Raw Honey Extracted (kg)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="e.g. 24.50" 
                      value={harvestWeight}
                      onChange={(e) => setHarvestWeight(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 text-sm transition"
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="w-full py-3 rounded-xl btn-primary text-sm font-extrabold shadow-xl hover:shadow-amber-500/10 active:scale-[0.99] transition flex items-center justify-center gap-2"
                  >
                    {!isOnline && <WifiOff className="w-4 h-4 text-black" />}
                    {isOnline ? 'Register Harvest & Mint NFT' : 'Queue Harvest Locally Offline'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'harvests' && (
        <div className="glass-card rounded-3xl overflow-hidden border border-zinc-800">
          <div className="p-6 border-b border-zinc-800">
            <h3 className="text-base font-bold text-white">Registered Honey Batches</h3>
            <p className="text-xs text-zinc-500 mt-1">Real-time status of minted NFT batches on Polygon Amoy ledger.</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-900/40 text-zinc-500 text-xs border-b border-zinc-800 uppercase tracking-wider">
                  <th className="p-4 font-semibold">Batch Code</th>
                  <th className="p-4 font-semibold">Hive MAC</th>
                  <th className="p-4 font-semibold">Quantity</th>
                  <th className="p-4 font-semibold">Web3 NFT</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {batches.map((batch: any) => (
                  <tr key={batch.id} className="hover:bg-white/[0.02] transition">
                    <td className="p-4 font-bold text-white">{batch.batch_code}</td>
                    <td className="p-4 text-zinc-400 font-mono text-xs">{batch.hive?.hardware_mac || 'EC:94:C4:4D:22:98'}</td>
                    <td className="p-4 text-zinc-400">{batch.raw_weight_kg} kg</td>
                    <td className="p-4 text-zinc-400 font-mono text-xs">
                      {batch.nft_token_id ? `Token #${batch.nft_token_id}` : 'Pending Mint'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                        batch.current_state === 'LAB_VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        batch.current_state === 'PACKAGED_RETAIL' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {batch.current_state}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <a 
                        href={`/verify/${batch.id}`} 
                        className="text-xs text-amber-500 hover:text-amber-400 font-bold transition"
                      >
                        Track &rarr;
                      </a>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500 text-xs">
                      No honey batches registered yet. Log a harvest to mint your first Web3 token.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
