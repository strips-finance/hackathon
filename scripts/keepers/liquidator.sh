#!/bin/bash
date
echo "Combined Script executed from: ${PWD}"
BASEDIR=$(dirname $0)
FULLPATH=${PWD}/${BASEDIR}

. ${FULLPATH}/../../.env

npx hardhat --config ${FULLPATH}/../../hardhat.config.ts liquidationKeeper --network local