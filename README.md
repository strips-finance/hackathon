# Strips hackathon 

Rules can be found here: https://strips-finance.medium.com/announcing-the-40-000-strips-hackathon-4994cb286cd6

This project allows to deploy local version of Strips and all related contracts.

Install all deps:
```shell
yarn
```


Open terminal and launch local hardhat node:

```shell
yarn test-node
```

In separate terminal launch deployment of the contracts to node

```shell
yarn deploy:local
```

Now you can launch hardhat console and interact with Strips contracts
```shell
yarn hardhat console --network local
```

# How to fork arbitrum testnet 
Open terminal and launch local forked hardhat node:


```shell
npx hardhat node --no-deploy --fork https://rinkeby.arbitrum.io/rpc
```

in the separate terminal launch check. This command will attach to rinkArby addresses and check that values are correct
```shell
npx hardhat forkCheck --network local
```

# How to launch the liquidator 

Liquidator is the script that liquidate positions in Strips. You should launch it locally via cron for any period (10 minutes is ok). To do that we've added the script, launch that with:
```shell
touch .env
sh scripts/keepers/liquidator.sh
```



# Structure of the repo

    .
    ├── external                # ABI and artifacts of all Strips related contracts 
    ├── deploy                  # local.ts is an example of deploying and setup Strips and all related contracts
    ├── params                  # Configuration of the contracts params
    ├── test                    # Example of how to interuct with Strips' contracts: stake/unstake, trade, etc.
    ├── docs                    # Contracts scheme.
    └── README.md
