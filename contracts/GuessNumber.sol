// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";

library SafeMath {
    function subAbs(uint16 a, uint16 b) internal pure returns (uint16) {
        return a >= b ? a - b : b - a;
    }
}

contract GuessNumber {
    event GameStarted(uint256 bet, bytes32 nonceHash, bytes32 nonceNumHash);
    event GuessSubmitted(address indexed player, uint256 guess);
    event ResultSubmitted(bytes32 nonce, uint16 numbert);
    event PlayerWins(address indexed player, uint256 amount);

    enum State {
        WAITING_SECRET,
        WAITING_GUESS,
        WAITING_RESULT,
        REVEALED
    }

    State public state;
    uint256 public bet;

    bytes32 public nonceHash;
    bytes32 public nonceNumHash;

    // two roles: Host and Players
    address public host;
    address payable[] playersAddress;
    mapping(address => uint16) private playersGuessing;
    mapping(uint16 => address) private playersGuessingIndex;
    mapping(uint16 => address payable[]) private playerWinner;

    modifier byHost() {
        require(msg.sender == host, "Only the owner can operate");
        _;
    }

    modifier byPlayer(uint16 _guess) {
        require(msg.sender != host, "Host can't guess");
        require(playersGuessing[msg.sender] == 0, "The Player has already submitted a guessing");
        require(
            playersGuessingIndex[_guess] == address(0x0),
            "The number has been guessed by another Player"
        );

        _;
    }

    modifier inState(State expected) {
        require(state == expected, "Not a good time, ser");
        _;
    }

    modifier isValidNumber(uint16 _guess) {
        require(_guess >= 0 && _guess < 1000, "The range of number should be [0, 1000)");
        _;
    }

    constructor(bytes32 _nonceHash, bytes32 _nonceNumHash) payable {
        require(msg.value > 0);

        host = msg.sender;
        bet = msg.value;

        emit GameStarted(bet, _nonceHash, _nonceNumHash);

        moveToState(State.WAITING_SECRET);
        submitSecretNumber(_nonceHash, _nonceNumHash);
    }

    function submitSecretNumber(bytes32 _nonceHash, bytes32 _nonceNumHash)
        private
        byHost
        inState(State.WAITING_SECRET)
    {
        nonceHash = _nonceHash;
        nonceNumHash = _nonceNumHash;
        moveToState(State.WAITING_GUESS);
    }

    function guess(uint16 _guess) public payable isValidNumber(_guess) byPlayer(_guess) {
        require(msg.value == bet, "need to attach the same Ether Value as the Host deposited");
        require(
            state == State.WAITING_RESULT || state == State.WAITING_GUESS,
            "Not a good time, ser"
        );

        playersAddress.push(payable(msg.sender));
        // for less gas
        playersGuessing[msg.sender] = _guess;
        playersGuessingIndex[_guess] = msg.sender;

        emit GuessSubmitted(msg.sender, _guess);
        moveToState(State.WAITING_RESULT);
    }

    function reveal(bytes32 nonce, uint16 number) external byHost inState(State.WAITING_RESULT) {
        require(keccak256(abi.encode(nonce)) == nonceHash, "Nonce should be derived by nonceHash");

        require(
            keccak256(abi.encode(nonce, number)) == nonceNumHash,
            "Nonce should be derived by nonceNumHash"
        );

        emit ResultSubmitted(nonce, number);

        uint256 playersNum = playersAddress.length;
        if (number >= 0 && number < 1000) {
            // Distribute all the rewards, to the Player who has the closest guessing
            uint16 delta = 2**16 - 1; // 65535

            for (uint256 i = 0; i < playersNum; i++) {
                address payable _address = playersAddress[i];
                uint16 _delta = SafeMath.subAbs(playersGuessing[_address], number);
                if (_delta <= delta) {
                    playerWinner[_delta].push(_address);
                    delta = _delta;
                }
            }

            uint256 transferAmount = address(this).balance / playerWinner[delta].length;

            for (uint256 i; i < playerWinner[delta].length; i++) {
                address payable playerAddress = playerWinner[delta][i];
                playerAddress.transfer(transferAmount);
                emit PlayerWins(playerAddress, transferAmount);
            }
        } else {
            // distribute the rewards evenly to all Players
            uint256 averageRewardAmount = address(this).balance / playersNum;

            for (uint256 i = 0; i < playersNum; i++) {
                address payable playerAddress = playersAddress[i];
                playerAddress.transfer(averageRewardAmount);
                emit PlayerWins(playerAddress, averageRewardAmount);
            }
        }

        moveToState(State.REVEALED);
    }

    function moveToState(State _state) private {
        state = _state;
    }
}
