/* Compile And Push To Eth Network */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('Web3');
const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();

const provider = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `https://cronos-testnet-3.crypto.org:8545`
);
const web3 = new Web3(provider);
const content = fs.readFileSync(
  './contracts/Multicall2.sol',
  'utf8'
); /* PATH TO CONTRACT */

const input = {
  language: 'Solidity',
  sources: {
    './contracts/Multicall2.sol': { content },
  },
  settings: {
    outputSelection: { '*': { '*': ['*'] } },
  },
};

async function deploy() {
  /* 1. Get Ethereum Account */
  const [account] = await web3.eth.getAccounts();

  /* 2. Compile Smart Contract */
  const { contracts } = JSON.parse(solc.compile(JSON.stringify(input)));

  const contract = contracts['./contracts/Multicall2.sol']['Multicall2'];

  /* 2. Extract Abi And Bytecode From Contract */
  const abi = contract.abi;

  console.log('abi', abi);

  return;

  const bytecode = contract.evm.bytecode.object;

  /* 3. Send Smart Contract To Blockchain */
  const { _address } = await new web3.eth.Contract(abi)
    .deploy({ data: bytecode })
    .send({ from: account, gas: 1000000 });

  console.log('Contract Address =>', _address);
}

deploy();
