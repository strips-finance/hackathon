import { Signer, utils } from 'ethers';
import { Contract } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

export async function liquidationKeeper(params: any, hre:any){
    const { ethers } = hre;
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    let chainId = await hre.getChainId();
    console.log("liquidationKeeper launched for chainId =" + chainId + " from wallet=" + deployer);
    
    const deployerSigner = await ethers.getSigner(deployer);

    try{
        let coder = hre.ethers.utils.defaultAbiCoder;
        let DUMMY_ENCODED_DATA = coder.encode(["int256"], [ethers.constants.MaxInt256]);

        const artifacts = await hre.deployments.get("LiquidationKeeper");
        const LiqudationKeeper = await hre.ethers.getContractAt("LiquidationKeeper", artifacts.address, deployerSigner);

        let tx = await LiqudationKeeper.performUpkeep(DUMMY_ENCODED_DATA);
        await tx.wait();
    }catch(error){
        console.log("FAILED liquidationKeeper");
        console.log(error);
        return;
    }

    console.log("SUCCESS liquidationKeeper");
}


export async function integrity(params: any, hre:any){
    const { ethers } = hre;
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    const deployerSigner = await ethers.getSigner(deployer);

    let chainId = await hre.getChainId();

    console.log("chainId =" + chainId);
    console.log("deployer =" + deployer);

    let artifact = await deployments.get("Strips");
    const STRIPS = await ethers.getContractAt("Strips", artifact.address, deployerSigner);
    console.log("STRIPS found at=", STRIPS.address);

    artifact = await deployments.get("InsuranceFund");
    const Insurance = await ethers.getContractAt("InsuranceFund", artifact.address, deployerSigner);
    console.log("InsuranceFund found at=", Insurance.address);

    artifact = await deployments.get("IrsMarket-ftx-btc-funding");
    const ftxMarket = await ethers.getContractAt("IrsMarket", artifact.address, deployerSigner);
    console.log("ftx-btc-funding IrsMarket found at=", ftxMarket.address);

    artifact = await deployments.get("IrsMarket-binance-btc-funding");
    const binanceMarket = await ethers.getContractAt("IrsMarket", artifact.address, deployerSigner);
    console.log("biance-btc-funding IrsMarket found at=", binanceMarket.address);

    artifact = await deployments.get("UniswapLpOracle");
    const lpOracle = await ethers.getContractAt("UniswapLpOracle", artifact.address, deployerSigner);
    console.log("UniswapLpOracle found at=", lpOracle.address);

    artifact = await deployments.get("SUSD");
    const SUSD = await ethers.getContractAt("SUSD", artifact.address, deployerSigner);
    console.log("SUSD found at=", SUSD.address);

    artifact = await deployments.get("STRP");
    const STRP = await ethers.getContractAt("STRP", artifact.address, deployerSigner);
    console.log("STRP found at=", lpOracle.address);

    console.log("...checking deployer balances:");
    let balance = await SUSD.balanceOf(deployer);
    console.log("SUSD deployer balance=", ethers.utils.formatUnits(balance));

    balance = await STRP.balanceOf(deployer);
    console.log("STRP deployer balance=", ethers.utils.formatUnits(balance));

    let tx = await SUSD.connect(deployerSigner).approve(STRIPS.address, ethers.constants.MaxInt256);
    await tx.wait();

    tx = await STRP.connect(deployerSigner).approve(STRIPS.address, ethers.constants.MaxInt256);
    await tx.wait();

    console.log("...checking liquidity:");
    let liquidity = await Insurance.getLiquidity();
    console.log("Insurance liquidity=", ethers.utils.formatUnits(liquidity));

    liquidity = await ftxMarket.getLiquidity();
    console.log("ftxMarket liquidity=", ethers.utils.formatUnits(liquidity));

    liquidity = await binanceMarket.getLiquidity();
    console.log("binanceMarket liquidity=", ethers.utils.formatUnits(liquidity));

    console.log("...checking prices:");
    let [
        marketPrice,
        oraclePrice
    ] = await ftxMarket.getPrices();
    console.log("ftxMarket marketPrice=" + ethers.utils.formatUnits(marketPrice) + " oraclePrice=" + ethers.utils.formatUnits(oraclePrice));

    [
        marketPrice,
        oraclePrice
    ] = await binanceMarket.getPrices();
    console.log("binanceMarket marketPrice=" + ethers.utils.formatUnits(marketPrice) + " oraclePrice=" + ethers.utils.formatUnits(oraclePrice));

    let lpPrice = await lpOracle.getPrice();
    console.log("UniswapLpOracle lpPrice=" + ethers.utils.formatUnits(lpPrice));

    let strpPrice = await lpOracle.strpPrice();
    console.log("UniswapLpOracle strpPrice=" + ethers.utils.formatUnits(strpPrice));

    console.log("...Check positions:");
    let count = await STRIPS.getPositionsCount();
    console.log("..STRIPS positions count=", count);
}


