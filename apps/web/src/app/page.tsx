'use client';

import React, { useState } from 'react';

export default function GovernmentHoneyPortal() {
  const [activeTab, setActiveTab] = useState<'beekeeper' | 'government' | 'buyer'>('beekeeper');

  // Beekeeper State
  const [beekeeperToken, setBeekeeperToken] = useState<string | null>(null);
  const [beekeeperEmail, setBeekeeperEmail] = useState('farmer@honeychain.io');
  const [beekeeperPass, setBeekeeperPass] = useState('password123');
  
  // Harvest Start Form State
  const [hiveId, setHiveId] = useState('HIV-IND-8821');
  const [harvestWeight, setHarvestWeight] = useState('45.5');
  const [moisturePct, setMoisturePct] = useState('17.2');
  const [tempC, setTempC] = useState('28.5');
  const [humPct, setHumPct] = useState('65.0');
  const [harvestNotes, setHarvestNotes] = useState('First seasonal harvest from Acacia blossom cluster.');

  // AI Response State
  const [aiResponse, setAiResponse] = useState<any>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Government Auth State
  const [govEmail, setGovEmail] = useState('officer@kvic.gov.in');
  const [govPass, setGovPass] = useState('govsecret123');
  const [govToken, setGovToken] = useState<string | null>(null);

  // Buyer Public QR State
  const [qrBatchInput, setQrBatchInput] = useState('HC-BATCH-2026-X89');
  const [searchedBatch, setSearchedBatch] = useState<any>({
    batchCode: 'HC-BATCH-2026-X89',
    farmerName: 'Saikat Beekeeping Enterprise',
    location: 'Karnataka Honey Cluster, IN',
    did: 'did:honeychain:device:246F28ABCDEF',
    harvestDate: '2026-08-31',
    weightKg: 45.5,
    moisturePct: 17.2,
    hmfPpm: 12.4,
    c4Sugars: 0.0,
    aiStatus: 'ACCEPTED_BY_AI_ENGINE',
    aiConfidence: '98.8%',
    polygonTx: '0x8f9a2b1c4e7d3f9b0a1c2e3f4a5b6c7d8e9f0a1b',
    ipfsHash: 'QmX78y9a2b1c4e7d3f9b0a1c2e3f4a5b6c7d8e9f0a1b'
  });

  const handleBeekeeperLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setBeekeeperToken('mock_beekeeper_token_12345');
  };

  const handleGovernmentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setGovToken('mock_gov_token_67890');
  };

  const handleRecordHarvestStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAiProcessing(true);
    setAiResponse(null);

    // Simulate AI data verification & acceptance engine response
    setTimeout(() => {
      const generatedBatch = 'HC-BATCH-' + Math.floor(1000 + Math.random() * 9000);
      setAiResponse({
        status: 'ACCEPTED_BY_AI_ENGINE',
        acceptanceCode: 'AI-ACC-2026-OK',
        confidenceScore: '98.8% Quality Acceptance',
        batchCode: generatedBatch,
        suggestedGrade: 'Grade A Pure Organic Honey',
        zkProofHash: '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        ipfsMetadataHash: 'Qm' + Array.from({length: 44}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        timestamp: new Date().toISOString(),
        validationDetails: [
          'Moisture level 17.2% is within standard limit (< 20%)',
          'Telemetry temperature 28.5°C & weight 45.5kg verified by AI model',
          'Beekeeper DID signature validated'
        ]
      });
      setIsAiProcessing(false);
    }, 1500);
  };

  const handleSearchQr = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedBatch({
      batchCode: qrBatchInput.toUpperCase(),
      farmerName: 'Saikat Beekeeping Enterprise',
      location: 'Karnataka Honey Cluster, IN',
      did: 'did:honeychain:device:246F28ABCDEF',
      harvestDate: new Date().toISOString().split('T')[0],
      weightKg: parseFloat(harvestWeight) || 45.5,
      moisturePct: 17.2,
      hmfPpm: 12.4,
      c4Sugars: 0.0,
      aiStatus: 'ACCEPTED_BY_AI_ENGINE',
      aiConfidence: '98.8%',
      polygonTx: '0x8f9a2b1c4e7d3f9b0a1c2e3f4a5b6c7d8e9f0a1b',
      ipfsHash: 'QmX78y9a2b1c4e7d3f9b0a1c2e3f4a5b6c7d8e9f0a1b'
    });
  };

  return (
    <div className="space-y-8 bg-white text-black font-sfmono py-4">
      
      {/* Three Auth Selection Bar */}
      <div className="border border-gray-300 rounded-lg p-2 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="text-xs font-bold text-gray-700 px-3 uppercase tracking-wider">
          AUTHENTICATION PORTALS
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('beekeeper')}
            className={`px-4 py-2 text-xs font-mono font-bold rounded border transition ${
              activeTab === 'beekeeper'
                ? 'bg-gold border-amber-600 text-white shadow-sm'
                : 'bg-white border-gray-300 text-black hover:bg-gray-100'
            }`}
          >
            1. BEEKEEPER AUTH
          </button>
          <button
            onClick={() => setActiveTab('government')}
            className={`px-4 py-2 text-xs font-mono font-bold rounded border transition ${
              activeTab === 'government'
                ? 'bg-gold border-amber-600 text-white shadow-sm'
                : 'bg-white border-gray-300 text-black hover:bg-gray-100'
            }`}
          >
            2. GOVERNMENT AUTH
          </button>
          <button
            onClick={() => setActiveTab('buyer')}
            className={`px-4 py-2 text-xs font-mono font-bold rounded border transition ${
              activeTab === 'buyer'
                ? 'bg-gold border-amber-600 text-white shadow-sm'
                : 'bg-white border-gray-300 text-black hover:bg-gray-100'
            }`}
          >
            3. BUYER AUTH (PUBLIC QR)
          </button>
        </div>
      </div>

      {/* PORTAL 1: BEEKEEPER AUTH & AI HARVEST ACCEPTANCE */}
      {activeTab === 'beekeeper' && (
        <div className="space-y-6">
          <div className="border-b-2 border-gold pb-3">
            <h1 className="text-2xl font-extrabold text-gold font-gfs-didot">
              BEEKEEPER HARVEST RECORD & AI ACCEPTANCE PORTAL
            </h1>
            <p className="text-xs font-mono text-black mt-1">
              Record hive harvest initialization. Automatically processes AI yield forecasting & returns data acceptance certificate.
            </p>
          </div>

          {!beekeeperToken ? (
            <div className="max-w-md border border-gray-300 rounded-lg p-6 bg-white space-y-4">
              <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
                BEEKEEPER LOGIN
              </h2>
              <form onSubmit={handleBeekeeperLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-black mb-1">Beekeeper Email / ID</label>
                  <input
                    type="email"
                    value={beekeeperEmail}
                    onChange={e => setBeekeeperEmail(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-black mb-1">Password</label>
                  <input
                    type="password"
                    value={beekeeperPass}
                    onChange={e => setBeekeeperPass(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider"
                >
                  AUTHENTICATE AS BEEKEEPER
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Harvest Record Entry Form */}
              <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <h2 className="text-lg font-bold text-gold font-gfs-didot">
                    HARVEST RECORD INITIALIZATION
                  </h2>
                  <button
                    onClick={() => setBeekeeperToken(null)}
                    className="text-[11px] font-mono text-gray-500 hover:text-black underline"
                  >
                    Logout
                  </button>
                </div>

                <form onSubmit={handleRecordHarvestStart} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-black mb-1">Hive Reference ID</label>
                      <input
                        type="text"
                        value={hiveId}
                        onChange={e => setHiveId(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs font-mono text-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold text-black mb-1">Raw Harvest Weight (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={harvestWeight}
                        onChange={e => setHarvestWeight(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs font-mono text-black bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono text-black mb-1">Moisture (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={moisturePct}
                        onChange={e => setMoisturePct(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono text-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-black mb-1">Ambient Temp (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tempC}
                        onChange={e => setTempC(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono text-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-black mb-1">Humidity (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={humPct}
                        onChange={e => setHumPct(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono text-black bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-black mb-1">Harvest Notes / Remarks</label>
                    <textarea
                      rows={2}
                      value={harvestNotes}
                      onChange={e => setHarvestNotes(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs font-mono text-black bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAiProcessing}
                    className="w-full py-3 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider flex items-center justify-center gap-2"
                  >
                    {isAiProcessing ? 'AI VERIFYING HARVEST DATA...' : 'SUBMIT HARVEST & GET AI ACCEPTANCE'}
                  </button>
                </form>
              </div>

              {/* AI Acceptance Response Card */}
              <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-4">
                <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
                  AI DATA ACCEPTANCE RETURN
                </h2>

                {!aiResponse ? (
                  <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs font-mono text-gray-500">
                    Fill out the Harvest Record form and click "SUBMIT HARVEST" to receive AI data acceptance certificate.
                  </div>
                ) : (
                  <div className="space-y-4 border border-emerald-300 bg-emerald-50/30 rounded p-5">
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                      <span className="font-mono font-bold text-xs text-emerald-800">
                        ✓ {aiResponse.status}
                      </span>
                      <span className="bg-emerald-600 text-white text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                        {aiResponse.confidenceScore}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-gray-500 block text-[10px]">GENERATED BATCH CODE</span>
                        <span className="font-bold text-black">{aiResponse.batchCode}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">AI SUGGESTED GRADE</span>
                        <span className="font-bold text-emerald-700">{aiResponse.suggestedGrade}</span>
                      </div>
                    </div>

                    <div className="text-xs font-mono border-t border-gray-200 pt-2 space-y-1">
                      <div className="text-[11px] font-bold text-black">AI VALIDATION ATTESTATIONS:</div>
                      {aiResponse.validationDetails.map((detail: string, idx: number) => (
                        <div key={idx} className="text-[11px] text-gray-700 flex items-center gap-1.5">
                          <span className="text-emerald-600 font-bold">•</span> {detail}
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-200 pt-2 text-[10px] font-mono text-gray-600 space-y-1">
                      <div>ZK PROOF HASH: <span className="text-black font-bold">{aiResponse.zkProofHash.slice(0, 24)}...</span></div>
                      <div>IPFS METADATA: <span className="text-black font-bold">{aiResponse.ipfsMetadataHash.slice(0, 24)}...</span></div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* PORTAL 2: GOVERNMENT AUTH (STUB FOR NOW) */}
      {activeTab === 'government' && (
        <div className="space-y-6">
          <div className="border-b-2 border-gold pb-3">
            <h1 className="text-2xl font-extrabold text-gold font-gfs-didot">
              GOVERNMENT AUTHORITY PORTAL (MADHUKRANTI ATTESTATION)
            </h1>
            <p className="text-xs font-mono text-black mt-1">
              Official Ministry of MSME & KVIC Beekeeper Quality Registry Sync.
            </p>
          </div>

          {!govToken ? (
            <div className="max-w-md border border-gray-300 rounded-lg p-6 bg-white space-y-4">
              <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
                GOVERNMENT OFFICER AUTHENTICATION
              </h2>
              <form onSubmit={handleGovernmentLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-black mb-1">Government Official Email</label>
                  <input
                    type="email"
                    value={govEmail}
                    onChange={e => setGovEmail(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-black mb-1">Security Credentials</label>
                  <input
                    type="password"
                    value={govPass}
                    onChange={e => setGovPass(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider"
                >
                  AUTHENTICATE GOVERNMENT ACCESS
                </button>
              </form>
            </div>
          ) : (
            <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-6">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🏛️</div>
                  <div>
                    <h2 className="text-lg font-bold text-gold font-gfs-didot">
                      MADHUKRANTI REGISTRY SYNCHRONIZATION OVERVIEW
                    </h2>
                    <p className="text-xs font-mono text-gray-600">Government Portal Attestation Sync Active</p>
                  </div>
                </div>
                <button
                  onClick={() => setGovToken(null)}
                  className="text-xs font-mono text-gray-600 hover:text-black underline"
                >
                  Logout
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="border border-gray-200 rounded p-4 bg-gray-50">
                  <div className="text-gray-500 text-[10px]">TOTAL SYNCHRONIZED RECORDS</div>
                  <div className="text-2xl font-bold text-black mt-1">1,482 Batches</div>
                </div>
                <div className="border border-gray-200 rounded p-4 bg-gray-50">
                  <div className="text-gray-500 text-[10px]">REGISTERED BEEKEEPER DIDS</div>
                  <div className="text-2xl font-bold text-black mt-1">340 Certified</div>
                </div>
                <div className="border border-gray-200 rounded p-4 bg-gray-50">
                  <div className="text-gray-500 text-[10px]">COMPLIANCE STATUS</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">100% PASSED</div>
                </div>
              </div>

              <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2 font-mono text-xs">
                <div className="font-bold text-black border-b border-gray-300 pb-1">GOVERNMENT COMPLIANCE NOTE:</div>
                <p className="text-gray-700 text-[11px] leading-relaxed">
                  Government auth portal initialized according to MadhuKranti and KVIC attestation framework standards. All verified batches are automatically cross-referenced with Polygon smart contract state logs.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PORTAL 3: BUYER AUTH (PUBLIC QR VERIFICATION) */}
      {activeTab === 'buyer' && (
        <div className="space-y-6">
          <div className="border-b-2 border-gold pb-3">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-extrabold text-gold font-gfs-didot">
                PUBLIC BUYER QR VERIFICATION PORTAL
              </h1>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                PUBLIC AUTH (NO LOGIN REQUIRED)
              </span>
            </div>
            <p className="text-xs font-mono text-black mt-1">
              Public QR scanner & batch lookup. Inspect complete honey provenance, AI quality acceptance, and lab analysis.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Box: QR Resolver & Code Display */}
            <div className="border border-gray-300 rounded-lg p-6 bg-white space-y-6">
              <h2 className="text-lg font-bold text-gold font-gfs-didot border-b border-gray-200 pb-2">
                SCAN OR ENTER BATCH QR
              </h2>

              {/* Visual QR Code Display */}
              <div className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded bg-gray-50 space-y-3">
                <div className="w-36 h-36 border-2 border-black p-2 bg-white flex flex-col items-center justify-center text-center">
                  <div className="font-mono text-[9px] font-bold text-black border-b border-black w-full pb-1 mb-1">
                    HONEYCHAIN QR
                  </div>
                  <div className="text-3xl">🏁</div>
                  <div className="font-mono text-[8px] text-gray-700 font-bold mt-1">
                    {searchedBatch.batchCode}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-gray-600">Scan QR Code on Retail Jar</span>
              </div>

              <form onSubmit={handleSearchQr} className="space-y-3">
                <div>
                  <label className="block text-xs font-mono font-bold text-black mb-1">Honey Batch Code</label>
                  <input
                    type="text"
                    value={qrBatchInput}
                    onChange={e => setQrBatchInput(e.target.value)}
                    required
                    placeholder="HC-BATCH-2026-X89"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono text-black bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gold hover:opacity-90 text-white font-mono font-bold rounded text-xs tracking-wider"
                >
                  VERIFY BATCH VIA PUBLIC AUTH
                </button>
              </form>
            </div>

            {/* Right Box: Verified Quality & AI Acceptance Certificate */}
            <div className="lg:col-span-2 border border-gray-300 rounded-lg p-6 bg-white space-y-6">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-gold font-gfs-didot">
                    PUBLIC AUTHENTICITY CERTIFICATE
                  </h2>
                  <p className="text-xs font-mono text-black">Batch Code: <span className="font-bold">{searchedBatch.batchCode}</span></p>
                </div>
                <span className="bg-emerald-600 text-white text-xs font-mono font-bold px-3 py-1 rounded">
                  ✓ {searchedBatch.aiStatus}
                </span>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                <div className="border border-gray-200 rounded p-3.5 bg-gray-50">
                  <span className="text-[10px] text-gray-500 block">HARVEST WEIGHT</span>
                  <span className="text-lg font-bold text-black">{searchedBatch.weightKg} kg</span>
                </div>
                <div className="border border-gray-200 rounded p-3.5 bg-gray-50">
                  <span className="text-[10px] text-gray-500 block">LAB MOISTURE LEVEL</span>
                  <span className="text-lg font-bold text-black">{searchedBatch.moisturePct}%</span>
                </div>
                <div className="border border-gray-200 rounded p-3.5 bg-gray-50">
                  <span className="text-[10px] text-gray-500 block">C4 SUGAR PURITY</span>
                  <span className="text-lg font-bold text-emerald-700">0.0% (100% PURE)</span>
                </div>
              </div>

              {/* Origin Details */}
              <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2 font-mono text-xs">
                <div className="font-bold text-gold font-gfs-didot border-b border-gray-300 pb-1 text-sm">
                  BEEKEEPER ORIGIN & TRACEABILITY
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div>Beekeeper Enterprise: <span className="font-bold text-black">{searchedBatch.farmerName}</span></div>
                  <div>Harvest Location: <span className="font-bold text-black">{searchedBatch.location}</span></div>
                  <div>Beekeeper DID: <span className="font-bold text-black">{searchedBatch.did}</span></div>
                  <div>AI Verification Score: <span className="font-bold text-emerald-700">{searchedBatch.aiConfidence}</span></div>
                </div>
              </div>

              {/* Blockchain & IPFS Attestation */}
              <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2 font-mono text-xs">
                <div className="font-bold text-gold font-gfs-didot border-b border-gray-300 pb-1 text-sm">
                  WEB3 BLOCKCHAIN & IPFS ATTESTATION
                </div>
                <div className="space-y-1 text-[11px] text-gray-700">
                  <div>Polygon Amoy Tx: <span className="font-bold text-black">{searchedBatch.polygonTx}</span></div>
                  <div>IPFS Lab Audit Hash: <span className="font-bold text-black">{searchedBatch.ipfsHash}</span></div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
