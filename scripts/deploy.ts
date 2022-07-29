import {ethers} from 'hardhat';

const nonce = 'AaronNan';
const number = 500;
const nonceHash = ethers.utils.keccak256(ethers.utils.formatBytes32String(nonce));
const nonceNumHash = ethers.utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(
    ['bytes32', 'uint'],
    [ethers.utils.formatBytes32String(nonce), number],
  ),
);
const Bet = ethers.utils.parseEther('0.1');

async function main() {
  const GuessNumber = await ethers.getContractFactory('GuessNumber');
  const guessNumber = await GuessNumber.deploy(nonceHash, nonceNumHash, 4, {
    value: Bet,
  });

  await guessNumber.deployed();

  console.log('GuessNumber with 0.1 ETH deployed to:', guessNumber.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
