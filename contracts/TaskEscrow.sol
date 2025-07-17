// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/Error.sol";
import "./lib/Event.sol";

contract TaskEscrow is Initializable {
    using SafeERC20 for IERC20;

    address public factory;
    address public taskOwner;
    address public taskAssignee;
    string public title;
    string public description;
    string public category;
    address public tokenAddress;
    uint256 public reward;
    uint256 public deadline;
    bool public isCompleted;
    bool public isDisputed;

    enum Status {
        OPEN,
        ASSIGNED,
        COMPLETED,
        DISPUTED,
        PAID_OUT,
        CANCELLED
    }

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

    modifier onlyAfterDeadline() {
        require(block.timestamp > deadline, Error.DEADLINE_NOT_REACHED());
        _;
    }

    modifier onlyBeforeDeadline() {
        require(block.timestamp <= deadline, Error.DEADLINE_HAS_PASSED());
        _;
    }

    function initialize(
        address _factory,
        address _taskOwner,
        string memory _title,
        string memory _description,
        string memory _category,
        address _tokenAddress,
        uint256 _reward,
        uint256 _deadline
    ) public initializer {
        factory = _factory;
        taskOwner = _taskOwner;
        title = _title;
        description = _description;
        category = _category;
        tokenAddress = _tokenAddress;
        reward = _reward;
        deadline = block.timestamp + _deadline;
        status = Status.OPEN;
    }

    function assignTask(address _assignee) external onlyTaskOwner onlyBeforeDeadline {
        require(status == Status.OPEN, Error.TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED());
        require(_assignee != address(0), Error.CAN_NOT_ASSIGN_TO_ADDRESS_ZERO());
        require(_assignee != taskOwner, Error.CANNOT_ASSIGN_TO_SELF());

        taskAssignee = _assignee;
        _updateStatus(Status.ASSIGNED);

        emit Event.TaskAssigned(_assignee);
    }

    function submitWork() external onlyTaskAssignee onlyBeforeDeadline {
        require(status == Status.ASSIGNED, Error.TASK_NOT_ASSIGNED());

        isCompleted = true;
        _updateStatus(Status.COMPLETED);

        emit Event.TaskCompleted();
    }

    function releasePayment() external onlyTaskOwner {
        require(status != Status.PAID_OUT, Error.TASK_HAS_ALREADY_BEEN_PAID_OUT());
        require(status == Status.COMPLETED, Error.TASK_NOT_COMPLETED());

        _updateStatus(Status.PAID_OUT);
        _transferFunds(taskAssignee, reward);

        emit Event.FundsReleased(taskAssignee, reward);
    }

    function raiseDispute() external {
        require(msg.sender == taskOwner || msg.sender == taskAssignee, Error.UNAUTHORIZED());
        require(status != Status.DISPUTED, Error.DISPUTE_ALREADY_RAISED());
        require(status != Status.PAID_OUT, Error.TASK_HAS_ALREADY_BEEN_PAID_OUT());
        require(
            status == Status.ASSIGNED || status == Status.COMPLETED,
            Error.INVALID_STATUS_FOR_DISPUTE()
        );

        isDisputed = true;
        _updateStatus(Status.DISPUTED);
        emit Event.DisputeRaised();
    }

    function resolveDispute(address _winner) external onlyFactory {
        require(status == Status.DISPUTED, Error.NO_ACTIVE_DISPUTE());
        require(status != Status.PAID_OUT, Error.TASK_HAS_ALREADY_BEEN_PAID_OUT());
        require(_winner != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());
        require(_winner == taskOwner || _winner == taskAssignee, Error.INVALID_DISPUTE_WINNER());

        _updateStatus(Status.PAID_OUT);
        _transferFunds(_winner, reward);

        emit Event.DisputeResolved(_winner, reward);
    }

    function cancelTask() external onlyTaskOwner {
        require(status == Status.OPEN, Error.TASK_CANNOT_BE_CANCELLED());

        _updateStatus(Status.CANCELLED);
        _transferFunds(taskOwner, reward);

        emit Event.TaskCancelled();
    }

    function withdrawAfterDeadline() external onlyTaskAssignee onlyAfterDeadline {
        require(status == Status.COMPLETED, Error.TASK_NOT_COMPLETED());

        _updateStatus(Status.PAID_OUT);
        _transferFunds(taskAssignee, reward);

        emit Event.FundsReleased(taskAssignee, reward);
    }

    function reclaimFunds() external onlyTaskOwner onlyAfterDeadline {
        require(!isCompleted, Error.TASK_HAS_ALREADY_BEEN_COMPLETED());
        require(status == Status.ASSIGNED, Error.INVALID_STATUS_FOR_RECLAIM());

        _updateStatus(Status.PAID_OUT);
        _transferFunds(taskOwner, reward);

        emit Event.FundsReclaimed(taskOwner, reward);
    }

    //=========================================================
    //==================== INTERNAL FUNCTIONS =================
    //=========================================================

    function _updateStatus(Status _newStatus) internal {
        Status oldStatus = status;
        status = _newStatus;

        emit Event.TaskStatusChanged(oldStatus, _newStatus);
    }

    function _transferFunds(address _recipient, uint256 _amount) internal {
        require(_recipient != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());

        IERC20(tokenAddress).safeTransfer(_recipient, _amount);
    }

    //=========================================================
    //==================== GETTER FUNCTIONS ===================
    //=========================================================

    function getTaskInfo()
        external
        view
        returns (
            address owner,
            address assignee,
            string memory taskTitle,
            string memory taskDescription,
            string memory taskCategory,
            address token,
            uint256 rewardAmount,
            uint256 taskDeadline,
            Status taskStatus,
            bool completed,
            bool disputed
        )
    {
        return (
            taskOwner,
            taskAssignee,
            title,
            description,
            category,
            tokenAddress,
            reward,
            deadline,
            status,
            isCompleted,
            isDisputed
        );
    }

    function isTaskActive() external view returns (bool) {
        return status == Status.OPEN || status == Status.ASSIGNED;
    }

    function canSubmitWork() external view returns (bool) {
        return
            status == Status.ASSIGNED && block.timestamp <= deadline && msg.sender == taskAssignee;
    }

    function canReleasePayment() external view returns (bool) {
        return status == Status.COMPLETED && msg.sender == taskOwner;
    }

    function canRaiseDispute() external view returns (bool) {
        return (msg.sender == taskOwner || msg.sender == taskAssignee) && status != Status.DISPUTED
            && status != Status.PAID_OUT && (status == Status.ASSIGNED || status == Status.COMPLETED);
    }

    function getTimeLeft() external view returns (uint256) {
        if (block.timestamp >= deadline) {
            return 0;
        }
        return deadline - block.timestamp;
    }

    receive() external payable {}

    function emergencyWithdrawETH() external onlyFactory {
        uint256 balance = address(this).balance;
        require(balance > 0, Error.NO_ETH_TO_WITHDRAW());

        (bool success, ) = factory.call{value: balance}("");
        require(success, Error.ETH_WITHDRAWAL_FAILED());

        emit Event.EmergencyETHWithdrawn(balance);
    }

    function emergencyWithdrawToken(address token) external onlyFactory {
        require(token != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());

        // Don't allow withdrawal of task reward token if task is still active
        if (token == tokenAddress) {
            require(
                status == Status.PAID_OUT || status == Status.CANCELLED,
                Error.CANNOT_WITHDRAW_TASK_REWARD_TOKEN_WHILE_TASK_IS_ACTIVE()
            );
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, Error.NO_TOKENS_TO_WITHDRAW());

        IERC20(token).safeTransfer(factory, balance);

        emit Event.EmergencyTokenWithdrawn(token, balance);
    }
}
