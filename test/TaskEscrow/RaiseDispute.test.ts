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
  
  describe("raiseDispute", function () {
    it("Should raise dispute successfully by task owner in ASSIGNED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        
        await expect(taskEscrow.connect(taskOwner).raiseDispute())
            .to.emit(taskEscrow, "DisputeRaised");
            
        expect(await taskEscrow.isDisputed()).to.equal(true);
        expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });
  
    it("Should raise dispute successfully by task assignee in ASSIGNED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        
        await expect(taskEscrow.connect(taskAssignee).raiseDispute())
            .to.emit(taskEscrow, "DisputeRaised");
            
        expect(await taskEscrow.isDisputed()).to.equal(true);
        expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });
  
    it("Should raise dispute successfully by task owner in COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        
        await expect(taskEscrow.connect(taskOwner).raiseDispute())
            .to.emit(taskEscrow, "DisputeRaised");
            
        expect(await taskEscrow.isDisputed()).to.equal(true);
        expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
    });
  
    it("Should raise dispute successfully by task assignee in COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        
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
  
    it("Should revert if dispute already raised", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskOwner).raiseDispute();
        
        await expect(
            taskEscrow.connect(taskAssignee).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "DISPUTE_ALREADY_RAISED");
    });
  
    it("Should revert if task is already paid out", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();
        
        await expect(
            taskEscrow.connect(taskOwner).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_PAID_OUT");
    });
  
    it("Should revert if task is OPEN", async function () {
        const { taskEscrow, taskOwner } = await getInitializedContract();
        
        await expect(
            taskEscrow.connect(taskOwner).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_DISPUTE");
    });
  
    it("Should revert if task is CANCELLED", async function () {
        const { token, taskEscrow, taskOwner } = await getInitializedContract();
        await token.mint(await taskEscrow.getAddress(), reward * 10n);
  
        await taskEscrow.connect(taskOwner).cancelTask();
        
        await expect(
            taskEscrow.connect(taskOwner).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_DISPUTE");
    });
  
    it("Should revert if task is DISPUTED", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskOwner).raiseDispute();
        
        await expect(
            taskEscrow.connect(taskOwner).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "DISPUTE_ALREADY_RAISED");
    });
  
    it("Should revert if task is PAID_OUT", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();
        
        await expect(
            taskEscrow.connect(taskOwner).raiseDispute()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_PAID_OUT");
    });
  
    it("Should emit TaskStatusChanged event", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        
        await expect(taskEscrow.connect(taskOwner).raiseDispute())
            .to.emit(taskEscrow, "TaskStatusChanged")
            .withArgs(1, 3);  // ASSIGNED -> DISPUTED
    });
  
    it("Should allow dispute after deadline in COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
  
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        
        // Fast-forward past deadline
        await time.increase(deadlineInSeconds + 1n);
        
        await expect(taskEscrow.connect(taskOwner).raiseDispute())
            .to.emit(taskEscrow, "DisputeRaised");
    });
  });
  
  });
  