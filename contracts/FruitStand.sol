// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract WATER is ERC20 {
    constructor(uint256 initialSupply) ERC20("WaterToken", "WATER") {
        _mint(msg.sender, initialSupply);
    }
}

contract MELON is ERC20 {
    constructor(uint256 initialSupply) ERC20("MelonToken", "MELON") {
        _mint(msg.sender, initialSupply);
    }
}

contract FruitStand is ReentrancyGuard {
    struct UserStake {
        uint256 startBlock;
        uint256 stakeAmount;
    }

    ERC20 water;
    ERC20 melon;
    mapping(address => UserStake) userStakes;

    constructor(address _water, address _melon) {
        water = ERC20(_water);
        melon = ERC20(_melon);
    }

    function stake(uint256 _amount) external nonReentrant {
        require(_amount > 0, "FruitStand: Stake amount must be greater than zero");

        uint256 previousStakedAmount = 0;
        UserStake memory curUserStake = userStakes[msg.sender];
        if (curUserStake.startBlock != 0) {
            // Pay out current stake
            payout(msg.sender, curUserStake);
            previousStakedAmount = curUserStake.stakeAmount;
        }
        water.transferFrom(msg.sender, address(this), _amount);
        UserStake memory newStake = UserStake({
            startBlock: block.number,
            stakeAmount: _amount + previousStakedAmount
        });
        userStakes[msg.sender] = newStake;
    }

    function unstake() external nonReentrant {
        UserStake memory curUserStake = userStakes[msg.sender];
        require(curUserStake.startBlock != 0, "FruitStand: User have not staked");
        payout(msg.sender, curUserStake);
        water.transfer(msg.sender, curUserStake.stakeAmount);
        userStakes[msg.sender] = UserStake({startBlock: 0, stakeAmount: 0});
    }

    function payout(address _user, UserStake memory _stake) internal returns (uint8 errCode) {
        uint256 blockDelta = block.number - _stake.startBlock;
        if (blockDelta > 300) {
            blockDelta = 300;
        }
        uint256 rewardAmount = _fib(blockDelta) * _stake.stakeAmount;
        melon.transfer(_user, rewardAmount);
        return 0;
    }

    //fib(4) =  796 gas
    //fib(42) = 1399 gas
    //fib(1042) = 2414 gas
    function _fib(uint256 n) private pure returns (uint256 a) {
        if (n == 0) {
            return 0;
        }
        uint256 h = n / 2;
        uint256 mask = 1;
        // find highest set bit in n
        while (mask <= h) {
            mask <<= 1;
        }
        mask >>= 1;
        a = 1;
        uint256 b = 1;
        uint256 c;
        while (mask > 0) {
            c = a * a + b * b;
            if (n & mask > 0) {
                b = b * (b + 2 * a);
                a = c;
            } else {
                a = a * (2 * b - a);
                b = c;
            }
            mask >>= 1;
        }
        return a;
    }
}
