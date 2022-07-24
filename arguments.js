const {ethers} = require('hardhat');

const nonce = 'AaronNan';
const number = 500;
const nonceHash = ethers.utils.keccak256(ethers.utils.formatBytes32String(nonce));
const nonceNumHash = ethers.utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(
    ['bytes32', 'uint'],
    [ethers.utils.formatBytes32String(nonce), number],
  ),
);

module.exports = [nonceHash, nonceNumHash];
