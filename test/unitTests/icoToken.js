import {createWeb3, deployContract, expectThrow} from '../testUtils.js';
import icoTokenJson from '../../build/contracts/IcoToken.json';
import Web3 from 'web3';
import chai from 'chai';
import bnChai from 'bn-chai';

const {expect} = chai;
const web3 = createWeb3(Web3);
chai.use(bnChai(web3.utils.BN));

describe('IcoToken', () => {
  const {BN} = web3.utils;
  let tokenOwner;
  let tokenContract;
  let tokenContractAddress;
  let accounts;
  let client1;
  let notTheOwner;
  let client2;
  let client3;
  const name = 'IcoToken';
  const symbol = 'IT';
  const decimals = 18;
  const tokenCap = new BN(500000000);

  before(async () => {
    accounts = await web3.eth.getAccounts();
    [tokenOwner, client1, client2, client3, notTheOwner] = accounts;
  });

  beforeEach(async () => {
    tokenContract = await deployContract(web3, icoTokenJson, tokenOwner,
      [tokenCap, name, symbol, decimals]);
    tokenContractAddress = tokenContract.options.address;
  });

  const mint = async (account, amount, from = tokenOwner) =>
    tokenContract.methods.mint(account, amount).send({from});

  const balanceOf = async (account) =>
    tokenContract.methods.balanceOf(account).call({from: tokenOwner});

  const finishMinting = async (from = tokenOwner) =>
    tokenContract.methods.finishMinting().send({from});

  const approve = async (spender, value, from) =>
    tokenContract.methods.approve(spender, value).send({from});

  const transfer = async (to, value, from) =>
    tokenContract.methods.transfer(to, value).send({from});

  const transferFrom = async (fromTransfer, to, value, fromSender) =>
    tokenContract.methods.transferFrom(fromTransfer, to, value).send({from: fromSender});

  const sendTransaction = async (from, value) =>
    web3.eth.sendTransaction({from, to: tokenContractAddress, value});

  const getEtherBalance = async () => web3.eth.getBalance(tokenContractAddress);

  it('should be properly created', async () => {
    const actualName = await tokenContract.methods.name().call({from: tokenOwner});
    const actualSymbol = await tokenContract.methods.symbol().call({from: tokenOwner});
    const actualCap = new BN(await tokenContract.methods.cap().call({from: tokenOwner}));
    const actualDecimals = new BN(await tokenContract.methods.decimals().call({from: tokenOwner}));
    expect(actualName).to.equal(name);
    expect(actualSymbol).to.equal(symbol);
    expect(actualCap).to.eq.BN(tokenCap);
    expect(actualDecimals).to.eq.BN(decimals);
  });

  describe('Creating', async () => {
    it('should not be created without a name', async () => {
      const args = [tokenCap, '', symbol, decimals];
      await expectThrow(deployContract(web3, icoTokenJson, tokenOwner, args));
    });

    it('should not be created without a symbol', async () => {
      const args = [tokenCap, name, '', decimals];
      await expectThrow(deployContract(web3, icoTokenJson, tokenOwner, args));
    });
  });

  it('should not receive ether transfers', async () => {
    const initialEtherBalance = new BN(await getEtherBalance());
    await expectThrow(sendTransaction(tokenOwner, 100));
    const etherBalance = await getEtherBalance();
    expect(initialEtherBalance).to.eq.BN(etherBalance);
  });

  it('should allow to mint tokens by the owner', async () => {
    await mint(client1, 100);
    const tokens = await balanceOf(client1);
    expect(tokens).to.eq.BN(100);
  });

  it('should not allow to mint tokens by a third party', async () => {
    await expectThrow(mint(client1, 100, notTheOwner));
    const tokens = await balanceOf(client1);
    expect(tokens).to.be.zero;
  });

  it('should not allow to mint tokens if minting finished', async () => {
    await finishMinting();
    await expectThrow(mint(client1, 100));
    const tokens = await balanceOf(client1);
    expect(tokens).to.be.zero;
  });

  describe('hard cap', async () => {
    it('should start with the correct cap', async () => {
      const cap = await tokenContract.methods.cap().call({from: tokenOwner});
      expect(cap).to.eq.BN(tokenCap);
    });

    it('should mint when amount is less than cap', async () => {
      const amount = tokenCap.sub(new BN(1));
      await mint(client1, amount);
      const balance = await balanceOf(client1);
      expect(balance).to.eq.BN(amount);
    });

    it('should fail to mint if the amount exceeds the cap', async () => {
      await mint(client1, tokenCap.sub(new BN(1)));
      await expectThrow(mint(client1, 100));
    });

    it('should fail to mint after cap is reached', async () => {
      await mint(client1, tokenCap);
      await expectThrow(mint(client1, 1));
    });
  });

  describe('transfering', async () => {
    beforeEach(async () => mint(client1, 100));

    it('should allow to transfer if minting is finished', async () => {
      await finishMinting();
      await transfer(client2, 10, client1);
      const balance1 = await balanceOf(client1);
      const balance2 = await balanceOf(client2);
      expect(balance1).to.eq.BN(90);
      expect(balance2).to.eq.BN(10);
    });

    it('should allow to transfer from if minting is finished', async () => {
      await finishMinting();
      await approve(client3, 10, client1);
      await transferFrom(client1, client2, 10, client3);
      const balance1 = await balanceOf(client1);
      const balance2 = await balanceOf(client2);
      expect(balance1).to.eq.BN(90);
      expect(balance2).to.eq.BN(10);
    });

    it('should not allow to transfer if minting is not finished', async () => {
      await expectThrow(transfer(client2, 10, client1));
      const balance1 = await balanceOf(client1);
      const balance2 = await balanceOf(client2);
      expect(balance1).to.eq.BN(100);
      expect(balance2).to.be.zero;
    });

    it('should not allow to transfer from if minting is not finished', async () => {
      await approve(client3, 10, client1);
      await expectThrow(transferFrom(client1, client2, 10, client3));
      const balance1 = await balanceOf(client1);
      const balance2 = await balanceOf(client2);
      expect(balance1).to.eq.BN(100);
      expect(balance2).to.be.zero;
    });
  });
});
