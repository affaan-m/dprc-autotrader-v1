import { AnchorProvider } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { generateImage } from "@elizaos/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { CreateTokenMetadata, PriorityFee, PumpFunSDK } from "pumpdotfun-sdk";

class CustomPumpFunSDK extends PumpFunSDK {
    async createTokenMetadata(create) {
        console.log("Custom Debug: Token Metadata Input", create);

        const formData = new FormData();
        formData.append("file", create.file, "image.png");
        formData.append("name", create.name);
        formData.append("symbol", create.symbol);
        formData.append("description", create.description);

        try {
            const response = await fetch("https://pump.fun/api/ipfs", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: formData,
            });
            console.log("Custom Debug: Pure Raw Response from API:", response);

            const rawResponse = await response.text();
            console.log("Custom Debug: Raw Response from API:", rawResponse);

            return JSON.parse(rawResponse);
        } catch (error) {
            console.error("Custom Debug: Error in createTokenMetadata:", error);
            throw error;
        }
    }
}


import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
    settings,
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    generateObjectDeprecated,
    composeContext,
    type Action,
} from "@elizaos/core";

import { walletProvider } from "../providers/wallet.ts";


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export interface CreateAndBuyContent extends Content {
    tokenMetadata: {
        name: string;
        symbol: string;
        description: string;
        image_description: string;
    };
    buyAmountSol: string | number;
}

export function isCreateAndBuyContent(
    runtime: IAgentRuntime,
    content: any
): content is CreateAndBuyContent {
    console.log("Content for create & buy", content);
    return (
        typeof content.tokenMetadata === "object" &&
        content.tokenMetadata !== null &&
        typeof content.tokenMetadata.name === "string" &&
        typeof content.tokenMetadata.symbol === "string" &&
        typeof content.tokenMetadata.description === "string" &&
        typeof content.tokenMetadata.image_description === "string" &&
        (typeof content.buyAmountSol === "string" ||
            typeof content.buyAmountSol === "number")
    );
}

export const createAndBuyToken = async ({
    deployer,
    mint,
    tokenMetadata,
    buyAmountSol,
    priorityFee,
    allowOffCurve,
    commitment = "finalized",
    sdk,
    connection,
    slippage,
}: {
    deployer: Keypair;
    mint: Keypair;
    tokenMetadata: CreateTokenMetadata;
    buyAmountSol: bigint;
    priorityFee: PriorityFee;
    allowOffCurve: boolean;
    commitment?:
        | "processed"
        | "confirmed"
        | "finalized"
        | "recent"
        | "single"
        | "singleGossip"
        | "root"
        | "max";
    sdk: CustomPumpFunSDK;
    connection: Connection;
    slippage: string;
}) => {
    try {
        console.log("Starting the createAndBuyToken process...");

        // Debugging: Log the input parameters
        console.log("Input Parameters:");
        console.log("Deployer Public Key:", deployer.publicKey.toBase58());
        console.log("Mint Public Key:", mint.publicKey.toBase58());
        console.log("Token Metadata:", tokenMetadata);
        console.log("Buy Amount (SOL):", buyAmountSol.toString());
        console.log("Priority Fee:", priorityFee);
        console.log("Allow Off Curve:", allowOffCurve);
        console.log("Commitment:", commitment);
        console.log("Slippage:", slippage);

        // Step 1: Call sdk.createAndBuy
        console.log("Calling sdk.createAndBuy...");
        const createResults = await sdk.createAndBuy(
            deployer,
            mint,
            tokenMetadata,
            buyAmountSol,
            BigInt(slippage),
            priorityFee,
            commitment
        );
        console.log("Create and Buy Results:", createResults);

        if (createResults.success) {
            console.log("Token creation and purchase successful!");

            // Debugging: Log the mint URL
            console.log(
                "Token URL:",
                `https://pump.fun/${mint.publicKey.toBase58()}`
            );

            // Step 2: Get the associated token account (ATA)
            console.log("Calculating the Associated Token Account (ATA)...");
            const ata = getAssociatedTokenAddressSync(
                mint.publicKey,
                deployer.publicKey,
                allowOffCurve
            );
            console.log("Associated Token Account (ATA):", ata.toBase58());

            // Step 3: Check the token balance
            console.log("Fetching token account balance...");
            const balance = await connection.getTokenAccountBalance(
                ata,
                "processed"
            );
            console.log("Token Account Balance:", balance);

            const amount = balance.value.uiAmount;
            if (amount === null) {
                console.log(
                    `${deployer.publicKey.toBase58()}:`,
                    "No Account Found"
                );
            } else {
                console.log(`${deployer.publicKey.toBase58()}:`, amount);
            }

            // Return success response
            console.log("Returning success response...");
            return {
                success: true,
                ca: mint.publicKey.toBase58(),
                creator: deployer.publicKey.toBase58(),
            };
        } else {
            // Handle failure
            console.error("Create and Buy failed:", createResults.error);
            return {
                success: false,
                ca: mint.publicKey.toBase58(),
                error: createResults.error || "Transaction failed",
            };
        }
    } catch (error) {
        // Catch any unexpected errors
        console.error("Unexpected error during createAndBuyToken process:", error);
        return {
            success: false,
            error: error.message || "Unexpected error occurred",
        };
    }
};


