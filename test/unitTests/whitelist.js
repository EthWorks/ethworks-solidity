import {createWeb3, deployContract, expectThrow} from '../testUtils.js';
import whitelistJson from '../../build/contracts/Whitelist.json';
import Web3 from 'web3';
import chai from 'chai';
const {expect} = chai;

describe('Whitelist', async () => {
  const web3 = createWeb3(Web3);
  let accounts;
  let whitelistContract;
  let whitelistOwner;
  let account1;
  let account2;
  let notTheOwner;

  before(async () => {
    accounts = await web3.eth.getAccounts();
    [whitelistOwner, account1, account2, notTheOwner] = accounts;
  });

  const addToWhitelist = async (account, from = whitelistOwner) =>
    whitelistContract.methods.add(account).send({from});

  const removeFromWhitelist = async (account, from = whitelistOwner) =>
    whitelistContract.methods.remove(account).send({from});

  const isWhitelisted = async (account, from = whitelistOwner) =>
    whitelistContract.methods.isWhitelisted(account).call({from});

  beforeEach(async () => {
    whitelistContract = await deployContract(web3, whitelistJson, whitelistOwner);
  });

  it('should be deployed successfully', async () => {
    const {address} = whitelistContract.options;
    expect(address).to.not.be.null;
  });

  describe('adding to the whitelist', () => {
    it('should show bad guy as not on the white list', async () => {
      expect(await isWhitelisted(account2)).to.equal(false);
    });

    it('should not be possible to add to the whitelist by a third party', async () => {
      await expectThrow(addToWhitelist(account1, notTheOwner));
      expect(await isWhitelisted(account1)).to.equal(false);
    });

    it('should be possible to add to the whitelist by the owner', async () => {
      await addToWhitelist(account1);
      expect(await isWhitelisted(account1)).to.equal(true);
    });

    it('should emit an event when adding', async () => {
      await addToWhitelist(account1);
      const events = await whitelistContract.getPastEvents('AddedToWhitelist', {
        filter: {account: account1},
        fromBlock: 1
      });
      expect(events.length).to.be.equal(1);
    });
  });

  describe('removing from the whitelist', () => {
    beforeEach(async () => addToWhitelist(account1));

    it('should be possible to remove from the whitelist by the owner', async () => {
      await addToWhitelist(account1);
      await removeFromWhitelist(account1);
      expect(await isWhitelisted(account1)).to.equal(false);
    });

    it('should not be possible to remove from the whitelist by a third party', async () => {
      await expectThrow(removeFromWhitelist(account1, notTheOwner));
      expect(await isWhitelisted(account1)).to.equal(true);
    });

    it('should emit an event when removing', async () => {
      await removeFromWhitelist(account1);
      const events = await whitelistContract.getPastEvents('RemovedFromWhitelist', {
        filter: {account: account1},
        fromBlock: 1
      });
      expect(events.length).to.be.equal(1);
    });
  });

  describe('checking the whitelist', () => {
    beforeEach(async () => addToWhitelist(account1));

    it('should be possible to check the whitelist by a third party', async () => {
      expect(await isWhitelisted(account1, notTheOwner)).to.equal(true);
      expect(await isWhitelisted(account2, notTheOwner)).to.equal(false);
    });
  });
});
