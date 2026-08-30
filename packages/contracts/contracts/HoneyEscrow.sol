// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IDynamicBatchNFT {
    function getBatchDetails(uint256 tokenId) external view returns (uint8 state, string memory ipfsHash);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract HoneyEscrow is Ownable {
    IDynamicBatchNFT public nftContract;

    struct EscrowInfo {
        address buyer;
        address payable beekeeper;
        uint256 amount;
        bool released;
    }

    mapping(uint256 => EscrowInfo) public escrows;

    event FundsDeposited(uint256 indexed batchId, address indexed buyer, address indexed beekeeper, uint256 amount);
    event FundsReleased(uint256 indexed batchId, address indexed beekeeper, uint256 amount);
    event EscrowRefunded(uint256 indexed batchId, address indexed buyer, uint256 amount);

    constructor(address _nftContract) Ownable(msg.sender) {
        nftContract = IDynamicBatchNFT(_nftContract);
    }

    function setNftContract(address _nftContract) external onlyOwner {
        nftContract = IDynamicBatchNFT(_nftContract);
    }

    function depositFunds(uint256 batchId, address payable beekeeper) external payable {
        require(msg.value > 0, "Must deposit positive amount");
        require(escrows[batchId].amount == 0, "Escrow already exists for this batch");
        require(beekeeper != address(0), "Invalid beekeeper address");

        escrows[batchId] = EscrowInfo({
            buyer: msg.sender,
            beekeeper: beekeeper,
            amount: msg.value,
            released: false
        });

        emit FundsDeposited(batchId, msg.sender, beekeeper, msg.value);
    }

    function releaseFunds(uint256 batchId) external {
        EscrowInfo storage escrow = escrows[batchId];
        require(escrow.amount > 0, "No escrow found");
        require(!escrow.released, "Funds already released");

        // Query the NFT contract to verify state
        (uint8 state, ) = nftContract.getBatchDetails(batchId);
        require(state >= 1, "Batch is not lab verified yet");

        escrow.released = true;
        uint256 amount = escrow.amount;
        address payable recipient = escrow.beekeeper;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsReleased(batchId, recipient, amount);
    }

    function refundBuyer(uint256 batchId) external onlyOwner {
        EscrowInfo storage escrow = escrows[batchId];
        require(escrow.amount > 0, "No escrow found");
        require(!escrow.released, "Funds already released");

        escrow.released = true;
        uint256 amount = escrow.amount;
        address buyer = escrow.buyer;

        (bool success, ) = payable(buyer).call{value: amount}("");
        require(success, "Refund failed");

        emit EscrowRefunded(batchId, buyer, amount);
    }
}
