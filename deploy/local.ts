import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction, DeploymentSubmission } from "hardhat-deploy/types";
import * as setupParams from "../params/local";
import * as constants from "./constants";

/*Sushi */
import { bytecode as bytecodeFactory, abi as abiFactory } from '../external/UniswapV2Factory.json';
import { bytecode as bytecodeRouter, abi as abiRouter } from '../external/UniswapV2Router02.json';
import { bytecode as bytecodePair, abi as abiPair } from '../external/UniswapV2Pair.json';

import { abi as abiAssetOracle } from '../external/AssetOracle.json';
import { abi as abiInsurance } from '../external/InsuranceFund.json';
import { abi as abiIrsMarket } from '../external/IrsMarket.json';
import { abi as abiStrips } from '../external/Strips.json';
import { abi as abiLiqudationKeeper } from '../external/LiquidationKeeper.json';
import { abi as abiSusd } from '../external/SUSD.json';
import { abi as abiStrp } from '../external/STRP.json';


const STRP_DECIMALS = 18;
const SUSD_DECIMALS = 18;
const DECIMALS = 18;

const STRP_POOLED = "100000";
const USDC_POOLED = "100000";

const UNI_LP_ORACLE_AVG_PERIOD = 0;
const UNI_LP_ORACLE_AVG_INTERVAL = 0;
const DEFAULT_STAKE_AMOUNT = "10000";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, save } = deployments;
    const { deployer } = await getNamedAccounts();

    const deployerSigner = await hre.ethers.getSigner(deployer);
    const UNLIMITED_APPROVE = hre.ethers.constants.MaxUint256;
    console.log("...Deploying bytecode of the contracts");
    console.log("...DEPLOYER WALLET = ", deployer);

    /*
        Deploying strips and all related contracts from bytecode.
        Setup basic parameters like staking amount, etc.
        Check Contracts Diagram to understand the relations between contracts.
    */

    console.log("1. deploying impls");
    let factory = await hre.ethers.getContractFactory("TradeImpl");
    const TradeImpl = await factory.connect(deployerSigner).deploy();

    factory = await hre.ethers.getContractFactory("StakingImpl");
    const StakingImpl = await factory.connect(deployerSigner).deploy();

    factory = await hre.ethers.getContractFactory("SlpFactoryImpl");
    const SlpFactoryImpl = await factory.connect(deployerSigner).deploy();

    factory = await hre.ethers.getContractFactory("StripsAdminImpl");
    const StripsAdminImpl = await factory.connect(deployerSigner).deploy();

    factory = await hre.ethers.getContractFactory("StripsStateImpl");
    const StripsStateImpl = await factory.connect(deployerSigner).deploy();

    factory = await hre.ethers.getContractFactory("StripsViewImpl");
    const StripsViewImpl = await factory.connect(deployerSigner).deploy();




    console.log("2. deploying tokens");
    factory = await hre.ethers.getContractFactory("SUSD");
    const SUSD = await factory.connect(deployerSigner).deploy();
    await save("SUSD", {
        abi: abiSusd,
        address: SUSD.address
    });

    factory = await hre.ethers.getContractFactory("STRP");
    const STRP = await factory.connect(deployerSigner).deploy();
    await save("STRP", {
        abi: abiStrp,
        address: STRP.address
    });


    console.log("3. deploying sushi pool");
    factory = await hre.ethers.getContractFactory("MockToken");
    const WETH = await factory.connect(deployerSigner).deploy();

    const univ2factory = await deploy("UniswapV2Factory", {
        contract: {
          abi: abiFactory,
          bytecode: bytecodeFactory,
        },
        from: deployer,
        log: true,
        args: [deployer]
      });
            
    const univ2router02 = await deploy("UniswapV2Router02", {
        contract: {
            abi: abiRouter,
            bytecode: bytecodeRouter,
        },
        from: deployer,
        log: true,
        args: [univ2factory.address, WETH.address]
    });
    
    const UniV2Router02 = await hre.ethers.getContractAt(univ2router02.abi, univ2router02.address, deployerSigner);
    const UniV2Factory = await hre.ethers.getContractAt(univ2factory.abi, univ2factory.address, deployerSigner);
    
    /*Stake liquidity to create Pair */
    let tokenA = STRP.address;
    let tokenB = SUSD.address;

    /* Adding liquidity */
    let tokenAStrpAmount = hre.ethers.utils.parseUnits(STRP_POOLED);
    let tokenBUsdcAmount = hre.ethers.utils.parseUnits(USDC_POOLED);

    let tx = await STRP.connect(deployerSigner).approve(univ2router02.address, UNLIMITED_APPROVE);
    await tx.wait();

    tx = await SUSD.connect(deployerSigner).mint(deployer, tokenBUsdcAmount.mul(100));
    await tx.wait()

    tx = await SUSD.connect(deployerSigner).approve(univ2router02.address, UNLIMITED_APPROVE);
    await tx.wait();

    let deadline = Math.round((Date.now() / 1000)) + 86400; // 1 day
    tx = await UniV2Router02.connect(deployerSigner).addLiquidity(
        tokenA,
        tokenB,
        tokenAStrpAmount,
        tokenBUsdcAmount,
        0,
        0,
        deployer,
        deadline
    );
    await tx.wait();


    const lp_pair = await UniV2Factory.getPair(STRP.address, SUSD.address);
    const LP_PAIR = await hre.ethers.getContractAt("UniswapV2Pair", lp_pair, deployerSigner);
    
    await save("SushiLpPair", {
        abi: abiPair,
        address: lp_pair
    });

    console.log("4. deploying UniLpOracle");
    factory = await hre.ethers.getContractFactory("UniswapLpOracle");
    const UniLpOracle = await factory.connect(deployerSigner).deploy(
        univ2router02.address, 
        STRP.address,
        LP_PAIR.address,
        setupParams.testParams.instantLpOracle);
    
    let coder = hre.ethers.utils.defaultAbiCoder;
    let DUMMY_DATA = coder.encode(["int256"], [hre.ethers.constants.MaxInt256]);

    tx = await UniLpOracle.performUpkeep(DUMMY_DATA);
    await tx.wait();  
  
    let lpPrice = await UniLpOracle.getPrice();
    console.log("SUCCESS: UniLpOracle deployed and first keep done with price=", hre.ethers.utils.formatUnits(lpPrice, DECIMALS));


    console.log("5. deploying Strips");
    factory = await hre.ethers.getContractFactory("Strips", {
        libraries:{
            TradeImpl: TradeImpl.address,
            StripsViewImpl: StripsViewImpl.address,
            StripsStateImpl: StripsStateImpl.address,
            StripsAdminImpl: StripsAdminImpl.address
        }
    });
    const STRIPS = await factory.connect(deployerSigner).deploy();
    tx = await STRIPS.initialize(
        setupParams.stripsParams.riskParams,
        SUSD.address,
        setupParams.stripsParams.keepAlive,
        deployer,
        UniLpOracle.address);

    await tx.wait();
    await save("Strips", {
        abi: abiStrips,
        address: STRIPS.address
    });
    
    console.log("5.1...deploying liquidationKeeper");
    factory = await hre.ethers.getContractFactory("LiquidationKeeper");
    const LiqudationKeeper = await factory.connect(deployerSigner).deploy(
            STRIPS.address,
            SUSD.address,
            setupParams.testParams.liquidationSize);

    console.log("...assign pinger to liquidator");
    tx = await STRIPS.changePinger(LiqudationKeeper.address);
    await tx.wait();
    await save("LiquidationKeeper", {
        abi: abiLiqudationKeeper,
        address: LiqudationKeeper.address
    });

    console.log("SUCCESS: Liqudation Keeper setup and deployed");

    /*
    ****************************
    *   STEP 5: deploy and setup Market
    ****************************    
    */

    console.log("6...deploying and setup Markets and Oracles");
    factory = await hre.ethers.getContractFactory("AssetOracle");
    const AssetOracle = await factory.connect(deployerSigner).deploy(STRIPS.address, deployer);
    let encodedPrice = coder.encode(["int256"], [setupParams.assetOracle.initialPrice._hex]);

    tx = await AssetOracle.performUpkeep(encodedPrice);
    await tx.wait();

    let assetPrice = await AssetOracle.getPrice();
    console.log("AssetOracle for market deployed and first keep done with price=", hre.ethers.utils.formatUnits(assetPrice, DECIMALS));

    factory = await hre.ethers.getContractFactory("IrsMarket", {
        libraries:{
            StakingImpl: StakingImpl.address,
            SlpFactoryImpl: SlpFactoryImpl.address,
        }
    });
    const IrsMarket = await factory.connect(deployerSigner).deploy();
    await save("IrsMarket", {
        abi: abiIrsMarket,
        address: IrsMarket.address
    });

    let initParams = {
        stripsProxy: STRIPS.address,
        assetOracle: AssetOracle.address,
        pairOracle: UniLpOracle.address,

        initialPrice: setupParams.market.initialPrice,
        burningCoef: 1,

        stakingToken: lp_pair,
        tradingToken: SUSD.address,
        strpToken: STRP.address
    }
    tx = await IrsMarket.initialize(
        initParams,
        univ2router02.address,
        deployer
    );
    await tx.wait();

    let slpParams = {
        stripsProxy: STRIPS.address,
        pairOracle: UniLpOracle.address,
        tradingToken: SUSD.address,
        stakingToken: lp_pair,
        
        penaltyPeriod: setupParams.market.slpPenaltyPeriod,
        penaltyFee: setupParams.market.slpPenaltyFee
    };
    tx = await IrsMarket.createSLP(slpParams);
    await tx.wait();

    let slptokenaddress = await IrsMarket.getSlpToken();
    console.log("SLP token created address=" + slptokenaddress);
    
    let RewardParams = {
        periodLength: setupParams.market.periodLength, 
        washTime: setupParams.market.washTime,

        slpToken: slptokenaddress,
        strpToken: STRP.address,

        stripsProxy: STRIPS.address,
        dao: deployer,
        admin: deployer,

        rewardTotalPerSecTrader: setupParams.market.rewardTraderParam,
        rewardTotalPerSecStaker: setupParams.market.rewardStakerParam
    };

    tx = await IrsMarket.createRewarder(RewardParams);
    await tx.wait();
    
    let rewarderaddress = await IrsMarket.getRewarder();
    console.log("Rewarder created address=" + rewarderaddress);

    await STRP.connect(deployerSigner).approve(rewarderaddress, UNLIMITED_APPROVE);

    let [
        marketPrice,
        oraclePrice
    ] = await IrsMarket.getPrices();
    
    console.log("SUCCESS: IrsMarket deployed with marketPrice=" + hre.ethers.utils.formatUnits(marketPrice, DECIMALS) + 
                " oraclePrice=" + hre.ethers.utils.formatUnits(oraclePrice, DECIMALS) + 
                " slptokenaddress=" + slptokenaddress + 
                " rewarderaddress=" + rewarderaddress);
    
    console.log("registering market at strips");
    let encodeTypes = [
        "address"
    ];

    let encodeParams = [
        IrsMarket.address
    ];

    let params = coder.encode(encodeTypes, encodeParams);
    let adminActionArgs = {
        actionType: constants.ADDMARKET,
        data: params
    }

    tx = await STRIPS.connect(deployerSigner).adminDispatcher(adminActionArgs);
    await tx.wait();    

    console.log("SUCCESS: IrsMarket has added to strips");


    console.log("...staking to market");
    let amountBn = hre.ethers.utils.parseUnits(DEFAULT_STAKE_AMOUNT, DECIMALS);

    /*Approve market */
    tx = await LP_PAIR.connect(deployerSigner).approve(IrsMarket.address, UNLIMITED_APPROVE);
    await tx.wait();

    tx = await IrsMarket.connect(deployerSigner).stake(amountBn);
    await tx.wait();

    let liquidity = await IrsMarket.getLiquidity();
    console.log("SUCCESS: staked to IrsMarket, liquidity=", hre.ethers.utils.formatUnits(liquidity, DECIMALS));


    /*
    ****************************
    *   STEP 7: deploy and setup Insurance
    ****************************    
    */
    factory = await hre.ethers.getContractFactory("InsuranceFund", {
        libraries:{
            StakingImpl: StakingImpl.address,
            SlpFactoryImpl: SlpFactoryImpl.address,
        }
    });
    const Insurance = await factory.connect(deployerSigner).deploy();
    await save("InsuranceFund", {
        abi: abiInsurance,
        address: Insurance.address
    });

    /*
        IStrips _stripsProxy,
        IUniswapV2Pair _stakingToken,
        IERC20 _tradingToken,
        IERC20 _strpToken,
        IUniswapLpOracle _pairOracle,
        address _sushiRouter,
        address _dao
    */
    tx = await Insurance.initialize(
        STRIPS.address,
        lp_pair,
        SUSD.address,
        STRP.address,
        UniLpOracle.address,
        univ2router02.address,
        deployer
    );
    await tx.wait();

    slpParams = {
        stripsProxy: STRIPS.address,
        pairOracle: UniLpOracle.address,
        tradingToken: SUSD.address,
        stakingToken: lp_pair,
        
        penaltyPeriod: setupParams.insuranceParams.slpPenaltyPeriod,
        penaltyFee: setupParams.insuranceParams.slpPenaltyFee
    };
    tx = await Insurance.createSLP(slpParams);
    await tx.wait();

    let siptokenaddress = await Insurance.getSlpToken();

    RewardParams = {
        periodLength: setupParams.insuranceParams.periodLength, 
        washTime: setupParams.insuranceParams.washTime,

        slpToken: siptokenaddress,
        strpToken: STRP.address,

        stripsProxy: STRIPS.address,
        dao: deployer,
        admin: deployer,

        rewardTotalPerSecTrader: setupParams.insuranceParams.rewardTraderParam,
        rewardTotalPerSecStaker: setupParams.insuranceParams.rewardStakerParam
    };

    tx = await Insurance.createRewarder(RewardParams);
    await tx.wait();
    
    rewarderaddress = await Insurance.getRewarder();
    await STRP.connect(deployerSigner).approve(rewarderaddress, UNLIMITED_APPROVE);


    console.log("SUCCESS: Insurance deployed with" + 
                " siptokenaddress=" + siptokenaddress +
                " rewarderaddress=" + rewarderaddress);

    /*
    ****************************
    *   STEP 9: Register Insurance at Strips
    ****************************    
    */
    /* Adding insurance to strips */
    encodeTypes = [
        "address"
    ];

    encodeParams = [
        Insurance.address
    ];

    params = coder.encode(encodeTypes, encodeParams);
    adminActionArgs = {
        actionType: constants.SETINSURANCE,
        data: params
    }

    tx = await STRIPS.connect(deployerSigner).adminDispatcher(adminActionArgs);
    await tx.wait();
    console.log("SUCCESS: Insurance has added to strips");

    console.log("...staking to Insurance");
    amountBn = hre.ethers.utils.parseUnits(DEFAULT_STAKE_AMOUNT, DECIMALS);

    /*Approve market */
    tx = await LP_PAIR.connect(deployerSigner).approve(Insurance.address, UNLIMITED_APPROVE);
    await tx.wait();

    tx = await Insurance.connect(deployerSigner).stake(amountBn);
    await tx.wait();

    liquidity = await Insurance.getLiquidity();
    console.log("SUCCESS: staked to Insurance, liquidity=", hre.ethers.utils.formatUnits(liquidity, DECIMALS));
   
};
export default func;
func.tags = ["local-strips"];