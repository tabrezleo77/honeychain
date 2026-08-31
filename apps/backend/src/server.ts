import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma, Role, BatchState } from '@honey-chain/db';
import { createClient } from 'redis';
import { ethers } from 'ethers';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '../../.env' });
dotenv.config(); // Load local environment variables if any

const app = express();
const port = process.env.BACKEND_PORT || 4000;
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------------------
// SECRETS & CONF
// -------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';
const API_KEY_SECRET = process.env.API_KEY_SECRET || 'super-secret-api-key-for-esp32-sensor-ingestion';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// -------------------------------------------------------------------------
// REDIS CLIENT (With In-Memory Fallback)
// -------------------------------------------------------------------------
let redisClient: any = null;
let useMemoryCache = false;
const memoryCache: Record<string, any[]> = {};

async function initRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let hasWarnedRedis = false;
  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) return false; // Stop retrying after 3 failures
          return Math.min(retries * 500, 2000);
        }
      }
    });
    redisClient.on('error', (err: any) => {
      if (!hasWarnedRedis) {
        console.warn('Redis client error, falling back to In-Memory Caching:', err.message);
        hasWarnedRedis = true;
      }
      useMemoryCache = true;
    });
    await redisClient.connect();
    console.log('Connected to Redis successfully.');
  } catch (err: any) {
    if (!hasWarnedRedis) {
      console.warn('Could not connect to Redis, using In-Memory Cache fallback.');
      hasWarnedRedis = true;
    }
    useMemoryCache = true;
  }
}
initRedis();

// Cache helper
async function cacheTelemetry(hiveId: string, data: any) {
  if (useMemoryCache) {
    if (!memoryCache[hiveId]) memoryCache[hiveId] = [];
    memoryCache[hiveId].push(data);
    // Limit to last 100 entries
    if (memoryCache[hiveId].length > 100) memoryCache[hiveId].shift();
    return true;
  } else {
    try {
      await redisClient.lPush(`telemetry:${hiveId}`, JSON.stringify(data));
      await redisClient.lTrim(`telemetry:${hiveId}`, 0, 99); // Keep latest 100
      return true;
    } catch (e) {
      console.error('Failed to write to Redis:', e);
      return false;
    }
  }
}

async function getCachedTelemetry(hiveId: string): Promise<any[]> {
  if (useMemoryCache) {
    return memoryCache[hiveId] || [];
  } else {
    try {
      const data = await redisClient.lRange(`telemetry:${hiveId}`, 0, -1);
      return data.map((d: string) => JSON.parse(d));
    } catch (e) {
      console.error('Failed to get from Redis:', e);
      return [];
    }
  }
}

// -------------------------------------------------------------------------
// BLOCKCHAIN WEB3 CLIENT (With In-Memory local contract state mock)
// -------------------------------------------------------------------------
// ABIs
const NFT_ABI = [
  "function mintBatchNFT(address farmer, string memory tokenURI) external returns (uint256)",
  "function updateBatchState(uint256 tokenId, uint8 newState, string memory ipfsHash) external",
  "function getBatchDetails(uint256 tokenId) external view returns (uint8 state, string memory ipfsHash)"
];
const ESCROW_ABI = [
  "function depositFunds(uint256 batchId, address beekeeper) external payable",
  "function releaseFunds(uint256 batchId) external",
  "function escrows(uint256 batchId) external view returns (address buyer, address beekeeper, uint256 amount, bool released)"
];

// In-Memory mock blockchain state if contract call fails or not set up
const mockBlockchainState = {
  nftTokenCount: 0,
  nfts: {} as Record<number, { farmer: string; uri: string; state: number; ipfsHash: string }>,
  escrows: {} as Record<number, { buyer: string; beekeeper: string; amount: string; released: boolean }>
};

class Web3Client {
  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private nftContractAddress = "";
  private escrowContractAddress = "";
  private isMock = true;

  constructor() {
    const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
    const pKey = process.env.PRIVATE_KEY;
    this.nftContractAddress = process.env.NFT_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
    this.escrowContractAddress = process.env.ESCROW_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (rpcUrl && pKey && pKey !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      try {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(pKey, this.provider);
        this.isMock = false;
        console.log("Web3 Blockchain provider successfully initialized for Amoy network.");
      } catch (err: any) {
        console.warn("Error initializing actual ethers wallet, defaulting to mock blockchain provider:", err.message);
      }
    } else {
      console.log("No valid Web3 credentials. Running Blockchain engine in Simulated (Mock) mode.");
    }
  }

