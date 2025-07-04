// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./TaskEscrow.sol";
import "./lib/Error.sol";
import "./lib/Event.sol";

contract TaskFactory is Initializable {
    using Clones for address;

    address public taskEscrowImplementation;
    address[] public tasks;

    function initialize(address _taskEscrowImpl) public initializer {
        taskEscrowImplementation = _taskEscrowImpl;
    }

    function createTask(
        string memory _title,
        string memory _description,
        string memory _category,
        uint256 _deadline
    ) external payable returns (address) {
        require(msg.value > 0, Error.REWARD_CANNOT_BE_EMPTY());

        address clone = taskEscrowImplementation.clone();
        address payable payableClone = payable(clone);
        TaskEscrow(payableClone).initialize(
            address(this),
            msg.sender,
            _title,
            _description,
            _category,
            msg.value,
            _deadline
        );

        tasks.push(clone);
        (bool success, ) = payable(clone).call{value: msg.value}("");

        emit Event.TaskCreated(clone, msg.sender);
        return clone;
    }
}
