// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Интерфейс для контракта Wormhole (или mock),
 * который должен иметь функцию publishMessage.
 */
interface IWormhole {
    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence);
}

/**
 * @title ETHLock
 * @notice Контракт для блокировки ETH и вызова Wormhole для публикации сообщения.
 */
contract ETHLock is Ownable {
    IWormhole public wormhole;         // Интерфейс к контракту Wormhole (или mock)
    uint256 public lockedEth;          // Общая сумма заблокированного ETH
    mapping(address => uint256) public deposits;  // Индивидуальные депозиты по адресам
    uint256 public fee;                // Комиссия для вызова publishMessage

    /// @notice Событие при блокировке ETH
    event ETHLocked(address indexed user, uint256 depositAmount, uint64 sequence);

    /// @notice Событие при разблокировке ETH владельцем
    event ETHUnlocked(address indexed admin, uint256 amount);

    /// @notice Событие при любом поступлении ETH на контракт
    event DepositReceived(address indexed sender, uint256 amount);

    /// @notice Событие при обновлении адреса Wormhole
    event WormholeUpdated(address indexed oldWormhole, address indexed newWormhole);

    /// @notice Событие при обновлении комиссии
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    /**
     * @dev Конструктор.
     * @param _wormholeAddress Адрес контракта Wormhole (или mock).
     * @param _owner Адрес, который будет владельцем контракта (передаётся в Ownable).
     */
    constructor(address _wormholeAddress, address _owner) Ownable(_owner) {
        require(_wormholeAddress != address(0), "Invalid Wormhole address");
        wormhole = IWormhole(_wormholeAddress);

        // Изначально комиссия (fee) — 0.0001 ETH
        fee = 0.0001 ether;
    }

    /**
     * @notice Изменяет комиссию fee (только для владельца).
     * @param newFee Новая комиссия (в wei).
     */
    function setFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = fee;
        fee = newFee;
        emit FeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Блокирует ETH и отправляет сообщение через Wormhole.
     * Пользователь должен отправить сумму, равную (deposit + fee).
     * Часть ETH (deposit) фиксируется в контракте, а комиссия (fee) отправляется Wormhole.
     */
    function lockETH() external payable {
        require(msg.value >= fee, "Sent ETH must be at least equal to fee");

        // Вычисляем сумму депозита (исключая комиссию)
        uint256 depositAmount = msg.value - fee;
        require(depositAmount > 0, "Deposit amount must be greater than 0");

        // Увеличиваем учёт общей заблокированной суммы и депозита конкретного пользователя
        lockedEth += depositAmount;
        deposits[msg.sender] += depositAmount;

        // Готовим полезную нагрузку для Wormhole
        bytes memory payload = abi.encode(msg.sender, depositAmount);

        // Проверяем, что у контракта достаточно баланса для оплаты fee
        require(address(this).balance >= fee, "Insufficient contract balance for message fee");

        // Вызываем Wormhole для публикации сообщения, передавая fee
        uint64 sequence = wormhole.publishMessage{ value: fee }(
            uint32(block.timestamp),
            payload,
            1
        );
        require(sequence > 0, "Failed to publish message");

        // Эмитируем событие о блокировке
        emit ETHLocked(msg.sender, depositAmount, sequence);
    }

    /**
     * @notice Позволяет владельцу изменить адрес Wormhole.
     * @param newWormhole Новый адрес контракта Wormhole (или mock).
     */
    function updateWormhole(address newWormhole) external onlyOwner {
        require(newWormhole != address(0), "Invalid address");
        address oldWormhole = address(wormhole);
        wormhole = IWormhole(newWormhole);
        emit WormholeUpdated(oldWormhole, newWormhole);
    }

    /**
     * @notice Позволяет пополнить контракт ETH (например, для оплаты комиссий).
     */
    function depositETH() external payable {
        require(msg.value > 0, "Must send ETH to deposit");
        emit DepositReceived(msg.sender, msg.value);
    }

    /**
     * @notice Разблокирует ETH (только для владельца).
     * @param amount Сумма для разблокировки.
     */
    function unlockETH(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= lockedEth, "Not enough locked ETH");
        require(address(this).balance >= amount, "Contract balance too low");

        lockedEth -= amount;
        (bool success, ) = payable(owner()).call{ value: amount }("");
        require(success, "ETH transfer failed");

        emit ETHUnlocked(owner(), amount);
    }

    /**
     * @notice Возвращает сумму заблокированного ETH (deposit), учтённую в lockedEth.
     */
    function getLockedBalance() external view returns (uint256) {
        return lockedEth;
    }

    /**
     * @notice Возвращает текущий баланс ETH на контракте (включая депозиты и комиссии).
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Функция для прямого приёма ETH. Вызывает событие DepositReceived.
     */
    receive() external payable {
        emit DepositReceived(msg.sender, msg.value);
    }

    /**
     * @dev Фолбэк-функция для прямого приёма ETH. Вызывает событие DepositReceived.
     */
    fallback() external payable {
        emit DepositReceived(msg.sender, msg.value);
    }
}

