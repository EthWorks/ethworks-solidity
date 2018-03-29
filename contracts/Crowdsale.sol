pragma solidity ^0.4.19;
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "./IcoToken.sol";
import "./LockingContract.sol";

contract Crowdsale is Ownable, Pausable {
    using SafeMath for uint256;

    event Minted(address indexed _beneficiary, uint256 _tokenAmount);

    IcoToken public token;
    LockingContract public lockingContract;
    uint256 public saleStartTime;
    uint256 public saleEndTime;

    function Crowdsale(IcoToken _token,
                      uint256 _saleStartTime,
                      uint256 _saleEndTime,
                      uint256 _lockingPeriod
                      ) public {
        require(address(_token) != 0x0);
        require(_saleStartTime > now);
        require(_lockingPeriod > 0);

        token = _token;
        lockingContract = new LockingContract(token, _lockingPeriod);
        saleStartTime = _saleStartTime;
        saleEndTime = _saleEndTime;
    }

    modifier saleNotStarted() {
        require(now < saleStartTime);
        _;
    }

    modifier saleStarted() {
        require(now >= saleStartTime);
        _;
    }

    modifier saleNotEnded() {
        require(now < saleEndTime);
        _;
    }

    modifier saleEnded() {
        require(now >= saleEndTime);
        _;
    }

    function mint(address _beneficiary, uint256 _tokenAmount) internal {
        require(_tokenAmount > 0);
        require(_beneficiary != 0x0);
        token.mint(_beneficiary, _tokenAmount);
        Minted(_beneficiary, _tokenAmount);
    }

    function mintLocked(address _beneficiary, uint256 _tokenAmount) internal {
        mint(lockingContract, _tokenAmount);
        lockingContract.noteTokens(_beneficiary, _tokenAmount);
    }

    function finishMinting() public onlyOwner saleEnded {
        token.finishMinting();
        transferTokenOwnership();
    }

    function mintPreSale(address _beneficiary, uint256 _tokenAmount) public onlyOwner saleNotStarted {
        mint(_beneficiary, _tokenAmount);
    }

    function mintPreSaleLocked(address _beneficiary, uint256 _tokenAmount) public onlyOwner saleNotStarted {
        mintLocked(_beneficiary, _tokenAmount);
    }

    function mintPostSale(address _beneficiary, uint256 _tokenAmount) public onlyOwner saleEnded {
        mint(_beneficiary, _tokenAmount);
    }

    function mintPostSaleLocked(address _beneficiary, uint256 _tokenAmount) public onlyOwner saleEnded {
        mintLocked(_beneficiary, _tokenAmount);
    }

    function transferTokenOwnership() public onlyOwner {
        token.transferOwnership(msg.sender);
    }
}