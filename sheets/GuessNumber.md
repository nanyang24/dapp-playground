# Assignment Week2
A “Guess Number” game using Solidity and smart contract.

Files path:
- Contract:  [GuessNumber.sol](https://github.com/nanyang24/dapp-playground/blob/main/contracts/GuessNumber.sol)
- Test case: [GuessNumber.ts](https://github.com/nanyang24/dapp-playground/blob/main/test/GuessNumber.ts)

Online Contracts example: [Etherscan: 0x3769158E35F83BdAF0B0229F405b626b526270D0](https://rinkeby.etherscan.io/address/0x3769158E35F83BdAF0B0229F405b626b526270D0)
<img width="1468" alt="image" src="https://user-images.githubusercontent.com/17287124/180646132-3dc41b43-b534-4398-9c09-aae989b5ac8a.png">

## Additional Tasks

### Q: Customized Player Numbers: Allow the Host to specify the number of Players upon deployment
A: Pls refer to contract file: [GuessNumber.sol](https://github.com/nanyang24/dapp-playground/blob/main/contracts/GuessNumber.sol)


### Q: Explain the reason of having both `nonceHash` and `nonceNumHash` in the smart contract. Can any of these two be omitted and why?
A: We can omit `nonceHash` as `nonceNumHash` contains unknown `nonce` and `num` in a known range, so a hacker cannot guess to violently compute the result to cheat.

### Q: Try to find out any security loopholes in the above design and propose an improved solution.
A:
1. Since the player participates in the game through the `guess` method and passes the unhashed value, like `200`. Then the participating players can easily guess the same value directly afterwards to win the equal reward under the current game rules.
  - Improved solution: Modify the game rules where players' guessing cannot be duplicated; or the guessing uploaded by players need to be hashed.

2. The current `reveal` function includes logic for calculating the recipients of the rewards and transferring the rewards to them. When a transfer fails at a certain address, it will lead to a bad situation; 
  - Improved solution: Separate the logic of `reveal` to `reveal` and `withdraw` (only by the revealed rewarder). It also reduces the problems caused by the gas limit and avoids the inclusion of multiple Ether transfers in a single transaction.
  - Note that we should be careful with similarly important logic and add some guardian logic, such as Checks-Effects-Interaction / Mutex
  
3. As the winning numbers are transparent to the host, theoretically it's possible for him to cheat and tell other players the numbers that can be awarded.
  - The contract no longer requires the winning numbers to be input when creating the contract, the contract automatically generates the eligible winning numbers at random when reveal function was calling.
