// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../TaskEscrow.sol";

library Event {
    event TaskAssigned(address indexed assignee);
    event TaskCompleted();
    event DisputeRaised();
    event DisputeResolved(address indexed winner, uint256 amount);
    event TaskStatusChanged(TaskEscrow.Status oldStatus, TaskEscrow.Status newStatus);
    event FundsReleased(address indexed recipient, uint256 amount);
    event TaskCreated(address indexed taskAddress, address indexed creator, address indexed token, uint256 reward);
    event TaskStatusUpdated(address indexed taskAddress, TaskEscrow.Status oldStatus, TaskEscrow.Status newStatus);
    event TaskCancelled();
    event FundsReclaimed(address indexed recipient, uint256 amount);
}