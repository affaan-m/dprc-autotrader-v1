export * from "./providers/token.ts";
export * from "./providers/wallet.ts";
export * from "./providers/trustScoreProvider.ts";
export * from "./evaluators/trust.ts";

import { Plugin } from "@elizaos/core";
import { executeSwap } from "./actions/swap.ts";
import take_order from "./actions/takeOrder";
import pumpfun from "./actions/pumpfun.ts";
import fomo from "./actions/fomo.ts";
import { executeSwapForDAO } from "./actions/swapDao";
import transferToken from "./actions/transfer.ts";
import { walletProvider } from "./providers/wallet.ts";
import { trustScoreProvider } from "./providers/trustScoreProvider.ts";
import { trustEvaluator } from "./evaluators/trust.ts";
import { tokenProvider, TokenProvider } from "./providers/token.ts";
import { WalletProvider } from "./providers/wallet.ts";
import fetchBirdEyeDataAction from "./actions/fetchBirdEyeData.ts";
import purchaseRecommendedTokensAction from "./actions/purchaseRecommendedTokens.ts";
import helloWorldAction from "./actions/tradingStartAction.ts";
import { tradingStartProvider } from "./providers/tradingStartProvider.ts";
import WorldAction from "./actions/mainTradingActions.ts";
import mainTradingActions from "./actions/mainTradingActions.ts";
import tradingStartAction from "./actions/tradingStartAction.ts";

export { TokenProvider, WalletProvider };

export const solanaPlugin: Plugin = {
    name: "solana",
    description: "Solana Plugin for Eliza",
    actions: [
//       fetchBirdEyeDataAction,
//       executeSwap,
//        pumpfun,
//        fomo,
//        transferToken,
//        executeSwapForDAO,
//        take_order,
         purchaseRecommendedTokensAction,
         tradingStartAction,
         mainTradingActions
    ],
    evaluators: [

       trustEvaluator

    ],
    providers: [
       walletProvider,
        trustScoreProvider,
       tokenProvider,
       tradingStartProvider
        ]
};

export default solanaPlugin;

