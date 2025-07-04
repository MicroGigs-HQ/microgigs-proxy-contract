// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Error {
    error CALLER_IS_NOT_FACTORY();
    error ONLY_TASK_OWNER_CAN_CALL();
    error ONLY_TASK_ASSIGNEE_CAN_CALL();
    error TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED();
    error TASK_NOT_ASSIGNED();
    error TASK_NOT_COMPLETED();
    error UNAUTHORIZED();
    error NO_ACTIVE_DISPUTE();
}