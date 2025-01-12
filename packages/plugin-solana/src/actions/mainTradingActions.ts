import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import tradingStartAction from "./tradingStartAction";
import purchaseRecommendedTokensAction from "./purchaseRecommendedTokens";
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const mainTradingActions: Action = {
    name: "MAIN_TRADING_ACTIONS",
    similes: ["TRADING_ACTIONS", "MAIN_TRADE_ACTIONS"],
    description: "Performs the main actions of trading for Agent.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Always return true since this action has no specific validation logic
        return true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Modern Stoic AI Agent Started the Trading")


        // Schedule tasks for today
        autonomousDailyTrades();

        async function autonomousDailyTrades() {

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

            // Generate three random future times
            const randomTimes = [];
            for (let i = 0; i < 3; i++) {
                let randomTime;
                do {
                    randomTime = new Date(startOfDay.getTime() + Math.random() * (endOfDay.getTime() - startOfDay.getTime()));
                } while (randomTime <= now); // Ensure only future times
                randomTimes.push(randomTime);
            }

            // Sort the times
            randomTimes.sort((a, b) => a - b);


            try {
                console.log('Attempting to purchase tokens...');
                await sleep(10000);
                await purchaseRecommendedTokensAction.handler(runtime, message);
                console.log('Purchase successful!');
                await sleep(10000);
            } catch (error) {
                console.error(`Error in Purchase Recommended tokens:`, error);
            }


            // Commenting this logic of scheduling now. Will use later if required

         /*   randomTimes.forEach((time, index) => {
                const delay = time.getTime() - now.getTime();
                if (delay > 0) {
                    console.log(`Task ${index + 1} scheduled with delay ${delay} ms`);
                    setTimeout(async () => {
                        console.log(`Task ${index + 1} executing at ${new Date().toLocaleTimeString()}`);
                        try {
                            console.log('Attempting to purchase tokens...');
                            await purchaseRecommendedTokensAction.handler(runtime, message);
                            console.log('Purchase successful!');
                        } catch (error) {
                            console.error(`Error in Task ${index + 1}:`, error);
                        }
                    }, delay);
                } else {
                    console.warn(`Task ${index + 1} skipped due to non-positive delay.`);
                }
            });
        }


        // Reschedule tasks at midnight for the next day
        const now = new Date();

        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const timeUntilMidnight = midnight.getTime() - now.getTime();
        setTimeout(() => {
            autonomousDailyTrades();
            setInterval(autonomousDailyTrades, 24 * 60 * 60 * 1000); // Repeat every 24 hours
        }, timeUntilMidnight);

 */

        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Perform the main trading actions" },
            },
            {
                user: "{{user2}}",
                content: { text: "Main trading actions!", action: "MAIN_TRADING_ACTIONS" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Perform main trading actions" },
            },
            {
                user: "{{user2}}",
                content: { text: "Main trading actions!", action: "MAIN_TRADING_ACTIONS" },
            },
        ],
    ],
};

export default mainTradingActions;
