import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import mainTradingActions from "./mainTradingActions";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const tradingStartAction: Action = {
    name: "TRADING_START_ACTION",
    similes: ["TRADING_START", "TRADING_ACTION"],
    description: "Start the action for trading.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Always return true since this action has no specific validation logic
        return true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {

        console.log("Starting Trading Action of Modern Stoic AI Agent")

        try {
            await sleep(10000);
            // Attempt to execute the main trading action
            await mainTradingActions.handler(runtime, message);
            // Process the result as needed
        } catch (error) {
            // Handle any errors that occur during the trading action
            console.error('An error occurred during the trading action:', error);
            // Implement additional error handling logic if necessary
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Say hello" },
            },
            {
                user: "{{user2}}",
                content: { text: "Start the trading action!", action: "TRADING_START_ACTION" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Starting the Trading action" },
            },
            {
                user: "{{user2}}",
                content: { text: "Start the trading action!", action: "TRADING_START_ACTION" },
            },
        ],
    ],
};

export default tradingStartAction;
