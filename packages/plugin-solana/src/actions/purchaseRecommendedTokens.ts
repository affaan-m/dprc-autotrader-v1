import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { TokenProvider } from "../providers/token.ts";
import { WalletProvider } from "../providers/wallet.ts";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getWalletKey } from "../keypairUtils.ts";
import BigNumber from "bignumber.js";
import { Scraper } from 'agent-twitter-client';


const initializeScraper = async (): Promise<Scraper> => {
    const scraper = new Scraper();

    try {
      // Verify login status directly
      const isLoggedIn = await scraper.isLoggedIn();

      if (!isLoggedIn) {
        console.log('Not logged in. Attempting login...');

        // Perform login with credentials
        const username = process.env.TWITTER_USERNAME || '';
        const password = process.env.TWITTER_PASSWORD || '';
        const email = process.env.TWITTER_EMAIL || '';

        if (!username || !password) {
          throw new Error('Missing username or password in environment variables.');
        }

        await scraper.login(username, password, email);
        console.log('Login successful!');
      } else {
        console.log('Already logged in.');
      }
    } catch (error) {
      console.error('Error during scraper initialization:', error);
      throw error;
    }

    return scraper;
  };


  let lastTweetContent: string | null = null;



function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}




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
You are a seasoned crypto trading expert. Focus only on providing token trading recommendations in valid JSON format.
Consider only 30% amount of walllet balanace as as tradable.  Based on the following available tokens for trading, my current wallet balance, and tradable wallet tokens, please recommend:
1. Which tokens I should trade.
2. How much amount of each token I should purchase to maximize profit.
3. Provide the accurate contract address (CA) for both input and output tokens in your recommendations.

**Input Details:**
Available Tokens: ${JSON.stringify(cryptoTokensJson, null, 2)}
Wallet Balance: ${JSON.stringify(walletBalance, null, 2)}
Tradable Wallet Tokens: ${JSON.stringify(tradableWalletTokens, null, 2)}

Respond ONLY with valid JSON data in the format below:
{
    "recommendations": [
        {
            "inputTokenCA": "INPUT_TOKEN_CONTRACT_ADDRESS",
            "outputTokenCA": "OUTPUT_TOKEN_CONTRACT_ADDRESS",
            "amountToBuy": "AMOUNT"
        }
    ]
}

