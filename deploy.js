// solc compiler
solc = require('solc');

// file reader
fs = require('fs');

// Creation of Web3 class
Web3 = require('web3');

require('dotenv').config()

// Setting up a HttpProvider
web3 = new Web3(
  new Web3.providers.HttpProvider('https://cronos-testnet-3.crypto.org:8545')
);

// Reading the file
file = fs.readFileSync('./contracts/Multicall2.sol').toString();

// console.log(file);

// input structure for solidity compiler
var input = {
  language: 'Solidity',
  sources: {
    './contracts/Multicall2.sol': {
      content: file,
    },
  },

  settings: {
    outputSelection: {
      '*': {
        '*': ['*'],
      },
    },
  },
};

var output = JSON.parse(solc.compile(JSON.stringify(input)));
// console.log("Result : ", output);

ABI = output.contracts['./contracts/Multicall2.sol']['Multicall2'].abi;
bytecode =
  output.contracts['./contracts/Multicall2.sol']['Multicall2'].evm.bytecode
    .object;
// console.log("Bytecode: ", bytecode);
// console.log("ABI: ", ABI);

web3.eth.personal
  .unlockAccount(
    '0x766De35346B6112Dc1aE559f60C0886e2A7ed5A5',
    process.env.PRIVATE_KEY
  )
  .then(() => {
    console.log('Account unlocked.');
  })
  .catch(console.error);

contract = new web3.eth.Contract(ABI);
contract
  .deploy({ data: bytecode })
  .send({ from: '0x766De35346B6112Dc1aE559f60C0886e2A7ed5A5', gas: 470000 })
  .on('receipt', (receipt) => {
    // Contract Address will be returned here
    console.log('Contract Address:', receipt.contractAddress);
  })
  .then((initialContract) => {
    initialContract.methods.message().call((err, data) => {
      console.log('Initial Data:', data);
    });
  });
