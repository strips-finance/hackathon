import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomiclabs/hardhat-ethers"
import "tsconfig-paths/register";
import "hardhat-contract-sizer";
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';


dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  external: {
   contracts: [
     {
       artifacts: "external",
    }]
  },
  networks: {
      forking: {
        url: ""
      },
      hardhat: {
          allowUnlimitedContractSize: true,
          blockGasLimit: 100000000,
          /*
          mining : {
            auto: false,   //we need this for tests
            interval: 0  
          }*/
          hardfork: 'berlin',
      },
      rinkArby: {
        chainId: 421611,
        url: "https://rinkeby.arbitrum.io/rpc",
        live: true,
        saveDeployments: true,
      },
      local: {
        url: "http://127.0.0.1:8545",
        hardfork: 'berlin'
      }
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
      1: `${process.env.DEPLOYER_ADDRESS}`, // for mainnet
      4: `${process.env.DEPLOYER_ADDRESS}`, // for rinkeby

    },
    tokenOwner: 1,
    randomAddress: 2
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12"
      },
      {
        version: "0.8.4"
      },
    ]
  },
  mocha: {
      timeout: 60000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  typechain:{
    outDir: 'typechain',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
  }
}

export default config