import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import tradingStartAction from "../actions/tradingStartAction";
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const tradingStartProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {

        console.log("Starting Trading Provider of Modern Stoic AI Agent");
        try {
            await sleep(10000);
            // Attempt to execute the trading start action
            await tradingStartAction.handler(runtime, message);
            // Process the result as needed
        } catch (error) {
            // Handle any errors that occur during the trading action
            console.error('An error occurred during the trading action:', error);
            // Implement additional error handling logic if necessary
        }
        return "Started Trading Provider of Modern Stoic AI Agent";
    },
};

export { tradingStartProvider };
