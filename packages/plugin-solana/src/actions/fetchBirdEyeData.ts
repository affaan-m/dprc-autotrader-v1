import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

const fetchBirdEyeDataAction: Action = {
    name: "FETCH_BIRDEYE_DATA",
    similes: ["GET_BIRDEYE_DATA", "FETCH_API_DATA"],
    description: "Fetches data from the BirdEye API and logs it to the console.",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Validation: Check if the message contains "BirdEye" or related keywords
        const text = (message.content as { text: string }).text.toLowerCase();
        return text.includes("birdeye") || text.includes("fetch data");
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            // Get the API key from runtime settings
            const apiKey = runtime.getSetting("BIRDEYE_API_KEY") || "";

            if (!apiKey) {
                throw new Error(
                    "BirdEye API key is missing. Please set it in the application settings."
                );
            }

            // Define the BirdEye API endpoint and options
            const endpoint = "https://public-api.birdeye.so/defi/networks";
            const options = {
                method: "GET",
                headers: {
                    accept: "application/json",
                    "X-API-KEY": apiKey,
                },
            };

            // Fetch data from the BirdEye API
            const response = await fetch(endpoint, options);

            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }

            const data = await response.json();

            // Log the fetched data to the console
            console.log("BirdEye API Data:", data);

            return true;
        } catch (error) {
            console.error("Error fetching BirdEye API data:", error);
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Fetch BirdEye data" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "BirdEye data has been fetched and logged to the console.",
                    action: "FETCH_BIRDEYE_DATA",
                },
            },
        ],
    ],
};

export default fetchBirdEyeDataAction;
