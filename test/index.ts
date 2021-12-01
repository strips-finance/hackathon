import { expect } from "chai";
import {ethers, deployments, getNamedAccounts} from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as setupParams from "../params/local";

const hre:HardhatRuntimeEnvironment = require("hardhat");

const amount = ethers.utils.parseUnits("1.0");
const TRADERS_AMOUNT = amount.mul(1000);

/*
    viewDispatcher enum actions
*/
const GETORACLES = 0;
const GETMARKETS = 1;
const CALCFEEANDSLIPPAGE = 2;
const GETPOSITON = 3;
const CALCCLOSE = 4;
const CALCREWARDS = 5;

/*
    stateDispatcher enum actions
*/
const CLAIMREWARDS = 0;

/*
    adminDispatcher enum actions
*/
const ADDMARKET = 0;  
const ADDORACLE = 1;
const REMOVEORACLE = 2; 
const CHANGEORACLE = 3;
const SETINSURANCE = 4;
const CHANGERISK = 5;

/*
    GLOBAL constants 
*/
const PRICE_HOURLY = 0.013356164  //1.17
const PRICE_YEARLY = (PRICE_HOURLY / 100) * 24 * 365;
const PRICE_HOURLY_2 = 0.038127853  //3.34
const PRICE_YEARLY_2 = (PRICE_HOURLY_2 / 100) * 24 * 365;


