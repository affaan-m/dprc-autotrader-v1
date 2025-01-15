import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getWalletKey } from "../keypairUtils.ts";
import BigNumber from "bignumber.js";
import { Scraper } from "agent-twitter-client";

interface IPosition {
  ticker: string;
  tokenCA: string;
  costBasisSOL: number;
  quantity: number;
  partialSales: number;
}

const purchasedPositions: Record<string, IPosition> = {};
const recentlyPurchasedTokens: Set<string> = new Set();
let lastTweetContent: string | null = null;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeScraper(): Promise<Scraper> {
  const scraper = new Scraper();
  try {
    const isLoggedIn = await scraper.isLoggedIn();
    if (!isLoggedIn) {
      console.log("Not logged in. Attempting login...");
      const username = process.env.TWITTER_USERNAME || "";
      const password = process.env.TWITTER_PASSWORD || "";
      const email = process.env.TWITTER_EMAIL || "";
      if (!username || !password) {
        throw new Error("Missing username or password in environment variables.");
      }
      await scraper.login(username, password, email);
      console.log("Login successful!");
    } else {
      console.log("Already logged in.");
    }
  } catch (error) {
    console.error("Error during scraper initialization:", error);
    throw error;
  }
  return scraper;
}

async function hasSufficientBalance(
  runtime: IAgentRuntime,
  apiKey: string,
  walletAddress: string
): Promise<boolean> {
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const solBalanceLamports = await connection.getBalance(new PublicKey(walletAddress));
  const solBalance = solBalanceLamports / 1e9;
  console.log(`Wallet SOL Balance: ${solBalance.toFixed(4)} SOL`);

  const endpoint = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${walletAddress}`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-API-KEY": apiKey,
      "x-chain": "solana",
    },
  };
  await sleep(5000);

  const response = await fetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`Wallet portfolio API call failed with status: ${response.status}`);
  }
  const portfolioData = await response.json();
  const totalUsd = portfolioData?.data?.totalUsd || 0;
  console.log(`Wallet Total USD: $${totalUsd}`);

  if (solBalance >= 0.1 || totalUsd >= 20) {
    return true;
  }
  console.log("Insufficient balance: need at least 0.1 SOL or $20 to proceed.");
  return false;
}

function pickBirdEyeEndpoint(): string {
  const endpoints = [
    "https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=20",
    "https://public-api.birdeye.so/defi/token_trending?sort_by=volume24hUSD&sort_type=asc&offset=0&limit=20",
    "https://public-api.birdeye.so/defi/token_trending?sort_by=liquidity&sort_type=asc&offset=0&limit=20",
    "https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20&meme_platform_enabled=true"
  ];
  const idx = Math.floor(Math.random() * endpoints.length);
  return endpoints[idx];
}

async function getTradeRecommendation(
  openAiApiKey: string,
  cryptoTokensJson: object,
  solBalance: number
) {
  if (!openAiApiKey || typeof openAiApiKey !== "string") {
    throw new Error("Invalid OpenAI API key.");
  }
  if (typeof cryptoTokensJson !== "object" || cryptoTokensJson === null) {
    throw new Error("Invalid cryptoTokensJson provided.");
  }

  const maxSolToUseFraction = 0.20;
  const maxSolPerPosition = solBalance * maxSolToUseFraction;

  const prompt = `
You are a seasoned crypto trading expert. Focus only on providing token trading recommendations in valid JSON format.

Key Constraints:
1. ALWAYS use the SOL contract address ("So11111111111111111111111111111111111111112") as the input token.
2. The output token's contract address must NOT be the same as the input token's address.
3. If you would recommend SOL as an output token, skip it.
4. My wallet SOL balance is ${solBalance.toFixed(4)}. Use at most ${(
    maxSolToUseFraction * 100
  ).toFixed(0)}% of this for any single trade (i.e. up to ${maxSolPerPosition.toFixed(4)} SOL max).
5. Provide how much of each token to purchase (amountToBuy) and the approximate amount in SOL (amountToBuyInSol).

Trending Tokens: ${JSON.stringify(cryptoTokensJson, null, 2)}

Output ONLY valid JSON in the format:
{
  "recommendations": [
    {
      "ticker": "SYMBOL_HERE",
      "inputTokenCA": "So11111111111111111111111111111111111111112",
      "outputTokenCA": "OUTPUT_TOKEN_CONTRACT_ADDRESS",
      "amountToBuy": "AMOUNT",
      "amountToBuyInSol": "AMOUNT_IN_SOL"
    }
  ]
}

If no tokens are worth trading, return:
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
      temperature: 0,
      max_tokens: 800,
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
      throw new Error("Recommendations key missing in LLM response.");
    }
    return recommendations;
  } catch (err) {
    console.error("OpenAI response parsing failed:", llmResponse);
    throw new Error(`Error parsing recommendations JSON: ${err.message}`);
  }
}