  async mintNFT(farmerWallet: string, uri: string): Promise<{ tokenId: string; txHash: string }> {
    if (this.isMock || !this.wallet || this.nftContractAddress === "0x0000000000000000000000000000000000000000") {
      const tokenId = mockBlockchainState.nftTokenCount++;
      mockBlockchainState.nfts[tokenId] = {
        farmer: farmerWallet,
        uri,
        state: 0, // RAW_HARVEST
        ipfsHash: ""
      };
      const txHash = "0x" + crypto.randomBytes(32).toString('hex');
      console.log(`[Simulated NFT Mint] Token ID ${tokenId} minted to ${farmerWallet}. URI: ${uri}`);
      return { tokenId: tokenId.toString(), txHash };
    }

    try {
      const nftContract = new ethers.Contract(this.nftContractAddress, NFT_ABI, this.wallet);
      const tx = await nftContract.mintBatchNFT(farmerWallet, uri);
      const receipt = await tx.wait();
      // Parse event to get tokenId
      // DynamicBatchNFT emits BatchMinted(tokenId, farmer, uri)
      const event = receipt.logs
        .map((log: any) => {
          try { return nftContract.interface.parseLog(log); } catch (e) { return null; }
        })
        .find((log: any) => log && log.name === 'BatchMinted');
      
      const tokenId = event ? event.args[0].toString() : "0";
      return { tokenId, txHash: tx.hash };
    } catch (err: any) {
      console.error("Web3 NFT Mint failed, falling back to simulation:", err.message);
      const tokenId = mockBlockchainState.nftTokenCount++;
      mockBlockchainState.nfts[tokenId] = {
        farmer: farmerWallet,
        uri,
        state: 0,
        ipfsHash: ""
      };
      return { tokenId: tokenId.toString(), txHash: "0x" + crypto.randomBytes(32).toString('hex') };
    }
  }

  async updateNFTState(tokenId: string, state: number, ipfsHash: string): Promise<string> {
    const tokenIdNum = parseInt(tokenId);
    if (this.isMock || !this.wallet || this.nftContractAddress === "0x0000000000000000000000000000000000000000") {
      if (mockBlockchainState.nfts[tokenIdNum]) {
        mockBlockchainState.nfts[tokenIdNum].state = state;
        mockBlockchainState.nfts[tokenIdNum].ipfsHash = ipfsHash;
      }
      const txHash = "0x" + crypto.randomBytes(32).toString('hex');
      console.log(`[Simulated NFT State Update] Token ${tokenIdNum} updated to State: ${state}, IPFS: ${ipfsHash}`);
      return txHash;
    }

    try {
      const nftContract = new ethers.Contract(this.nftContractAddress, NFT_ABI, this.wallet);
      const tx = await nftContract.updateBatchState(tokenIdNum, state, ipfsHash);
      await tx.wait();
      return tx.hash;
    } catch (err: any) {
      console.error("Web3 NFT Update failed, updating mock state:", err.message);
      if (mockBlockchainState.nfts[tokenIdNum]) {
        mockBlockchainState.nfts[tokenIdNum].state = state;
        mockBlockchainState.nfts[tokenIdNum].ipfsHash = ipfsHash;
      }
      return "0x" + crypto.randomBytes(32).toString('hex');
    }
  }

  async triggerEscrowRelease(tokenId: string): Promise<string> {
    const tokenIdNum = parseInt(tokenId);
    if (this.isMock || !this.wallet || this.escrowContractAddress === "0x0000000000000000000000000000000000000000") {
      if (mockBlockchainState.escrows[tokenIdNum]) {
        mockBlockchainState.escrows[tokenIdNum].released = true;
      }
      const txHash = "0x" + crypto.randomBytes(32).toString('hex');
      console.log(`[Simulated Escrow Release] Funds released for Batch/Token ID: ${tokenId}`);
      return txHash;
    }

    try {
      const escrowContract = new ethers.Contract(this.escrowContractAddress, ESCROW_ABI, this.wallet);
      const tx = await escrowContract.releaseFunds(tokenIdNum);
      await tx.wait();
      return tx.hash;
    } catch (err: any) {
      console.error("Web3 Escrow Release failed, releasing mock state:", err.message);
      if (mockBlockchainState.escrows[tokenIdNum]) {
        mockBlockchainState.escrows[tokenIdNum].released = true;
      }
      return "0x" + crypto.randomBytes(32).toString('hex');
    }
  }

  async getOnchainBatchDetails(tokenId: string): Promise<{ state: number; ipfsHash: string; escrowStatus: string }> {
    const tokenIdNum = parseInt(tokenId);
    let state = 0;
    let ipfsHash = "";
    let escrowReleased = false;
    let escrowAmount = "0";

    if (this.isMock || !this.wallet || this.nftContractAddress === "0x0000000000000000000000000000000000000000") {
      const nft = mockBlockchainState.nfts[tokenIdNum];
      if (nft) {
        state = nft.state;
        ipfsHash = nft.ipfsHash;
      }
      const esc = mockBlockchainState.escrows[tokenIdNum];
      if (esc) {
        escrowReleased = esc.released;
        escrowAmount = esc.amount;
      }
    } else {
      try {
        const nftContract = new ethers.Contract(this.nftContractAddress, NFT_ABI, this.wallet);
        const details = await nftContract.getBatchDetails(tokenIdNum);
        state = Number(details[0]);
        ipfsHash = details[1];

        if (this.escrowContractAddress !== "0x0000000000000000000000000000000000000000") {
          const escrowContract = new ethers.Contract(this.escrowContractAddress, ESCROW_ABI, this.wallet);
          const escInfo = await escrowContract.escrows(tokenIdNum);
          escrowReleased = escInfo.released;
          escrowAmount = ethers.formatEther(escInfo.amount);
        }
      } catch (err: any) {
        console.warn("Failed to fetch Web3 contract state, pulling mock data:", err.message);
        const nft = mockBlockchainState.nfts[tokenIdNum];
        if (nft) {
          state = nft.state;
          ipfsHash = nft.ipfsHash;
        }
      }
    }

    let escrowStatus = "NOT_DEPOSITED";
    if (this.isMock ? mockBlockchainState.escrows[tokenIdNum] : escrowAmount !== "0") {
      escrowStatus = escrowReleased ? "RELEASED_TO_FARMER" : "HELD_IN_ESCROW";
    }

    return { state, ipfsHash, escrowStatus };
  }

