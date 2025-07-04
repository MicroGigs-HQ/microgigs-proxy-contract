// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./lib/Error.sol";
import "./lib/Event.sol";

contract TaskEscrow is Initializable {
    address public factory;
    address public taskOwner;
    address public taskAssignee;
    string public title;
    string public description;
    string public category;
    uint256 public reward;
    uint256 public deadline;
    bool public isCompleted;
    bool public isDisputed;
    enum Status { OPEN, ASSIGNED, COMPLETED, DISPUTED }
    Status public status;

    //=========================================================
    //==================== MODIFIERS ==========================
    //=========================================================
    modifier onlyFactory() {
        require(msg.sender == factory, Error.CALLER_IS_NOT_FACTORY());
        _;
    }

    modifier onlyTaskOwner() {
        require(msg.sender == taskOwner, Error.ONLY_TASK_OWNER_CAN_CALL());
        _;
    }

    modifier onlyTaskAssignee() {
        require(msg.sender == taskAssignee, Error.ONLY_TASK_ASSIGNEE_CAN_CALL());
        _;
    }
    
    function initialize(
        address _factory,
        address _taskOwner,
        string memory _title,
        string memory _description,
        string memory _category,
        uint256 _reward,
        uint256 _deadline
    ) public initializer {
        factory = _factory;
        taskOwner = _taskOwner;
        title = _title;
        description = _description;
        category = _category;
        reward = _reward;
        deadline = block.timestamp + _deadline;
        status = Status.OPEN;
    }

    function assignTask(address _assignee) external onlyTaskOwner {
        require(status == Status.OPEN, Error.TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED());
        taskAssignee = _assignee;
        status = Status.ASSIGNED;
        emit Event.TaskAssigned(_assignee);
    }

    function submitWork() external onlyTaskAssignee {
        require(status == Status.ASSIGNED, Error.TASK_NOT_ASSIGNED());
        isCompleted = true;
        status = Status.COMPLETED;
        emit Event.TaskCompleted();
    }

    function releasePayment() external onlyTaskOwner {
        require(status == Status.COMPLETED, Error.TASK_NOT_COMPLETED());
        payable(taskAssignee).transfer(reward);
        emit Event.FundsReleased(taskAssignee, reward);
    }

    function raiseDispute() external {
        require(msg.sender == taskOwner || msg.sender == taskAssignee, Error.UNAUTHORIZED());
        isDisputed = true;
        status = Status.DISPUTED;
        emit Event.DisputeRaised();
    }

    function resolveDispute(address _winner) external {
        require(status == Status.DISPUTED, Error.NO_ACTIVE_DISPUTE());
        (bool success, )= payable(_winner).call{value: reward}("");
        status = Status.COMPLETED;
    }

    receive() external payable {}
}