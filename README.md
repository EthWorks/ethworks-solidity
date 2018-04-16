# ethworks-solidity
Internal EthWorks library for writing Solidity contracts

[![Build Status](https://travis-ci.org/EthWorks/ethworks-solidity.svg?branch=master)](https://travis-ci.org/EthWorks/ethworks-solidity)

## Installation
```bash
npm install -s ethworks/ethworks-solidity
```

## Usage

Contracts can be imported in Solidity:

```Solidity
import "ethworks-solidity/contracts/CrowdfundableToken.sol";
contract MyToken is CrowdfundableToken {
  (...)
}
```

Test utilities can be imported in JS:
```javascript
import {deployContract, ...} from '../testUtils.js';
```

## Contracts

The following Smart Contracts are available:
* CrowdfundableToken
* LockingContract
* Whitelist
* Crowdsale

### CrowdfundableToken

Contract for a mintable ERC20 token, that is frozen until all minting has been conducted.

### LockingContract

Contract used for locking ERC20 tokens for a specified time period.

| Event  | Description |
| ------------- | ------------- |
| NotedTokens | Investor's tokens have been locked |
| ReleasedTokens | Locked tokens have been released after locking period |
| ReducedLockingTime | Locking period has been reduced |

### Whitelist

Contract for a whitelist, typically used for KYC purposes.

| Event  | Description |
| ------------- | ------------- |
| AddedToWhitelist | Client has been added to the whitelist |
| RemovedFromWhitelist | Client has been removed from the whitelist |

### Crowdsale

Base contract for organizing a crowdsale. This contract is meant for inheriting, and calling internal mint functions from child contracts.

| Event  | Description |
| ------------- | ------------- |
| Minted | Investor has made an investment, and the tokens have been minted |

## Tests

The unit tests covering the smart contracts can be executed by running the following command:

```bash
npm run dev:test
```
