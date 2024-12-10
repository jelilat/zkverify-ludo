// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract NoLossPredictionMarket {
    // Proving system ID
    bytes32 public constant PROVING_SYSTEM_ID =
        keccak256(abi.encodePacked("risc0"));

    enum PlayerColor {
        Red,
        Green,
        Blue,
        Yellow
    }

    struct Game {
        PlayerColor winner; // Winner's color
        bool started; // Whether the game has started
        bool ended; // Whether the game has ended
        mapping(address => PlayerColor) predictions; // Address to predicted color
        mapping(PlayerColor => uint256) stakes; // Total stake per color
        uint256 totalStake; // Total staked amount
        uint256 totalFees; // Total platform fees
        address[] predictors; // List of predictors
    }

    mapping(uint256 => Game) public games; // Game ID to Game details
    uint256 public platformFees; // Total platform fees collected
    address public owner; // Owner of the platform
    address public immutable zkvContract; // Address of the zkProof verification contract
    bytes32 public immutable vkHash; // Verification key hash

    event GameCreated(uint256 indexed gameId);
    event PredictionMade(
        uint256 indexed gameId,
        address indexed predictor,
        PlayerColor predictedColor
    );
    event GameEnded(uint256 indexed gameId, PlayerColor winner);
    event FeesDistributed(uint256 indexed gameId, uint256 rewardPerWinner);

    constructor(address _zkvContract, bytes32 _vkHash) {
        owner = msg.sender;
        zkvContract = _zkvContract;
        vkHash = _vkHash;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier gameNotStarted(uint256 gameId) {
        require(!games[gameId].started, "Game has already started");
        _;
    }

    modifier gameNotEnded(uint256 gameId) {
        require(!games[gameId].ended, "Game has already ended");
        _;
    }

    function createGame(uint256 gameId) external onlyOwner {
        require(games[gameId].totalStake == 0, "Game already exists");
        Game storage game = games[gameId];
        game.started = false;
        game.ended = false;
        emit GameCreated(gameId);
    }

    function makePrediction(
        uint256 gameId,
        PlayerColor predictedColor
    ) external payable gameNotStarted(gameId) {
        require(msg.value > 0, "Stake must be greater than zero");

        Game storage game = games[gameId];
        require(
            game.predictions[msg.sender] == PlayerColor.Red &&
                game.stakes[PlayerColor.Red] == 0,
            "Already made a prediction"
        );

        uint256 fee = msg.value / 100; // 1% platform fee
        uint256 stake = msg.value - fee;

        game.predictions[msg.sender] = predictedColor;
        game.stakes[predictedColor] += stake;
        game.totalStake += stake;
        game.totalFees += fee;
        game.predictors.push(msg.sender);
        platformFees += fee;

        emit PredictionMade(gameId, msg.sender, predictedColor);
    }

    function startGame(
        uint256 gameId
    ) external onlyOwner gameNotStarted(gameId) {
        games[gameId].started = true;
    }

    function endGameWithProof(
        uint256 gameId,
        PlayerColor winnerColor,
        uint256 attestationId,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) external onlyOwner gameNotEnded(gameId) {
        require(
            _verifyProofHasBeenPostedToZkv(
                attestationId,
                winnerColor,
                merklePath,
                leafCount,
                index
            ),
            "Invalid proof"
        );

        Game storage game = games[gameId];
        require(game.started, "Game has not started");

        game.ended = true;
        game.winner = winnerColor;

        uint256 totalRewards = (game.totalFees * 80) / 100; // 80% of platform fees
        uint256 totalWinningStake = game.stakes[winnerColor];

        uint256 rewardPerStake = totalWinningStake > 0
            ? (totalRewards * 1e18) / totalWinningStake
            : 0;

        for (uint256 i = 0; i < game.predictors.length; i++) {
            address predictor = game.predictors[i];
            PlayerColor predictedColor = game.predictions[predictor];
            uint256 userStake = game.stakes[predictedColor];

            if (predictedColor == winnerColor) {
                uint256 reward = (userStake * rewardPerStake) / 1e18;
                payable(predictor).transfer(userStake + reward);
            } else {
                payable(predictor).transfer(userStake);
            }
        }

        emit GameEnded(gameId, winnerColor);
        emit FeesDistributed(gameId, rewardPerStake);
    }

    function _verifyProofHasBeenPostedToZkv(
        uint256 attestationId,
        PlayerColor winnerColor,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) internal view returns (bool) {
        // Encode the public input (winnerColor) as bytes
        bytes memory publicInputsBytes = abi.encodePacked(uint256(winnerColor));

        // Hash the public inputs
        bytes32 publicInputsHash = keccak256(publicInputsBytes);

        // Construct the leaf digest
        bytes32 leafDigest = keccak256(
            abi.encodePacked(PROVING_SYSTEM_ID, vkHash, publicInputsHash)
        );

        // Call the zkProof verification contract to verify the proof
        (bool callSuccessful, bytes memory validProof) = zkvContract.staticcall(
            abi.encodeWithSignature(
                "verifyProofAttestation(uint256,bytes32,bytes32[],uint256,uint256)",
                attestationId,
                leafDigest,
                merklePath,
                leafCount,
                index
            )
        );

        require(callSuccessful, "Proof verification call failed");

        // Decode and return the result of the proof verification
        return abi.decode(validProof, (bool));
    }
}
