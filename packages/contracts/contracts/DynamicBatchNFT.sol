// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DynamicBatchNFT is ERC721URIStorage, Ownable {
    enum BatchState { RAW_HARVEST, LAB_VERIFIED, PACKAGED_RETAIL }

    struct BatchInfo {
        BatchState state;
        string ipfsHash;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => BatchInfo) public batchDetails;
    mapping(address => bool) public authorizedVerifiers;

    event BatchMinted(uint256 indexed tokenId, address indexed farmer, string uri);
    event BatchStateUpdated(uint256 indexed tokenId, BatchState indexed newState, string ipfsHash);
    event VerifierAuthorizationChanged(address indexed verifier, bool authorized);

    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorizedVerifiers[msg.sender], "Caller is not authorized");
        _;
    }

    constructor() ERC721("HoneyChain Batch NFT", "HONEY") Ownable(msg.sender) {
        authorizedVerifiers[msg.sender] = true;
    }

    function setVerifier(address verifier, bool authorized) external onlyOwner {
        authorizedVerifiers[verifier] = authorized;
        emit VerifierAuthorizationChanged(verifier, authorized);
    }

    function mintBatchNFT(address farmer, string memory tokenURI) external onlyAuthorized returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(farmer, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        batchDetails[tokenId] = BatchInfo({
            state: BatchState.RAW_HARVEST,
            ipfsHash: ""
        });
        
        emit BatchMinted(tokenId, farmer, tokenURI);
        return tokenId;
    }

    function updateBatchState(uint256 tokenId, uint8 newState, string memory ipfsHash) external onlyAuthorized {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(newState <= uint8(BatchState.PACKAGED_RETAIL), "Invalid state");
        
        batchDetails[tokenId].state = BatchState(newState);
        batchDetails[tokenId].ipfsHash = ipfsHash;
        
        emit BatchStateUpdated(tokenId, BatchState(newState), ipfsHash);
    }

    function getBatchDetails(uint256 tokenId) external view returns (BatchState state, string memory ipfsHash) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        BatchInfo memory info = batchDetails[tokenId];
        return (info.state, info.ipfsHash);
    }
}
