import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
  import { expect } from "chai";
  import hre from "hardhat";
  
  describe("TaskEscrow:", function () {
    const title = "Create App Logo";
    const description = "Create an intuitive modern day logo for xyz app";
    const category = "Design";
    const reward = 100n;
    const deadlineInSeconds = 86400n;
  
    async function deployTaskEscrow() {
      const [factory, taskOwner, taskAssignee, otherAccount] = await hre.ethers.getSigners();
  
      // Deploy mock ERC20 token
      const Token = await hre.ethers.getContractFactory("ERC20Mock");
      const token = await Token.deploy("Test Token", "TST");
      await token.waitForDeployment();
  
      const TaskEscrow = await hre.ethers.getContractFactory("TaskEscrow");
      const taskEscrow = await TaskEscrow.deploy();
      await taskEscrow.waitForDeployment();
  
      // mint tokens to taskOwner
      await token.mint(taskOwner.address, reward * 10n);
      
      // approve taskEscrow to spend
      await token.connect(taskOwner).approve(await taskEscrow.getAddress(),reward * 10n);
  
      const currentTime = await time.latest();
      const expectedDeadline = currentTime + Number(deadlineInSeconds);
  
      return {
        token,
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
      const { token, taskEscrow, factory, taskOwner, taskAssignee, otherAccount } = await loadFixture(deployTaskEscrow);
      
      await token.connect(taskOwner).approve(taskEscrow.getAddress(), reward);
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        await token.getAddress(),
        reward,
        deadlineInSeconds
      );
      
      return { token, taskEscrow, factory, taskOwner, taskAssignee, otherAccount };
    }
  
    describe("assignTask", function () {
      it("Should assign task successfully by task owner", async function () {
          const {  taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
          const tx = taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
          
          await expect(tx)
              .to.emit(taskEscrow, "TaskAssigned")
              .withArgs(taskAssignee.address);
              
          await expect(tx)
              .to.emit(taskEscrow, "TaskStatusChanged")
              .withArgs(0, 1);  // OPEN -> ASSIGNED
  
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
  
      it("Should prevent task owner from assigning to themselves", async function () {
          const { taskEscrow, taskOwner } = await getInitializedContract();
  
          await expect(taskEscrow.connect(taskOwner).assignTask(taskOwner.address))
              .to.be.revertedWithCustomError(taskEscrow, "CANNOT_ASSIGN_TO_SELF");
      });
  
      it("Should revert if task is completed", async function () {
          const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
  
          await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
          await taskEscrow.connect(taskAssignee).submitWork();
  
          await expect(
              taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
          ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
      });
  
      it("Should revert if task is disputed", async function () {
          const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
  
          await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
          await taskEscrow.connect(taskOwner).raiseDispute();
  
          await expect(
              taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
          ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
      });
  
      it("Should revert if task is cancelled", async function () {
          const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
          await token.mint(await taskEscrow.getAddress(), reward * 10n);
  
          await taskEscrow.connect(taskOwner).cancelTask();
  
          await expect(
              taskEscrow.connect(taskOwner).assignTask(taskAssignee.address)
          ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
      });
  
      it("Should revert if task is paid out", async function () {
          const { token, taskEscrow, factory, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
          await token.mint(await taskEscrow.getAddress(), reward * 10n);
  
          await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
          await taskEscrow.connect(taskAssignee).submitWork();
          await taskEscrow.connect(taskOwner).releasePayment();
  
          await expect(
              taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
          ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
      });
  
      it("Should revert if deadline has passed", async function () {
          const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
          
          // Fast-forward past deadline
          await time.increase(deadlineInSeconds + 1n);
          
          await expect(
              taskEscrow.connect(taskOwner).assignTask(taskAssignee.address)
          ).to.be.revertedWithCustomError(taskEscrow, "DEADLINE_HAS_PASSED");
      });
  });
  
  });
  