Make sure that the values of inputTokenCA and outputTokenCA are correct.
Do not include explanations or comments. If no tokens are worth trading, return:
{
    "recommendations": []
}
`;


    await sleep(15000);
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
            temperature: 0, // Fully deterministic
            max_tokens: 300,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Raw OpenAI Response:", data);

    const llmResponse = data.choices[0]?.message?.content?.trim();
    if (!llmResponse) {
        throw new Error("Invalid or empty response from OpenAI API.");
    }
    console.log("LLM Response:", llmResponse);

    try {
        const recommendations = JSON.parse(llmResponse);
        if (!recommendations.recommendations) {
            throw new Error("Recommendations key missing in response.");
        }
        return recommendations;
    } catch (err) {
        console.error("OpenAI response parsing failed:", llmResponse);
        throw new Error(`Error parsing recommendations JSON: ${err.message}`);
    }
}

const purchaseRecommendedTokensAction: Action = {
    name: "PURCHASE_RECOMMENDED_TOKENS",
    similes: ["GET_RECOMMENDED_TOKENS", "BUY_RECOMMENDED_TOKENS"],
    description:
        "Fetches data from the BirdEye API, logs it to the console, and checks if the token should be traded for multiple tokens and purchase them.",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
          // Check if the necessary parameters are provided in the message
          console.log("Message:", message);
          return true;
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
            await sleep(15000);
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

            const totalUsd = birdEyeWalletPortfolio.data.totalUsd;
            console.log("Total USD Amount:", totalUsd);

            // Check if totalUsd is less than 20 and skip trade recommendations if true
            if (totalUsd < 20) {
                console.log("Total USD amount is less than $20 in your wallet. Skipping trade recommendations.");
                return;
            }

            await sleep(15000);
            const recommendation = await getTradeRecommendation(
                openAiApiKey,
                tradableTokens,
                birdEyeWalletPortfolio
            );

            const recommendationsResponse = recommendation.recommendations;

            if (!recommendationsResponse || recommendationsResponse.length === 0) {
                console.log("No trade recommendations available.");
                return;
            }

            console.log("Trade Recommendations:", recommendationsResponse);

            // Step 3: Pass Recommendations to buyRecommendedTokens
            await sleep(15000);
            await buyRecommendedTokens(recommendationsResponse, runtime);

            console.log("Trade execution completed.");

            return true;

        } catch (error) {
            console.error("Error in action handler:", error);
            return false;
        }
    },




    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Can you purchase some recommended tokens for me?" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "BirdEye data has been fetched, and trade recommendations are available. Now just purchased the tokens",
                    action: "PURCHASE_RECOMMENDED_TOKENS",
                },
            },
        ],
    ],
};


async function generateTradeTweet(openAiApiKey, inputToken, outputToken, amount) {
    const prompt = `Generate a professional tweet as a trading expert announcing the purchase of ${amount} tokens of ${outputToken} using ${inputToken}, explaining the rationale behind this investment. Also use the actual name of tokens instead of token's Contract Address in your response. If you don't know the token name, you can use the actual contract address. Make it in less than 280 characters.`;
    await sleep(15000);

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
        temperature: 0.6, // Adjust for creativity
        max_tokens: 280, // Twitter's character limit
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const tweetContent = data.choices[0]?.message?.content?.trim();

    if (!tweetContent) {
      throw new Error("Invalid response from OpenAI API.");
    }

    return tweetContent;
  }

/**
 * Fetch token decimals from the blockchain.
 * @param connection Solana connection object.
 * @param tokenMintAddress The mint address of the token.
 * @returns Decimals for the token.

 */

export async function getTokenDecimals(connection: Connection, tokenMintAddress: string): Promise<number> {
    try {
        const tokenMintPublicKey = new PublicKey(tokenMintAddress);
        const tokenAccountInfo = await connection.getParsedAccountInfo(tokenMintPublicKey);

        if (!tokenAccountInfo || !tokenAccountInfo.value) {
            throw new Error("Token account not found on the blockchain.");
        }

        const tokenData = tokenAccountInfo.value.data as any; // Token metadata is stored in `data`.
        if (!tokenData || !tokenData.parsed) {
            throw new Error("Invalid token account data.");
        }

        const decimals = tokenData.parsed.info.decimals;
        return decimals;
    } catch (error) {
        console.error(`Error fetching token decimals for mint ${tokenMintAddress}:`, error);
        throw error;
    }
}




async function buyRecommendedTokens(recommendations, runtime) {

    const openAiApiKey = runtime.getSetting("OPENAI_API_KEY") || "";
    try {
        const connection = new Connection("https://api.mainnet-beta.solana.com");
        const { publicKey: walletPublicKey } = await getWalletKey(runtime, false);

        for (const recommendation of recommendations) {
            let { inputTokenCA, outputTokenCA, amountToBuy } = recommendation;

            if (!inputTokenCA || !outputTokenCA || !amountToBuy) {
                console.error("Invalid recommendation data:", recommendation);
                continue;
            }
            // Check and replace invalid token contract addresses
            if (inputTokenCA === "So11111111111111111111111111111111111111111") {
                console.warn(`Invalid inputTokenCA detected: ${inputTokenCA}. Replacing with the correct CA.`);
                inputTokenCA = "So11111111111111111111111111111111111111112";
            }

            if (outputTokenCA === "So11111111111111111111111111111111111111111") {
                console.warn(`Invalid outputTokenCA detected: ${outputTokenCA}. Replacing with the correct CA.`);
                outputTokenCA = "So11111111111111111111111111111111111111112";
}
            console.log(`Preparing to swap ${amountToBuy} of ${inputTokenCA} for ${outputTokenCA}`);

            // Adjust the amount based on token decimals
            const inputTokenDecimals =
                inputTokenCA === "So11111111111111111111111111111111111111112" // SOL token address
                    ? new BigNumber(9)
                    : new BigNumber(
                          await getTokenDecimals(connection, inputTokenCA)
                      );

            let adjustedAmount = new BigNumber(amountToBuy)
            .multipliedBy(new BigNumber(10).pow(inputTokenDecimals))
            .integerValue(BigNumber.ROUND_DOWN); // Ensure the amount is an integer

            // Check if the number has more than 7 digits
            if (adjustedAmount.toString().length > 7) {
                // Scale down to 7 digits
                const scalingFactor = new BigNumber(10).pow(adjustedAmount.toString().length - 7);
                const scaledAmount = adjustedAmount.dividedBy(scalingFactor).integerValue(BigNumber.ROUND_DOWN);
                console.log("Scaled Adjusted Amount: ", scaledAmount.toString());
                adjustedAmount=scaledAmount;
            } else {
                console.log("Adjusted Amount (already adjusted):", adjustedAmount.toString());
            }


            console.log("Adjusted Amount:", adjustedAmount.toString());
            await sleep(5000);
            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${inputTokenCA}&outputMint=${outputTokenCA}&amount=${adjustedAmount}&slippageBps=50`
            );

            const quoteData = await quoteResponse.json();

            if (!quoteData || quoteData.error) {
                console.error("Error fetching quote for swap:", quoteData);
                continue;
            }

            console.log("Quote data received:", quoteData);

            const swapRequestBody = {
                quoteResponse: quoteData,
                userPublicKey: walletPublicKey.toString(),
                wrapAndUnwrapSol: true,
                computeUnitPriceMicroLamports: 2000000,
                dynamicComputeUnitLimit: true,
            };
            await sleep(5000);
            const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(swapRequestBody),
            });

            const swapData = await swapResponse.json();

            if (!swapData || !swapData.swapTransaction) {
                console.error("Error executing swap transaction:", swapData);
                continue;
            }

            console.log("Swap transaction received:", swapData);

            const transactionBuf = Buffer.from(swapData.swapTransaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBuf);

            console.log("Signing transaction...");
            const { keypair } = await getWalletKey(runtime, true);

            if (keypair.publicKey.toBase58() !== walletPublicKey.toBase58()) {
                throw new Error(
                    "Generated public key doesn't match expected public key"
                );
            }

            transaction.sign([keypair]);

            console.log("Sending transaction...");

            const latestBlockhash = await connection.getLatestBlockhash();
            const txid = await connection.sendTransaction(transaction, {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: "confirmed",
            });

            console.log(`Transaction sent successfully! Transaction ID: ${txid}`);

            const postTweet = async (tweetContent: string): Promise<void> => {
                try {
                  // Check if the new tweet content matches the last tweet
                  if (lastTweetContent === tweetContent) {
                    console.log("Tweet content is the same as the last tweet. Skipping...");
                    return;
                  }

                  const scraper = await initializeScraper();
                  await sleep(15000);

                  // Post the tweet
                  await scraper.sendTweet(tweetContent);
                  console.log("Tweet posted successfully:", tweetContent);

                  // Update the lastTweetContent
                  lastTweetContent = tweetContent;
                } catch (error) {
                  console.error("Failed to post trade tweet:", error);
                }
              };


                try {
                    const tweetContent = await generateTradeTweet(openAiApiKey, inputTokenCA, outputTokenCA, adjustedAmount);
                    console.log("Generated Tweet:", tweetContent);

                    // Post the tweet
                    await postTweet(tweetContent);
                } catch (error) {
                    console.error("Error generating tweet:", error);
                }


        }

        console.log("All recommendations processed.");
    } catch (error) {
        console.error("Error in buying recommended tokens:", error);
    }
}





export default purchaseRecommendedTokensAction;
