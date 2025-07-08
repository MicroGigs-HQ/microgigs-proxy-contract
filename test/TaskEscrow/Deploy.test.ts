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
        const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
        const tokenAddress = await token.getAddress();
  
        await taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
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
        expect(await taskEscrow.tokenAddress()).to.equal(tokenAddress);
      });
  
      it("Should set deadline as current timestamp + deadline parameter", async function () {
        const { token, taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
        const tokenAddress = await token.getAddress();
        const beforeInit = await time.latest();
  
        await taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
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
        const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
        const tokenAddress = await token.getAddress();
  
        // First initialization should succeed
        await taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
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
            tokenAddress,
            reward,
            deadlineInSeconds
          )
        ).to.be.reverted;
      });
  
      it("Should handle large reward values", async function () {
        const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
        const tokenAddress = await token.getAddress();
        const largeReward = hre.ethers.parseEther("1000000"); // 1 million tokens
  
        await taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
          largeReward,
          deadlineInSeconds
        );
  
        expect(await taskEscrow.reward()).to.equal(largeReward);
      });
  
      it("Should handle large deadline values", async function () {
        const { token, taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
        const tokenAddress = await token.getAddress();
        const largeDeadline = 31536000n; // 1 year in seconds
  
        const beforeInit = await time.latest();
        await taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
          reward,
          largeDeadline
        );
  
        const contractDeadline = await taskEscrow.deadline();
        const expectedDeadline = beforeInit + Number(largeDeadline);
        expect(contractDeadline).to.be.closeTo(expectedDeadline, 5);
      });
    });
  });
  