import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';

const PORT = 4099;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log('--- Starting Backend Server for API Verification ---');
  
  const serverProcess = spawn('node', [path.join(__dirname, '../dist/server.js')], {
    env: { ...process.env, BACKEND_PORT: PORT.toString() },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    // console.log(`[SERVER]: ${data}`);
  });
  serverProcess.stderr.on('data', (data) => {
    // console.error(`[SERVER ERR]: ${data}`);
  });

  // Wait for server to start
  await new Promise((res) => setTimeout(res, 3000));

  let token = '';
  let deviceId = '';
  let deviceApiKey = '';

  try {
    // 1.1 Register User
    console.log('\n[1.1] Testing Register User (POST /auth/register)...');
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      username: 'saikat_test_' + Date.now(),
      email: `saikat_${Date.now()}@example.com`,
      password: 'SecurePassword123!'
    });
    console.log('Register Response:', JSON.stringify(regRes.data, null, 2));
    token = regRes.data.data.token;
    if (!token || !regRes.data.success) throw new Error('Register failed!');

    // 1.2 Login User
    console.log('\n[1.2] Testing Login User (POST /auth/login)...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: regRes.data.data.email,
      password: 'SecurePassword123!'
    });
    console.log('Login Response:', JSON.stringify(loginRes.data, null, 2));
    if (!loginRes.data.success || !loginRes.data.data.token) throw new Error('Login failed!');

    // 1.3 Get User Profile
    console.log('\n[1.3] Testing Get User Profile (GET /auth/me)...');
    const meRes = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Profile Response:', JSON.stringify(meRes.data, null, 2));
    if (!meRes.data.success || !meRes.data.data.userId) throw new Error('Get profile failed!');

    // 2.1 Register New Device
    console.log('\n[2.1] Testing Register Device (POST /devices)...');
    const mac = `24:6F:28:${Math.floor(Math.random()*89+10)}:${Math.floor(Math.random()*89+10)}:${Math.floor(Math.random()*89+10)}`;
    const devRes = await axios.post(`${BASE_URL}/devices`, {
      deviceName: 'ESP32-Smart-Scale-DHT11',
      macAddress: mac,
      location: 'Lab Workbench'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Device Register Response:', JSON.stringify(devRes.data, null, 2));
    deviceId = devRes.data.data.deviceId;
    deviceApiKey = devRes.data.data.deviceApiKey;
    if (!deviceId || !deviceApiKey) throw new Error('Device Registration failed!');

    // 2.2 Get All Devices
    console.log('\n[2.2] Testing Get All Devices (GET /devices)...');
    const devicesRes = await axios.get(`${BASE_URL}/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Devices List Response:', JSON.stringify(devicesRes.data, null, 2));

    // 2.3 Get Single Device Details
    console.log('\n[2.3] Testing Get Single Device (GET /devices/:deviceId)...');
    const singleDevRes = await axios.get(`${BASE_URL}/devices/${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Single Device Response:', JSON.stringify(singleDevRes.data, null, 2));

    // 3.1 Push Telemetry
    console.log('\n[3.1] Testing Push Sensor Readings (POST /telemetry)...');
    const telemRes = await axios.post(`${BASE_URL}/telemetry`, {
      deviceId,
      temperature: 28.50,
      humidity: 65.20,
      weightGrams: 1024.50,
      timestamp: Math.floor(Date.now() / 1000)
    }, {
      headers: { 'X-Device-API-Key': deviceApiKey }
    });
    console.log('Telemetry Response:', JSON.stringify(telemRes.data, null, 2));

    // Push 2nd reading for stats test
    await axios.post(`${BASE_URL}/telemetry`, {
      deviceId,
      temperature: 29.10,
      humidity: 62.00,
      weightGrams: 1030.00,
      timestamp: Math.floor(Date.now() / 1000)
    }, {
      headers: { 'X-Device-API-Key': deviceApiKey }
    });

    // 4.1 Get Latest Live Telemetry
    console.log('\n[4.1] Testing Get Live Telemetry (GET /telemetry/live)...');
    const liveRes = await axios.get(`${BASE_URL}/telemetry/live?deviceId=${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Live Telemetry Response:', JSON.stringify(liveRes.data, null, 2));

    // 4.2 Get Historical Telemetry Logs
    console.log('\n[4.2] Testing Get Telemetry History (GET /telemetry/history)...');
    const histRes = await axios.get(`${BASE_URL}/telemetry/history?deviceId=${deviceId}&limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('History Telemetry Response:', JSON.stringify(histRes.data, null, 2));

    // 4.3 Get Aggregated Statistics
    console.log('\n[4.3] Testing Get Telemetry Stats (GET /telemetry/stats)...');
    const statsRes = await axios.get(`${BASE_URL}/telemetry/stats?deviceId=${deviceId}&range=24h`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Stats Response:', JSON.stringify(statsRes.data, null, 2));

    // 5.1 Set Sensor Threshold Alert
    console.log('\n[5.1] Testing Set Sensor Threshold Alert (POST /alerts/config)...');
    const alertRes = await axios.post(`${BASE_URL}/alerts/config`, {
      deviceId,
      metric: 'weightGrams',
      condition: 'LESS_THAN',
      threshold: 100.00,
      notifyEmail: true
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Alert Config Response:', JSON.stringify(alertRes.data, null, 2));

    // Get Alerts List
    console.log('\n[5.2] Testing Get Alerts List (GET /alerts)...');
    const alertsListRes = await axios.get(`${BASE_URL}/alerts?deviceId=${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Alerts List Response:', JSON.stringify(alertsListRes.data, null, 2));

    // 2.4 Delete Device
    console.log('\n[2.4] Testing Delete Device (DELETE /devices/:deviceId)...');
    const delRes = await axios.delete(`${BASE_URL}/devices/${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Delete Device Response:', JSON.stringify(delRes.data, null, 2));

    console.log('\n=============================================================');
    console.log('SUCCESS! All IoT System Specification Endpoints Verified 100%!');
    console.log('=============================================================');
  } catch (err: any) {
    console.error('TEST FAILED:', err.response?.data || err.message);
    process.exitCode = 1;
  } finally {
    serverProcess.kill('SIGTERM');
  }
}

runTests();