describe("Strips usage examples", function () {
    before(async function () { 
        this.signers = await ethers.getSigners();
        this.trader1 = this.signers[1];
        this.trader2 = this.signers[2];
        this.trader3 = this.signers[3];

        this.keeper = this.signers[3];

        const { deployments, getNamedAccounts } = hre;
        const { deploy, save } = deployments;
        const { deployer } = await getNamedAccounts();
    
        this.deployer = await hre.ethers.getSigner(deployer);
        this.dao = this.deployer;

        await deployments.fixture(['local-strips']);
        
        let artifact = await deployments.get("UniswapV2Router02");
        this.sushiRouter = await ethers.getContractAt(artifact.abi, artifact.address);

        artifact = await deployments.get("InsuranceFund");
        this.insurance = await ethers.getContractAt(artifact.abi, artifact.address);

        artifact = await deployments.get("Strips");
        this.strips = await ethers.getContractAt(artifact.abi, artifact.address);

        artifact = await deployments.get("SushiLpPair");
        this.lp = await ethers.getContractAt(artifact.abi, artifact.address);
                
        artifact = await deployments.get("SUSD");
        this.susd = await ethers.getContractAt(artifact.abi, artifact.address);

        artifact = await deployments.get("STRP");
        this.strp = await ethers.getContractAt(artifact.abi, artifact.address);

        artifact = await deployments.get("IrsMarket");
        this.market = await ethers.getContractAt(artifact.abi, artifact.address);

        await createTraders(this);
    });



    it("getTradingInfo - wallet NOT connected", async function () {
        let [
            marketData,
            positionData
        ] = await this.strips.getTradingInfo(ethers.constants.AddressZero);

        expect(marketData[0].asset).to.be.eq(this.market.address)
    });

    it("getStakingInfo - wallet NOT connected", async function () {
        let [
            marketData,
            stakingData
        ] = await this.strips.getStakingInfo(ethers.constants.AddressZero);
                
        expect(marketData[0].asset).to.be.eq(this.market.address)
    });



    it("GetOracles", async function () {
        let coder = ethers.utils.defaultAbiCoder;

        /*Empty data - requirement of the ABI */
        let params = coder.encode(["int256"], [0]);
        let viewActionArgs = {
            actionType: GETORACLES,
            data: params
        }

        let oracles = await this.strips.viewDispatcher(viewActionArgs);

        let decodeTypes = [
          "tuple(bool isActive, int256 keeperReward)[]"
        ];

        let decoded = coder.decode(decodeTypes, oracles);
        let allOracles = decoded[0];
        
        let i = 0;
        for (let oracle of allOracles){
            expect(oracle.isActive).to.be.eq(true);
            if (i == 0){
                expect(oracle.keeperReward).to.be.eq(22);
            }else if (i == 1){
                expect(oracle.keeperReward).to.be.eq(33);
            }
            i++;
        }   
    });
    it("GetMarkets", async function () {
        let coder = ethers.utils.defaultAbiCoder;

        /*Empty data - requirement of the ABI */
        let params = coder.encode(["int256"], [0]);
        let viewActionArgs = {
            actionType: GETMARKETS,
            data: params
        }


        let markets = await this.strips.viewDispatcher(viewActionArgs);

        let decodeTypes = [
          "tuple(bool created, address marketAddress)[]"
        ];

        let decoded = coder.decode(decodeTypes, markets);
        let allMarkets = decoded[0];
        
        expect(allMarkets[0].created).to.be.eq(true);
        expect(allMarkets[0].marketAddress).to.be.eq(this.market.address);
    });

    it("calcFeeAndSlippage - when trader trying to open the position", async function () {
        let coder = ethers.utils.defaultAbiCoder;

        /*
        REQUEST PARAMS:
            struct FeeAndSlippageParams {
                address market;
                int256 notional;
                int256 collateral;
                bool isLong;
            }
         */
        let encodeTypes = [
            "address","int256","int256","bool"
        ];
        
        /*100 collateral with 10x leverage Long */
        let traderCollateral = ethers.utils.parseUnits("100");
        let traderNotional = traderCollateral.mul(10);
        let encodeParams = [
            this.market.address,
            traderNotional,
            traderCollateral,
            true
        ];

        let params = coder.encode(encodeTypes, encodeParams);

        let viewActionArgs = {
            actionType: CALCFEEANDSLIPPAGE,
            data: params
        }

        let data = await this.strips.viewDispatcher(viewActionArgs);

        /*
        RESPONSE DATA:
            struct FeeAndSlippageData{
                address market;
                int256 marketRate;
                int256 oracleRate;
                
                int256 fee;
                int256 whatIfPrice;
                int256 slippage;
            }
        */
        let decodeTypes = [
          "tuple(address market, int256 marketRate, int256 oracleRate, int256 fee, int256 whatIfPrice, int256 slippage)"
        ];

        let decoded = coder.decode(decodeTypes, data);
        let res = decoded[0];

        /*Some checks that data is correct - no need to do it on frontend */
        expect(res.market).to.be.eq(this.market.address);
        
        // conversion from BN to float
        let friendlyFee = ethers.FixedNumber.from(ethers.utils.formatUnits(res.fee).toString());
        
        // we need to mul 100 - because slippage should be showed as %
        let friendlySlippage = ethers.FixedNumber.from(ethers.utils.formatUnits(res.slippage.mul(100)).toString());
        
        console.log(friendlyFee.toString());
        console.log(friendlySlippage.toString() + " %");
    });

    it("open position (long or short)", async function () {
        /*
            Trader should have USDC on the balance
            And approve it before make an operation.

            He pass required slippage. 
            If slippage exceeded transaction will be reverted with
            SLIPPAGE_EXCEEDED error

            This is test is unit - all checks like slippage, margin, etc. 
            MUST be done before or transaction will be reverted and the user will lose gas fee
        */

        /*
            Approve first on USDC  (approve amount = collateral + FEE)
            To know exact fee check calcFeeAndSlippage. Now we use infinite approve.
            
            In this test I just multiply to 10x for SIMPLICITY.
        */
        
        /*Any money or percents should be 18 decimals */
        let collateral = ethers.utils.parseUnits("100");
        let slippage = ethers.utils.parseUnits("0.05")  // 5%
        let leverage = 1;
        let isLong = false; // we open short position, for long this should be true

        let tx = await this.susd.connect(this.trader1).approve(this.strips.address, collateral.mul(leverage).mul(10));
        await tx.wait();

        /*
        open PARAMS:
                IMarket _market,
                bool isLong,
                int256 collateral,
                int256 leverage,
                int256 slippage
        */
        tx = await this.strips.connect(this.trader1).open(
            this.market.address,
            isLong,
            collateral,
            leverage,
            slippage
        );
        await tx.wait();

        /*
            Just simple check for a test purpose only 
            
            GETPOSITON must never be used on FRONTEND - it's just for corner cases

            use getTradingInfo instead to receive all positions of the user.
        */
            let coder = ethers.utils.defaultAbiCoder;
        
            /*
            REQUEST PARAMS:
                struct GetPositionParams {
                    address market;
                    address account;
                }
            */
            let encodeTypes = [
                "address","address"
            ];
            
            let encodeParams = [
                this.market.address,
                this.trader1.address
            ];
    
            let params = coder.encode(encodeTypes, encodeParams);
    
            let viewActionArgs = {
                actionType: GETPOSITON,
                data: params
            }
    
            let data = await this.strips.viewDispatcher(viewActionArgs);
    
            /*
            RESPONSE DATA:
                struct PositionData {
                    IMarket market;
                    int256 pnl;
                    int256 marginRatio;
                    PositionParams positionParams;
                }
                
                where:
                struct PositionParams {
                    bool isLong;
                    bool isActive;
                    bool isLiquidated;
                    int256 notional;
                    int256 collateral;
                    int256 initialPrice;
                }

            */
            let decodeTypes = [
              "tuple(address market,int256 pnl,int256 marginRatio,(bool isLong, bool isActive, bool isLiquidated, int256 notional, int256 collateral, int256 initialPrice) positionParams)"
            ];
    
            let decoded = coder.decode(decodeTypes, data);
            let res = decoded[0];
    });

    it("stake to market/insurance - flow1/flow2", async function () {
        /*
            User stake directly to market/insurance. 

            And stake with USDC-STRP LP token - that he should receive from sushiswap pool

            For simplicity in this test scenario we are using the same mockToken for everything
        */

        let stakeAmount = ethers.utils.parseUnits("100");

        /* 
            FLOW 1: stake to market 
        */
        
        // approve first
        await this.lp.connect(this.trader1).approve(this.market.address, stakeAmount);

        let tx = await this.market.connect(this.trader1).stake(stakeAmount);
        await tx.wait();

        /*
            Once user has staked to market, all future operations to receive 
            his instant balance should be on SLPToken that is unique per market.

            In this test we will just check balance. More complex scenarios will be below
        */

        
        /* INTEGRITY CHECK For tests purpose only */

                /*First we need to receive address of SLP token */
                let slpTokenAddress = await this.market.getSlpToken();
                expect(slpTokenAddress).to.be.not.eq(ethers.constants.AddressZero);

                /*Then we can check balance it 1-1 to stake */
                let slpTokenFactory = await ethers.getContractFactory("SLPToken");
                let slpToken = slpTokenFactory.attach(slpTokenAddress);

                let stakerSlpBalance = await slpToken.balanceOf(this.trader1.address);
                expect(stakerSlpBalance).to.be.eq(stakeAmount);


        /* 
            FLOW 1: stake to insurance
            Insurance token called SIP - but the token is exactly the same

            It's the same as to stake to market, the address of SIP token will be different
        */

        // approve first
        await this.lp.connect(this.trader1).approve(this.insurance.address, stakeAmount);

        tx = await this.insurance.connect(this.trader1).stake(stakeAmount);
        await tx.wait();

        /* INTEGRITY CHECK For tests purpose only */

                /*First we need to receive address of SLP token */
                let sipTokenAddress = await this.insurance.getSlpToken();
                expect(sipTokenAddress).to.be.not.eq(ethers.constants.AddressZero);

                let sipTokenFactory = await ethers.getContractFactory("SLPToken");
                let sipToken = sipTokenFactory.attach(sipTokenAddress);

                let stakerSIpBalance = await sipToken.balanceOf(this.trader1.address);
                expect(stakerSIpBalance).to.be.eq(stakeAmount);

    });

    describe("DEPENDS on position", function () {
        beforeEach(async function () {

            /*Open a position for trader */
            let collateral = ethers.utils.parseUnits("100");
            let slippage = ethers.utils.parseUnits("0.05")  // 5%
            let leverage = 1;
            let isLong = false; // we open short position, for long this should be true
    
            let tx = await this.susd.connect(this.trader1).approve(this.strips.address, collateral.mul(leverage).mul(100));
            await tx.wait();
    
            tx = await this.strips.connect(this.trader1).open(
                this.market.address,
                isLong,
                collateral,
                leverage,
                slippage
            );
            await tx.wait();          
        });
    

            it("calc close/partly close params - close popup", async function () {
                /*
                    For this method the contract will return required values,
                    but some calculations should be done on frontend.

                    See below.
                */

                let coder = ethers.utils.defaultAbiCoder;

                /*
                REQUEST PARAMS:
                    struct CalcCloseParams {
                        address market;
                        address account;
                        int256 closeRatio;
                    }
                */
                let encodeTypes = [
                    "address","address","int256"
                ];
                
                /*closeRation MUST be 18 decimals even if 1 
                    for 100% close:
                    closeRatio = ethers.utils.parseUnits("1");
                */
                let closeRatio = ethers.utils.parseUnits("0.5"); //50% of the position
                let encodeParams = [
                    this.market.address,
                    this.trader1.address,
                    closeRatio
                ];
        
                let params = coder.encode(encodeTypes, encodeParams);
        
                let viewActionArgs = {
                    actionType: CALCCLOSE,
                    data: params
                }
        
                let data = await this.strips.viewDispatcher(viewActionArgs);
        
                /*
                RESPONSE DATA:
                    struct CalcCloseData {
                        address market;
                        int256 minimumMargin;
                        int256 pnl;
                        int256 marginLeft;
                        int256 fee;
                        int256 slippage;
                        int256 whatIfPrice;
                    }
                */
                let decodeTypes = [
                    "tuple(address market, int256 minMargin, int256 pnl, int256 marginLeft, int256 fee, int256 slippage, int256 whatIfPrice)"
                ];
        
                let decoded = coder.decode(decodeTypes, data);
                let res = decoded[0];
                
                /*
                    YOU MUST provide a check before allow user to close the position.
                    User CAN'T close (transaction will be reverted) the position IF:

                    if (closeRatio < 1){
                        CAN'T close if:  marginLeft < minimumMargin;  // transaction will be reverted
                    }
                    
                    if (closeRatio == 1){
                        it's a full close and user CAN close.
                        
                        TX will be reverted if position for liquidation.
                        BUT we don't need to make this check on frontend.
                    }
                */

                /*
                    Here are the parameters that we should show in popup
                    
                    Calc on frontend:
                    collateral_remaining = position.collateral * (1 - closeRatio)
                    total_returned = position.collateral + pnl;

                    all other from response:
                */
                
                let pnl = res.pnl;
                let fee = res.fee;
                let slippate = res.slippage;


                expect(res.market).to.be.eq(this.market.address);
                expect(res.minMargin).to.be.gt(0);
                expect(res.marginLeft).to.be.gt(0);
                expect(res.slippage).to.be.gt(0);
                expect(res.fee).to.be.gt(0);
                expect(res.whatIfPrice).to.be.gt(0);

        });


        it("close/partly close position", async function () {

            /*
                This methods suggests that frontend already did all checks.
                And the user approve close on popup.

                If checks were not validated TX will be reverted and user will lose gas fee
            */
            
            /*
                FULL CLOSE position    
            */
            
            let closeRatio = ethers.utils.parseUnits("1"); // FULL CLOSE
            let slippage = ethers.utils.parseUnits("0");  // let's simulate revert
        
            /*
                NEED to approve on USDC 
                BECAUSE fee is paying on top of collateral. 

                IF user doesn't have USDC - he can't close the position
                because he will not be able to pay fee

                For simplicity and decrease amount of calls on frontend.
                You can just apprive for notional size
            */
            let approveAmount = ethers.utils.parseUnits("100000");
            let tx = await this.susd.connect(this.trader1).approve(this.strips.address, approveAmount);
            await tx.wait();
            
            /*SHOULD be reverted as slippage is ZERO */
            await expect(
                this.strips.connect(this.trader1).close(
                    this.market.address,
                    closeRatio,
                    slippage
                )
            ).to.be.revertedWith("SLIPPAGE_EXCEEDED");
            
            slippage = ethers.utils.parseUnits("0.5");  // 50%
            // Now it should be closed
            tx = await this.strips.connect(this.trader1).close(
                this.market.address,
                closeRatio,
                slippage);
            await tx.wait();
            
            /*Check that NO_POSITON reverted */
            await getPosition(this, 
                            this.trader1.address, 
                            this.market.address, 
                            true); // shoud be reverted with NO_POSITION error
        });


        it("change collateral", async function () {
            
            /*
                For collateral popup we have 3 parameters that are fully calculated on Frontend.
                For this momemnt you already have information about position,
                that you received from getTradingInfo

                Parameters:
                Collateral - Show current collateral. (MUST be changed when user input)
                MarginRatio - Show margin ratio (MUST be changed when user input)
                MinimumRequiredCollateral - show this number IF Margin Ratio <= minMargin * 1.2
                    * MinimumRequiredCollateral = Position.notional * minMargin - Position.Pnl - Position.collateral


                When the user makes an input we should change parameters like this.
                ADD collateral popup:
                    Collateral += amount from input
                    MarginRatio = (Collateral + Position.Pnl) / Position.notional

                REMOVE collateral popup:
                    Collateral -= amount from input
                    MarginRatio = (Collateral + Position.Pnl) / Position.notional
                    IF margin_ratio <= minMarginPossible * 1.2 then SHOW WARNING and deactivate the button
            */
            
            /*
                ADD flow
                We need to approve on USDC - because there will be withdraw
            */
            let addCollateral = ethers.utils.parseUnits("100");

            // We always approve a little bit more.
            let tx = await this.susd.connect(this.trader1).approve(this.strips.address, addCollateral.mul(2));
            await tx.wait();
            
            /*
                changeCollateral params:
                    address market,
                    int256 collateral,
                    bool isAdd 
            */        
            tx = await this.strips.connect(this.trader1).changeCollateral(
                this.market.address,
                addCollateral,
                true
            );
            await tx.wait();
            
            /*INTEGRITY CHECK for test ony */
            let position = await getPosition(this,
                                            this.trader1.address,
                                            this.market.address,
                                            false);



            /*
                REMOVE flow
                NO need to approve on USDC - because there will be no withdraw
            */
            let removeCollateral = ethers.utils.parseUnits("100");
            tx = await this.strips.connect(this.trader1).changeCollateral(
                this.market.address,
                removeCollateral,
                false  
            );
            await tx.wait();
            
            /*INTEGRITY CHECK for test ony */
            position = await getPosition(this,
                                            this.trader1.address,
                                            this.market.address,
                                            false);

        });
    });

    describe("DEPENDS on position and stake", function () {
        beforeEach(async function () {
            /*Stake */
            let stakeAmount = ethers.utils.parseUnits("100");
            this.totalStaked = stakeAmount;
            await this.lp.connect(this.trader1).approve(this.market.address, stakeAmount.mul(10));
    
            let tx = await this.market.connect(this.trader1).stake(stakeAmount);
            await tx.wait();
    
            /*Make a trade */
            this.collateral = ethers.utils.parseUnits("100");
            this.leverage = 1;
            
            let slippage = ethers.utils.parseUnits("0.10")  // 10%
            let isLong = false; // we open short position, for long this should be true
    
            tx = await this.susd.connect(this.trader1).approve(this.strips.address, this.collateral.mul(this.leverage).mul(100));
            await tx.wait();
    
            tx = await this.strips.connect(this.trader1).open(
                this.market.address,
                isLong,
                this.collateral,
                this.leverage,
                slippage
            );
            await tx.wait();          
        });
        
        it("GET all rewards", async function () {
            let coder = ethers.utils.defaultAbiCoder;

            /*
            REQUEST PARAMS:
                struct CalcRewardsParams {
                    address account;
                }
            */
            let encodeTypes = [
                "address"
            ];
            
            let encodeParams = [
                this.trader1.address
            ];
    
            let params = coder.encode(encodeTypes, encodeParams);
    
            let viewActionArgs = {
                actionType: CALCREWARDS,
                data: params
            }
    
            let data = await this.strips.viewDispatcher(viewActionArgs);
    
            /*
            RESPONSE DATA:
                struct CalcRewardsData {
                    address account;
                    int256 rewardsTotal;
                }
            */
            let decodeTypes = [
                "tuple(address account, int256 rewardsTotal)"
            ];
    
            let decoded = coder.decode(decodeTypes, data);
            let res = decoded[0];
            
            expect(res.account).to.be.eq(this.trader1.address);
            expect(res.rewardsTotal).to.be.gt(0);
        });

        it("CLAIM all rewards", async function () {
            let coder = ethers.utils.defaultAbiCoder;

            /*
            REQUEST PARAMS:
                struct ClaimRewardsParams {
                    address account;
                }
            */
            let encodeTypes = [
                "address"
            ];
            
            let encodeParams = [
                this.trader1.address
            ];
    
            let params = coder.encode(encodeTypes, encodeParams);
    
            let stateActionArgs = {
                actionType: CLAIMREWARDS,
                data: params
            }
    
            await this.strips.stateDispatcher(stateActionArgs);
            
            /*INTEGRITY check for test only */
            let res = await getRewards(this, this.trader1.address);

            expect(res.rewardsTotal).to.be.eq(0);
        });

        it("getTradingInfo - wallet connected", async function () {
            let [
                assetData,
                positionData
            ] = await this.strips.getTradingInfo(this.trader1.address);
            
            /*
                Will return the next data STRUCTURE:
                 
                struct TradingInfo {
                    //Includes also info about the current market prices, to show on dashboard
                    AssetData[] assetData;
                    PositionData[] positionData;
                }

                WHERE: 
                    struct AssetData {
                        bool isInsurance;

                        address asset;
                        // Address of SLP/SIP token
                        address slpToken;

                        int256 marketPrice;
                        int256 oraclePrice;

                        int256 maxNotional;
                        int256 tvl;
                        int256 apy;
                    }


                    struct PositionData {
                        //address of the market
                        IMarket market;
                        // total pnl - real-time profit or loss for this position
                        int256 pnl;
                        // current margin ratio of the position
                        int256 marginRatio;
                        PositionParams positionParams;
                    }


                    struct PositionParams {
                        // true - for long, false - for short
                        bool isLong;
                        // is this position closed or not
                        bool isActive;
                        // is this position liquidated or not
                        bool isLiquidated;

                        //position size in USDC
                        int256 notional;
                        //collateral size in USDC
                        int256 collateral;
                        //initial price for position
                        int256 initialPrice;
                    }
            */
            expect(assetData[0].asset).to.be.eq(this.market.address)
                
            /*
                positionData size is equal to marketData size but
                market === 0x000000
            */
            expect(positionData.length).to.be.gt(0);

            /*ONE POSITION MINIMUM */
            let foundPosition = false;
            for (let position of positionData){
                if (position.market === this.market.address){
                    expect(position.positionParams.isActive).to.be.eq(true);
                    expect(position.positionParams.notional).to.be.eq(this.collateral.mul(this.leverage).mul(4));
                    expect(position.positionParams.collateral).to.be.eq(this.collateral.mul(4));
    
                    foundPosition = true;   
                    break;
                }
            }
    
        });
    
        it("getStakingInfo - wallet connected", async function () {
            let [
                assetData,
                stakingData
            ] = await this.strips.getStakingInfo(this.trader1.address);
            
            /*
                Will return the next data STRUCTURE:
                 
                struct StakingInfo {
                    //Includes also info about the current market prices, to show on dashboard
                    AssetData[] assetData;
                    StakingData[] stakingData;
                }

                WHERE: 
                    struct AssetData {
                        address asset;
                        // Address of SLP/SIP token
                        address slpToken;

                        int256 marketPrice;
                        int256 oraclePrice;

                        int256 maxNotional;
                        int256 tvl;
                        int256 apy;
                    }

                    struct StakingData {
                        //Market or Insurance address
                        address asset; 

                        // collateral = slp amount
                        uint256 totalStaked;
                    }
            */
            expect(assetData[0].asset).to.be.eq(this.market.address)
            expect(stakingData.length).to.be.gt(0);

            /*ONE STAKE MINIMUM */
            let foundStake = false;
            for (let stake of stakingData){
                if (stake.asset === this.market.address){
                    expect(stake.totalStaked).to.be.eq(this.totalStaked.mul(5));
    
                    foundStake = true;   
                    break;
                }
            }

            expect(foundStake).to.be.eq(true);
    
        });

        it("unstake - calc profit and unstake", async function () {
            /*
                This is the scenario when user has stake and want to unstake amount
                But we need to show him profit on popup first 
            */

            /*
                Profit stored on SLP token.

                Here is how to receive it:
                * getSlpToken() from market or insurance (you also receive this address in AssetData.slpToken)
                * slpToken.calcProfit(address staker, uint256 amount) - will return the profit for unstake == amount
                
                
                The next structure will be returned for profit:
                    struct ProfitParams{
                        int256 unstakeAmountLP;
                        int256 unstakeAmountERC20;

                        int256 stakingProfit;   
                        int256 stakingFee;

                        int256 penaltyLeft;
                        uint256 totalStaked;

                        int256 lpPrice;

                        int256 lpProfit;
                        int256 usdcLoss;
                    }  
            */
            

            let slpTokenAddress = await this.market.getSlpToken(); /*The same for insurance  this.insurance.getSlpToken()*/
            expect(slpTokenAddress).to.be.not.eq(ethers.constants.AddressZero);
        
            let slpTokenFactory = await ethers.getContractFactory("SLPToken");
            let slpToken = slpTokenFactory.attach(slpTokenAddress);
                
            /*Let's calc profit for 50% */
            let [
                unstakeAmountLP,
                unstakeAmountERC20,
                stakingProfit,
                stakingFee,
                penaltyLeft,
                totalStaked,
                lpPrice,
                lpProfit,
                usdcLoss
            ] = await slpToken.calcProfit(this.trader1.address, this.totalStaked.div(2));

            expect(totalStaked).to.be.eq(this.totalStaked.mul(6));
            

            /*To unstake 50% do this */
            await this.market.connect(this.trader1).unstake(this.totalStaked.div(2));

            /*Integrity check the stake must be 50% now */
            [
                unstakeAmountLP,
                unstakeAmountERC20,
                stakingProfit,
                stakingFee,
                penaltyLeft,
                totalStaked,
                lpPrice,
                lpProfit,
                usdcLoss
            ] = await slpToken.calcProfit(this.trader1.address, this.totalStaked.div(2));

        });


    });

});


