import {
    ActionExample,
    composeContext,
    generateObjectDeprecated,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    settings,
    State,
    type Action,
} from "@elizaos/core";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { getWalletKey } from "../keypairUtils.ts";
import { walletProvider, WalletProvider } from "../providers/wallet.ts";
import { getTokenDecimals } from "./swapUtils.ts";
import { TwitterApi } from 'twitter-api-v2';
import OpenAI from 'openai'; // Correct import for OpenAI

import fetch from "node-fetch";

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();


// Hardcoding credentials for testing
const API_KEY = process.env.TWITTER_API_KEY || "qDDfinpYrMMbwly2P6Kq97TLI";
const API_KEY_SECRET = process.env.TWITTER_API_KEY_SECRET || "qXZrESA4tjCK0bf3Ilf4w4ksojPveGtxVZQvZS1CoiVgtDYPby";
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || "1870053544553791488-WCnRgsZx8ArKSJAnBOZEyjEg7WDFZ7";
const ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET || "pyInshJDb2ykoE4ylJifXDGiaTFbDLGgccT6Xpu9ChvOc";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize Twitter client
const client = new TwitterApi({
  appKey: API_KEY,
  appSecret: API_KEY_SECRET,
  accessToken: ACCESS_TOKEN,
  accessSecret: ACCESS_TOKEN_SECRET,
});



// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

async function postTweet(tweetText: string) {
  try {
    // Send the tweet
    const response = await client.v2.tweet(tweetText);
    console.log(`Tweet posted successfully:`, response);
  } catch (error) {
    console.error(`An error occurred while posting the tweet:`, error);
  }
}