async function fetchTokenMetadata(apiKey: string, addresses: string[]): Promise<Record<string, any>> {
  if (addresses.length === 0) {
    return {};
  }
  const encodedList = encodeURIComponent(addresses.join(","));
  const endpoint = `https://public-api.birdeye.so/defi/v3/token/meta-data/multiple?list_address=${encodedList}`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-API-KEY": apiKey,
      "x-chain": "solana",
    },
  };
  await sleep(5000);

  const response = await fetch(endpoint, options);
  if (!response.ok) {
    console.error(`Failed to fetch token metadata: ${response.status}`);
    return {};
  }
  const result = await response.json();
  const metaMap: Record<string, any> = {};

  if (result && result.data && Array.isArray(result.data)) {
    for (const item of result.data) {
      if (!item?.address) continue;
      metaMap[item.address] = item;
    }
  }
  return metaMap;
}

async function generateTradeTweet(
  openAiApiKey: string,
  ticker: string,
  outputTokenCA: string,
  amountToBuyInSol: string,
  tokenMetadata: any,
  txExplorerUrl: string
): Promise<string> {
  const name = tokenMetadata?.name || ticker;
  const symbol = tokenMetadata?.symbol || ticker;
  const shortDesc = tokenMetadata?.description
    ? tokenMetadata.description.slice(0, 100)
    : "";

  const prompt = `
Generate a concise, professional tweet announcing the purchase of ${amountToBuyInSol} SOL worth of ${name} (${symbol}, CA: ${outputTokenCA}) Tx: ${txExplorerUrl}.
You have these real facts from BirdEye:
Name: ${name}
Symbol: ${symbol}
Short Description: ${shortDesc}

Do not invent facts beyond this data.
Use a stoic rationale maybe a quote from Marcus Aurelius or Seneca or any other stoic philosopher. No hashtags. Under 280 chars.
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
      temperature: 0.6,
      max_tokens: 280,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const tweetContent = data.choices[0]?.message?.content?.trim();
  if (!tweetContent) {
    throw new Error("Invalid response from OpenAI API (empty tweet).");
  }

  return tweetContent;
}

async function generateSellTweet(
  openAiApiKey: string,
  ticker: string,
  tokensSold: number,
  solReceived: number,
  approxProfitSol: number
): Promise<string> {
  const prompt = `
Write a concise tweet announcing we sold ${tokensSold.toFixed(2)} tokens of ${ticker}, receiving approx ${solReceived.toFixed(
    3
  )} SOL.
Profit (or loss) ~ ${approxProfitSol.toFixed(3)} SOL.
A stoic perspective, no hashtags, under 280 characters.
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
      temperature: 0.6,
      max_tokens: 280,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const tweetContent = data.choices[0]?.message?.content?.trim();
  if (!tweetContent) {
    throw new Error("Invalid response from OpenAI API (empty tweet).");
  }

  return tweetContent;
}

