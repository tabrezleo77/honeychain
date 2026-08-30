'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Database, HardHat, Compass, FileSpreadsheet } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [batchId, setBatchId] = useState('');

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (batchId.trim()) {
      router.push(`/verify/${batchId.trim()}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 md:py-20 text-center">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-6 animate-pulse-slow">
        <ShieldCheck className="w-4 h-4" /> Blockchain-Verified Honey Provenance
      </div>

      {/* Main Title */}
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
        Secure Honey Quality with <span className="text-gradient">IoT & Web3 Escrows</span>
      </h1>
      
      <p className="max-w-2xl text-zinc-400 text-base md:text-lg mb-12">
        HoneyChain tracks beekeeping telemetry live, stores purity credentials on IPFS, mints dynamic state NFTs on Polygon, and auto-releases buyer payments via smart contract escrows.
      </p>

      {/* Public QR Resolver Form */}
      <form onSubmit={handleVerify} className="w-full max-w-md flex gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md mb-16 shadow-2xl">
        <input 
          type="text" 
          placeholder="Enter Batch ID (e.g. HC-BATCH-ABCD)" 
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          className="flex-grow bg-transparent text-sm text-white placeholder-zinc-500 px-4 focus:outline-none"
        />
        <button type="submit" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-black text-sm font-semibold hover:shadow-lg hover:shadow-amber-500/10 active:scale-95 transition">
          Verify Batch
        </button>
      </form>

      {/* Dashboard Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl text-left">
        {/* Farmer Dashboard */}
        <div 
          onClick={() => router.push('/dashboard/farmer')}
          className="glass-card p-6 rounded-2xl cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-6 group-hover:scale-110 transition duration-300">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Beekeeper PWA</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Live hive telemetry, ML yield warnings, offline harvest registration, and automatic IndexedDB queues.
            </p>
          </div>
          <span className="text-xs text-amber-500 font-semibold mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition duration-200">
            Open Farmer Dashboard &rarr;
          </span>
        </div>

        {/* Lab Inspector Dashboard */}
        <div 
          onClick={() => router.push('/dashboard/lab')}
          className="glass-card p-6 rounded-2xl cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-6 group-hover:scale-110 transition duration-300">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Lab Inspector Portal</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Analytical purity metrics (moisture, HMF, C4 sugar analysis), IPFS report binding, and NFT oracle triggers.
            </p>
          </div>
          <span className="text-xs text-amber-500 font-semibold mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition duration-200">
            Open Lab Portal &rarr;
          </span>
        </div>

        {/* Buyer & Admin Dashboard */}
        <div 
          onClick={() => router.push('/dashboard/admin')}
          className="glass-card p-6 rounded-2xl cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-6 group-hover:scale-110 transition duration-300">
              <HardHat className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Admin & Escrow Hub</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Deposit escrow funds, monitor hive clusters, run government portal mock synchronization, and review DIDs.
            </p>
          </div>
          <span className="text-xs text-amber-500 font-semibold mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition duration-200">
            Open Admin Portal &rarr;
          </span>
        </div>
      </div>

      {/* Govt Sync Attestation banner */}
      <div className="mt-20 inline-flex items-center gap-4 px-6 py-4 rounded-xl bg-zinc-900/40 border border-white/5 text-left text-xs text-zinc-400 max-w-lg">
        <FileSpreadsheet className="w-10 h-10 text-emerald-500 flex-shrink-0" />
        <div>
          <span className="font-bold text-white block mb-0.5">Government Compliance</span>
          Attested compliance adapter matching the Indian MadhuKranti National Beekeeper registry standards.
        </div>
      </div>
    </div>
  );
}
