import axios from "axios";
import getAIMove from "./agent";
import initialGameState from "./gameState";

interface InitResponse {
  game_id: string;
  commit: string;
}

interface PlayRequest {
  game_id: string;
  current_player: number;
  dice_roll: number;
  piece_index: number;
}

interface PlayResponse {
  commit: string;
  state: LudoGameState;
  game_ended: boolean;
}

export interface LudoGameState {
  players: Player[];
  current_player: number;
  dice_roll: number;
  winners: number[];
  sixes: number;
}

export interface Player {
  name: string;
  color: string;
  pieces: Piece[];
  path: (number | string)[];
}

export interface Piece {
  position: number | string;
  status: "home" | "active" | "win";
}

const API_URL = "http://127.0.0.1:3003";

async function startGame() {
  try {
    const response = await axios.post<InitResponse>(`${API_URL}/init`);
    return response.data.game_id;
  } catch (error) {
    console.error("Failed to start game:", error);
    throw error;
  }
}

const rollDice = () => {
  return Math.floor(Math.random() * 6) + 1;
};

const getNextTurn = (
  currentTurn: number,
  winners: number[],
  totalPlayers: number
) => {
  let nextIndex = (currentTurn + 1) % totalPlayers;
  while (winners.includes(nextIndex)) {
    nextIndex = (nextIndex + 1) % totalPlayers;
  }
  return nextIndex;
};

const canMakeMove = (gameState: LudoGameState): boolean => {
  const currentPlayer = gameState.players[gameState.current_player];
  const activePieces = currentPlayer.pieces.filter(
    (piece) => piece.status === "active"
  );

  if (
    (activePieces.length === 0 && gameState.dice_roll !== 6) ||
    gameState.sixes === 3
  ) {
    return false;
  }
  return true;
};

async function playGame(gameId: string, gameState: LudoGameState) {
  try {
    // let pieceIndex = "0";
    // if (canMakeMove(gameState)) {
    //   console.log("Can make move");
    //   pieceIndex = await getAIMove(gameState);
    // }
    const diceRoll = rollDice();
    console.log("Dice roll:", diceRoll);
    const playRequest: PlayRequest = {
      game_id: gameId,
      current_player: gameState.current_player,
      dice_roll: diceRoll,
      piece_index: 0,
    };

    const response = await axios.post<PlayResponse>(
      `${API_URL}/play`,
      playRequest
    );
    return response.data;
  } catch (error) {
    console.error("Failed to play game:", error);
    throw error;
  }
}

async function main() {
  try {
    const gameId = await startGame();
    console.log(`Game started with ID: ${gameId}`);

    let gameEnded = false;
    let gameState: LudoGameState = initialGameState;

    while (!gameEnded) {
      const playResponse = await playGame(gameId, gameState);
      gameState = playResponse.state;
      gameEnded = playResponse.game_ended;

      //   console.log("Current game state:", gameState);
      console.log("Playing again");
    }

    console.log("Game ended. Winners:", gameState.winners);
  } catch (error) {
    console.error("Error during game:", error);
  }
}

main();
