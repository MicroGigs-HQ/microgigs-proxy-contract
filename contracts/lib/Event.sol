// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Event {
    event TaskAssigned(address indexed assignee);
    event TaskCompleted();
    event DisputeRaised();
    event FundsReleased(address indexed recipient, uint256 amount);
}