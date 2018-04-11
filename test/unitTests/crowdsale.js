import {createWeb3, deployContract, expectThrow, latestTime, durationInit, increaseTimeTo, expectNotAFunction} from '../testUtils.js';
import crowdsaleJson from '../../build/contracts/Crowdsale.json';
import tokenJson from '../../build/contracts/CrowdfundableToken.json';
import lockingJson from '../../build/contracts/LockingContract.json';
import Web3 from 'web3';
import chai from 'chai';
import bnChai from 'bn-chai';

const {expect} = chai;
const web3 = createWeb3(Web3);
chai.use(bnChai(web3.utils.BN));

describe('Crowdsale', () => {
  const {BN} = web3.utils;
  const duration = durationInit(web3);
  let tokenContract;
  let tokenDeployer;
  let tokenContractAddress;
  let saleContract;
  let saleOwner;
  let saleContractAddress;
  let lockingContract;
  let accounts;
  let contributor;
  const tokenCap = new BN(web3.utils.toWei('500000000'));
  const lockingPeriod = duration.days(30).mul(new BN(3));
  let saleStartTime;
  let saleEndTime;

  before(async () => {
    accounts = await web3.eth.getAccounts();
    [, tokenDeployer, saleOwner, contributor] = accounts;
  });

  const deployContracts = async () => {
    // token contract
    const args = [tokenCap, 'CrowdfundableToken', 'CT', 18];
    tokenContract = await deployContract(web3, tokenJson, tokenDeployer, args);
    tokenContractAddress = tokenContract.options.address;

    // dates and times
    const now = new BN(await latestTime(web3));
    saleStartTime = now.add(duration.days(1));
    saleEndTime = saleStartTime.add(duration.weeks(1));

    // crowdsale contract
    const saleArgs = [
      tokenContractAddress,
      saleStartTime,
      saleEndTime,
      lockingPeriod
    ];
    saleContract = await deployContract(web3, crowdsaleJson, saleOwner, saleArgs);
    saleContractAddress = saleContract.options.address;

    // Locking contract
    const lockingContractAddress = await saleContract.methods.lockingContract().call({from: saleOwner});
    lockingContract = await new web3.eth.Contract(lockingJson.abi, lockingContractAddress);
  };

  beforeEach(async () => {
    await deployContracts();
    await tokenContract.methods.transferOwnership(saleContractAddress).send({from: tokenDeployer});
  });

  it('should be properly deployed', async () => {
    const actualCap = new BN(await tokenContract.methods.cap().call({from: tokenDeployer}));
    expect(tokenCap).to.be.eq.BN(actualCap);
    const actualTokenAddress = await saleContract.methods.token().call({from: saleOwner});
    expect(actualTokenAddress).to.be.equal(tokenContractAddress);
    const actualTokenOwner = await tokenContract.methods.owner().call({from: tokenDeployer});
    expect(actualTokenOwner).to.be.equal(saleContractAddress);
  });

  const advanceToSaleStarted = async () => increaseTimeTo(web3, saleStartTime.add(duration.hours(12)));
  const advanceToSaleEnded = async () => increaseTimeTo(web3, saleEndTime.add(duration.hours(12)));

  const lockedBalanceOf = async (client) =>
    lockingContract.methods.balanceOf(client).call({from: saleOwner});
    
  const mintingFinished = async () => tokenContract.methods.mintingFinished().call({from: tokenDeployer});
  const balanceOf = async (client) => tokenContract.methods.balanceOf(client).call({from: saleOwner});
  const transferTokenOwnership = async (from) => saleContract.methods.transferTokenOwnership().send({from});

  const finishMinting = async (from) =>
    saleContract.methods.finishMinting().send({from});

  const mint = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mint(beneficiary, tokenAmount).send({from});

  const mintLocked = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mintLocked(beneficiary, tokenAmount).send({from});

  describe('Transferring token ownership', async () => {
    const testShouldTransferTokenOwnership = async (from = saleOwner) => {
      await transferTokenOwnership(from);
      const actualOwner = await tokenContract.methods.owner().call();
      expect(actualOwner).to.be.equal(from);
    };

    const testShouldNotTransferTokenOwnership = async (from = saleOwner) => {
      await expectThrow(transferTokenOwnership(from));
      const actualOwner = await tokenContract.methods.owner().call();
      expect(actualOwner).to.be.equal(saleContractAddress);
    };

    describe('Before crowdsale starts', async () => {
      it('should be possible to transfer token ownership',
        async () => testShouldTransferTokenOwnership(saleOwner));

      it('should not be possible to transfer token ownership by third party',
        async () => testShouldNotTransferTokenOwnership(contributor));
    });

    describe('Crowdsale started', async () => {
      beforeEach(advanceToSaleStarted);

      it('should be possible to transfer token ownership',
        async () => testShouldTransferTokenOwnership(saleOwner));

      it('should not be possible to transfer token ownership by third party',
        async () => testShouldNotTransferTokenOwnership(contributor));
    });

    describe('Crowdsale ended', async () => {
      beforeEach(advanceToSaleEnded);

      it('should be possible to transfer token ownership',
        async () => testShouldTransferTokenOwnership(saleOwner));

      it('should not be possible to transfer token ownership by third party',
        async () => testShouldNotTransferTokenOwnership(contributor));
    });
  });

  describe('Minting', async () => {
    const contributionAmount = new BN(web3.utils.toWei('1'));

    const testShouldNotMint = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await balanceOf(beneficiary));
      await expectNotAFunction(mint(beneficiary, tokenAmount, from));
      const balance = await balanceOf(beneficiary);
      expect(balance).to.eq.BN(initialBalance);
    };

    const testShouldNotMintLocked = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await lockedBalanceOf(beneficiary));
      await expectNotAFunction(mintLocked(beneficiary, tokenAmount, from));
      const balance = new BN(await lockedBalanceOf(beneficiary));
      expect(balance).to.eq.BN(initialBalance);
    };

    describe('Before crowdsale starts', async () => {
      it('should not allow to mint', 
        async () => testShouldNotMint(contributor, contributionAmount, saleOwner));

      it('should not allow to mint locked', 
        async () => testShouldNotMintLocked(contributor, contributionAmount, saleOwner));
    });

    describe('Crowdsale started', async () => {
      beforeEach(advanceToSaleStarted);

      it('should not allow to mint', 
        async () => testShouldNotMint(contributor, contributionAmount, saleOwner));

      it('should not allow to mint locked', 
        async () => testShouldNotMintLocked(contributor, contributionAmount, saleOwner));
    });

    describe('Crowdsale ended', async () => {
      beforeEach(advanceToSaleEnded);

      it('should not allow to mint', 
        async () => testShouldNotMint(contributor, contributionAmount, saleOwner));

      it('should not allow to mint locked', 
        async () => testShouldNotMintLocked(contributor, contributionAmount, saleOwner));
    });
  });

  describe('Finishing minting', async () => {
    const testShouldFinishMinting = async (from) => {
      await finishMinting(from);
      expect(await mintingFinished()).to.be.true;
    };

    const testShouldNotFinishMinting = async (from) => {
      await expectThrow(finishMinting(from));
      expect(await mintingFinished()).to.be.false;
    };

    describe('Before crowdsale starts', async () => {
      it('should not allow to finish minting', 
        async () => testShouldNotFinishMinting(saleOwner));
    });

    describe('Crowdsale started', async () => {
      beforeEach(advanceToSaleStarted);

      it('should not allow to finish minting', 
        async () => testShouldNotFinishMinting(saleOwner));
    });

    describe('Crowdsale ended', async () => {
      beforeEach(advanceToSaleEnded);

      it('should allow to finish minting', 
        async () => testShouldFinishMinting(saleOwner));

      it('should not allow to finish minting by a third party', 
        async () => testShouldNotFinishMinting(contributor));
    });
  });
});
