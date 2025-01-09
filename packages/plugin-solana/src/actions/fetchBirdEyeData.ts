import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { TokenProvider } from "../providers/token.ts";
import { WalletProvider } from "../providers/wallet.ts";
import { Connection } from "@solana/web3.js";
import { getWalletKey } from "../keypairUtils.ts";

async function getTradeRecommendation(openAiApiKey, cryptoTokensJson, walletBalance) {
    if (!openAiApiKey || typeof openAiApiKey !== "string") {
        throw new Error("Invalid OpenAI API key.");
    }
    if (typeof cryptoTokensJson !== "object" || cryptoTokensJson === null) {
        throw new Error("Invalid cryptoTokensJson provided. It should be a non-null object.");
    }
    if (typeof walletBalance !== "object" || walletBalance === null) {
        throw new Error("Invalid walletBalance provided. It should be a non-null object.");
    }

    const tradableTokens = Object.keys(cryptoTokensJson).filter(token => cryptoTokensJson[token]);

    const walletItems = walletBalance.data?.items || [];
    const tradableWalletTokens = walletItems.filter(item =>
        tradableTokens.includes(item.symbol.toLowerCase())
    );

    const prompt = `
You are a seasoned crypto trading expert. Based on the following available tokens for trading and my current wallet balance, please recommend which tokens I should trade and how much amount of each token I should purchase to maximize profit.




**Available Tokens for Trading:** ${JSON.stringify(cryptoTokensJson, null, 2)}
**Wallet Balance:** ${JSON.stringify(walletBalance, null, 2)}
**Tradable Wallet Tokens:** ${JSON.stringify(tradableWalletTokens, null, 2)}

**Trading Budget:**
Assume I will use only (5% of my wallet balance) for trading recommendations.

Consider the following factors in your recommendation:
1. Token value in USD.
2. My trading budget
3. Market trends and liquidity of each token.
4. Any other relevant metrics for maximizing profitability.

If no tokens are worth trading, state "No trade recommended."

**Provide your recommendation in the following JSON format:**
{
    "recommendations": [
        {
            "token": "TOKEN_SYMBOL",
            "amountToBuy": "AMOUNT"
        },
        ...
    ]
}
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4",
            messages: [
                { role: "system", content: "You are ChatGPT, a crypto trading expert." },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 300, // Increase max tokens for more detailed output
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const llmResponse = data.choices[0].message.content.trim();

    const recommendations = JSON.parse(llmResponse.match(/\{[\s\S]*\}/)[0]);
    return recommendations;
}

const fetchBirdEyeDataAction: Action = {
    name: "FETCH_BIRDEYE_DATA",
    similes: ["GET_BIRDEYE_DATA", "FETCH_API_DATA"],
    description:
        "Fetches data from the BirdEye API, logs it to the console, and checks if the token should be traded for multiple tokens.",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = (message.content as { text: string }).text.toLowerCase();
        return text.includes("birdeye") || text.includes("fetch data");
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            const apiKey = runtime.getSetting("BIRDEYE_API_KEY") || "";
            const walletAddress = runtime.getSetting("WALLET_PUBLIC_KEY") || "";
            const openAiApiKey = runtime.getSetting("OPENAI_API_KEY") || "";

            if (!apiKey || !walletAddress || !openAiApiKey) {
                throw new Error("Missing API keys or Wallet Address in the application settings.");
            }

            const endpoint = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${walletAddress}`;
            const options = {
                method: "GET",
                headers: {
                    accept: "application/json",
                    "X-API-KEY": apiKey,
                    "x-chain": "solana",
                },
            };

            const response = await fetch(endpoint, options);
            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }
            const birdEyeWalletPortfolio = await response.json();
            console.log("Current Wallet Portfolio:", birdEyeWalletPortfolio);

            const connection = new Connection("https://api.mainnet-beta.solana.com");
            const { publicKey } = await getWalletKey(runtime, false);
            const walletProvider = new WalletProvider(connection, publicKey);

            const tokens = [
                { name: "SOL", address: "So11111111111111111111111111111111111111112" },
                { name: "USD Coin", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
                { name: "Bonk", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
            ];

            const results = [];
            for (const token of tokens) {
                const tokenProvider = new TokenProvider(
                    token.address,
                    walletProvider,
                    runtime.cacheManager
                );
                const shouldTrade = await tokenProvider.shouldTradeToken();
                results.push({ token: token.name, shouldTrade });
            }
            console.log("Current Wallet Portfolio:", JSON.stringify(birdEyeWalletPortfolio, null, 2));
            console.log("Results:", results);

            const tradableTokens = results.reduce((acc, cur) => {
                acc[cur.token.toLowerCase()] = cur.shouldTrade;
                return acc;
            }, {});

            const recommendation = await getTradeRecommendation(
                openAiApiKey,
                tradableTokens,
                birdEyeWalletPortfolio
            );

            console.log("Trade Recommendation:", recommendation);

            return {
                birdEyeWalletPortfolio,
                results,
                recommendation,
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
                content: { text: "Fetch BirdEye data and get trade recommendations" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "BirdEye data has been fetched, and trade recommendations are available.",
                    action: "FETCH_BIRDEYE_DATA",
                },
            },
        ],
    ],
};

export default fetchBirdEyeDataAction;