async function createTraders(_this:any){
    await _this.strp.connect(_this.deployer).transfer(_this.trader1.address, TRADERS_AMOUNT);
    await _this.susd.connect(_this.deployer).mint(_this.trader1.address, TRADERS_AMOUNT);

    await _this.strp.connect(_this.deployer).transfer(_this.trader2.address, TRADERS_AMOUNT);
    await _this.susd.connect(_this.deployer).mint(_this.trader2.address, TRADERS_AMOUNT);

    await _this.strp.connect(_this.deployer).transfer(_this.trader3.address, TRADERS_AMOUNT);
    await _this.susd.connect(_this.deployer).mint(_this.trader3.address, TRADERS_AMOUNT);

    await _this.susd.connect(_this.deployer).approve(_this.sushiRouter.address, TRADERS_AMOUNT.mul(100));
    await _this.strp.connect(_this.deployer).approve(_this.sushiRouter.address, TRADERS_AMOUNT.mul(100));

    let balance = await _this.susd.balanceOf(_this.trader1.address);
    expect(TRADERS_AMOUNT).to.be.eq(balance);

    balance = await _this.strp.balanceOf(_this.trader1.address);
    expect(TRADERS_AMOUNT).to.be.eq(balance);


    balance = await _this.susd.balanceOf(_this.trader2.address);
    expect(TRADERS_AMOUNT).to.be.eq(balance);

    balance = await _this.strp.balanceOf(_this.trader2.address);
    expect(TRADERS_AMOUNT).to.be.eq(balance);

    let tokenA = _this.strp.address;
    let tokenB = _this.susd.address;

    let deadline = Math.round((Date.now() / 1000)) + 86400; // 1 day
    let tx = await _this.sushiRouter.connect(_this.deployer).addLiquidity(
        tokenA,
        tokenB,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT.div(2),
        TRADERS_AMOUNT.div(2),
        _this.trader1.address,
        deadline
    );
    await tx.wait();

    tx = await _this.sushiRouter.connect(_this.deployer).addLiquidity(
        tokenA,
        tokenB,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT.div(2),
        TRADERS_AMOUNT.div(2),
        _this.trader2.address,
        deadline
    );
    await tx.wait();

    tx = await _this.sushiRouter.connect(_this.deployer).addLiquidity(
        tokenA,
        tokenB,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT,
        TRADERS_AMOUNT.div(2),
        TRADERS_AMOUNT.div(2),
        _this.trader3.address,
        deadline
    );
    await tx.wait();

    /*Just mint more SUSD */
    await _this.susd.connect(_this.deployer).mint(_this.trader1.address, TRADERS_AMOUNT);
    await _this.susd.connect(_this.deployer).mint(_this.trader2.address, TRADERS_AMOUNT);
    await _this.susd.connect(_this.deployer).mint(_this.trader3.address, TRADERS_AMOUNT);


}


