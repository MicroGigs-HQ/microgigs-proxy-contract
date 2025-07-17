// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TaskEscrow.sol";
import "./lib/Error.sol";
import "./lib/Event.sol";

contract TaskFactory is Initializable, ReentrancyGuard {
    using Clones for address;
    using SafeERC20 for IERC20;

    address public taskEscrowImplementation;
    address[] public tasks;
    mapping(address => uint256) public userTaskCounts;
    mapping(TaskEscrow.Status => uint256) public taskStatusCounts;
    mapping (address => TaskInfo) public taskDetails;
    struct TaskInfo{
        address taskAddress;
        address taskOwner;
        string  title;
        string  description;
        string  category;
        address tokenAddress;
        uint256 deadline;
        uint256 reward;
        TaskEscrow.Status  status;
    }
    function initialize(address _taskEscrowImpl) public initializer {
        require(_taskEscrowImpl != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());
        taskEscrowImplementation = _taskEscrowImpl;
    }

    function createTask(
        string memory _title,
        string memory _description,
        string memory _category,
        address _tokenAddress,
        uint256 _deadline,
        uint256 _reward
    ) external nonReentrant payable returns (address) {
        require(_reward > 0, Error.REWARD_CANNOT_BE_EMPTY());
        require(msg.sender != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());
        require(_tokenAddress != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());

        //====Create new task escrow contract  ====//
        address clone = taskEscrowImplementation.clone();
        address payable payableClone = payable(clone);

    //==== Update state BEFORE external call  ====//
        tasks.push(clone);
        userTaskCounts[msg.sender]++;
        taskStatusCounts[TaskEscrow.Status.OPEN]++;

        emit Event.TaskCreated(clone, msg.sender, _tokenAddress, _reward);

        //==== External call AFTER state changes and event ====//
        IERC20 token = IERC20(_tokenAddress);
        require(token.balanceOf(msg.sender) >= _reward, Error.INSUFFICIENT_BALANCE());
        token.safeTransferFrom(msg.sender, clone, _reward);

        TaskEscrow(payableClone).initialize(
            address(this),
            msg.sender,
            _title,
            _description,
            _category,
            _tokenAddress,
            _reward,
            _deadline
        );
        
        tasks.push(clone);
        userTaskCounts[msg.sender]++;
        taskStatusCounts[TaskEscrow.Status.OPEN]++;

        //Store task details
        TaskInfo memory info = TaskInfo({
            taskAddress: clone,
            taskOwner: msg.sender,
            title: _title,
            description: _description,
            category: _category,
            tokenAddress: _tokenAddress,
            deadline: _deadline,
            reward: _reward,
            status: TaskEscrow.Status.OPEN
        });
        taskDetails[clone] = info;
        return clone;
    }


    function getTotalTasks() external view returns (uint256) {
        return tasks.length;
    }

    function getTaskStatusCounts()
        external
        view
        returns (
            uint256 open,
            uint256 assigned,
            uint256 completed,
            uint256 disputed,
            uint256 paidOut
        )
    {
        return (
            taskStatusCounts[TaskEscrow.Status.OPEN],
            taskStatusCounts[TaskEscrow.Status.ASSIGNED],
            taskStatusCounts[TaskEscrow.Status.COMPLETED],
            taskStatusCounts[TaskEscrow.Status.DISPUTED],
            taskStatusCounts[TaskEscrow.Status.PAID_OUT]
        );
    }

    function isTaskContract(address _address) public view returns (bool) {
        require(_address != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());
        
        uint256 tasksLength = tasks.length;
        for (uint256 i = 0; i < tasksLength; i++) {
            if (tasks[i] == _address) {
                return true;
            }
        }
        return false;
    }

    function getTaskDetails(address _taskAddress)
        external
        view
        returns (
            address taskOwner,
            address taskAssignee,
            string memory title,
            string memory description,
            string memory category,
            address tokenAddress,
            uint256 reward,
            uint256 deadline,
            TaskEscrow.Status status,
            bool isCompleted,
            bool isDisputed
        )
    {
        TaskEscrow task = TaskEscrow(payable(_taskAddress));
        return (
            task.taskOwner(),
            task.taskAssignee(),
            task.title(),
            task.description(),
            task.category(),
            task.tokenAddress(),
            task.reward(),
            task.deadline(),
            task.status(),
            task.isCompleted(),
            task.isDisputed()
        );
    }

    function getUncompletedTasks()
        external
        view
        returns (address[] memory)
    {
        uint256 tasksLength = tasks.length;
        uint256 count = 0;
        
        for (uint256 i = 0; i < tasksLength; i++) {
            TaskEscrow task = TaskEscrow(payable(tasks[i]));
            if (task.status() == TaskEscrow.Status.OPEN) {
                count++;
            }
        }

        address[] memory uncompletedTasks = new address[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < tasksLength; i++) {
            TaskEscrow task = TaskEscrow(payable(tasks[i]));
            if (task.status() == TaskEscrow.Status.OPEN) {
                uncompletedTasks[index] = tasks[i];
                index++;
            }
        }
        
        return uncompletedTasks;
    }

    function getDetailsForATask(address _taskAddress)
        external
        view
        returns(TaskInfo memory)
        {
            require(_taskAddress != address(0), Error.CAN_NOT_USE_ADDRESS_ZERO());
            return taskDetails[_taskAddress];
        }

}