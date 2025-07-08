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
  
  });
  