export const buyToken = async ({
    sdk,
    buyer,
    mint,
    amount,
    priorityFee,
    allowOffCurve,
    slippage,
    connection,
}: {
    sdk: PumpFunSDK;
    buyer: Keypair;
    mint: PublicKey;
    amount: bigint;
    priorityFee: PriorityFee;
    allowOffCurve: boolean;
    slippage: string;
    connection: Connection;
}) => {
    const buyResults = await sdk.buy(
        buyer,
        mint,
        amount,
        BigInt(slippage),
        priorityFee
    );
    if (buyResults.success) {
        console.log("Success:", `https://pump.fun/${mint.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(
            mint,
            buyer.publicKey,
            allowOffCurve
        );
        const balance = await connection.getTokenAccountBalance(
            ata,
            "processed"
        );
        const amount = balance.value.uiAmount;
        if (amount === null) {
            console.log(`${buyer.publicKey.toBase58()}:`, "No Account Found");
        } else {
            console.log(`${buyer.publicKey.toBase58()}:`, amount);
        }
    } else {
        console.log("Buy failed");
    }
};

export const sellToken = async ({
    sdk,
    seller,
    mint,
    amount,
    priorityFee,
    allowOffCurve,
    slippage,
    connection,
}: {
    sdk: PumpFunSDK;
    seller: Keypair;
    mint: PublicKey;
    amount: bigint;
    priorityFee: PriorityFee;
    allowOffCurve: boolean;
    slippage: string;
    connection: Connection;
}) => {
    const sellResults = await sdk.sell(
        seller,
        mint,
        amount,
        BigInt(slippage),
        priorityFee
    );
    if (sellResults.success) {
        console.log("Success:", `https://pump.fun/${mint.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(
            mint,
            seller.publicKey,
            allowOffCurve
        );
        const balance = await connection.getTokenAccountBalance(
            ata,
            "processed"
        );
        const amount = balance.value.uiAmount;
        if (amount === null) {
            console.log(`${seller.publicKey.toBase58()}:`, "No Account Found");
        } else {
            console.log(`${seller.publicKey.toBase58()}:`, amount);
        }
    } else {
        console.log("Sell failed");
    }
};

// previous logic:
// if (typeof window !== "undefined" && typeof window.confirm === "function") {
//     return window.confirm(
//         "Confirm the creation and purchase of the token?"
//     );
// }
// return true;
const promptConfirmation = async (): Promise<boolean> => {
    return true;
};

// Save the base64 data to a file
import * as fs from "fs";
import * as path from "path";
import { getWalletKey } from "../keypairUtils.ts";

const pumpfunTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "tokenMetadata": {
        "name": "Test Token",
        "symbol": "TEST",
        "description": "A test token",
        "image_description": "create an image of a rabbit"
    },
    "buyAmountSol": "0.00069"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract or generate (come up with if not included) the following information about the requested token creation:
