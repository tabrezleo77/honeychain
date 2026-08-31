'use client';

import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:4000/api/v1';

export default function IoTDevicesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  // Auth state
  const [email, setEmail] = useState('saikat@example.com');
  const [password, setPassword] = useState('SecurePassword123!');
  const [username, setUsername] = useState('saikat');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // Device state
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [liveTelemetry, setLiveTelemetry] = useState<any>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [statsRange, setStatsRange] = useState<string>('24h');
  const [alerts, setAlerts] = useState<any[]>([]);

  // Modals & forms
  const [showRegModal, setShowRegModal] = useState(false);
  const [newDevName, setNewDevName] = useState('ESP32-Smart-Scale-DHT11');
  const [newDevMac, setNewDevMac] = useState('24:6F:28:AB:CD:EF');
  const [newDevLoc, setNewDevLoc] = useState('Lab Workbench');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Alert config form
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMetric, setAlertMetric] = useState('weightGrams');
  const [alertCond, setAlertCond] = useState('LESS_THAN');
  const [alertThresh, setAlertThresh] = useState('100');

  // Simulation state
  const [simTemp, setSimTemp] = useState('28.5');
  const [simHum, setSimHum] = useState('65.2');
  const [simWeight, setSimWeight] = useState('1024.5');
  const [simSuccess, setSimSuccess] = useState('');

  useEffect(() => {
    const savedToken = localStorage.getItem('hc_iot_token');
    const savedUser = localStorage.getItem('hc_iot_user');
    if (savedToken) {
      setToken(savedToken);
      if (savedUser) setUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchDevices();
    }
  }, [token]);

  useEffect(() => {
    if (token && selectedDeviceId) {
      fetchDeviceDetails(selectedDeviceId);
    }
  }, [token, selectedDeviceId, statsRange]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const endpoint = isRegistering ? '/auth/register' : '/auth/login';
      const body = isRegistering 
        ? { username, email, password }
        : { email, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!data.success) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      const authToken = data.data?.token || data.token;
      const userData = data.user || data.data;

      setToken(authToken);
      setUser(userData);
      localStorage.setItem('hc_iot_token', authToken);
      localStorage.setItem('hc_iot_user', JSON.stringify(userData));
    } catch (err: any) {
      setAuthError('Connection failed: Ensure Backend API running on port 4000');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setDevices([]);
    setSelectedDeviceId('');
    localStorage.removeItem('hc_iot_token');
    localStorage.removeItem('hc_iot_user');
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDevices(data.data || []);
        if (data.data.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(data.data[0].deviceId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const fetchDeviceDetails = async (devId: string) => {
    try {
      // 1. Live Telemetry
      const liveRes = await fetch(`${API_BASE}/telemetry/live?deviceId=${devId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const liveData = await liveRes.json();
      if (liveData.success) setLiveTelemetry(liveData.data);

      // 2. History Logs
      const histRes = await fetch(`${API_BASE}/telemetry/history?deviceId=${devId}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const histData = await histRes.json();
      if (histData.success) setHistoryLogs(histData.data);

      // 3. Stats
      const statsRes = await fetch(`${API_BASE}/telemetry/stats?deviceId=${devId}&range=${statsRange}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.data);

      // 4. Alerts
      const alertsRes = await fetch(`${API_BASE}/alerts?deviceId=${devId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const alertsData = await alertsRes.json();
      if (alertsData.success) setAlerts(alertsData.data);
    } catch (err) {
      console.error('Error fetching device data', err);
    }
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceName: newDevName,
          macAddress: newDevMac,
          location: newDevLoc
        })
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedKey(data.data.deviceApiKey);
        fetchDevices();
        setSelectedDeviceId(data.data.deviceId);
      } else {
        alert(data.error || 'Failed to register device');
      }
    } catch (err: any) {
      alert('Error registering device');
    }
  };

  const handlePushSimulatedTelemetry = async () => {
    const dev = devices.find(d => d.deviceId === selectedDeviceId);
    const key = generatedKey || 'esp_key_8f3a1290bc414a1f8d';

    try {
      const res = await fetch(`${API_BASE}/telemetry`, {
        method: 'POST',
        headers: {
          'X-Device-API-Key': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          temperature: parseFloat(simTemp),
          humidity: parseFloat(simHum),
          weightGrams: parseFloat(simWeight),
          timestamp: Math.floor(Date.now() / 1000)
        })
      });
      const data = await res.json();
      if (data.success) {
        setSimSuccess('✅ Telemetry Ingested Successfully!');
        setTimeout(() => setSimSuccess(''), 3000);
        fetchDeviceDetails(selectedDeviceId);
      } else {
        alert(data.error || 'Failed to ingest telemetry');
      }
    } catch (err) {
      alert('Failed to connect to backend server');
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/alerts/config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          metric: alertMetric,
          condition: alertCond,
          threshold: parseFloat(alertThresh),
          notifyEmail: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowAlertModal(false);
        fetchDeviceDetails(selectedDeviceId);
      } else {
        alert(data.error || 'Failed to configure alert');
      }
    } catch (err) {
      alert('Failed to set threshold alert');
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 bg-zinc-900/90 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center font-bold text-black text-2xl shadow-lg shadow-amber-500/20">
            📡
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">IoT Portal Auth</h1>
            <p className="text-xs text-zinc-400">ESP32 Telemetry & Smart Scale Gateway</p>
          </div>
        </div>

        {authError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {authError}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20"
          >
            {isRegistering ? 'Register Account' : 'Sign In to IoT Portal'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            {isRegistering ? 'Already registered? Log In' : 'Need an IoT account? Register'}
          </button>
        </div>
      </div>
    );
  }

  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId);

  return (
    <div className="space-y-8">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center font-bold text-black text-2xl shadow-lg shadow-amber-500/20">
            📡
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">IoT Smart Scale Dashboard</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Live Gateway
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Logged in as <span className="text-amber-400 font-semibold">{user?.username || user?.email}</span> ({user?.userId || 'usr_demo'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRegModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            <span>+</span> Register ESP32 Device
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl text-xs border border-white/10 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Device Selector & Details */}
        <div className="space-y-6">
          {/* Registered Devices List */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Your Devices ({devices.length})</span>
              <button onClick={fetchDevices} className="text-xs text-amber-400 hover:underline">Refresh</button>
            </h2>

            {devices.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No registered devices yet. Click "+ Register ESP32 Device" to add your smart scale board.
              </div>
            ) : (
              <div className="space-y-3">
                {devices.map((dev) => (
                  <div
                    key={dev.deviceId}
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selectedDeviceId === dev.deviceId
                        ? 'bg-amber-500/10 border-amber-500/50 text-white'
                        : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-white">{dev.deviceName}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        dev.status === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        ● {dev.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-mono text-zinc-400 flex items-center justify-between">
                      <span>MAC: {dev.macAddress}</span>
                      <span className="text-[10px] text-zinc-500">ID: {dev.deviceId.slice(0, 12)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ESP32 Telemetry Simulation Panel */}
          {selectedDevice && (
            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">ESP32 Hardware Simulator</h2>
                <span className="text-[10px] font-mono text-amber-400">X-Device-API-Key</span>
              </div>

              {simSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                  {simSuccess}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simTemp}
                    onChange={e => setSimTemp(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Humidity (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simHum}
                    onChange={e => setSimHum(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Weight (g)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={simWeight}
                    onChange={e => setSimWeight(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <button
                onClick={handlePushSimulatedTelemetry}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2"
              >
                ⚡ Push Telemetry Payload to /api/v1/telemetry
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Live Telemetry Gauges & Analytics */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Live Telemetry Gauges Card */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Live Sensor Dashboard</h2>
                <p className="text-xs text-zinc-400">Real-time readings for <span className="text-amber-400">{selectedDevice?.deviceName || 'Selected Device'}</span></p>
              </div>
              {liveTelemetry?.recordedAt && (
                <div className="text-[11px] text-zinc-400 font-mono">
                  Updated: {new Date(liveTelemetry.recordedAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Temperature Gauge */}
              <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-500/30 transition">
                <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  <span>DHT11 Temperature</span>
                  <span className="text-red-400">🌡️</span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">
                    {liveTelemetry?.temperature !== undefined ? liveTelemetry.temperature : '--'}
                  </span>
                  <span className="text-sm font-bold text-amber-500">°C</span>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500">Normal Range: 15.0°C - 35.0°C</div>
              </div>

              {/* Humidity Gauge */}
              <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-500/30 transition">
                <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  <span>DHT11 Humidity</span>
                  <span className="text-blue-400">💧</span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">
                    {liveTelemetry?.humidity !== undefined ? liveTelemetry.humidity : '--'}
                  </span>
                  <span className="text-sm font-bold text-blue-400">%</span>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500">Optimal Hive: 55% - 75%</div>
              </div>

              {/* Scale Weight Gauge */}
              <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-500/30 transition">
                <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                  <span>HX711 Honey Scale Weight</span>
                  <span className="text-amber-400">⚖️</span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">
                    {liveTelemetry?.weightGrams !== undefined ? liveTelemetry.weightGrams : '--'}
                  </span>
                  <span className="text-sm font-bold text-amber-400">g</span>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500">
                  Equivalent: {liveTelemetry?.weightGrams ? (liveTelemetry.weightGrams / 1000).toFixed(3) : 0} kg
                </div>
              </div>
            </div>
          </div>

          {/* 24h Aggregated Statistics */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Aggregated Sensor Statistics</h2>
              <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1 border border-white/5">
                {['1h', '24h', '7d'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setStatsRange(r)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                      statsRange === r ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {stats ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-zinc-800/30 border border-white/5">
                  <div className="text-xs font-semibold text-red-400 mb-2">Temperature (°C)</div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div><span className="text-zinc-500 block text-[10px]">MIN</span><span className="font-bold text-white">{stats.temperature.min}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">AVG</span><span className="font-bold text-amber-400">{stats.temperature.avg}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">MAX</span><span className="font-bold text-white">{stats.temperature.max}</span></div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-800/30 border border-white/5">
                  <div className="text-xs font-semibold text-blue-400 mb-2">Humidity (%)</div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div><span className="text-zinc-500 block text-[10px]">MIN</span><span className="font-bold text-white">{stats.humidity.min}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">AVG</span><span className="font-bold text-blue-400">{stats.humidity.avg}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">MAX</span><span className="font-bold text-white">{stats.humidity.max}</span></div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-800/30 border border-white/5">
                  <div className="text-xs font-semibold text-amber-400 mb-2">Weight (g)</div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div><span className="text-zinc-500 block text-[10px]">MIN</span><span className="font-bold text-white">{stats.weightGrams.min}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">AVG</span><span className="font-bold text-amber-400">{stats.weightGrams.avg}</span></div>
                    <div><span className="text-zinc-500 block text-[10px]">MAX</span><span className="font-bold text-white">{stats.weightGrams.max}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-zinc-500">Loading aggregated statistics...</div>
            )}
          </div>

          {/* Alerts & Notifications Section */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Configured Threshold Alerts</h2>
              <button
                onClick={() => setShowAlertModal(true)}
                className="px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
              >
                + Set Alert Rule
              </button>
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-500">
                No alerts configured for this device. Set a threshold rule (e.g. alert if weight &lt; 100g).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {alerts.map((alt) => (
                  <div key={alt.alertId} className="p-3.5 rounded-xl bg-zinc-800/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">
                        {alt.metric} {alt.condition === 'LESS_THAN' ? '<' : alt.condition === 'GREATER_THAN' ? '>' : '='} {alt.threshold}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">Email notification enabled</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      alt.triggered
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {alt.triggered ? '⚠️ TRIGGERED' : '✓ NORMAL'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historical Telemetry Logs Table */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Historical Telemetry Logs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400 uppercase text-[10px] tracking-wider">
                    <th className="pb-3 font-semibold">Log ID</th>
                    <th className="pb-3 font-semibold">Timestamp</th>
                    <th className="pb-3 font-semibold">Temperature (°C)</th>
                    <th className="pb-3 font-semibold">Humidity (%)</th>
                    <th className="pb-3 font-semibold">Weight (g)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {historyLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition text-zinc-300">
                      <td className="py-2.5 font-mono text-amber-400">#{log.id}</td>
                      <td className="py-2.5 text-zinc-400">{new Date(log.recordedAt).toLocaleString()}</td>
                      <td className="py-2.5 font-semibold text-white">{log.temperature}°C</td>
                      <td className="py-2.5 text-blue-400">{log.humidity}%</td>
                      <td className="py-2.5 font-bold text-amber-400">{log.weightGrams} g</td>
                    </tr>
                  ))}
                  {historyLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-500 text-xs">
                        No historical logs recorded yet. Push telemetry using the hardware simulator.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* Device Registration Modal */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Register ESP32 Board</h3>
              <button onClick={() => { setShowRegModal(false); setGeneratedKey(null); }} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            {generatedKey ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                  <div className="font-bold text-sm mb-1">🎉 Device Registered Successfully!</div>
                  Save your Device API Key below. This key must be sent in the <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">X-Device-API-Key</code> request header by your ESP32 board.
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Device API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedKey}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-amber-400"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedKey);
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }}
                      className="px-3 py-2 bg-amber-500 text-black font-bold text-xs rounded-xl hover:bg-amber-400"
                    >
                      {copiedKey ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => { setShowRegModal(false); setGeneratedKey(null); }}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl text-xs"
                >
                  Close Modal
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterDevice} className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Device Name</label>
                  <input
                    type="text"
                    value={newDevName}
                    onChange={e => setNewDevName(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">MAC Address</label>
                  <input
                    type="text"
                    value={newDevMac}
                    onChange={e => setNewDevMac(e.target.value)}
                    required
                    placeholder="24:6F:28:AB:CD:EF"
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Deployment Location</label>
                  <input
                    type="text"
                    value={newDevLoc}
                    onChange={e => setNewDevLoc(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegModal(false)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold rounded-xl text-xs"
                  >
                    Generate API Key & Register
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Set Alert Threshold Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Configure Sensor Alert</h3>
              <button onClick={() => setShowAlertModal(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateAlert} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Metric</label>
                <select
                  value={alertMetric}
                  onChange={e => setAlertMetric(e.target.value)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="weightGrams">weightGrams (Scale Weight)</option>
                  <option value="temperature">temperature (°C)</option>
                  <option value="humidity">humidity (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Condition</label>
                <select
                  value={alertCond}
                  onChange={e => setAlertCond(e.target.value)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="LESS_THAN">LESS_THAN (&lt;)</option>
                  <option value="GREATER_THAN">GREATER_THAN (&gt;)</option>
                  <option value="EQUAL">EQUAL (=)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Threshold Value</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertThresh}
                  onChange={e => setAlertThresh(e.target.value)}
                  required
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAlertModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-black font-bold rounded-xl text-xs hover:bg-amber-400"
                >
                  Create Alert Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
