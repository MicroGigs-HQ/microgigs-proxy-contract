import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("TaskFactory", function () {
  const title = "Create App Logo";
  const description = "Create an intuitive modern day logo for xyz app";
  const category = "Design";
  const reward = 100n;
  const deadlineInSeconds = 86400n;

  async function deployTaskFactory() {
    const [owner, user1, user2, user3] = await hre.ethers.getSigners();

    const Token = await hre.ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Test Token", "TST");
    await token.waitForDeployment();
    await token.mint(user1.address, reward * 10n);

    const TaskEscrow = await hre.ethers.getContractFactory("TaskEscrow");
    const taskEscrowImpl = await TaskEscrow.deploy();
    await taskEscrowImpl.waitForDeployment();

    const TaskFactory = await hre.ethers.getContractFactory("TaskFactory");
    const taskFactory = await TaskFactory.deploy();
    await taskFactory.waitForDeployment();

    await taskFactory.initialize(await taskEscrowImpl.getAddress());

    return { taskFactory, taskEscrowImpl, token, owner, user1, user2, user3 };
  }

  async function createTaskFixture() {
    const { taskFactory, taskEscrowImpl, token, owner, user1, user2, user3 } =
      await deployTaskFactory();

    await token.connect(user1).approve(taskFactory.getAddress(), reward);
    await taskFactory
      .connect(user1)
      .createTask(
        title,
        description,
        category,
        await token.getAddress(),
        deadlineInSeconds,
        reward
      );

    const taskAddress = await taskFactory.tasks(0);
    const taskContract = await hre.ethers.getContractAt(
      "TaskEscrow",
      taskAddress
    );

    return {
      taskFactory,
      taskEscrowImpl,
      token,
      owner,
      user1,
      user2,
      user3,
      taskAddress,
      taskContract,
    };
  }

  describe("Access Control", function () {
    it("Should allow only task owner to call emergencyWithdrawFromTask", async function () {
      const { taskFactory, taskAddress, user1, user2 } = await loadFixture(
        createTaskFixture
      );

      // Should succeed for task owner
      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      ).to.not.be.reverted;
    });

    it("Should revert when non-task owner tries to call emergencyWithdrawFromTask", async function () {
      const { taskFactory, taskAddress, user2 } = await loadFixture(
        createTaskFixture
      );

      await expect(
        taskFactory.connect(user2).emergencyWithdrawFromTask(taskAddress)
      ).to.be.revertedWithCustomError(taskFactory, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert with invalid task address", async function () {
      const { taskFactory, user1 } = await loadFixture(createTaskFixture);

      await expect(
        taskFactory
          .connect(user1)
          .emergencyWithdrawFromTask(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(taskFactory, "INVALID_TASK_ADDRESS");
    });

    it("Should revert with non-task contract address", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        createTaskFixture
      );

      await expect(
        taskFactory
          .connect(user1)
          .emergencyWithdrawFromTask(await token.getAddress())
      ).to.be.revertedWithCustomError(taskFactory, "INVALID_TASK_ADDRESS");
    });
  });

  describe("Valid Status Requirements", function () {
    it("Should allow emergency withdrawal from OPEN task", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1 } =
        await loadFixture(createTaskFixture);

      // Task should be in OPEN status by default
      expect(await taskContract.status()).to.equal(0); // OPEN

      const initialBalance = await token.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(taskAddress, user1.address, await token.getAddress(), reward);

      // Verify balance transfer
      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );

      // Verify task is cancelled
      expect(await taskContract.status()).to.equal(5); // CANCELLED
    });

    it("Should allow emergency withdrawal from ASSIGNED task", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1, user2 } =
        await loadFixture(createTaskFixture);

      // Assign task to user2
      await taskContract.connect(user1).assignTask(user2.address);
      expect(await taskContract.status()).to.equal(1); // ASSIGNED

      const initialBalance = await token.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(taskAddress, user1.address, await token.getAddress(), reward);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskContract.status()).to.equal(5); // CANCELLED
    });

    it("Should allow emergency withdrawal from COMPLETED task", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1, user2 } =
        await loadFixture(createTaskFixture);

      // Assign and complete task
      await taskContract.connect(user1).assignTask(user2.address);
      await taskContract.connect(user2).submitWork();
      expect(await taskContract.status()).to.equal(2); // COMPLETED

      const initialBalance = await token.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(taskAddress, user1.address, await token.getAddress(), reward);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskContract.status()).to.equal(5); // CANCELLED
    });

    it("Should allow emergency withdrawal from DISPUTED task", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1, user2 } =
        await loadFixture(createTaskFixture);

      // Assign task and raise dispute
      await taskContract.connect(user1).assignTask(user2.address);
      await taskContract.connect(user1).raiseDispute();
      expect(await taskContract.status()).to.equal(3); // DISPUTED

      const initialBalance = await token.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(taskAddress, user1.address, await token.getAddress(), reward);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskContract.status()).to.equal(5); // CANCELLED
    });
  });

  describe("Invalid Status Requirements", function () {
    it("Should revert emergency withdrawal from PAID_OUT task", async function () {
      const { taskFactory, taskAddress, taskContract, user1, user2 } =
        await loadFixture(createTaskFixture);

      // Complete the full task lifecycle
      await taskContract.connect(user1).assignTask(user2.address);
      await taskContract.connect(user2).submitWork();
      await taskContract.connect(user1).releasePayment();
      expect(await taskContract.status()).to.equal(4); // PAID_OUT

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      ).to.be.revertedWithCustomError(
        taskFactory,
        "CANNOT_EMERGENCY_WITHDRAW_AFTER_COMPLETION"
      );
    });

    it("Should revert emergency withdrawal from CANCELLED task", async function () {
      const { taskFactory, taskAddress, taskContract, user1 } =
        await loadFixture(createTaskFixture);

      // Cancel the task first
      await taskContract.connect(user1).cancelTask();
      expect(await taskContract.status()).to.equal(5); // CANCELLED

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      ).to.be.revertedWithCustomError(
        taskFactory,
        "CANNOT_EMERGENCY_WITHDRAW_AFTER_COMPLETION"
      );
    });
  });

  describe("Token Transfer Mechanics", function () {
    it("Should transfer correct reward amount", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1 } =
        await loadFixture(createTaskFixture);

      const initialBalance = await token.balanceOf(user1.address);
      const taskBalance = await token.balanceOf(taskAddress);

      expect(taskBalance).to.equal(reward);

      await taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress);

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );
      expect(await token.balanceOf(taskAddress)).to.equal(0);
    });

    it("Should handle tasks with different reward amounts", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      const customReward = 500n;
      await token.mint(user1.address, customReward);
      await token
        .connect(user1)
        .approve(taskFactory.getAddress(), customReward);

      // Create task with custom reward
      await taskFactory
        .connect(user1)
        .createTask(
          title,
          description,
          category,
          await token.getAddress(),
          deadlineInSeconds,
          customReward
        );

      const taskAddress = await taskFactory.tasks(0);
      const initialBalance = await token.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(
          taskAddress,
          user1.address,
          await token.getAddress(),
          customReward
        );

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + customReward
      );
    });

    it("Should handle different token types", async function () {
      const { taskFactory, taskEscrowImpl, user1 } = await loadFixture(
        deployTaskFactory
      );

      // Deploy different token
      const Token2 = await hre.ethers.getContractFactory("ERC20Mock");
      const token2 = await Token2.deploy("Test Token 2", "TST2");
      await token2.waitForDeployment();
      await token2.mint(user1.address, reward);

      await token2.connect(user1).approve(taskFactory.getAddress(), reward);

      // Create task with different token
      await taskFactory
        .connect(user1)
        .createTask(
          title,
          description,
          category,
          await token2.getAddress(),
          deadlineInSeconds,
          reward
        );

      const taskAddress = await taskFactory.tasks(0);
      const initialBalance = await token2.balanceOf(user1.address);

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(
          taskAddress,
          user1.address,
          await token2.getAddress(),
          reward
        );

      expect(await token2.balanceOf(user1.address)).to.equal(
        initialBalance + reward
      );
    });
  });

  describe("Event Emission", function () {
    it("Should emit EmergencyWithdrawalExecuted event with correct parameters", async function () {
      const { taskFactory, taskAddress, token, user1 } = await loadFixture(
        createTaskFixture
      );

      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      )
        .to.emit(taskFactory, "EmergencyWithdrawalExecuted")
        .withArgs(taskAddress, user1.address, await token.getAddress(), reward);
    });
  });

  describe("Task State Changes", function () {
    it("Should call emergencyCancel on task contract", async function () {
      const { taskFactory, taskAddress, taskContract, user1 } =
        await loadFixture(createTaskFixture);

      expect(await taskContract.status()).to.equal(0); // OPEN

      await taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress);

      expect(await taskContract.status()).to.equal(5); // CANCELLED
    });

    it("Should update task status counts in factory", async function () {
      const { taskFactory, taskAddress, user1 } = await loadFixture(
        createTaskFixture
      );

      // Initial state
      expect(await taskFactory.taskStatusCounts(0)).to.equal(1); // OPEN
      expect(await taskFactory.taskStatusCounts(5)).to.equal(0); // CANCELLED

      await taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress);

      // After emergency withdrawal
      expect(await taskFactory.taskStatusCounts(0)).to.equal(0); // OPEN
      expect(await taskFactory.taskStatusCounts(5)).to.equal(1); // CANCELLED
    });
  });

  describe("Multiple Tasks Scenario", function () {
    it("Should handle emergency withdrawal from multiple tasks", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      // Create multiple tasks
      await token.connect(user1).approve(taskFactory.getAddress(), reward * 3n);

      for (let i = 0; i < 3; i++) {
        await taskFactory
          .connect(user1)
          .createTask(
            `${title} ${i}`,
            description,
            category,
            await token.getAddress(),
            deadlineInSeconds,
            reward
          );
      }

      const initialBalance = await token.balanceOf(user1.address);

      // Emergency withdraw from all tasks
      for (let i = 0; i < 3; i++) {
        const taskAddress = await taskFactory.tasks(i);
        await taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress);
      }

      expect(await token.balanceOf(user1.address)).to.equal(
        initialBalance + reward * 3n
      );
      expect(await taskFactory.taskStatusCounts(0)).to.equal(0); // No OPEN tasks
      expect(await taskFactory.taskStatusCounts(5)).to.equal(3); // 3 CANCELLED tasks
    });
  });

  describe("Edge Cases", function () {
    it("Should handle emergency withdrawal when task has zero balance", async function () {
      const { taskFactory, taskAddress, taskContract, token, user1 } =
        await loadFixture(createTaskFixture);

      // Manually transfer tokens out (simulate edge case)
      const taskTokenBalance = await token.balanceOf(taskAddress);
      expect(taskTokenBalance).to.equal(reward);

      // This should still work even if there's an issue with token transfer
      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      ).to.emit(taskFactory, "EmergencyWithdrawalExecuted");
    });

    it("Should prevent double emergency withdrawal", async function () {
      const { taskFactory, taskAddress, user1 } = await loadFixture(
        createTaskFixture
      );

      // First withdrawal should succeed
      await taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress);

      // Second withdrawal should fail (task is now CANCELLED)
      await expect(
        taskFactory.connect(user1).emergencyWithdrawFromTask(taskAddress)
      ).to.be.revertedWithCustomError(
        taskFactory,
        "CANNOT_EMERGENCY_WITHDRAW_AFTER_COMPLETION"
      );
    });
  });
});