async function getPosition(_this:any, _trader:any, _market:any, _reverted:boolean)
{
    let coder = ethers.utils.defaultAbiCoder;
        
    /*
    REQUEST PARAMS:
        struct GetPositionParams {
            address market;
            address account;
        }
    */
    let encodeTypes = [
        "address","address"
    ];
    
    let encodeParams = [
        _market,
        _trader
    ];

    let params = coder.encode(encodeTypes, encodeParams);

    let viewActionArgs = {
        actionType: GETPOSITON,
        data: params
    }

    if (_reverted){
        await expect(_this.strips.viewDispatcher(viewActionArgs)
        ).to.be.revertedWith("NO_POSITION");
        return;
    }

    let data = await _this.strips.viewDispatcher(viewActionArgs);

    /*
    RESPONSE DATA:
        struct PositionData {
            IMarket market;
            int256 pnl;
            int256 marginRatio;
            PositionParams positionParams;
        }
        
        where:
        struct PositionParams {
            bool isLong;
            bool isActive;
            bool isLiquidated;
            int256 notional;
            int256 collateral;
            int256 initialPrice;
        }

    */
    let decodeTypes = [
      "tuple(address market,int256 pnl,int256 marginRatio,(bool isLong, bool isActive, bool isLiquidated, int256 notional, int256 collateral, int256 initialPrice) positionParams)"
    ];

    let decoded = coder.decode(decodeTypes, data);
    let res = decoded[0];

    return res;
}
  

async function getRewards(_this:any, _trader:any)
{
    let coder = ethers.utils.defaultAbiCoder;

    /*
    REQUEST PARAMS:
        struct CalcRewardsParams {
            address account;
        }
    */
    let encodeTypes = [
        "address"
    ];
    
    let encodeParams = [
        _trader
    ];

    let params = coder.encode(encodeTypes, encodeParams);

    let viewActionArgs = {
        actionType: CALCREWARDS,
        data: params
    }

    let data = await _this.strips.viewDispatcher(viewActionArgs);

    /*
    RESPONSE DATA:
        struct CalcRewardsData {
            address account;
            int256 rewardsTotal;
        }
    */
    let decodeTypes = [
        "tuple(address account, int256 rewardsTotal)"
    ];

    let decoded = coder.decode(decodeTypes, data);
    let res = decoded[0];

    return res;
}