- Token name
- Token symbol
- Token description
- Token image description
- Amount of SOL to buy

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "CREATE_AND_BUY_TOKEN",
    similes: ["CREATE_AND_PURCHASE_TOKEN", "DEPLOY_AND_BUY_TOKEN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; //return isCreateAndBuyContent(runtime, message.content);
    },
    description:
        "Create a new token and buy a specified amount using SOL. Requires deployer private key, token metadata, buy amount in SOL, priority fee, and allowOffCurve flag.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        console.log("Starting CREATE_AND_BUY_TOKEN handler...");

        // Compose state if not provided
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        //console.log("State :", state);
        //await sleep(5000);

        // Get wallet info for context
        const walletInfo = await walletProvider.get(runtime, message, state);

        //console.log("WalletInfo :");
        //console.log(walletInfo)

        state.walletInfo = walletInfo;

        //console.log("State dot WalletInfo :");
        //console.log(state.walletInfo)

        // Generate structured content from natural language
        const pumpContext = composeContext({
            state,
            template: pumpfunTemplate,
        });
        //console.log("Pumpfun Context :", pumpContext);

        const content = await generateObjectDeprecated({
            runtime,
            context: pumpContext,
            modelClass: ModelClass.LARGE,
        });

        //console.log("Content :", content);


        // Validate the generated content
        if (!isCreateAndBuyContent(runtime, content)) {
            console.error("Invalid content for CREATE_AND_BUY_TOKEN action.");
            return false;
        }

        const { tokenMetadata, buyAmountSol } = content;
        /*
            // Generate image if tokenMetadata.file is empty or invalid
            if (!tokenMetadata.file || tokenMetadata.file.length < 100) {  // Basic validation
                try {
                    const imageResult = await generateImage({
                        prompt: `logo for ${tokenMetadata.name} (${tokenMetadata.symbol}) token - ${tokenMetadata.description}`,
                        width: 512,
                        height: 512,
                        count: 1
                    }, runtime);

                    if (imageResult.success && imageResult.data && imageResult.data.length > 0) {
                        // Remove the "data:image/png;base64," prefix if present
                        tokenMetadata.file = imageResult.data[0].replace(/^data:image\/[a-z]+;base64,/, '');
                    } else {
                        console.error("Failed to generate image:", imageResult.error);
                        return false;
                    }
                } catch (error) {
                    console.error("Error generating image:", error);
                    return false;
                }
            } */

        const imageResult = await generateImage(
            {
                prompt: `logo for ${tokenMetadata.name} (${tokenMetadata.symbol}) token - ${tokenMetadata.description}`,
                width: 256,
                height: 256,
                count: 1,
            },
            runtime
        );

        tokenMetadata.image_description = imageResult.data[0].replace(
            /^data:image\/[a-z]+;base64,/,
            ""
        );

        // Convert base64 string to Blob
        const base64Data = tokenMetadata.image_description;
        const outputPath = path.join(
            process.cwd(),
            `generated_image_${Date.now()}.txt`
        );
        fs.writeFileSync(outputPath, base64Data);
        console.log(`Base64 data saved to: ${outputPath}`);

        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        // Add the default decimals and convert file to Blob
        const fullTokenMetadata: CreateTokenMetadata = {
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            description: tokenMetadata.description,
            file: blob,
        };

        // Default priority fee for high network load
        const priorityFee = {
            unitLimit: 100_000_000,
            unitPrice: 100_000,
        };
        const slippage = "2000";
        try {
            // Get private key from settings and create deployer keypair
            const { keypair: deployerKeypair } = await getWalletKey(
                runtime,
                true
            );

            // Generate new mint keypair
            const mintKeypair = Keypair.generate();
            console.log(
                `Generated mint address: ${mintKeypair.publicKey.toBase58()}`
            );

            // Setup connection and SDK
            const connection = new Connection(settings.RPC_URL!, {
                commitment: "confirmed",
                confirmTransactionInitialTimeout: 500000, // 120 seconds
                wsEndpoint: settings.RPC_URL!.replace("https", "wss"),
            });

            const wallet = new Wallet(deployerKeypair);
            const provider = new AnchorProvider(connection, wallet, {
                commitment: "finalized",
            });
            const sdk = new CustomPumpFunSDK(provider);
            // const slippage = runtime.getSetting("SLIPPAGE");

            const createAndBuyConfirmation = await promptConfirmation();
            if (!createAndBuyConfirmation) {
                console.log("Create and buy token canceled by user");
                return false;
            }

            // Convert SOL to lamports (1 SOL = 1_000_000_000 lamports)
            const lamports = Math.floor(Number(buyAmountSol) * 1_000_000_000);

            console.log("Executing create and buy transaction...");
            const result = await createAndBuyToken({
                deployer: deployerKeypair,
                mint: mintKeypair,
                tokenMetadata: fullTokenMetadata,
                buyAmountSol: BigInt(lamports),
                priorityFee,
                allowOffCurve: false,
                sdk,
                connection,
                slippage,
            });

            console.log("Result: ");
            console.log(result);

            if (callback) {
                if (result.success) {
                    callback({
                        text: `Token ${tokenMetadata.name} (${tokenMetadata.symbol}) created successfully!\nContract Address: ${result.ca}\nCreator: ${result.creator}\nView at: https://pump.fun/${result.ca}`,
                        content: {
                            tokenInfo: {
                                symbol: tokenMetadata.symbol,
                                address: result.ca,
                                creator: result.creator,
                                name: tokenMetadata.name,
                                description: tokenMetadata.description,
                                timestamp: Date.now(),
                            },
                        },
                    });
                } else {
                    callback({
                        text: `Failed to create token: ${result.error}\nAttempted mint address: ${result.ca}`,
                        content: {
                            error: result.error,
                            mintAddress: result.ca,
                        },
                    });
                }
            }
            //await trustScoreDb.addToken(tokenInfo);
            /*
                // Update runtime state
                await runtime.updateState({
                    ...state,
                    lastCreatedToken: tokenInfo
                });
                */
            // Log success message with token view URL
            const successMessage = `Token created and purchased successfully! View at: https://pump.fun/${mintKeypair.publicKey.toBase58()}`;
            console.log(successMessage);
            return result.success;
        } catch (error) {
            if (callback) {
                callback({
                    text: `Error during token creation: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new token called GLITCHIZA with symbol GLITCHIZA and generate a description about it on pump.fun. Also come up with a description for it to use for image generation .buy 0.00069 SOL worth.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Token GLITCHIZA (GLITCHIZA) created successfully on pump.fun!\nContract Address: 3kD5DN4bbA3nykb1abjS66VF7cYZkKdirX8bZ6ShJjBB\nCreator: 9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa\nView at: https://pump.fun/EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r",
                    action: "CREATE_AND_BUY_TOKEN",
                    content: {
                        tokenInfo: {
                            symbol: "GLITCHIZA",
                            address:
                                "EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r",
                            creator:
                                "9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
                            name: "GLITCHIZA",
                            description: "A GLITCHIZA token",
                        },
                    },
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
