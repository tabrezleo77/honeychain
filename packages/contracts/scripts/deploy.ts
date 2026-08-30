import { ethers } from "hardhat";

async function main() {
  console.log("Deploying HoneyChain Contracts...");

  const DynamicBatchNFT = await ethers.getContractFactory("DynamicBatchNFT");
  const nft = await DynamicBatchNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`DynamicBatchNFT deployed to: ${nftAddress}`);

  const HoneyEscrow = await ethers.getContractFactory("HoneyEscrow");
  const escrow = await HoneyEscrow.deploy(nftAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`HoneyEscrow deployed to: ${escrowAddress}`);

  console.log("Deployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