export async function getTokenDecimals(
  connection: Connection,
  tokenMintAddress: string
): Promise<number> {
  try {
    const tokenMintPublicKey = new PublicKey(tokenMintAddress);
    const tokenAccountInfo = await connection.getParsedAccountInfo(tokenMintPublicKey);
    if (!tokenAccountInfo || !tokenAccountInfo.value) {
      throw new Error("Token account not found on the blockchain.");
    }
    const tokenData = tokenAccountInfo.value.data as any;
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

async function buyRecommendedTokens(recommendations: any[], runtime: IAgentRuntime) {
  const openAiApiKey = runtime.getSetting("OPENAI_API_KEY") || "";
  const apiKey = runtime.getSetting("BIRDEYE_API_KEY") || "";
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const { publicKey: walletPublicKey } = await getWalletKey(runtime, false);
  const lamportsBalance = await connection.getBalance(walletPublicKey);
  const solBalance = lamportsBalance / 1e9;

  const finalRecs = recommendations.filter(
    (r) => !recentlyPurchasedTokens.has(r.outputTokenCA)
  );
  const addressesToFetch = finalRecs.map((r) => r.outputTokenCA);
  const metadataMap = await fetchTokenMetadata(apiKey, addressesToFetch);

  for (const recommendation of finalRecs) {
    const {
      ticker,
      inputTokenCA,
      outputTokenCA,
      amountToBuy,
      amountToBuyInSol
    } = recommendation;

    if (!ticker || !inputTokenCA || !outputTokenCA || !amountToBuy || !amountToBuyInSol) {
      console.error("Invalid recommendation data:", recommendation);
      continue;
    }
    if (inputTokenCA === outputTokenCA) {
      console.error("Error: LLM recommended same input & output. Skipping trade.");
      continue;
    }

    const desiredSol = new BigNumber(amountToBuyInSol);
    if (desiredSol.isNaN() || desiredSol.lte(0)) {
      console.error(`LLM recommended invalid SOL: ${desiredSol.toString()}. Skipping...`);
      continue;
    }

    const safeSolForTrade = solBalance - 0.01;
    if (desiredSol.gt(safeSolForTrade)) {
      console.error(`LLM suggests ${desiredSol.toString()} SOL but we only have ${safeSolForTrade} SOL. Skipping...`);
      continue;
    }

    console.log(`Preparing to swap ${desiredSol.toString()} of ${inputTokenCA} for ${outputTokenCA}`);
    const inputTokenDecimals =
      inputTokenCA === "So11111111111111111111111111111111111111112"
        ? new BigNumber(9)
        : new BigNumber(await getTokenDecimals(connection, inputTokenCA));

    let adjustedAmount = new BigNumber(amountToBuyInSol)
      .multipliedBy(new BigNumber(10).pow(inputTokenDecimals))
      .integerValue(BigNumber.ROUND_DOWN);

    if (adjustedAmount.lte(0)) {
      console.error(`Invalid adjusted amount: ${adjustedAmount.toString()}. Skipping...`);
      continue;
    }
    console.log("Adjusted Amount (base units):", adjustedAmount.toString());

    await sleep(5000);

    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputTokenCA}&outputMint=${outputTokenCA}&amount=${adjustedAmount}&slippageBps=50`;
    const quoteResponse = await fetch(quoteUrl);
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
      throw new Error("Generated public key doesn't match expected public key");
    }
    transaction.sign([keypair]);

    console.log("Sending transaction...");
    const latestBlockhash = await connection.getLatestBlockhash();
    let txid: string;
    try {
      txid = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });
    } catch (err) {
      console.error("Send transaction error:", err);
      continue;
    }
    console.log(`Transaction sent successfully! Transaction ID: ${txid}`);
    const txExplorerUrl = `https://solscan.io/tx/${txid}?cluster=mainnet`;

    const outAmountLamports = quoteData?.data?.[0]?.outAmount || 0;
    const outputTokenDecimals =
      outputTokenCA === "So11111111111111111111111111111111111111112"
        ? 9
        : await getTokenDecimals(connection, outputTokenCA);

    const acquiredQuantityBN = new BigNumber(outAmountLamports).div(
      new BigNumber(10).pow(outputTokenDecimals)
    );
    if (acquiredQuantityBN.isFinite() && acquiredQuantityBN.gt(1e-12)) {
      const acquiredQuantity = acquiredQuantityBN.toNumber();
      const spentSol = parseFloat(amountToBuyInSol);

      const costBasisSOL = new BigNumber(spentSol).div(acquiredQuantityBN).toNumber();
      purchasedPositions[outputTokenCA] = {
        ticker,
        tokenCA: outputTokenCA,
        costBasisSOL,
        quantity: (purchasedPositions[outputTokenCA]?.quantity || 0) + acquiredQuantity,
        partialSales: purchasedPositions[outputTokenCA]?.partialSales || 0,
      };
    } else {
      console.warn("Acquired quantity too small or invalid; skipping cost basis update");
    }

    recentlyPurchasedTokens.add(outputTokenCA);
    await sleep(500000); // 5 minutes between trades/tweets

    const postTweet = async (tweetContent: string): Promise<void> => {
      try {
        if (lastTweetContent === tweetContent) {
          console.log("Tweet content is the same as last tweet. Skipping...");
          return;
        }
        const scraper = await initializeScraper();
        await sleep(15000);
        await scraper.sendTweet(tweetContent);
        console.log("Tweet posted successfully:", tweetContent);
        lastTweetContent = tweetContent;
      } catch (error) {
        console.error("Failed to post trade tweet:", error);
      }
    };

    try {
      const meta = metadataMap[outputTokenCA] || {};
      const tweetContent = await generateTradeTweet(
        openAiApiKey,
        ticker,
        outputTokenCA,
        amountToBuyInSol,
        meta,
        txExplorerUrl
      );
      console.log("Generated Tweet:", tweetContent);
      await postTweet(tweetContent);
    } catch (error) {
      console.error("Error generating tweet:", error);
    }
  }

  console.log("All buy recommendations processed.");
}

async function fetchCurrentPriceInSOL(tokenMint: string, connection: Connection): Promise<number> {
  try {
    const decimals = await getTokenDecimals(connection, tokenMint);
    const oneTokenInBaseUnits = new BigNumber(10).pow(decimals).toString();
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=${oneTokenInBaseUnits}&slippageBps=50`;
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    const outAmountLamports = quoteData?.data?.[0]?.outAmount || 0;
    const outSOL = new BigNumber(outAmountLamports).div(1e9).toNumber();
    return outSOL;
  } catch (error) {
    console.error("Error fetching current price in SOL:", error);
    return 0;
  }
}

async function sellExactPercentageOfPosition(
  runtime: IAgentRuntime,
  pos: IPosition,
  fraction: number
) {
  const openAiApiKey = runtime.getSetting("OPENAI_API_KEY") || "";
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const { publicKey: walletPublicKey } = await getWalletKey(runtime, false);

  const tokensToSell = pos.quantity * fraction;
  if (tokensToSell <= 0) return;

  const decimals = await getTokenDecimals(connection, pos.tokenCA);
  let adjustedAmount = new BigNumber(tokensToSell)
    .multipliedBy(new BigNumber(10).pow(decimals))
    .integerValue(BigNumber.ROUND_DOWN);

  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${pos.tokenCA}&outputMint=So11111111111111111111111111111111111111112&amount=${adjustedAmount}&slippageBps=50`;
  await sleep(3000);
  const quoteResponse = await fetch(quoteUrl);
  const quoteData = await quoteResponse.json();

  if (!quoteData || quoteData.error) {
    console.error("Error fetching quote for selling:", quoteData);
    return;
  }

  const swapRequestBody = {
    quoteResponse: quoteData,
    userPublicKey: walletPublicKey.toString(),
    wrapAndUnwrapSol: true,
    computeUnitPriceMicroLamports: 2000000,
    dynamicComputeUnitLimit: true,
  };
  await sleep(3000);

  const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swapRequestBody),
  });
  const swapData = await swapResponse.json();
  if (!swapData || !swapData.swapTransaction) {
    console.error("Error executing swap transaction for selling:", swapData);
    return;
  }

  const transactionBuf = Buffer.from(swapData.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(transactionBuf);
  console.log("Signing sell transaction...");

  const { keypair } = await getWalletKey(runtime, true);
  transaction.sign([keypair]);

  let txid: string;
  try {
    txid = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    console.error("Send transaction error (selling):", err);
    return;
  }
  console.log(`Sell transaction sent successfully! Transaction ID: ${txid}`);

  pos.quantity -= tokensToSell;
  console.log(`Sold ${tokensToSell} tokens of ${pos.ticker}. Remaining quantity = ${pos.quantity}`);

  const outAmountLamports = quoteData?.data?.[0]?.outAmount || 0;
  const solReceived = new BigNumber(outAmountLamports).div(1e9).toNumber();

  const currentPriceSOL = await fetchCurrentPriceInSOL(pos.tokenCA, connection);
  const profitPerTokenInSOL = currentPriceSOL - pos.costBasisSOL;
  const approximateProfitInSOL = profitPerTokenInSOL * tokensToSell;

  const postTweet = async (tweetContent: string): Promise<void> => {
    try {
      if (lastTweetContent === tweetContent) {
        console.log("Tweet content is the same as last tweet. Skipping...");
        return;
      }
      const scraper = await initializeScraper();
      await sleep(15000);
      await scraper.sendTweet(tweetContent);
      console.log("Sell Tweet posted successfully:", tweetContent);
      lastTweetContent = tweetContent;
    } catch (error) {
      console.error("Failed to post sell tweet:", error);
    }
  };

  try {
    const tweetContent = await generateSellTweet(
      openAiApiKey,
      pos.ticker,
      tokensToSell,
      solReceived,
      approximateProfitInSOL
    );
    console.log("Generated Sell Tweet:", tweetContent);
    await postTweet(tweetContent);
  } catch (error) {
    console.error("Error generating tweet for sale:", error);
  }
}