  // Helper mock to deposit funds via backend api
  mockDeposit(tokenId: string, buyerAddr: string, beekeeperAddr: string, amountEth: string) {
    const tokenIdNum = parseInt(tokenId);
    mockBlockchainState.escrows[tokenIdNum] = {
      buyer: buyerAddr,
      beekeeper: beekeeperAddr,
      amount: amountEth,
      released: false
    };
    console.log(`[Simulated Escrow Deposit] ${amountEth} ETH deposited by ${buyerAddr} for Beekeeper ${beekeeperAddr}`);
  }
}

const web3Client = new Web3Client();

// -------------------------------------------------------------------------
// IPFS FILE MOCK OR PINATA UPLOADER
// -------------------------------------------------------------------------
async function uploadToIPFS(content: any): Promise<string> {
  const pinataJwt = process.env.PINATA_JWT;
  if (pinataJwt && pinataJwt !== 'your_pinata_jwt_here') {
    try {
      const res = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        {
          pinataContent: content,
          pinataMetadata: { name: `honeychain-report-${Date.now()}` }
        },
        {
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return res.data.IpfsHash;
    } catch (e: any) {
      console.error('Failed uploading to Pinata, returning mock hash:', e.message);
    }
  }

  // Mock Hash generator
  const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return "Qm" + hash.substring(0, 44);
}

// -------------------------------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// -------------------------------------------------------------------------
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: Role;
    email: string;
  };
}

function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Token is invalid or expired' });
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------------------
// IN-MEMORY DATABASE FALLBACK STORE
// -------------------------------------------------------------------------
const inMemoryStore = {
  users: [] as any[],
  hives: [] as any[],
  telemetryLogs: [] as any[],
  alerts: [] as any[]
};

