import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

const {utils} = ethers;

const nonce = 'AaronNan';
const number = 500;
const nonceHash = utils.keccak256(utils.formatBytes32String(nonce));
const nonceNumHash = utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(
    ['bytes32', 'uint'],
    [ethers.utils.formatBytes32String(nonce), number],
  ),
);
const ONE_ETHER = utils.parseEther('1');

describe('GuessNumber', function () {
  async function getGuessNumberFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, accountA, accountB, accountC] = await ethers.getSigners();

    const GuessNumber = await ethers.getContractFactory('GuessNumber');
    const guessNumber = await GuessNumber.deploy(nonceHash, nonceNumHash, 4, {
      value: ONE_ETHER,
    });

    return {guessNumber, owner, accountA, accountB, accountC};
  }

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      const {guessNumber, owner} = await loadFixture(getGuessNumberFixture);

      expect(await guessNumber.host()).to.equal(owner.address);
    });

    it('Should set the right bet', async function () {
      const {guessNumber} = await loadFixture(getGuessNumberFixture);

      expect(await guessNumber.bet()).to.equal(ONE_ETHER);
    });

    it('Should set the right nonceHash', async function () {
      const {guessNumber} = await loadFixture(getGuessNumberFixture);

      expect(await guessNumber.nonceHash()).to.equal(nonceHash);
    });

    it('Should set the right nonceNumHash', async function () {
      const {guessNumber} = await loadFixture(getGuessNumberFixture);

      expect(await guessNumber.nonceNumHash()).to.equal(nonceNumHash);
    });

    it('Should receive and store the funds', async function () {
      const {guessNumber} = await loadFixture(getGuessNumberFixture);

      expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(ONE_ETHER);
    });
  });

  describe('Guessing', function () {
    // how to specify the address to guess
    it('Should revert with the right error if wrong range', async function () {
      const {guessNumber} = await loadFixture(getGuessNumberFixture);

      expect(guessNumber.guess(1000)).to.be.revertedWith(
        'The range of number should be [0, 1000)',
      );
    });

    it('Should revert with the right error if host is guessing', async function () {
      const {guessNumber, owner} = await loadFixture(getGuessNumberFixture);

      expect(guessNumber.connect(owner).guess(999)).to.be.revertedWith(`Host can't guess`);
    });

    it('Should attach the same Ether Value as the Host deposited', async function () {
      const {guessNumber, accountA} = await loadFixture(getGuessNumberFixture);

      expect(
        guessNumber.connect(accountA).guess(200, {value: utils.parseEther('0.5')}),
      ).to.be.revertedWith('need to attach the same Ether Value as the Host deposited');
    });

    it('Should receive and store the funds after guessing', async function () {
      const {guessNumber, accountA, accountB} = await loadFixture(getGuessNumberFixture);

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));

      await expect(guessNumber.connect(accountB).guess(300, {value: ONE_ETHER}));

      expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(utils.parseEther('3'));
    });

    it('Should revert with the right error if exceeding the player limit', async function () {
      const [accountA, accountB] = await ethers.getSigners();
      const GuessNumber = await ethers.getContractFactory('GuessNumber');
      const guessNumber = await GuessNumber.deploy(nonceHash, nonceNumHash, 1, {
        value: ONE_ETHER,
      });

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));
      expect(guessNumber.connect(accountB).guess(300, {value: ONE_ETHER})).to.be.revertedWith(
        `Already the maximum number of players`,
      );
    });
  });

  describe('Reveal', () => {
    it('Should only the owner can reveal', async function () {
      const {guessNumber, accountA} = await loadFixture(getGuessNumberFixture);

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));

      expect(
        guessNumber.connect(accountA).reveal(utils.formatBytes32String(nonce), number),
      ).to.be.revertedWith('Only the owner can operate');
    });

    it('Should revert if no one has participated in the betting yet', async function () {
      const {guessNumber, owner} = await loadFixture(getGuessNumberFixture);

      expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), number),
      ).to.be.revertedWith('Not a good time, ser');
    });

    it('Should revert if nonce is not expected', async function () {
      const {guessNumber, owner, accountA} = await loadFixture(getGuessNumberFixture);

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));

      expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String('NOT_NONCE'), number),
      ).to.be.revertedWith('Nonce should be derived by nonceHash');
    });

    it('Should revert if number is not expected', async function () {
      const {guessNumber, owner, accountA} = await loadFixture(getGuessNumberFixture);

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));

      expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), 123),
      ).to.be.revertedWith('Nonce should be derived by nonceNumHash');
    });

    it('Should reveal the success if it meets expectations (Closest guessing)', async function () {
      const {guessNumber, owner, accountA, accountB, accountC} = await loadFixture(
        getGuessNumberFixture,
      );

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountB).guess(300, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountC).guess(400, {value: ONE_ETHER}));

      expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(utils.parseEther('4'));

      await expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), number),
      ).to.changeEtherBalances(
        [guessNumber, accountC],
        [utils.parseEther('-4'), utils.parseEther('4')],
      );
    });

    it('Should reveal the success if it meets expectations (Direct guessing)', async function () {
      const {guessNumber, owner, accountA, accountB, accountC} = await loadFixture(
        getGuessNumberFixture,
      );

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountB).guess(300, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountC).guess(500, {value: ONE_ETHER}));

      expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(utils.parseEther('4'));

      await expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), number),
      ).to.changeEtherBalances(
        [guessNumber, accountC],
        [utils.parseEther('-4'), utils.parseEther('4')],
      );
    });

    it('Should share the reward evenly to each player (Multiple guessed)', async function () {
      const {guessNumber, owner, accountA, accountB, accountC} = await loadFixture(
        getGuessNumberFixture,
      );

      await expect(guessNumber.connect(accountA).guess(200, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountB).guess(400, {value: ONE_ETHER}));
      await expect(guessNumber.connect(accountC).guess(600, {value: ONE_ETHER}));

      expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(utils.parseEther('4'));

      await expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), number),
      ).to.changeEtherBalances(
        [guessNumber, accountB, accountC],
        [utils.parseEther('-4'), utils.parseEther('2'), utils.parseEther('2')],
      );
    });

    it('Should share the reward evenly to each player (Host breaking the rules)', async function () {
      const number = 1415;
      const nonceNumHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['bytes32', 'uint'],
          [ethers.utils.formatBytes32String(nonce), number],
        ),
      );
      const [owner, accountA, accountB] = await ethers.getSigners();
      const GuessNumber = await ethers.getContractFactory('GuessNumber');
      const guessNumber = await GuessNumber.deploy(nonceHash, nonceNumHash, 4, {
        value: ONE_ETHER,
      });

      await guessNumber.connect(accountA).guess(200, {value: ONE_ETHER});
      await guessNumber.connect(accountB).guess(400, {value: ONE_ETHER});

      await expect(await ethers.provider.getBalance(guessNumber.address)).to.equal(
        utils.parseEther('3'),
      );

      await expect(
        guessNumber.connect(owner).reveal(utils.formatBytes32String(nonce), number),
      ).to.changeEtherBalances(
        [guessNumber, accountA, accountB],
        [utils.parseEther('-3'), utils.parseEther('1.5'), utils.parseEther('1.5')],
      );
    });
  });
});
