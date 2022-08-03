// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ChequeBank is ReentrancyGuard {
    struct ChequeInfo {
        uint256 amount;
        bytes32 chequeId;
        uint32 validFrom;
        uint32 validThru;
        address payee;
        address payer;
    }
    struct SignOverInfo {
        uint8 counter;
        bytes32 chequeId;
        address oldPayee;
        address newPayee;
    }

    struct Cheque {
        ChequeInfo chequeInfo;
        bytes sig;
    }
    struct SignOver {
        SignOverInfo signOverInfo;
        bytes sig;
    }

    mapping(address => uint256) public balances;
    mapping(bytes32 => bool) public redeemedCheques;
    mapping(bytes32 => bool) public revokedCheques;
    mapping(bytes32 => address) public latestPayerForCheque;
    mapping(bytes32 => address) public latestPayeeForCheque;

    // https://eips.ethereum.org/EIPS/eip-191
    // The following is prepended before hashing in personal_sign
    bytes constant prependedSign = "\x19Ethereum Signed Message:\n32";
    bytes4 constant magicNumber = 0xFFFFDEAD;

    function deposit() external payable {
        require(msg.value > 0, "Deposit must be greater than 0");
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "User do not have enough balance to withdraw");

        balances[msg.sender] = balances[msg.sender] - amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdrawal failure");
    }

    function withdrawTo(uint256 amount, address payable recipient) external nonReentrant {
        require(balances[msg.sender] >= amount, "User do not have enough balance to withdraw");

        balances[msg.sender] = balances[msg.sender] - amount;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failure");
    }

    function redeem(Cheque memory chequeData) external nonReentrant {
        require(
            balances[chequeData.chequeInfo.payer] >= chequeData.chequeInfo.amount,
            "Insufficient redeemable balance"
        );

        require(
            latestPayerForCheque[chequeData.chequeInfo.chequeId] == address(0),
            "Cheque have been signed over"
        );

        require(
            isChequeValid(msg.sender, chequeData, new SignOver[](0)),
            "Invalidation of the cheque"
        );

        balances[chequeData.chequeInfo.payer] -= chequeData.chequeInfo.amount;
        redeemedCheques[chequeData.chequeInfo.chequeId] = true;

        (bool success, ) = chequeData.chequeInfo.payee.call{value: chequeData.chequeInfo.amount}(
            ""
        );
        require(success, "Redemption failure");
    }

    function revoke(Cheque memory chequeData) external nonReentrant {
        require(msg.sender == chequeData.chequeInfo.payer, "Only the payer can revoke its cheque");
        require(
            isChequeValid(chequeData.chequeInfo.payee, chequeData, new SignOver[](0)),
            "Invalidation of the cheque"
        );
        revokedCheques[chequeData.chequeInfo.chequeId] = true;
    }

    function notifySignOver(Cheque memory chequeData, SignOver[] memory signOverData)
        external
        nonReentrant
    {
        isChequeValid(msg.sender, chequeData, signOverData);

        SignOver memory latestSignOver = signOverData[signOverData.length - 1];

        latestPayerForCheque[latestSignOver.signOverInfo.chequeId] = latestSignOver
            .signOverInfo
            .oldPayee;
        latestPayeeForCheque[latestSignOver.signOverInfo.chequeId] = latestSignOver
            .signOverInfo
            .newPayee;
    }

    function redeemSignOver(Cheque memory chequeData, SignOver[] memory signOverData) external nonReentrant {
        isChequeValid(msg.sender, chequeData, signOverData);
        require(
            balances[chequeData.chequeInfo.payer] >= chequeData.chequeInfo.amount,
            "Insufficient redeemable balance(redeem-signover)"
        );

        balances[chequeData.chequeInfo.payer] =
            balances[chequeData.chequeInfo.payer] -
            chequeData.chequeInfo.amount;
        (bool success, ) = msg.sender.call{value: chequeData.chequeInfo.amount}("");
        require(success, "Redemption failure");
    }

    function isChequeValid(
        address payee,
        Cheque memory chequeData,
        SignOver[] memory signOverData
    ) public view returns (bool) {
        bytes32 curChequeId = chequeData.chequeInfo.chequeId;
        uint32 curValidFrom = chequeData.chequeInfo.validFrom;
        uint32 curValidThru = chequeData.chequeInfo.validThru;

        require(!redeemedCheques[curChequeId], "Cheque has been redeemed");
        require(!revokedCheques[curChequeId], "Cheque has been revoked");
        require(curValidFrom == 0 || curValidFrom <= block.number, "Cheque has not activated yet");
        require(curValidThru == 0 || curValidThru > block.number, "Cheque has been expired");

        bytes32 message = getMessageHash(chequeData);

        require(
            recoverSigner(message, chequeData.sig) == chequeData.chequeInfo.payer,
            "Cheque signature verification failure"
        );

        require(signOverData.length <= 6, "Exceed sign-over limit");

        address currentPayee = chequeData.chequeInfo.payee;

        if (signOverData.length > 0) {
            SignOver memory latestSignOver = signOverData[signOverData.length - 1];
            require(
                latestSignOver.signOverInfo.chequeId == curChequeId,
                "SignOver chequeId doesn't match"
            );

            require(
                recoverSigner(
                    getSignOverMessageHash(latestSignOver.signOverInfo),
                    latestSignOver.sig
                ) == latestSignOver.signOverInfo.oldPayee,
                "Cheque signature verification failure"
            );

            currentPayee = latestSignOver.signOverInfo.newPayee;
        }

        require(currentPayee == payee, "Wrong payee");

        return true;
    }

    function extractRSV(bytes memory sig)
        internal
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65);

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 255)
        }
        if (v < 27) v += 27;
    }

    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = extractRSV(sig);

        return ecrecover(message, v, r, s);
    }

    function getSignOverMessageHash(SignOverInfo memory signOverInfo)
        private
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    prependedSign,
                    keccak256(
                        abi.encodePacked(
                            magicNumber,
                            signOverInfo.counter,
                            signOverInfo.chequeId,
                            signOverInfo.oldPayee,
                            signOverInfo.newPayee
                        )
                    )
                )
            );
    }

    function getMessageHash(Cheque memory chequeData) private view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    prependedSign,
                    keccak256(
                        abi.encodePacked(
                            chequeData.chequeInfo.chequeId,
                            chequeData.chequeInfo.payer,
                            chequeData.chequeInfo.payee,
                            chequeData.chequeInfo.amount,
                            address(this),
                            chequeData.chequeInfo.validFrom,
                            chequeData.chequeInfo.validThru
                        )
                    )
                )
            );
    }
}