const dbService = {
  async findUserByEmail(email: string) {
    try {
      return await prisma.user.findUnique({ where: { email } });
    } catch {
      return inMemoryStore.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    }
  },

  async findUserById(id: string) {
    try {
      return await prisma.user.findUnique({ where: { id } });
    } catch {
      return inMemoryStore.users.find(u => u.id === id) || null;
    }
  },

  async findUserByEmailOrUsername(email: string, username: string) {
    try {
      return await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }]
        }
      });
    } catch {
      return inMemoryStore.users.find(u => u.email.toLowerCase() === email.toLowerCase() || (u.username && u.username.toLowerCase() === username.toLowerCase())) || null;
    }
  },

  async createUser(data: any) {
    const newUser = {
      id: crypto.randomUUID(),
      name: data.name,
      username: data.username || data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      wallet_address: data.wallet_address || null,
      role: data.role || 'FARMER',
      createdAt: new Date()
    };
    try {
      return await prisma.user.create({ data });
    } catch {
      inMemoryStore.users.push(newUser);
      return newUser;
    }
  },

  async createHive(data: any) {
    const newHive = {
      id: crypto.randomUUID(),
      deviceName: data.deviceName,
      hardware_mac: data.hardware_mac,
      cluster_location: data.cluster_location,
      did_identifier: data.did_identifier,
      deviceApiKey: data.deviceApiKey,
      status: data.status || 'online',
      samplingIntervalSec: data.samplingIntervalSec || 5,
      lastActiveAt: data.lastActiveAt || new Date(),
      farmer_id: data.farmer_id
    };
    try {
      return await prisma.hive.create({ data });
    } catch {
      inMemoryStore.hives.push(newHive);
      return newHive;
    }
  },

  async findHivesByFarmer(farmerId: string) {
    try {
      return await prisma.hive.findMany({ where: { farmer_id: farmerId } });
    } catch {
      return inMemoryStore.hives.filter(h => h.farmer_id === farmerId);
    }
  },

  async findHiveByIdOrMac(idOrMac: string) {
    const rawId = idOrMac.replace(/^dev_/, '');
    try {
      return await prisma.hive.findFirst({
        where: {
          OR: [{ id: rawId }, { id: idOrMac }, { hardware_mac: idOrMac }]
        }
      });
    } catch {
      return inMemoryStore.hives.find(h => h.id === rawId || h.id === idOrMac || h.hardware_mac === idOrMac || h.hardware_mac === idOrMac.toUpperCase()) || null;
    }
  },

  async findHiveByApiKey(apiKey: string) {
    try {
      return await prisma.hive.findFirst({ where: { deviceApiKey: apiKey } });
    } catch {
      return inMemoryStore.hives.find(h => h.deviceApiKey === apiKey) || null;
    }
  },

  async findFirstFarmer() {
    try {
      return await prisma.user.findFirst({ where: { role: Role.FARMER } });
    } catch {
      return inMemoryStore.users.find(u => u.role === 'FARMER') || null;
    }
  },

  async updateHiveStatus(hiveId: string, status: string, lastActiveAt: Date) {
    try {
      return await prisma.hive.update({
        where: { id: hiveId },
        data: { status, lastActiveAt }
      });
    } catch {
      const h = inMemoryStore.hives.find(x => x.id === hiveId);
      if (h) {
        h.status = status;
        h.lastActiveAt = lastActiveAt;
      }
      return h;
    }
  },

  async deleteHive(hiveId: string) {
    try {
      await prisma.hive.delete({ where: { id: hiveId } });
    } catch {
      const idx = inMemoryStore.hives.findIndex(x => x.id === hiveId);
      if (idx !== -1) inMemoryStore.hives.splice(idx, 1);
    }
  },

  async createTelemetryLog(data: any) {
    const newLog = {
      id: crypto.randomUUID(),
      hive_id: data.hive_id,
      weight_kg: data.weight_kg,
      temperature_c: data.temperature_c,
      humidity_pct: data.humidity_pct,
      timestamp: data.timestamp || new Date(),
      zk_proof_hash: data.zk_proof_hash
    };
    try {
      return await prisma.telemetryLog.create({ data });
    } catch {
      inMemoryStore.telemetryLogs.push(newLog);
      return newLog;
    }
  },

  async getLatestTelemetryLog(hiveId: string) {
    try {
      return await prisma.telemetryLog.findFirst({
        where: { hive_id: hiveId },
        orderBy: { timestamp: 'desc' }
      });
    } catch {
      const logs = inMemoryStore.telemetryLogs
        .filter(l => l.hive_id === hiveId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return logs[0] || null;
    }
  },

  async getTelemetryHistory(hiveId: string, limitVal: number, startDate?: string, endDate?: string) {
    try {
      const whereFilter: any = { hive_id: hiveId };
      if (startDate || endDate) {
        whereFilter.timestamp = {};
        if (startDate) whereFilter.timestamp.gte = new Date(startDate);
        if (endDate) whereFilter.timestamp.lte = new Date(endDate);
      }
      return await prisma.telemetryLog.findMany({
        where: whereFilter,
        orderBy: { timestamp: 'desc' },
        take: limitVal
      });
    } catch {
      let logs = inMemoryStore.telemetryLogs.filter(l => l.hive_id === hiveId);
      if (startDate) logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
      if (endDate) logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return logs.slice(0, limitVal);
    }
  },

  async getTelemetryStats(hiveId: string, cutoff: Date) {
    try {
      return await prisma.telemetryLog.findMany({
        where: {
          hive_id: hiveId,
          timestamp: { gte: cutoff }
        }
      });
    } catch {
      return inMemoryStore.telemetryLogs.filter(l => l.hive_id === hiveId && new Date(l.timestamp) >= cutoff);
    }
  },

  async createAlertConfig(data: any) {
    const newAlert = {
      id: crypto.randomUUID(),
      hive_id: data.hive_id,
      metric: data.metric,
      condition: data.condition,
      threshold: data.threshold,
      notifyEmail: data.notifyEmail ?? true,
      triggered: false,
      createdAt: new Date()
    };
    try {
      return await prisma.alertConfig.create({ data });
    } catch {
      inMemoryStore.alerts.push(newAlert);
      return newAlert;
    }
  },

  async getAlertConfigs(hiveId: string) {
    try {
      return await prisma.alertConfig.findMany({
        where: { hive_id: hiveId },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      return inMemoryStore.alerts.filter(a => a.hive_id === hiveId);
    }
  },

  async updateAlertTriggered(alertId: string, triggered: boolean) {
    try {
      await prisma.alertConfig.update({ where: { id: alertId }, data: { triggered } });
    } catch {
      const a = inMemoryStore.alerts.find(x => x.id === alertId);
      if (a) a.triggered = triggered;
    }
  }
};

// -------------------------------------------------------------------------
// ROUTES - IoT SYSTEM FULL API SPECIFICATION
// -------------------------------------------------------------------------

// --- 1. AUTHENTICATION & USER MANAGEMENT ---

// 1.1 Register User
app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  const { username, name, email, password, role, wallet_address } = req.body;
  const userIdentifier = username || name;
  
  if (!userIdentifier || !email || !password) {
    return res.status(400).json({ success: false, error: 'Missing username, email, or password' });
  }

  try {
    const existingUser = await dbService.findUserByEmailOrUsername(email, userIdentifier);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = (role as Role) || Role.FARMER;
    
    const user = await dbService.createUser({
      name: userIdentifier,
      username: userIdentifier,
      email,
      passwordHash,
      wallet_address: wallet_address || null,
      role: userRole
    });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const formattedUserId = `usr_${user.id}`;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: { id: user.id, userId: formattedUserId, username: user.username, name: user.name, email: user.email, role: user.role, wallet_address: user.wallet_address },
      data: {
        userId: formattedUserId,
        username: user.username || user.name,
        email: user.email,
        token
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1.2 Login User
app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Missing email or password' });
  }

  try {
    const user = await dbService.findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const formattedUserId = `usr_${user.id}`;

    res.json({
      success: true,
      token,
      user: { id: user.id, userId: formattedUserId, username: user.username || user.name, name: user.name, email: user.email, role: user.role, wallet_address: user.wallet_address },
      data: {
        userId: formattedUserId,
        token,
        expiresIn: '7d'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1.3 Get User Profile
app.get('/api/v1/auth/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await dbService.findUserById(req.user!.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({
      success: true,
      data: {
        userId: `usr_${user.id}`,
        username: user.username || user.name,
        email: user.email,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 2. DEVICE MANAGEMENT ---

// 2.1 Register New Device
app.post('/api/v1/devices', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceName, macAddress, location } = req.body;
  if (!macAddress) {
    return res.status(400).json({ success: false, error: 'Missing MAC address' });
  }

  try {
    const deviceApiKey = `esp_key_${crypto.randomBytes(9).toString('hex')}`;
    const cleanMac = macAddress.toUpperCase();
    const did = `did:honeychain:device:${cleanMac.replace(/:/g, '')}`;
    const name = deviceName || `ESP32-Smart-Scale-${cleanMac.slice(-5)}`;

    const existing = await dbService.findHiveByIdOrMac(cleanMac);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Device with this MAC address already registered' });
    }

    const hive = await dbService.createHive({
      deviceName: name,
      hardware_mac: cleanMac,
      cluster_location: location || 'Lab Workbench',
      did_identifier: did,
      deviceApiKey,
      status: 'online',
      lastActiveAt: new Date(),
      farmer_id: req.user!.id
    });

    const formattedDeviceId = `dev_${hive.id}`;
    const createdAtStr = hive.lastActiveAt ? (hive.lastActiveAt instanceof Date ? hive.lastActiveAt.toISOString() : new Date(hive.lastActiveAt).toISOString()) : new Date().toISOString();

    res.status(201).json({
      success: true,
      data: {
        deviceId: formattedDeviceId,
        deviceName: hive.deviceName,
        deviceApiKey: hive.deviceApiKey,
        createdAt: createdAtStr
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.2 Get All User Devices
app.get('/api/v1/devices', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const hives = await dbService.findHivesByFarmer(req.user!.id);

    const now = Date.now();
    const formatted = hives.map((h: any) => {
      const isOnline = h.lastActiveAt && (now - new Date(h.lastActiveAt).getTime() < 300000);
      return {
        deviceId: `dev_${h.id}`,
        deviceName: h.deviceName || h.hardware_mac,
        macAddress: h.hardware_mac,
        status: isOnline ? 'online' : 'offline',
        lastActiveAt: h.lastActiveAt ? new Date(h.lastActiveAt).toISOString() : new Date().toISOString()
      };
    });

    res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.3 Get Single Device Details
app.get('/api/v1/devices/:deviceId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const now = Date.now();
    const isOnline = hive.lastActiveAt && (now - new Date(hive.lastActiveAt).getTime() < 300000);

    res.json({
      success: true,
      data: {
        deviceId: `dev_${hive.id}`,
        deviceName: hive.deviceName || hive.hardware_mac,
        status: isOnline ? 'online' : 'offline',
        samplingIntervalSec: hive.samplingIntervalSec || 5,
        lastActiveAt: hive.lastActiveAt ? new Date(hive.lastActiveAt).toISOString() : new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.4 Delete Device
app.delete('/api/v1/devices/:deviceId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.params;

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    await dbService.deleteHive(hive.id);

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 3. TELEMETRY INGESTION (ESP32 HARDWARE SIDE) ---

// 3.1 Push Sensor Readings
app.post('/api/v1/telemetry', async (req: Request, res: Response) => {
  const apiKeyHeader = req.headers['x-device-api-key'] as string;
  const { deviceId, temperature, humidity, weightGrams, timestamp, api_key, hive_mac } = req.body;

  const keyToTest = apiKeyHeader || api_key;

  try {
    let hive = null;

    if (keyToTest) {
      hive = await dbService.findHiveByApiKey(keyToTest);
    }

    if (!hive && deviceId) {
      hive = await dbService.findHiveByIdOrMac(deviceId as string);
    }

    if (!hive && hive_mac) {
      hive = await dbService.findHiveByIdOrMac(hive_mac as string);
    }

    if (!hive && keyToTest !== API_KEY_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid Device API Key' });
    }

    // Auto-create fallback device if key matches global secret but no hive exists
    if (!hive) {
      let farmer = await dbService.findFirstFarmer();
      if (!farmer) {
        const dummyHash = await bcrypt.hash('password123', 10);
        farmer = await dbService.createUser({
          name: 'Demo Beekeeper',
          username: 'demobeekeeper',
          email: 'farmer@honeychain.io',
          passwordHash: dummyHash,
          role: Role.FARMER
        });
      }

      const mac = hive_mac || `24:6F:28:${crypto.randomBytes(3).toString('hex').toUpperCase().match(/../g)?.join(':')}`;
      hive = await dbService.createHive({
        deviceName: 'ESP32-Smart-Scale-DHT11',
        hardware_mac: mac,
        cluster_location: 'Lab Workbench',
        did_identifier: `did:honeychain:device:${mac.replace(/:/g, '')}`,
        deviceApiKey: keyToTest || `esp_key_${crypto.randomBytes(9).toString('hex')}`,
        status: 'online',
        lastActiveAt: new Date(),
        farmer_id: farmer.id
      });
    }

    // Update hive status & lastActiveAt
    await dbService.updateHiveStatus(hive.id, 'online', new Date());

    const tempVal = parseFloat(temperature ?? 0);
    const humVal = parseFloat(humidity ?? 0);
    const weightValGrams = parseFloat(weightGrams ?? 0);
    const weightKgVal = weightValGrams / 1000;

    let recDate = new Date();
    if (timestamp) {
      const tsNum = typeof timestamp === 'number' ? timestamp : parseInt(timestamp);
      recDate = new Date(tsNum < 10000000000 ? tsNum * 1000 : tsNum);
    }

    const logEntry = {
      hive_id: hive.id,
      weight_kg: weightKgVal,
      temperature_c: tempVal,
      humidity_pct: humVal,
      timestamp: recDate.toISOString(),
      zk_proof_hash: '0x' + crypto.createHash('sha256').update(`${hive.hardware_mac}-${weightValGrams}-${Date.now()}`).digest('hex')
    };

    // Cache in Redis
    await cacheTelemetry(hive.id, logEntry);

    // Save in DB/Store
    await dbService.createTelemetryLog({
      hive_id: hive.id,
      weight_kg: weightKgVal,
      temperature_c: tempVal,
      humidity_pct: humVal,
      timestamp: recDate,
      zk_proof_hash: logEntry.zk_proof_hash
    });

    // Check & evaluate alert rules
    const alerts = await dbService.getAlertConfigs(hive.id);
    for (const alert of alerts) {
      let metricVal = 0;
      if (alert.metric === 'weightGrams' || alert.metric === 'weight') metricVal = weightValGrams;
      else if (alert.metric === 'temperature') metricVal = tempVal;
      else if (alert.metric === 'humidity') metricVal = humVal;

      let triggered = false;
      if (alert.condition === 'LESS_THAN' && metricVal < alert.threshold) triggered = true;
      if (alert.condition === 'GREATER_THAN' && metricVal > alert.threshold) triggered = true;
      if (alert.condition === 'EQUAL' && metricVal === alert.threshold) triggered = true;

      if (triggered) {
        await dbService.updateAlertTriggered(alert.id, true);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Telemetry recorded successfully'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Legacy / Ingest alias
app.post('/api/v1/telemetry/ingest', async (req: Request, res: Response) => {
  const { weight_kg, weightGrams, temperature_c, temperature, humidity_pct, humidity } = req.body;
  req.body.weightGrams = weightGrams ?? (weight_kg ? weight_kg * 1000 : 0);
  req.body.temperature = temperature ?? temperature_c;
  req.body.humidity = humidity ?? humidity_pct;
  
  return app._router.handle(req, res, () => {});
});

// --- 4. TELEMETRY ANALYTICS & DASHBOARD (FRONTEND SIDE) ---

// 4.1 Get Latest Live Telemetry
app.get('/api/v1/telemetry/live', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId as string);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const latest = await dbService.getLatestTelemetryLog(hive.id);

    if (!latest) {
      return res.json({
        success: true,
        data: {
          deviceId: `dev_${hive.id}`,
          temperature: 0,
          humidity: 0,
          weightGrams: 0,
          recordedAt: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: {
        deviceId: `dev_${hive.id}`,
        temperature: latest.temperature_c,
        humidity: latest.humidity_pct,
        weightGrams: Math.round(latest.weight_kg * 1000 * 100) / 100,
        recordedAt: latest.timestamp instanceof Date ? latest.timestamp.toISOString() : new Date(latest.timestamp).toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4.2 Get Historical Telemetry Logs
app.get('/api/v1/telemetry/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId, limit, startDate, endDate } = req.query;
  if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });

  const limitVal = Math.min(parseInt((limit as string) || '50'), 1000);

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId as string);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const logs = await dbService.getTelemetryHistory(hive.id, limitVal, startDate as string, endDate as string);

    const formatted = logs.map((l: any, index: number) => ({
      id: 1000 + index,
      temperature: l.temperature_c,
      humidity: l.humidity_pct,
      weightGrams: Math.round(l.weight_kg * 1000 * 100) / 100,
      recordedAt: l.timestamp instanceof Date ? l.timestamp.toISOString() : new Date(l.timestamp).toISOString()
    }));

    res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4.3 Get Aggregated Statistics
app.get('/api/v1/telemetry/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId, range } = req.query;
  if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });

  const rangeStr = (range as string) || '24h';

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId as string);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const cutoff = new Date();
    if (rangeStr === '1h') cutoff.setHours(cutoff.getHours() - 1);
    else if (rangeStr === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else cutoff.setHours(cutoff.getHours() - 24); // default 24h

    const logs = await dbService.getTelemetryStats(hive.id, cutoff);

    if (logs.length === 0) {
      return res.json({
        success: true,
        range: rangeStr,
        data: {
          temperature: { min: 0, max: 0, avg: 0 },
          humidity: { min: 0, max: 0, avg: 0 },
          weightGrams: { min: 0, max: 0, avg: 0 }
        }
      });
    }

    const temps = logs.map((l: any) => l.temperature_c);
    const hums = logs.map((l: any) => l.humidity_pct);
    const weights = logs.map((l: any) => l.weight_kg * 1000);

    const calcStats = (arr: number[]) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      return {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        avg: Math.round(avg * 100) / 100
      };
    };

    res.json({
      success: true,
      range: rangeStr,
      data: {
        temperature: calcStats(temps),
        humidity: calcStats(hums),
        weightGrams: calcStats(weights)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 5. ALERTS & NOTIFICATIONS ---

// 5.1 Set Sensor Threshold Alert
app.post('/api/v1/alerts/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId, metric, condition, threshold, notifyEmail } = req.body;
  if (!deviceId || !metric || !condition || threshold === undefined) {
    return res.status(400).json({ success: false, error: 'Missing required alert configuration fields' });
  }

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const alert = await dbService.createAlertConfig({
      hive_id: hive.id,
      metric,
      condition,
      threshold: parseFloat(threshold),
      notifyEmail: notifyEmail !== undefined ? Boolean(notifyEmail) : true
    });

    res.status(201).json({
      success: true,
      alertId: `alt_${alert.id}`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5.2 Get Device Alerts
app.get('/api/v1/alerts', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId query parameter required' });

  try {
    const hive = await dbService.findHiveByIdOrMac(deviceId as string);

    if (!hive) return res.status(404).json({ success: false, error: 'Device not found' });

    const alerts = await dbService.getAlertConfigs(hive.id);

    res.json({
      success: true,
      data: alerts.map((a: any) => ({
        alertId: `alt_${a.id}`,
        deviceId: `dev_${a.hive_id}`,
        metric: a.metric,
        condition: a.condition,
        threshold: a.threshold,
        notifyEmail: a.notifyEmail,
        triggered: a.triggered,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date(a.createdAt).toISOString()
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Legacy Get Live Hive Telemetry
app.get('/api/v1/hives/:hiveId/telemetry', async (req: Request, res: Response) => {
  const { hiveId } = req.params;
  try {
    const logs = await prisma.telemetryLog.findMany({
      where: { hive_id: hiveId },
      orderBy: { timestamp: 'desc' },
      take: 50
    });
    res.json(logs.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// List farmer hives
app.get('/api/v1/farmer/hives', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== Role.FARMER) return res.status(403).json({ error: 'Only farmers can access this endpoint' });
  try {
    const hives = await prisma.hive.findMany({
      where: { farmer_id: req.user!.id },
      include: {
        batches: true
      }
    });
    res.json(hives);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Hive
app.post('/api/v1/hives', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== Role.FARMER) return res.status(403).json({ error: 'Only farmers can create hives' });
  const { hardware_mac, cluster_location } = req.body;
  if (!hardware_mac || !cluster_location) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const did = `did:honeychain:hive:${hardware_mac.toLowerCase().replace(/:/g, '')}`;
    const hive = await prisma.hive.create({
      data: {
        hardware_mac,
        cluster_location,
        did_identifier: did,
        farmer_id: req.user!.id
      }
    });
    res.status(201).json(hive);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Farmer: Create Harvest Batch ---
app.post('/api/v1/batches/create', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== Role.FARMER) return res.status(403).json({ error: 'Only farmers can initialize a harvest' });
  const { raw_weight_kg, hive_id } = req.body;

  if (!raw_weight_kg || !hive_id) {
    return res.status(400).json({ error: 'Missing raw weight or hive reference' });
  }

  try {
    const batch_code = "HC-BATCH-" + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Get farmer wallet
    const farmerUser = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const farmerWallet = farmerUser?.wallet_address || "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

    // 1. Upload initial metadata to IPFS
    const ipfsMetadata = {
      batch_code,
      raw_weight_kg: parseFloat(raw_weight_kg),
      harvested_by: farmerUser?.name,
      timestamp: new Date().toISOString(),
      state: 'RAW_HARVEST'
    };
    const uri = await uploadToIPFS(ipfsMetadata);

    // 2. Mint the Batch NFT on-chain
    const { tokenId, txHash } = await web3Client.mintNFT(farmerWallet, `https://gateway.pinata.cloud/ipfs/${uri}`);

    // 3. Save to database
    const batch = await prisma.batch.create({
      data: {
        batch_code,
        raw_weight_kg: parseFloat(raw_weight_kg),
        current_state: BatchState.RAW_HARVEST,
        nft_token_id: tokenId,
        hive_id,
        ipfs_lab_hash: uri
      }
    });

    res.status(201).json({
      success: true,
      batch,
      tokenId,
      nftTxHash: txHash
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Lab: Upload Purity & Verify ---
app.post('/api/v1/lab/verify', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== Role.LAB) return res.status(403).json({ error: 'Unauthorized lab personnel credentials' });
  
  const { batch_id, moisture_pct, hmf_ppm, c4_sugars_pct, pdf_ipfs_hash } = req.body;
  if (!batch_id || moisture_pct === undefined || hmf_ppm === undefined || c4_sugars_pct === undefined || !pdf_ipfs_hash) {
    return res.status(400).json({ error: 'Missing verification metrics or report links' });
  }

  try {
    const batch = await prisma.batch.findUnique({ where: { id: batch_id }, include: { hive: true } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (!batch.nft_token_id) return res.status(400).json({ error: 'Batch has no on-chain NFT mapped' });

    // 1. Create database report entry
    const report = await prisma.labReport.create({
      data: {
        batch_id,
        moisture_pct: parseFloat(moisture_pct),
        hmf_ppm: parseFloat(hmf_ppm),
        c4_sugars_pct: parseFloat(c4_sugars_pct),
        lab_inspector_id: req.user!.id,
        pdf_ipfs_hash
      }
    });

    // 2. Upload combined metadata update to IPFS
    const verifiedMetadata = {
      batch_id,
      batch_code: batch.batch_code,
      moisture_pct,
      hmf_ppm,
      c4_sugars_pct,
      pdf_report_link: pdf_ipfs_hash,
      verification_timestamp: new Date().toISOString(),
      state: 'LAB_VERIFIED'
    };
    const combinedHash = await uploadToIPFS(verifiedMetadata);

    // 3. Update Polygon NFT State to LAB_VERIFIED (1) and store IPFS Hash
    const updateTx = await web3Client.updateNFTState(batch.nft_token_id, 1, combinedHash);

    // 4. Update internal database state
    const updatedBatch = await prisma.batch.update({
      where: { id: batch_id },
      data: {
        current_state: BatchState.LAB_VERIFIED,
        ipfs_lab_hash: combinedHash
      }
    });

    // 5. Automatically trigger escrow funds payout
    const escrowTx = await web3Client.triggerEscrowRelease(batch.nft_token_id);

    res.json({
      success: true,
      batch: updatedBatch,
      report,
      nftUpdateTx: updateTx,
      escrowPayoutTx: escrowTx
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Buyer Mock: Deposit Escrow
app.post('/api/v1/escrow/deposit', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { batch_id, amount_eth } = req.body;
  if (!batch_id || !amount_eth) return res.status(400).json({ error: 'Missing batch id or deposit amount' });
  
  try {
    const batch = await prisma.batch.findUnique({ where: { id: batch_id }, include: { hive: { include: { farmer: true } } } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (!batch.nft_token_id) return res.status(400).json({ error: 'Batch not mapped to Web3 NFT yet' });

    if (!req.user) return res.status(401).json({ error: 'Unauthorized user credentials' });
    const buyerUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    const buyerWallet = buyerUser?.wallet_address || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Hardhat test addr #2
    const farmerWallet = batch.hive.farmer.wallet_address || "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

    web3Client.mockDeposit(batch.nft_token_id, buyerWallet, farmerWallet, amount_eth.toString());
    res.json({ success: true, message: `Locked ${amount_eth} ETH in Escrow` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Public: Verify QR Batch ---
app.get('/api/v1/public/verify/:batchId', async (req: Request, res: Response) => {
  const { batchId } = req.params;

  try {
    // 1. Fetch internal DB records
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        hive: {
          include: {
            farmer: { select: { name: true, wallet_address: true } }
          }
        },
        labReport: {
          include: {
            lab_inspector: { select: { name: true } }
          }
        }
      }
    });

    if (!batch) return res.status(404).json({ error: 'Requested Honey Batch not found' });

    // 2. Query blockchain directly for state integrity
    let onchainState = { state: 0, ipfsHash: "", escrowStatus: "NOT_DEPOSITED" };
    if (batch.nft_token_id) {
      onchainState = await web3Client.getOnchainBatchDetails(batch.nft_token_id);
    }

    // 3. Fetch latest telemetry logs from hive for visual chart representation
    const telemetry = await prisma.telemetryLog.findMany({
      where: { hive_id: batch.hive_id },
      orderBy: { timestamp: 'desc' },
      take: 20
    });

    res.json({
      batch_details: {
        id: batch.id,
        code: batch.batch_code,
        weight_kg: batch.raw_weight_kg,
        current_state: batch.current_state,
        createdAt: batch.createdAt,
        nft_token_id: batch.nft_token_id,
        ipfs_lab_hash: batch.ipfs_lab_hash
      },
      farmer: batch.hive.farmer,
      hive: {
        id: batch.hive.id,
        mac: batch.hive.hardware_mac,
        location: batch.hive.cluster_location,
        did: batch.hive.did_identifier
      },
      lab_report: batch.labReport,
      blockchain: {
        onchain_state: onchainState.state,
        onchain_ipfs: onchainState.ipfsHash,
        escrow_status: onchainState.escrowStatus,
        nft_contract_address: process.env.NFT_CONTRACT_ADDRESS || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        polygonscan_link: `https://amoy.polygonscan.com/token/${process.env.NFT_CONTRACT_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'}?a=${batch.nft_token_id || '0'}`
      },
      telemetry: telemetry.reverse()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Government (KVIC / MadhuKranti Adapter) ---
app.get('/api/v1/gov/madhukranti/sync', async (req: Request, res: Response) => {
  // Pulls all LAB_VERIFIED and PACKAGED batches to map schema to MadhuKranti standard format
  try {
    const verifiedBatches = await prisma.batch.findMany({
      where: {
        current_state: {
          in: [BatchState.LAB_VERIFIED, BatchState.PACKAGED_RETAIL]
        }
      },
      include: {
        hive: { include: { farmer: true } },
        labReport: true
      }
    });

    // Map internal schema to government standardized API payload (combines farmer details, batch IDs, purity levels)
    const govtPayload = verifiedBatches.map(batch => ({
      madhukranti_record_id: `MK-HC-${batch.id.substring(0,8).toUpperCase()}`,
      beekeeper_did: batch.hive.did_identifier,
      beekeeper_name: batch.hive.farmer.name,
      beekeeper_wallet: batch.hive.farmer.wallet_address || 'N/A',
      cluster_location: batch.hive.cluster_location,
      honey_batch_code: batch.batch_code,
      net_quantity_kg: batch.raw_weight_kg,
      analytical_metrics: {
        moisture_percentage: batch.labReport?.moisture_pct || 0.0,
        hmf_level_ppm: batch.labReport?.hmf_ppm || 0.0,
        c4_sugar_purity_pct: batch.labReport?.c4_sugars_pct || 0.0,
        inspection_status: "PASSED",
        certifying_lab_ipfs_hash: batch.labReport?.pdf_ipfs_hash || ""
      },
      blockchain_attestation: {
        polygon_nft_token: batch.nft_token_id,
        ipfs_metadata_receipt: batch.ipfs_lab_hash,
        network_id: "POLYGON_AMOY_137"
      },
      sync_timestamp: new Date().toISOString()
    }));

    res.json({
      status: "SUCCESS",
      synchronized_records_count: govtPayload.length,
      records: govtPayload
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- General List Batches API ---
app.get('/api/v1/batches', async (req: Request, res: Response) => {
  try {
    const batches = await prisma.batch.findMany({
      include: {
        hive: { include: { farmer: { select: { name: true } } } },
        labReport: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(batches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`HoneyChain Core Middleware Gateway running on port ${port}`);
});
