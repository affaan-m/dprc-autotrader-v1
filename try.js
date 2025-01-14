import { VersionedTransaction, Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const web3Connection = new Connection(RPC_ENDPOINT, "confirmed");

async function fetchTransactionData() {
    try {
        const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                publicKey: "GvZ4adx6CNuLFuhLeSAvohcejrcLpX88mbXA12ShLFQa", // Your wallet public key
                action: "buy", // "buy" or "sell"
                mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // Token mint address
                denominatedInSol: "false", // "true" if amount is SOL, "false" if tokens
                amount: 1000, // Amount of SOL or tokens
                slippage: 10, // Slippage allowed (percent)
                priorityFee: 0.00001, // Priority fee
                pool: "pump", // Exchange pool ("pump" or "raydium")
            }),
        });

        if (response.status === 200) {
            const data = await response.arrayBuffer();
            return VersionedTransaction.deserialize(new Uint8Array(data));
        } else {
            console.error("Error from API:", response.statusText);
            return null;
        }
    } catch (error) {
        console.error("Error fetching transaction data:", error);
        throw error;
    }
}

async function validateAndSendTransaction(transaction, signerKeyPair) {
    try {
        console.log("Validating and sending transaction...");

        // Validate the transaction structure
        if (!transaction.message || !Array.isArray(transaction.message.compiledInstructions)) {
            console.error("Invalid transaction format:", transaction);
            throw new Error("Transaction message or compiledInstructions missing.");
        }

        // Iterate through compiled instructions in the versioned transaction
        for (const compiledInstruction of transaction.message.compiledInstructions) {
            const programIdIndex = compiledInstruction.programIdIndex;
            const programId = transaction.message.staticAccountKeys[programIdIndex];

            // Resolve accounts used by this instruction
            const accountKeys = compiledInstruction.accounts.map(
                (index) => transaction.message.staticAccountKeys[index]
            );

            // Verify ownership for each account
            for (const account of accountKeys) {
                const accountInfo = await web3Connection.getAccountInfo(account);
                if (!accountInfo) {
                    console.error(`Account ${account.toBase58()} not found.`);
                    throw new Error(`Account ${account.toBase58()} not found.`);
                }

                if (!accountInfo.owner.equals(programId)) {
                    console.error(
                        `Account ${account.toBase58()} is owned by ${accountInfo.owner.toBase58()}, expected ${programId.toBase58()}`
                    );
                    throw new Error(`Account ownership mismatch for ${account.toBase58()}`);
                }
            }
        }

        // Sign and send the transaction
        transaction.sign([signerKeyPair]);
        console.log("Transaction signed. Sending...");

        const signature = await web3Connection.sendTransaction(transaction, {
            skipPreflight: false,
            maxRetries: 2,
        });

        console.log(`Transaction sent successfully. Signature: ${signature}`);
        console.log(`View the transaction: https://solscan.io/tx/${signature}`);
        return signature;
    } catch (error) {
        console.error("Error during transaction:", error);
        throw error;
    }
}



async function sendPortalTransaction() {
    const signerKeyPair = Keypair.fromSecretKey(
        bs58.decode("4K4ph5wQZQBptmHcfcix6ohyxAdnGAzpHbMbm8wz94h8awXhZihc7dZS4bGJeMuSKRBFUCYWHBZuUTCgQKRkCJkW") // Your private key
    );

    try {
        const transaction = await fetchTransactionData();
        if (!transaction) {
            console.error("Failed to fetch transaction data.");
            return;
        }

        // Validate and send the transaction
        await validateAndSendTransaction(transaction, signerKeyPair);
    } catch (error) {
        console.error("Error in sendPortalTransaction:", error);
    }
}

sendPortalTransaction();
