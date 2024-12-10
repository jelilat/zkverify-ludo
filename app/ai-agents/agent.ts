import OpenAI from "openai";
// import { config } from "dotenv";
import type { LudoGameState } from "./play";
// config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getAIMove = async (gameState: LudoGameState) => {
  const completion = await openai.chat.completions.create({
    model: "o1-preview",
    messages: [
      {
        role: "user",
        content: `
        You are a Ludo game player. You are given the current state of the game and you need to make a move.
        The game state is: ${JSON.stringify(gameState)}
        You need to make a move.

        Tell me which piece you want to move. No gibberish. Don't say anything, just the piece number. (e.g. 1)
        `,
      },
    ],
  });
  console.log(completion.choices[0].message.content);

  return completion.choices[0].message.content;
};

export default getAIMove;
