import hre, { ethers } from "hardhat";
import { expect } from 'chai';
import { v4 } from 'uuid';
import { BigNumber, } from 'ethers';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

const { utils } = ethers;

describe('ChequeBank', function () {
  async function deployContract() {
    const [owner, accountA, accountB, accountC, accountD] = await ethers.getSigners();
    const ChequeBank = await ethers.getContractFactory('ChequeBank');
    const chequeBank = await ChequeBank.deploy();
    return { chequeBank, owner, accountA, accountB, accountC, accountD };
  }

  async function signCheque({
    chequeId,
    payer,
    payee,
    amount,
    contractAddress,
    validFrom,
    validThru,
    signer,
  }: {
    chequeId: string, payer: string, payee: string, amount: BigNumber,
    contractAddress: string, validFrom: number, validThru: number, signer: SignerWithAddress
  }) {
    const chequeDataHash = utils.solidityKeccak256(
      ["bytes32", "address", "address", "uint", "address", "uint32", "uint32"],
      [
        chequeId,
        payer,
        payee,
        amount,
        contractAddress,
        validFrom,
        validThru
      ]);

    return await signer.signMessage(utils.arrayify(chequeDataHash));
  }

  async function createCheque(payer: string, payee: string, contractAddress: string, signer: SignerWithAddress, validFrom?: number, validThru?: number) {
    const chequeId = utils.formatBytes32String(v4().slice(0, 10));
    const ONE_ETHER = utils.parseEther('1');
    // https://hardhat.org/hardhat-network/docs/reference#hardhat-mine
    // mine 256 blocks
    await hre.network.provider.send('hardhat_mine', ['0x100']);

    const curBlockNumber = await ethers.provider.getBlockNumber();
    validFrom = validFrom ? validFrom : curBlockNumber - 100;
    validThru = validThru ? validThru : curBlockNumber + 100;

    const chequeInfo = {
      chequeId,
      payer,
      payee,
      amount: ONE_ETHER,
      validFrom,
      validThru,
    };

    const sig = await signCheque({
      ...chequeInfo,
      contractAddress,
      signer,
    });

    return {
      chequeInfo,
      sig,
    };;
  }

  async function createSignOver(counter: number, chequeId: string, oldPayee: string, newPayee: string, signer: SignerWithAddress) {
    const magicNumber = 0xFFFFDEAD;
    const signOverDataHash = utils.solidityKeccak256(
      ["bytes4", "uint8", "bytes32", "address", "address"],
      [
        magicNumber,
        counter,
        chequeId,
        oldPayee,
        newPayee
      ]);

    const sig = await signer.signMessage(utils.arrayify(signOverDataHash));
    const signOverInfo = {
      counter,
      chequeId,
      oldPayee,
      newPayee
    }
    const signOverData = {
      signOverInfo,
      sig
    }

    return signOverData;
  }


  describe('Deposit', async function () {
    it('deposit success', async function () {
      const { chequeBank, owner, accountA, accountB, accountC } = await deployContract();

      await expect(
        chequeBank.connect(accountA).deposit({ value: utils.parseEther('1') }),
      ).to.changeEtherBalances([accountA], [utils.parseEther('-1')]);

      expect(await ethers.provider.getBalance(chequeBank.address)).to.equal(utils.parseEther('1'));
    });
  });

  describe('Withdraw', async function () {
    it('Withdrawal should be successful', async function () {
      const { chequeBank, owner, accountA, accountB, accountC } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther('3') });

      await expect(
        chequeBank.connect(accountA).withdraw(utils.parseEther('1')),
      ).to.changeEtherBalances([accountA], [utils.parseEther('1').toBigInt()]);

      expect(await chequeBank.balances(accountA.address)).to.equal(utils.parseEther('2'));
    });

    it('Withdrawal failed due to insufficient balance', async function () {
      const { chequeBank, accountA } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther('1') });

      await expect(
        chequeBank.connect(accountA).withdraw(utils.parseEther('2')),
      ).to.be.revertedWith('User do not have enough balance to withdraw');
    });
  });

  describe('WithdrawTo', async function () {
    it('Withdrawal should be successful', async function () {
      const { chequeBank, owner, accountA, accountB, accountC } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther('3') });

      await expect(
        chequeBank.connect(accountA).withdrawTo(utils.parseEther('1'), accountB.address),
      ).to.changeEtherBalances([accountB], [utils.parseEther('1')]);

      expect(await chequeBank.balances(accountA.address)).to.equal(utils.parseEther('2'));
    });

    it('Withdrawal failed due to insufficient balance', async function () {
      const { chequeBank, accountA, accountB } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther('1') });

      await expect(
        chequeBank.connect(accountA).withdrawTo(utils.parseEther('2'), accountB.address),
      ).to.be.revertedWith('User do not have enough balance to withdraw');
    });
  });

  describe('Redeem', async function () {
    it('Redemption Successful', async function () {
      const { chequeBank, owner, accountA, accountB } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther('3') });

      const chequeData = await createCheque(
        accountA.address,
        accountB.address,
        chequeBank.address,
        accountA,
      );

      await expect(chequeBank.connect(accountB).redeem(chequeData)).to.changeEtherBalances(
        [accountB],
        [utils.parseEther('1')],
      );

      expect(await chequeBank.balances(accountA.address)).to.equal(utils.parseEther('2'));
      expect(await chequeBank.redeemedCheques(chequeData.chequeInfo.chequeId)).to.equal(true);
    });


    it("Cheque have been redeemed", async function () {
      const { chequeBank, owner, accountA, accountB } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      await expect(chequeBank.connect(accountB).redeem(chequeData)).to
        .changeEtherBalances(
          [accountB],
          [utils.parseEther("1")]
        );

      expect(chequeBank.connect(accountA).redeem(chequeData)).to.be.revertedWith("Cheque has been redeemed");
    });

    it("Cheque have been revoked", async function () {
      const { chequeBank, owner, accountA, accountB } = await deployContract();

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      await chequeBank.connect(accountA).revoke(chequeData);

      expect(await chequeBank.revokedCheques(chequeData.chequeInfo.chequeId)).to.be.equal(true);

      expect(chequeBank.connect(accountB).redeem(chequeData)).to.be.revertedWith("Checks have been revoked");
    });

    it("Cheque has not activated yet", async function () {
      const { chequeBank, owner, accountA, accountB } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const currentBlockNumber = await ethers.provider.getBlockNumber();
      const validFrom = currentBlockNumber + 500;
      const validThru = currentBlockNumber + 600;

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA, validFrom, validThru);

      await expect(chequeBank.connect(accountB).redeem(chequeData)).to.be.revertedWith("Cheque has not activated yet");
    });


    it("Cheque has not activated yet", async function () {
      const { chequeBank, owner, accountA, accountB } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const currentBlockNumber = await ethers.provider.getBlockNumber();
      const validFrom = currentBlockNumber - 500;
      const validThru = currentBlockNumber - 600;

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA, validFrom, validThru);

      await expect(chequeBank.connect(accountB).redeem(chequeData)).to.be.revertedWith("Cheque has been expired");
    });

    it("Cheque have been signed over", async function () {
      const { chequeBank, owner, accountA, accountB, accountC } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      const signOverData = await createSignOver(
        1, chequeData.chequeInfo.chequeId, accountB.address, accountC.address, accountB);

      await chequeBank.connect(accountC).notifySignOver(chequeData, [signOverData]);

      await expect(chequeBank.connect(accountC).redeem(chequeData)).to.be.revertedWith("Cheque have been signed over");
    });
  });
  describe("Notify SignOver", async function () {
    it("Notify SignOver happy flow", async function () {
      const { chequeBank, owner, accountA, accountB, accountC, accountD } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      const signOverData1 = await createSignOver(
        1, chequeData.chequeInfo.chequeId, accountB.address, accountC.address, accountB);

      await chequeBank.connect(accountC).notifySignOver(chequeData, [signOverData1]);

      expect(await chequeBank.latestPayerForCheque(chequeData.chequeInfo.chequeId)).to.be.equal(accountB.address);
      expect(await chequeBank.latestPayeeForCheque(chequeData.chequeInfo.chequeId)).to.be.equal(accountC.address);

      const signOverData2 = await createSignOver(
        2, chequeData.chequeInfo.chequeId, accountC.address, accountD.address, accountC);

      await chequeBank.connect(accountD).notifySignOver(chequeData, [signOverData1, signOverData2],);

      expect(await chequeBank.latestPayerForCheque(chequeData.chequeInfo.chequeId)).to.be.equal(accountC.address);
      expect(await chequeBank.latestPayeeForCheque(chequeData.chequeInfo.chequeId)).to.be.equal(accountD.address);
    });

    it("Should notify the failure to sign over if the number of signatures exceeded 6 times", async function () {
      const { chequeBank, owner, accountA, accountB, accountC, accountD } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      const signOverData = await createSignOver(
        1, chequeData.chequeInfo.chequeId, accountB.address, accountC.address, accountB);

      await expect(
        chequeBank.connect(accountC).notifySignOver(chequeData,
          new Array(6 + 1).fill(signOverData)
        )).to.be.revertedWith("Exceed sign-over limit");
    });

    it("Should notify the failure to sign over if msg.sender doesn't match the final payee", async function () {
      const { chequeBank, owner, accountA, accountB, accountC, accountD } = await deployContract();

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      const signOverData = await createSignOver(
        1, chequeData.chequeInfo.chequeId, accountB.address, accountC.address, accountB);

      await expect(
        chequeBank.connect(accountD)
          .notifySignOver(chequeData, [signOverData],)).to.be.revertedWith("Wrong payee");
    });
  })
  describe("Redeem SignOver", async function () {
    it("Redeem SignOver happy flow", async function () {
      const { chequeBank, owner, accountA, accountB, accountC, accountD } = await deployContract();

      await chequeBank.connect(accountA).deposit({ value: utils.parseEther("3") });

      const chequeData = await createCheque(accountA.address, accountB.address, chequeBank.address, accountA);

      const signOverData = await createSignOver(
        1, chequeData.chequeInfo.chequeId, accountB.address, accountC.address, accountB);

      await chequeBank.connect(accountC).notifySignOver(chequeData, [signOverData],);

      await expect(chequeBank.connect(accountC).redeemSignOver(chequeData, [signOverData])).to
        .changeEtherBalances(
          [accountC],
          [utils.parseEther("1")]
        );
    });
  })
});
