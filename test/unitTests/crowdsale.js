import {createWeb3, deployContract, expectThrow, latestTime, durationInit, increaseTimeTo} from '../testUtils.js';
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

  const mintPreSale = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mintPreSale(beneficiary, tokenAmount).send({from});

  const mintPreSaleLocked = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mintPreSaleLocked(beneficiary, tokenAmount).send({from});

  const mintPostSale = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mintPostSale(beneficiary, tokenAmount).send({from});

  const mintPostSaleLocked = async (beneficiary, tokenAmount, from) =>
    saleContract.methods.mintPostSaleLocked(beneficiary, tokenAmount).send({from});


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

    const testShouldMintPreSale = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await balanceOf(beneficiary));
      await mintPreSale(beneficiary, tokenAmount, from);
      const balance = new BN(await balanceOf(beneficiary));
      expect(balance.sub(initialBalance)).to.eq.BN(tokenAmount);
    };

    const testShouldNotMintPreSale = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await balanceOf(beneficiary));
      await expectThrow(mintPreSale(beneficiary, tokenAmount, from));
      const balance = await balanceOf(beneficiary);
      expect(balance).to.eq.BN(initialBalance);
    };

    const testShouldMintPreSaleLocked = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await lockedBalanceOf(beneficiary));
      await mintPreSaleLocked(beneficiary, tokenAmount, from);
      const balance = new BN(await lockedBalanceOf(beneficiary));
      expect(balance.sub(initialBalance)).to.eq.BN(tokenAmount);
    };

    const testShouldNotMintPreSaleLocked = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await lockedBalanceOf(beneficiary));
      await expectThrow(mintPreSaleLocked(beneficiary, tokenAmount, from));
      const balance = await lockedBalanceOf(beneficiary);
      expect(balance).to.eq.BN(initialBalance);
    };

    const testShouldMintPostSale = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await balanceOf(beneficiary));
      await mintPostSale(beneficiary, tokenAmount, from);
      const balance = new BN(await balanceOf(beneficiary));
      expect(balance.sub(initialBalance)).to.eq.BN(tokenAmount);
    };

    const testShouldNotMintPostSale = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await balanceOf(beneficiary));
      await expectThrow(mintPostSale(beneficiary, tokenAmount, from));
      const balance = await balanceOf(beneficiary);
      expect(balance).to.eq.BN(initialBalance);
    };

    const testShouldMintPostSaleLocked = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await lockedBalanceOf(beneficiary));
      await mintPostSaleLocked(beneficiary, tokenAmount, from);
      const balance = new BN(await lockedBalanceOf(beneficiary));
      expect(balance.sub(initialBalance)).to.eq.BN(tokenAmount);
    };

    const testShouldNotMintPostSaleLocked = async (beneficiary, tokenAmount, from) => {
      const initialBalance = new BN(await lockedBalanceOf(beneficiary));
      await expectThrow(mintPostSaleLocked(beneficiary, tokenAmount, from));
      const balance = await lockedBalanceOf(beneficiary);
      expect(balance).to.eq.BN(initialBalance);
    };

    describe('Before crowdsale starts', async () => {
      it('should allow to mint pre sale', 
        async () => testShouldMintPreSale(contributor, contributionAmount, saleOwner));

      it('should allow to mint pre sale locked', 
        async () => testShouldMintPreSaleLocked(contributor, contributionAmount, saleOwner));

      it('should not allow to mint post sale', 
        async () => testShouldNotMintPostSale(contributor, contributionAmount, saleOwner));

      it('should not allow to mint post sale locked', 
        async () => testShouldNotMintPostSaleLocked(contributor, contributionAmount, saleOwner));
    });

    describe('Crowdsale started', async () => {
      beforeEach(advanceToSaleStarted);

      it('should not allow to mint pre sale', 
        async () => testShouldNotMintPreSale(contributor, contributionAmount, saleOwner));

      it('should not allow to mint pre sale locked', 
        async () => testShouldNotMintPreSaleLocked(contributor, contributionAmount, saleOwner));

      it('should not allow to mint post sale', 
        async () => testShouldNotMintPostSale(contributor, contributionAmount, saleOwner));

      it('should not allow to mint post sale locked', 
        async () => testShouldNotMintPostSaleLocked(contributor, contributionAmount, saleOwner));
    });

    describe('Crowdsale ended', async () => {
      beforeEach(advanceToSaleEnded);

      it('should not allow to mint pre sale', 
        async () => testShouldNotMintPreSale(contributor, contributionAmount, saleOwner));

      it('should not allow to mint pre sale locked', 
        async () => testShouldNotMintPreSaleLocked(contributor, contributionAmount, saleOwner));

      it('should allow to mint post sale', 
        async () => testShouldMintPostSale(contributor, contributionAmount, saleOwner));

      it('should allow to mint post sale locked', 
        async () => testShouldMintPostSaleLocked(contributor, contributionAmount, saleOwner));
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