async function sellTokensIfNeeded(runtime: IAgentRuntime) {
  console.log("Checking if we should sell any positions based on PnL thresholds...");
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const positionsList = Object.values(purchasedPositions);

  for (const pos of positionsList) {
    if (pos.quantity <= 0) {
      continue;
    }
    const currentPriceSOL = await fetchCurrentPriceInSOL(pos.tokenCA, connection);
    if (!currentPriceSOL) {
      console.log(`Cannot fetch price for token: ${pos.tokenCA}, skipping...`);
      continue;
    }
    const ratio = currentPriceSOL / pos.costBasisSOL;
    console.log(
      `Ticker ${pos.ticker}, ratio = ${ratio.toFixed(2)} (current / costBasis). partialSales: ${pos.partialSales}`
    );

    if (ratio <= 0.5) {
      await sellExactPercentageOfPosition(runtime, pos, 1.0);
      pos.quantity = 0;
      console.log(`Sold 100% of ${pos.ticker} due to -50% drawdown.`);
      continue;
    }
    if (ratio >= 2 && pos.partialSales < 1) {
      await sellExactPercentageOfPosition(runtime, pos, 0.5);
      pos.partialSales = 1;
    }
    if (ratio >= 4 && pos.partialSales < 2) {
      await sellExactPercentageOfPosition(runtime, pos, 0.25);
      pos.partialSales = 2;
    }
    if (ratio >= 8 && pos.partialSales < 3) {
      await sellExactPercentageOfPosition(runtime, pos, 0.15);
      pos.partialSales = 3;
    }
    if (ratio >= 16 && pos.partialSales < 4) {
      await sellExactPercentageOfPosition(runtime, pos, 0.1);
      pos.partialSales = 4;
    }
  }
  console.log("Finished checking all positions for partial sells / stop-losses.");
}