async function swapToken(
    connection: Connection,
    walletPublicKey: PublicKey,
    inputTokenCA: string,
    outputTokenCA: string,
    amount: number
): Promise<any> {
    try {
        // Get the decimals for the input token
        const decimals =
            inputTokenCA === settings.SOL_ADDRESS
                ? new BigNumber(9)
                : new BigNumber(
                      await getTokenDecimals(connection, inputTokenCA)
                  );

        console.log("Decimals:", decimals.toString());

        // Use BigNumber for adjustedAmount: amount * (10 ** decimals)
        const amountBN = new BigNumber(amount);
        const adjustedAmount = amountBN.multipliedBy(
            new BigNumber(10).pow(decimals)
        );

        console.log("Fetching quote with params:", {
            inputMint: inputTokenCA,
            outputMint: outputTokenCA,
            amount: adjustedAmount,
        });
                        //Hard coding values for testing
        const quoteResponse = await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${inputTokenCA}&outputMint=${outputTokenCA}&amount=${adjustedAmount}&slippageBps=50`
        );

        console.log("Jupiter URL to call the swaping", quoteResponse)
        const quoteData = await quoteResponse.json();

        if (!quoteData || quoteData.error) {
            console.error("Quote error:", quoteData);
            throw new Error(
                `Failed to get quote: ${quoteData?.error || "Unknown error"}`
            );
        }

        console.log("Quote received:", quoteData);

        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: walletPublicKey.toString(),
            wrapAndUnwrapSol: true,
            computeUnitPriceMicroLamports: 2000000,
            dynamicComputeUnitLimit: true,
        };

        console.log("Requesting swap with body:", swapRequestBody);

        const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(swapRequestBody),
        });

        const swapData = await swapResponse.json();

        if (!swapData || !swapData.swapTransaction) {
            console.error("Swap error:", swapData);
            throw new Error(
                `Failed to get swap transaction: ${swapData?.error || "No swap transaction returned"}`
            );
        }

        console.log("Swap transaction received");
        return swapData;
    } catch (error) {
        console.error("Error in swapToken:", error);
        throw error;
    }
}

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "USDC",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": 1.5
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token symbol (the token being sold)
- Output token symbol (the token being bought)
- Input token contract address if provided
- Output token contract address if provided
- Amount to swap

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "inputTokenSymbol": string | null,
    "outputTokenSymbol": string | null,
    "inputTokenCA": string | null,
    "outputTokenCA": string | null,
    "amount": number | string | null
}
\`\`\``;

// if we get the token symbol but not the CA, check walet for matching token, and if we have, get the CA for it

// get all the tokens in the wallet using the wallet provider
async function getTokensInWallet(runtime: IAgentRuntime) {
    const { publicKey } = await getWalletKey(runtime, false);
    const walletProvider = new WalletProvider(
        new Connection("https://api.mainnet-beta.solana.com"),
        publicKey
    );

    const walletInfo = await walletProvider.fetchPortfolioValue(runtime);
    const items = walletInfo.items;
    return items;
}

// check if the token symbol is in the wallet
async function getTokenFromWallet(runtime: IAgentRuntime, tokenSymbol: string) {
    try {
        const items = await getTokensInWallet(runtime);
        const token = items.find((item) => item.symbol === tokenSymbol);

        if (token) {
            return token.address;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error checking token in wallet:", error);
        return null;
    }
}

// swapToken should took CA, not symbol

export const executeSwap: Action = {
    name: "EXECUTE_SWAP",
    similes: ["SWAP_TOKENS", "TOKEN_SWAP", "TRADE_TOKENS", "EXCHANGE_TOKENS"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        console.log("Message:", message);
        return true;
    },
    description: "Perform a token swap.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const walletInfo = await walletProvider.get(runtime, message, state);

        state.walletInfo = walletInfo;

        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });

        const response = await generateObjectDeprecated({
            runtime,
            context: swapContext,
            modelClass: ModelClass.LARGE,
        });


        console.log("Response:", response);
        // const type = response.inputTokenSymbol?.toUpperCase() === "SOL" ? "buy" : "sell";

        response.inputTokenSymbol="SOL";
        response.outputTokenSymbol="USDC";

        // Add SOL handling logic
        if (response.inputTokenSymbol?.toUpperCase() === "SOL") {
            response.inputTokenCA = settings.SOL_ADDRESS;
            response.inputTokenCA="So11111111111111111111111111111111111111112";

        }
        if (response.outputTokenSymbol?.toUpperCase() === "SOL") {
            response.outputTokenCA = settings.SOL_ADDRESS;
            response.outputTokenCA="So11111111111111111111111111111111111111112";

        }
        // if both contract addresses are set, lets execute the swap
        // TODO: try to resolve CA from symbol based on existing symbol in wallet
        if (!response.inputTokenCA && response.inputTokenSymbol) {
            console.log(
                `Attempting to resolve CA for input token symbol: ${response.inputTokenSymbol}`
            );
            response.inputTokenCA = await getTokenFromWallet(
                runtime,
                response.inputTokenSymbol
            );
            //Hard coding values for testing
            response.inputTokenCA="So11111111111111111111111111111111111111112";
            if (response.inputTokenCA) {
                console.log(`Resolved inputTokenCA: ${response.inputTokenCA}`);
            } else {
                console.log("No contract addresses provided, skipping swap");
                const responseMsg = {
                    text: "I need the contract addresses to perform the swap",
                };
                callback?.(responseMsg);
                return true;
            }
        }

        if (!response.outputTokenCA && response.outputTokenSymbol) {
            console.log(
                `Attempting to resolve CA for output token symbol: ${response.outputTokenSymbol}`
            );
            response.outputTokenCA = await getTokenFromWallet(
                runtime,
                response.outputTokenSymbol
            );
            //Hard coding values for testing
            response.outputTokenCA="So11111111111111111111111111111111111111112";
            if (response.outputTokenCA) {
                console.log(
                    `Resolved outputTokenCA: ${response.outputTokenCA}`
                );
            } else {
                console.log("No contract addresses provided, skipping swap");
                const responseMsg = {
                    text: "I need the contract addresses to perform the swap",
                };
                callback?.(responseMsg);
                return true;
            }
        }

        if (!response.amount) {
            console.log("No amount provided, skipping swap");
            const responseMsg = {
                text: "I need the amount to perform the swap",
            };
            callback?.(responseMsg);
            return true;
        }

        // TODO: if response amount is half, all, etc, semantically retrieve amount and return as number
        if (!response.amount) {
            console.log("Amount is not a number, skipping swap");
            const responseMsg = {
                text: "The amount must be a number",
            };
            callback?.(responseMsg);
            return true;
        }
        try {
            const connection = new Connection(
                "https://api.mainnet-beta.solana.com"
            );
            const { publicKey: walletPublicKey } = await getWalletKey(
                runtime,
                false
            );

            // const provider = new WalletProvider(connection, walletPublicKey);
            response.amount=0.0008;
            console.log("Wallet Public Key:", walletPublicKey);
            console.log("inputTokenSymbol:", response.inputTokenCA);
            console.log("outputTokenSymbol:", response.outputTokenCA);
            console.log("amount:", response.amount);

            const swapResult = await swapToken(
                connection,
                walletPublicKey,
                response.inputTokenCA as string,
                response.outputTokenCA as string,
                response.amount as number
            );

            console.log("Deserializing transaction...");
            const transactionBuf = Buffer.from(
                swapResult.swapTransaction,
                "base64"
            );
            const transaction =
                VersionedTransaction.deserialize(transactionBuf);

            console.log("Preparing to sign transaction...");

            console.log("Creating keypair...");
            const { keypair } = await getWalletKey(runtime, true);
            // Verify the public key matches what we expect
            //console.log("Public Key from the Key pair: ", keypair.publicKey.toBase58())
            //console.log("Public Key from the Wallet: ", walletPublicKey.toBase58())

            if (keypair.publicKey.toBase58() !== walletPublicKey.toBase58()) {

                throw new Error(
                    "Generated public key doesn't match expected public key"
                );
            }

            console.log("Signing transaction...");
            transaction.sign([keypair]);

            console.log("Sending transaction...");

            const latestBlockhash = await connection.getLatestBlockhash();
            console.log("Latest Block hash has beed fetched");

            const txid = await connection.sendTransaction(transaction, {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: "confirmed",
            });

            console.log("Transaction sent:", txid);

            console.log("Sending the tweet on twitter:");
            const openai_response = await openai.chat.completions.create({
               model: 'gpt-4',
               messages: [
                 {
                   role: 'system',
                   content: 'You are an assistant that writes concise and engaging tweets about cryptocurrency trades.',
              },
              {
                role: 'user',
                    content: `Generate a tweet about swapping ${response.amount} ${response.inputTokenSymbol} to ${response.outputTokenSymbol}.
                      The tweet should explain the action in a conversational and informative tone with a rationale for why this swap was made.
                     Keep the tweet under 280 characters. Avoid hashtags, emojis, or promotional language.`,
                 },
               ],
             max_tokens: 100,
             });

            const tweetContent = openai_response.choices[0]?.message?.content.trim();


            console.log("Content of the twitter post is : ", tweetContent);

            postTweet(tweetContent);

            console.log("Posted the tweet on twitter:");

            // Confirm transaction using the blockhash
            const confirmation = await connection.confirmTransaction(
                {
                    signature: txid,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                },
                "confirmed"
            );

            if (confirmation.value.err) {
                throw new Error(
                    `Transaction failed: ${confirmation.value.err}`
                );
            }

            if (confirmation.value.err) {
                throw new Error(
                    `Transaction failed: ${confirmation.value.err}`
                );
            }

            console.log("Swap completed successfully!");
            console.log(`Transaction ID: ${txid}`);

            const responseMsg = {
                text: `Swap completed successfully! Transaction ID: ${txid}`,
            };

            callback?.(responseMsg);

            return true;
        } catch (error) {
            console.error("Error during token swap:", error);
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    inputTokenSymbol: "SOL",
                    outputTokenSymbol: "USDC",
                    amount: 0.1,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 0.1 SOL for USDC...",
                    action: "TOKEN_SWAP",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swap completed successfully! Transaction ID: ...",
                },
            },
        ],
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;
