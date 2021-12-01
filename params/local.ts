import { ethers } from "ethers";

const DECIMALS = 18;

export const stripsParams = {
    riskParams : {
        fundFeeRatio: ethers.utils.parseUnits("0.75", DECIMALS),
        daoFeeRatio: ethers.utils.parseUnits("0.20", DECIMALS),
        
        liquidatorFeeRatio: ethers.utils.parseUnits("0.002", DECIMALS),
        marketFeeRatio: ethers.utils.parseUnits("0.95", DECIMALS),
        insuranceProfitOnPositionClosed: ethers.utils.parseUnits("0.05", DECIMALS),
        liquidationMarginRatio: ethers.utils.parseUnits("0.035", DECIMALS),
        minimumPricePossible: ethers.utils.parseUnits("0.0001", DECIMALS),    
    },

    keepAlive: 31536000, // 1 year - don't need this for local
}

export const uniLpOracleParams = {
    initialPrice: ethers.utils.parseUnits("1", DECIMALS)
}

export const insuranceParams = {
    slpPenaltyPeriod: 604800, // 7 days
    slpPenaltyFee: ethers.utils.parseUnits("0.02", DECIMALS), // 2%

    rewardTraderParam: ethers.utils.parseUnits("0", DECIMALS),
    rewardStakerParam: ethers.utils.parseUnits("0.059169", DECIMALS),

    periodLength: 0,
    washTime: 0 
}

export const assetOracle = {
    initialPrice: ethers.utils.parseUnits("1.35", DECIMALS)
}

export const market = {
    initialPrice: ethers.utils.parseUnits("1.17", DECIMALS),    
    slpPenaltyPeriod: 604800, // 7 days
    slpPenaltyFee: ethers.utils.parseUnits("0.02", DECIMALS), // 2%

    rewardTraderParam: ethers.utils.parseUnits("0.3944613563", DECIMALS),
    rewardStakerParam: ethers.utils.parseUnits("0.03944613563", DECIMALS),

    periodLength: 2592000,  // 1 month
    washTime: 150
}

export const testParams = {
    instantLpOracle: true,
    liquidationSize: 100
}