import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { TokenProvider } from "../providers/token.ts";
import { WalletProvider } from "../providers/wallet.ts";
import { Connection } from "@solana/web3.js";
import { getWalletKey } from "../keypairUtils.ts";

const fetchBirdEyeDataAction: Action = {
    name: "FETCH_BIRDEYE_DATA",
    similes: ["GET_BIRDEYE_DATA", "FETCH_API_DATA"],
    description:
        "Fetches data from the BirdEye API, logs it to the console, and checks if the token should be traded for multiple tokens.",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Validation: Check if the message contains "BirdEye" or related keywords
        const text = (message.content as { text: string }).text.toLowerCase();
        return text.includes("birdeye") || text.includes("fetch data");
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            // Get the BirdEye API key and wallet address from runtime settings
            const apiKey = runtime.getSetting("BIRDEYE_API_KEY") || "";
            const walletAddress = runtime.getSetting("WALLET_PUBLIC_KEY") || "";

            if (!apiKey || !walletAddress) {
                throw new Error(
                    "BirdEye API key or Wallet Address is missing. Please set it in the application settings."
                );
            }

            // Define the BirdEye API endpoint and options
            const endpoint = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${walletAddress}`;
            const options = {
                method: "GET",
                headers: {
                    accept: "application/json",
                    "X-API-KEY": apiKey,
                    "x-chain": "solana", // Specify the blockchain (e.g., "ethereum" or "solana")
                },
            };

            // Fetch data from the BirdEye API
            const response = await fetch(endpoint, options);
            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }
            const birdEyeWalletPortfolio = await response.json();
            console.log("My Current Wallet Portfolio:");
            console.log(JSON.stringify(birdEyeWalletPortfolio, null, 2));

            // Initialize Solana connection
            const connection = new Connection("https://api.mainnet-beta.solana.com");
            const { publicKey } = await getWalletKey(runtime, false);
            const walletProvider = new WalletProvider(connection, publicKey);

            // List of tokens to check
            const tokens = [
                { name: "SOL", address: "So11111111111111111111111111111111111111112" },
                { name: "USD Coin", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
                { name: "Bonk", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
            ];

            // Array to store results
            const results = [];

            // Loop through each token and check `shouldTradeToken`
            for (const token of tokens) {
                console.log(`Checking if token ${token.name} (${token.address}) should be traded...`);

                // Initialize TokenProvider for the current token
                const tokenProvider = new TokenProvider(
                    token.address,
                    walletProvider,
                    runtime.cacheManager
                );

                // Run `shouldTradeToken` for the current token
                const shouldTrade = await tokenProvider.shouldTradeToken();
                console.log(`Result for ${token.name}:`, shouldTrade);

                // Store the result
                results.push({ token: token.name, shouldTrade });
            }

            // Display all results at the end
            console.log("\nFinal Results:");
            results.forEach((result) => {
                console.log(`${result.token}: ${result.shouldTrade ? "Trade" : "Do Not Trade"}`);
            });

            return {
                birdEyeWalletPortfolio,
                results,
            };
        } catch (error) {
            console.error("Error in action handler:", error);
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Fetch BirdEye data and check if tokens should be traded" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "BirdEye data has been fetched and logged to the console. Token trade status checked for all tokens.",
                    action: "FETCH_BIRDEYE_DATA",
                },
            },
        ],
    ],
};

export default fetchBirdEyeDataAction;
