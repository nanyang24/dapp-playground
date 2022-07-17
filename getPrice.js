const Web3 = require('web3');
const { FixedNumber } = require('ethers');
const CronosOracleReaderABI = require('./ABIs/CronosOracleReader.json');
const NetworkRPC = require('./NetworkRPC.js');

const CronosOracleReader = '0xb3DF0a9582361db08EC100bd5d8CB70fa8579f4B';

const getPrice = async () => {
  const web3 = new Web3(NetworkRPC.Cronos);
  const contract = new web3.eth.Contract(
    CronosOracleReaderABI,
    CronosOracleReader
  );

  const [latestAnswer, description, decimals] = await Promise.all([
    contract.methods.latestAnswer().call(),
    contract.methods.description().call(),
    contract.methods.decimals().call(),
  ]);

  // human readable way...
  formattedPrice = FixedNumber.fromValue(latestAnswer, decimals).round(2);

  console.log(`${description}: ${formattedPrice}`);
};

getPrice();
