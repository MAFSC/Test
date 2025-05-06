// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Wormhole is Ownable {
    struct Message {
        uint32 nonce;
        bytes payload;
        uint8 consistencyLevel;
    }

    uint256 public totalDepositedETH;
    mapping(uint256 => Message) public messages;
    uint256 public messageCount;

    event MessagePublished(uint256 indexed messageId, uint32 nonce, bytes payload, uint8 consistencyLevel);
    event ETHDeposited(address indexed sender, uint256 amount);
    event ETHWithdrawn(address indexed owner, uint256 amount);

    constructor(address _owner) Ownable(_owner) {}

    /// @notice Позволяет пополнять контракт ETH
    receive() external payable {
        totalDepositedETH += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /// @notice Ручное пополнение контракта
    function depositETH() external payable {
        require(msg.value > 0, "Deposit must be greater than zero");
        totalDepositedETH += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /// @notice Публикация сообщения и оплата комиссии
    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence) {
        require(msg.value >= 0.0001 ether, "Insufficient ETH for publishing message");

        // Сохраняем сообщение
        messages[messageCount] = Message(nonce, payload, consistencyLevel);
        sequence = uint64(messageCount);
        messageCount++;

        emit MessagePublished(sequence, nonce, payload, consistencyLevel);
    }

    /// @notice Вывод ETH только владельцем
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Not enough ETH in contract");
        totalDepositedETH -= amount;
        payable(owner()).transfer(amount);

        emit ETHWithdrawn(owner(), amount);
    }

    /// @notice Получение баланса контракта
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
