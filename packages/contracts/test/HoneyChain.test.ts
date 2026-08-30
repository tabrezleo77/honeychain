import { expect } from "chai";
import { ethers } from "hardhat";

describe("HoneyChain Core Contracts", function () {
  let nftContract: any;
  let escrowContract: any;
  let owner: any;
  let farmer: any;
  let lab: any;
  let buyer: any;

  beforeEach(async function () {
    [owner, farmer, lab, buyer] = await ethers.getSigners();

    // Deploy NFT Contract
    const DynamicBatchNFT = await ethers.getContractFactory("DynamicBatchNFT");
    nftContract = await DynamicBatchNFT.deploy();
    await nftContract.waitForDeployment();

    // Deploy Escrow Contract with NFT address
    const HoneyEscrow = await ethers.getContractFactory("HoneyEscrow");
    escrowContract = await HoneyEscrow.deploy(await nftContract.getAddress());
    await escrowContract.waitForDeployment();

    // Authorize lab as verifier on NFT contract
    await nftContract.setVerifier(lab.address, true);
  });

  describe("DynamicBatchNFT", function () {
    it("should allow owner or verifier to mint NFT", async function () {
      const uri = "ipfs://QmFarmerMetadataHash";
      const tx = await nftContract.connect(owner).mintBatchNFT(farmer.address, uri);
      await tx.wait();

      // Token ID should be 0 for the first minted NFT
      expect(await nftContract.ownerOf(0)).to.equal(farmer.address);
      expect(await nftContract.tokenURI(0)).to.equal(uri);

      const details = await nftContract.getBatchDetails(0);
      expect(details.state).to.equal(0); // RAW_HARVEST
      expect(details.ipfsHash).to.equal("");
    });

    it("should reject minting from unauthorized addresses", async function () {
      const uri = "ipfs://QmFarmerMetadataHash";
      await expect(
        nftContract.connect(buyer).mintBatchNFT(farmer.address, uri)
      ).to.be.revertedWith("Caller is not authorized");
    });

    it("should allow verifier/lab to update state and IPFS hash", async function () {
      const uri = "ipfs://QmFarmerMetadataHash";
      await nftContract.connect(owner).mintBatchNFT(farmer.address, uri);

      // State 1 = LAB_VERIFIED
      await nftContract.connect(lab).updateBatchState(0, 1, "QmLabReportHash");
      
      const details = await nftContract.getBatchDetails(0);
      expect(details.state).to.equal(1);
      expect(details.ipfsHash).to.equal("QmLabReportHash");
    });
  });

  describe("HoneyEscrow", function () {
    const tokenId = 0;
    const depositAmount = ethers.parseEther("1.0");

    beforeEach(async function () {
      // Mint NFT
      await nftContract.connect(owner).mintBatchNFT(farmer.address, "ipfs://QmMetadata");
    });

    it("should allow buyer to lock funds in escrow", async function () {
      const tx = await escrowContract.connect(buyer).depositFunds(tokenId, farmer.address, {
        value: depositAmount,
      });
      await tx.wait();

      const escrow = await escrowContract.escrows(tokenId);
      expect(escrow.buyer).to.equal(buyer.address);
      expect(escrow.beekeeper).to.equal(farmer.address);
      expect(escrow.amount).to.equal(depositAmount);
      expect(escrow.released).to.equal(false);
    });

    it("should reject releasing funds before batch is LAB_VERIFIED", async function () {
      // Deposit funds
      await escrowContract.connect(buyer).depositFunds(tokenId, farmer.address, {
        value: depositAmount,
      });

      // Try releasing
      await expect(
        escrowContract.connect(owner).releaseFunds(tokenId)
      ).to.be.revertedWith("Batch is not lab verified yet");
    });

    it("should automatically release funds to beekeeper when batch is LAB_VERIFIED", async function () {
      // Deposit funds
      await escrowContract.connect(buyer).depositFunds(tokenId, farmer.address, {
        value: depositAmount,
      });

      // Update state to LAB_VERIFIED (1)
      await nftContract.connect(lab).updateBatchState(tokenId, 1, "QmLabReportHash");

      // Balance check
      const initialBalance = await ethers.provider.getBalance(farmer.address);

      // Release funds
      const tx = await escrowContract.connect(owner).releaseFunds(tokenId);
      await tx.wait();

      const finalBalance = await ethers.provider.getBalance(farmer.address);
      expect(finalBalance - initialBalance).to.equal(depositAmount);

      const escrow = await escrowContract.escrows(tokenId);
      expect(escrow.released).to.equal(true);
    });
  });
});
