import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import tradingStartAction from "./tradingStartAction";
import purchaseRecommendedTokensAction from "./purchaseRecommendedTokens";

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

        function autonomousDailyTrades() {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

            // Generate three random times within the day
            const randomTimes = [];
            for (let i = 0; i < 3; i++) {
                const randomTime = new Date(startOfDay.getTime() + Math.random() * (endOfDay.getTime() - startOfDay.getTime()));
                randomTimes.push(randomTime);
            }

            // Sort the times to ensure they are in chronological order
            randomTimes.sort((a, b) => a - b);

            // Schedule the tasks
            randomTimes.forEach((time, index) => {
                const delay = time.getTime() - now.getTime();
                if (delay > 0) {
                    setTimeout(async () => {
                        console.log(`Task ${index + 1} executed at ${new Date().toLocaleTimeString()}`);
                        // Purchase the recommended tokens
                        try {
                            // Attempt to purchase the recommended tokens
                            const result = await purchaseRecommendedTokensAction.handler(runtime, message);
                            // Handle the result as needed
                            console.log('Purchase successful:', result);
                        } catch (error) {
                            // Handle any errors that occur during the purchase
                            console.error('An error occurred during the purchase:', error);
                            // Additional error handling logic can be added here
                        }

                    }, delay);
                }
            });
        }

        // Schedule tasks for today
        autonomousDailyTrades();

        // Reschedule tasks at midnight for the next day
        const now = new Date();

        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const timeUntilMidnight = midnight.getTime() - now.getTime();
        setTimeout(() => {
            autonomousDailyTrades();
            setInterval(autonomousDailyTrades, 24 * 60 * 60 * 1000); // Repeat every 24 hours
        }, timeUntilMidnight);


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