const purchaseRecommendedTokensAction: Action = {
  name: "PURCHASE_RECOMMENDED_TOKENS",
  similes: ["GET_RECOMMENDED_TOKENS", "BUY_RECOMMENDED_TOKENS"],
  description:
    "Fetch trending data from random BirdEye endpoints, buy with SOL, handle sells if needed, tweet stoically.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
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

      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const sufficientFunds = await hasSufficientBalance(runtime, apiKey, walletAddress);
      if (!sufficientFunds) {
        console.log("Not enough funds. Attempting partial sells...");
        await sellTokensIfNeeded(runtime);
        const fundsNow = await hasSufficientBalance(runtime, apiKey, walletAddress);
        if (!fundsNow) {
          console.log("Still insufficient after sells. Exiting...");
          return;
        }
      }

      const lamportsBalance = await connection.getBalance(new PublicKey(walletAddress));
      const solBalance = lamportsBalance / 1e9;
      console.log(`Using wallet SOL balance of ${solBalance.toFixed(4)} in LLM prompt.`);

      const trendingEndpoint = pickBirdEyeEndpoint();
      console.log(`Chosen BirdEye endpoint: ${trendingEndpoint}`);
      const trendingOptions = {
        method: "GET",
        headers: {
          accept: "application/json",
          "X-API-KEY": apiKey,
          "x-chain": "solana",
        },
      };
      await sleep(5000);
      const trendingResponse = await fetch(trendingEndpoint, trendingOptions);
      if (!trendingResponse.ok) {
        throw new Error(`Trending API call failed with status: ${trendingResponse.status}`);
      }
      const trendingData = await trendingResponse.json();

      const cryptoTokensJson: Record<string, { address: string }> = {};
      if (trendingData?.data?.tokens?.length) {
        for (const tkn of trendingData.data.tokens) {
          cryptoTokensJson[tkn.symbol.toLowerCase()] = { address: tkn.address };
        }
      }
      console.log("Trending Tokens for LLM Prompt:", cryptoTokensJson);

      const recommendation = await getTradeRecommendation(
        openAiApiKey,
        cryptoTokensJson,
        solBalance
      );
      const recommendationsResponse = recommendation.recommendations;
      if (!recommendationsResponse || recommendationsResponse.length === 0) {
        console.log("No trade recommendations available.");
        return;
      }
      console.log("Trade Recommendations:", recommendationsResponse);

      await buyRecommendedTokens(recommendationsResponse, runtime);
      console.log("Performing a quick post-buy check for potential sells...");
      await sellTokensIfNeeded(runtime);

      console.log("Trade execution + any sells completed.");
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

export default purchaseRecommendedTokensAction;