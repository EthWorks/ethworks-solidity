pragma solidity ^0.4.19;
import "zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";

contract IcoToken is MintableToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public cap;

    function IcoToken(uint256 _cap, string _name, string _symbol, uint8 _decimals) public {
        require(_cap > 0);
        require(bytes(_name).length > 0);
        require(bytes(_symbol).length > 0);
        cap = _cap;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    // override
    function mint(address _to, uint256 _amount) onlyOwner canMint public returns (bool) {
        require(totalSupply_.add(_amount) <= cap);
        return super.mint(_to, _amount);
    }

    // override
    function transfer(address _to, uint256 _value) public returns (bool) {
        require(mintingFinished == true);
        return super.transfer(_to, _value);
    }

    // override
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        require(mintingFinished == true);
        return super.transferFrom(_from, _to, _value);
    }
}