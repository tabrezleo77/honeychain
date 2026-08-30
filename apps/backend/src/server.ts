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
// ROUTES
// -------------------------------------------------------------------------

// --- Authentication ---
app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  const { name, email, password, role, wallet_address } = req.body;
  
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required registration parameters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role as Role;
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        wallet_address,
        role: userRole
      }
    });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet_address: user.wallet_address }
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Email already registered' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) return res.status(401).json({ error: 'Incorrect credentials' });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet_address: user.wallet_address }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Telemetry Ingestion ---
app.post('/api/v1/telemetry/ingest', async (req: Request, res: Response) => {
  const { hive_mac, weight_kg, temperature_c, humidity_pct, api_key } = req.body;

  if (api_key !== API_KEY_SECRET) {
    return res.status(403).json({ error: 'Unauthorized hardware sensor payload signature' });
  }

  if (!hive_mac || weight_kg === undefined || temperature_c === undefined || humidity_pct === undefined) {
    return res.status(400).json({ error: 'Malformed sensor telemetry payload' });
  }

  try {
    // 1. Look up the Hive in DB
    let hive = await prisma.hive.findUnique({ where: { hardware_mac: hive_mac } });
    
    // Auto-create dummy Hive for debugging/developer-ease if it doesn't exist
    if (!hive) {
      // Find or create a default farmer to assign the hive to
      let farmer = await prisma.user.findFirst({ where: { role: Role.FARMER } });
      if (!farmer) {
        const dummyHash = await bcrypt.hash('password123', 10);
        farmer = await prisma.user.create({
          data: {
            name: 'Demo Beekeeper',
            email: 'farmer@honeychain.io',
            passwordHash: dummyHash,
            role: Role.FARMER,
            wallet_address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1' // Standard hardhat test address #1
          }
        });
      }

      hive = await prisma.hive.create({
        data: {
          hardware_mac: hive_mac,
          cluster_location: 'Karnataka Honey Cluster, IN',
          did_identifier: `did:honeychain:hive:${hive_mac.toLowerCase().replace(/:/g, '')}`,
          farmer_id: farmer.id
        }
      });
    }

    const logEntry = {
      hive_id: hive.id,
      weight_kg: parseFloat(weight_kg),
      temperature_c: parseFloat(temperature_c),
      humidity_pct: parseFloat(humidity_pct),
      timestamp: new Date().toISOString(),
      zk_proof_hash: "0x" + crypto.createHash('sha256').update(`${hive_mac}-${weight_kg}-${Date.now()}`).digest('hex')
    };

    // 2. Cache in Redis
    await cacheTelemetry(hive.id, logEntry);

    // 3. Batch commit to Postgres DB
    const telemetry = await prisma.telemetryLog.create({
      data: {
        hive_id: logEntry.hive_id,
        weight_kg: logEntry.weight_kg,
        temperature_c: logEntry.temperature_c,
        humidity_pct: logEntry.humidity_pct,
        timestamp: new Date(logEntry.timestamp),
        zk_proof_hash: logEntry.zk_proof_hash
      }
    });

    // 4. Hit ML Predictor asynchronously for realtime analysis
    // Get rolling history from Cache to supply to ML
    const history = await getCachedTelemetry(hive.id);
    let mlPrediction = null;
    try {
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict/yield`, {
        hive_id: hive.id,
        telemetry_history: history.map(h => ({
          weight_kg: h.weight_kg,
          temperature_c: h.temperature_c,
          humidity_pct: h.humidity_pct,
          timestamp: h.timestamp
        }))
      });
      mlPrediction = mlResponse.data;
    } catch (e: any) {
      console.warn('ML yield forecasting service unavailable:', e.message);
    }

    res.json({
      success: true,
      telemetry,
      mlPrediction
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Live Hive Telemetry
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
