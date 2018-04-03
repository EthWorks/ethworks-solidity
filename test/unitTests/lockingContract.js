import {createWeb3, deployContract, expectThrow, increaseTimeTo, durationInit, latestTime} from '../testUtils.js';
import thinkCoinJson from '../../build/contracts/IcoToken.json';
import lockingJson from '../../build/contracts/LockingContract.json';
import Web3 from 'web3';
import chai from 'chai';
import bnChai from 'bn-chai';

const {expect} = chai;
const web3 = createWeb3(Web3);
chai.use(bnChai(web3.utils.BN));

describe('LockingContract', () => {
  let tokenOwner;
  let tokenContract;
  let lockingOwner;
  let lockingContract;
  let accounts; 
  let client1;
  let client2;
  let notTheOwner;
  let deploymentTime; 
  let lockingContractAddress;
  const {BN} = web3.utils;
  const duration = durationInit(web3);
  const tokenCap = new BN(500000000);
  const lockingDuration = duration.weeks(1);

  const isLocked = async () => lockingContract.methods.isLocked().call({from: lockingOwner});
  const lockedBalanceOf = async (client) => lockingContract.methods.balanceOf(client).call({from: lockingOwner});
  const balanceOf = async (client) => tokenContract.methods.balanceOf(client).call({from: tokenOwner});

  const noteTokens = async (client, amount, from = lockingOwner) =>
    lockingContract.methods.noteTokens(client, amount).send({from});

  const releaseTokens = async (client, from = lockingOwner) =>
    lockingContract.methods.releaseTokens(client).send({from});

  const advanceToAfterLockingPeriod = async () =>
    increaseTimeTo(web3, deploymentTime.add(lockingDuration).add(duration.days(1)));

  const mint = async (account, amount, from = tokenOwner) =>
    tokenContract.methods.mint(account, amount).send({from});

  const finishMinting = async () =>
    tokenContract.methods.finishMinting().send({from: tokenOwner});

  const reduceLockingTime = async (newUnlockTime, from = lockingOwner) =>
    lockingContract.methods.reduceLockingTime(newUnlockTime).send({from});

  before(async () => {
    accounts = await web3.eth.getAccounts();
    [tokenOwner, lockingOwner, client1, client2, notTheOwner] = accounts;
  });

  beforeEach(async () => {
    tokenContract = await deployContract(web3, thinkCoinJson, tokenOwner,
      [tokenCap, 'IcoToken', 'IT', 18]);
    lockingContract = await deployContract(web3, lockingJson, lockingOwner,
      [tokenContract.options.address, lockingDuration]);
    deploymentTime = new BN(await latestTime(web3));
    lockingContractAddress = lockingContract.options.address;
  });

  it('should be locked initially', async () => {
    expect(await isLocked()).to.be.equal(true);
  });

  it('should be unlocked after the unlocking period', async () => {
    await advanceToAfterLockingPeriod();
    expect(await isLocked()).to.be.equal(false);
  });

  describe('noting tokens', async () => {
    it('should allow to note tokens when locked', async () => {
      await mint(lockingContractAddress, 100);
      await noteTokens(client1, 100);
      await mint(lockingContractAddress, 1000);
      await noteTokens(client2, 1000);
      const balance = await lockedBalanceOf(client1);
      expect(balance).to.eq.BN(100);
    });

    it('should not allow to note tokens if not minted', async () => {
      await expectThrow(noteTokens(client2, 1000));
      const balance2 = await lockedBalanceOf(client2);
      expect(balance2).to.be.zero;
    });

    it('should not allow to note tokens when unlocked', async () => {
      await advanceToAfterLockingPeriod();
      await mint(lockingContractAddress, 100);
      await expectThrow(noteTokens(client1, 100));
      const balance = await lockedBalanceOf(client1);
      expect(balance).to.be.zero;
    });

    it('should allow to note tokens to the same person twice', async () => {
      await mint(lockingContractAddress, 100);
      await noteTokens(client1, 100);
      await mint(lockingContractAddress, 1000);
      await noteTokens(client1, 1000);
      const balance = await lockedBalanceOf(client1);
      expect(balance).to.eq.BN(1100);
    });
  });

  describe('shrinking locking period', async () => {
    it('should allow to shrink the locking period', async () => {
      const newUnlockTime = deploymentTime.add(lockingDuration.sub(duration.days(2)));
      await reduceLockingTime(newUnlockTime);
      await increaseTimeTo(web3, newUnlockTime.add(duration.hours(1)));
      expect(await isLocked()).to.be.equal(false);
    });

    it('should not allow to shrink the locking period by a third party', async () => {
      const newUnlockTime = deploymentTime.add(lockingDuration.sub(duration.days(2)));
      await expectThrow(reduceLockingTime(newUnlockTime, notTheOwner));
      await increaseTimeTo(web3, newUnlockTime.add(duration.hours(1)));
      expect(await isLocked()).to.be.equal(true);
    });

    it('should not allow to make the locking period longer', async () => {
      const newUnlockTime = deploymentTime.add(lockingDuration.add(duration.days(2)));
      await expectThrow(reduceLockingTime(newUnlockTime, notTheOwner));
      await increaseTimeTo(web3, newUnlockTime.sub(duration.hours(1)));
      expect(await isLocked()).to.be.equal(false);
    });

    it('should allow to unlock right away', async () => {
      const newUnlockTime = await latestTime(web3);
      await reduceLockingTime(newUnlockTime);
      expect(await isLocked()).to.be.equal(false);
    });
  });

  describe('releasing', async () => {
    beforeEach(async () => {
      await mint(lockingContractAddress, 100);
      await noteTokens(client1, 100);
      await mint(lockingContractAddress, 1000);
      await noteTokens(client2, 1000);
    });

    it('should allow to release the tokens when unlocked', async () => {
      await advanceToAfterLockingPeriod();
      await finishMinting();
      await releaseTokens(client1);
      const balance = await balanceOf(client1);
      expect(balance).to.eq.BN(100);
    });

    it('should allow to release by the beneficiary', async () => {
      await advanceToAfterLockingPeriod();
      await finishMinting();
      await releaseTokens(client1, client1);
      const balance = await balanceOf(client1);
      expect(balance).to.eq.BN(100);
    });

    it('should not allow to release by anyone', async () => {
      await advanceToAfterLockingPeriod();
      await finishMinting();
      await expectThrow(releaseTokens(client1, notTheOwner));
      const balance = await balanceOf(client1);
      expect(balance).to.be.zero;
    });

    it('should not allow to release the tokens when locked', async () => {
      await expectThrow(releaseTokens(client1));
      const balance = await balanceOf(client1);
      expect(balance).to.be.zero;
    });

    it('should not release the tokens twice', async () => {
      await advanceToAfterLockingPeriod();
      await finishMinting();
      await releaseTokens(client1, lockingOwner);
      await releaseTokens(client1, lockingOwner);
      const balance = await balanceOf(client1);
      expect(balance).to.eq.BN(100);
    });
  });
});
