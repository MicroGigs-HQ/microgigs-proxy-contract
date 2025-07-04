import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

describe("TaskEscrow", function () {
  const title = "Create App Logo";
  const description = "Create an intuitive modern day logo for xyz app";
  const category = "Design";
  const reward = 100n;
  const deadlineInSeconds = 86400n;

  async function deployTaskEscrow() {
    const [factory, taskOwner, taskAssignee, otherAccount] = await hre.ethers.getSigners();

    const TaskEscrow = await hre.ethers.getContractFactory("TaskEscrow");
    const taskEscrow = await TaskEscrow.deploy();
    await taskEscrow.waitForDeployment();

    // Get the current block timestamp for deadline calculation
    const currentTime = await time.latest();
    const expectedDeadline = currentTime + Number(deadlineInSeconds);

    return {
      taskEscrow,
      factory,
      taskOwner,
      taskAssignee,
      otherAccount,
      currentTime,
      expectedDeadline
    };
  }

  // helper function
  async function getInitializedContract() {
    const { taskEscrow, factory, taskOwner, taskAssignee, otherAccount } = await loadFixture(deployTaskEscrow);
    
    await taskEscrow.initialize(
      factory.address,
      taskOwner.address,
      title,
      description,
      category,
      reward,
      deadlineInSeconds
    );
    
    return { taskEscrow, factory, taskOwner, taskAssignee, otherAccount };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { taskEscrow } = await loadFixture(deployTaskEscrow);
      expect(await taskEscrow.getAddress()).to.be.properAddress;
    });

    it("Should have initial state before initialization", async function () {
      const { taskEscrow } = await loadFixture(deployTaskEscrow);
      
      // Check that contract is not initialized yet
      expect(await taskEscrow.factory()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.taskOwner()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.taskAssignee()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.title()).to.equal("");
      expect(await taskEscrow.description()).to.equal("");
      expect(await taskEscrow.category()).to.equal("");
      expect(await taskEscrow.reward()).to.equal(0);
      expect(await taskEscrow.deadline()).to.equal(0);
      expect(await taskEscrow.isCompleted()).to.equal(false);
      expect(await taskEscrow.isDisputed()).to.equal(false);
      expect(await taskEscrow.status()).to.equal(0); // Status.OPEN
    });
  });

  describe("Initialization", function () {
    it("Should initialize correctly with valid parameters", async function () {
      const { taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        reward,
        deadlineInSeconds
      );

      expect(await taskEscrow.factory()).to.equal(factory.address);
      expect(await taskEscrow.taskOwner()).to.equal(taskOwner.address);
      expect(await taskEscrow.title()).to.equal(title);
      expect(await taskEscrow.description()).to.equal(description);
      expect(await taskEscrow.category()).to.equal(category);
      expect(await taskEscrow.reward()).to.equal(reward);
      expect(await taskEscrow.deadline()).to.be.closeTo(expectedDeadline, 5); // Allow 5 seconds
      expect(await taskEscrow.status()).to.equal(0); // Status.OPEN
      expect(await taskEscrow.isCompleted()).to.equal(false);
      expect(await taskEscrow.isDisputed()).to.equal(false);
      expect(await taskEscrow.taskAssignee()).to.equal(hre.ethers.ZeroAddress);
    });

    it("Should set deadline as current timestamp + deadline parameter", async function () {
      const { taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);

      const beforeInit = await time.latest();
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        reward,
        deadlineInSeconds
      );
      const afterInit = await time.latest();

      const contractDeadline = await taskEscrow.deadline();
      const expectedMinDeadline = beforeInit + Number(deadlineInSeconds);
      const expectedMaxDeadline = afterInit + Number(deadlineInSeconds);

      expect(contractDeadline).to.be.at.least(expectedMinDeadline);
      expect(contractDeadline).to.be.at.most(expectedMaxDeadline);
    });

    it("Should prevent double initialization", async function () {
      const { taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);

      // First initialization should succeed
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        reward,
        deadlineInSeconds
      );

      // Second initialization should fail
      await expect(
        taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          reward,
          deadlineInSeconds
        )
      ).to.be.reverted;
    });

    it("Should handle large reward values", async function () {
      const { taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
      const largeReward = hre.ethers.parseEther("1000000"); // 1 million tokens

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        largeReward,
        deadlineInSeconds
      );

      expect(await taskEscrow.reward()).to.equal(largeReward);
    });

    it("Should handle large deadline values", async function () {
      const { taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
      const largeDeadline = 31536000n; // 1 year in seconds

      const beforeInit = await time.latest();
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        reward,
        largeDeadline
      );

      const contractDeadline = await taskEscrow.deadline();
      const expectedDeadline = beforeInit + Number(largeDeadline);
      expect(contractDeadline).to.be.closeTo(expectedDeadline, 5);
    });
  });

  describe("State after initialization", function () {
    it("Should have correct initial state after initialization", async function () {
      const { taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        reward,
        deadlineInSeconds
      );

      expect(await taskEscrow.factory()).to.equal(factory.address);
      expect(await taskEscrow.taskOwner()).to.equal(taskOwner.address);
      expect(await taskEscrow.taskAssignee()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.title()).to.equal(title);
      expect(await taskEscrow.description()).to.equal(description);
      expect(await taskEscrow.category()).to.equal(category);
      expect(await taskEscrow.reward()).to.equal(reward);
      expect(await taskEscrow.isCompleted()).to.equal(false);
      expect(await taskEscrow.isDisputed()).to.equal(false);
      expect(await taskEscrow.status()).to.equal(0); // Status.OPEN
    });
  });

  describe("assignTask", function () {
    it("Should assign task successfully by task owner", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await expect(taskEscrow.connect(taskOwner).assignTask(taskAssignee.address))
        .to.emit(taskEscrow, "TaskAssigned")
        .withArgs(taskAssignee.address);

      expect(await taskEscrow.taskAssignee()).to.equal(taskAssignee.address);
      expect(await taskEscrow.status()).to.equal(1); // Status.ASSIGNED
    });

    it("Should revert if called by non-task owner", async function () {
      const { taskEscrow, taskAssignee, otherAccount } = await getInitializedContract();

      await expect(
        taskEscrow.connect(otherAccount).assignTask(taskAssignee.address)
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert if task is already assigned", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should not allow assignment to zero address", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();

      await expect(taskEscrow.connect(taskOwner).assignTask(hre.ethers.ZeroAddress))
        .to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_ASSIGN_TO_ADDRESS_ZERO");
    });

    it("Should allow task owner to assign to themselves", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();

      await expect(taskEscrow.connect(taskOwner).assignTask(taskOwner.address))
        .to.emit(taskEscrow, "TaskAssigned")
        .withArgs(taskOwner.address);

      expect(await taskEscrow.taskAssignee()).to.equal(taskOwner.address);
    });

    it("Should revert if task is completed", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });
  });

  describe("submitWork", function () {
    it("Should submit work successfully by task assignee", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(taskEscrow.connect(taskAssignee).submitWork())
        .to.emit(taskEscrow, "TaskCompleted");

      expect(await taskEscrow.isCompleted()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(2); // Status.COMPLETED
    });

    it("Should revert if called by non-task assignee", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(otherAccount).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow,"ONLY_TASK_ASSIGNEE_CAN_CALL");
    });

    it("Should revert if task is not assigned", async function () {
      const { taskEscrow, taskAssignee } = await getInitializedContract();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_ASSIGNEE_CAN_CALL");
    });

    it("Should revert if work already submitted", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_ASSIGNED");
    });

    it("Should revert if task is disputed", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_ASSIGNED");
    });
  });

  describe("releasePayment", function () {

    it("Should release payment successfully by task owner", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      const initialBalance = await hre.ethers.provider.getBalance(taskAssignee.address);

      await expect(taskEscrow.connect(taskOwner).releasePayment())
        .to.emit(taskEscrow, "FundsReleased")
        .withArgs(taskAssignee.address, reward);

      const finalBalance = await hre.ethers.provider.getBalance(taskAssignee.address);
      expect(finalBalance - initialBalance).to.equal(reward);
    });

    it("Should revert if called by non-task owner", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(otherAccount).releasePayment()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert if task is not completed", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(taskOwner).releasePayment()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should revert if task is not assigned", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await expect(
        taskEscrow.connect(taskOwner).releasePayment()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should revert if contract has insufficient funds", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(taskOwner).releasePayment()
      ).to.be.reverted;
    });
  });

  describe("raiseDispute", function () {
    it("Should raise dispute successfully by task owner", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(taskEscrow.connect(taskOwner).raiseDispute())
        .to.emit(taskEscrow, "DisputeRaised");

      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });

    it("Should raise dispute successfully by task assignee", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();


      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(taskEscrow.connect(taskAssignee).raiseDispute())
        .to.emit(taskEscrow, "DisputeRaised");

      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });

    it("Should revert if called by unauthorized user", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(otherAccount).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "UNAUTHORIZED");
    });

    it("Should allow dispute after task completion", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(taskEscrow.connect(taskOwner).raiseDispute())
        .to.emit(taskEscrow, "DisputeRaised");

      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });

    it("Should not allow multiple dispute calls", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await taskEscrow.connect(taskOwner).raiseDispute();
      
      await expect(taskEscrow.connect(taskAssignee).raiseDispute())
        .to.be.revertedWithCustomError(taskEscrow, "DISPUTE_ALREADY_RAISED");
    });
  });

  describe("resolveDispute", function () {
    it("Should resolve dispute successfully with task owner as winner", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      const initialBalance = await hre.ethers.provider.getBalance(taskOwner.address);

      await taskEscrow.connect(factory).resolveDispute(taskOwner.address);

      const finalBalance = await hre.ethers.provider.getBalance(taskOwner.address);
      expect(finalBalance - initialBalance).to.equal(reward);
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
    });

    it("Should resolve dispute successfully with task assignee as winner", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).raiseDispute();

      const initialBalance = await hre.ethers.provider.getBalance(taskAssignee.address);

      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

      const finalBalance = await hre.ethers.provider.getBalance(taskAssignee.address);
      expect(finalBalance - initialBalance).to.equal(reward);
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
    });

    it("Should revert if no active dispute", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.be.revertedWithCustomError(taskEscrow, "NO_ACTIVE_DISPUTE");
    });

    it("Should resolve dispute with third party as winner", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      const initialBalance = await hre.ethers.provider.getBalance(otherAccount.address);

      await taskEscrow.connect(factory).resolveDispute(otherAccount.address);

      const finalBalance = await hre.ethers.provider.getBalance(otherAccount.address);
      expect(finalBalance - initialBalance).to.equal(reward);
      expect(await taskEscrow.status()).to.equal(4);
    });

    it("Should handle zero address not as winner", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_USE_ADDRESS_ZERO");
    });

    // todo: recheck
    // it("Should handle insufficient contract balance", async function () {
    //   const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

    //   await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
    //   await taskEscrow.connect(taskOwner).raiseDispute();

    //   await expect(
    //     taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
    //   ).to.be.reverted;
    // });

    it("Should allow anyone to resolve dispute", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.not.be.reverted;
    });
  });

  describe("Integration Tests", function () {
    it("Should handle complete workflow: assign -> submit -> release", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).releasePayment();

      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
      expect(await taskEscrow.isCompleted()).to.equal(true);
    });

    it("Should handle workflow with dispute: assign -> dispute -> resolve", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskOwner.sendTransaction({
        to: await taskEscrow.getAddress(),
        value: reward
      });

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();
      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
      expect(await taskEscrow.isDisputed()).to.equal(true);
    });
  });
});
