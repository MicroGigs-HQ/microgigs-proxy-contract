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
  const reward = hre.ethers.parseUnits("100", 18);
  const deadlineInSeconds = 86400n;

  async function deployTaskEscrow() {
    const [factory, taskOwner, taskAssignee, otherAccount] =
      await hre.ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await hre.ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Test Token", "TST");
    await token.waitForDeployment();

    const TaskEscrow = await hre.ethers.getContractFactory("TaskEscrow");
    const taskEscrow = await TaskEscrow.deploy();
    await taskEscrow.waitForDeployment();

    // mint tokens to taskOwner
    await token.mint(taskOwner.address, hre.ethers.parseUnits("1000", 18));

    // approve more tokens for spending
    await token
      .connect(taskOwner)
      .approve(await taskEscrow.getAddress(), hre.ethers.parseUnits("500", 18));

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
      expectedDeadline,
    };
  }

  // helper function
  async function getInitializedContract() {
    const {
      token,
      taskEscrow,
      factory,
      taskOwner,
      taskAssignee,
      otherAccount,
    } = await loadFixture(deployTaskEscrow);

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

    return {
      token,
      taskEscrow,
      factory,
      taskOwner,
      taskAssignee,
      otherAccount,
    };
  }

  describe("emergencyWithdrawToken", function () {
    // Helper function to deploy additional mock token
    async function deploySecondToken() {
      const Token = await hre.ethers.getContractFactory("ERC20Mock");
      const secondToken = await Token.deploy("Second Token", "STK");
      await secondToken.waitForDeployment();
      return secondToken;
    }

    describe("Non-task token withdrawal", function () {
      it("Should allow factory to withdraw non-task tokens", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Deploy second token
        const secondToken = await deploySecondToken();
        const tokenAmount = hre.ethers.parseUnits("1500", 18);

        // Mint and send second token to contract
        await secondToken.mint(await taskEscrow.getAddress(), tokenAmount);

        // Verify token was sent
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(tokenAmount);

        // Get factory's initial balance
        const initialFactoryBalance = await secondToken.balanceOf(
          factory.address
        );

        // Call emergencyWithdrawToken
        await taskEscrow
          .connect(factory)
          .emergencyWithdrawToken(await secondToken.getAddress());

        // Verify tokens were transferred to factory
        const finalFactoryBalance = await secondToken.balanceOf(
          factory.address
        );
        expect(finalFactoryBalance).to.equal(
          initialFactoryBalance + tokenAmount
        );

        // Verify contract balance is now 0
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);
      });

      it("Should emit EmergencyTokenWithdrawn event", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const tokenAmount = hre.ethers.parseUnits("100", 18);

        await secondToken.mint(await taskEscrow.getAddress(), tokenAmount);

        // Call emergencyWithdrawToken and check event
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), tokenAmount);
      });

      it("Should work with multiple different tokens", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Deploy multiple tokens
        const secondToken = await deploySecondToken();
        const Token3 = await hre.ethers.getContractFactory("ERC20Mock");
        const thirdToken = await Token3.deploy("Third Token", "TTK");
        await thirdToken.waitForDeployment();

        const amount1 = hre.ethers.parseUnits("100", 18);
        const amount2 = hre.ethers.parseUnits("200", 18);

        // Send both tokens to contract
        await secondToken.mint(await taskEscrow.getAddress(), amount1);
        await thirdToken.mint(await taskEscrow.getAddress(), amount2);

        // Withdraw first token
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), amount1);

        // Withdraw second token
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await thirdToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await thirdToken.getAddress(), amount2);

        // Verify both balances are 0
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);
        expect(
          await thirdToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);
      });
    });

    describe("Task reward token withdrawal", function () {
      it("Should allow withdrawal of task reward token when task is PAID_OUT", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();

        // Send additional task reward tokens to contract
        const additionalTokens = hre.ethers.parseUnits("50", 18);
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), additionalTokens);

        // Should allow withdrawal when status is PAID_OUT
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await token.getAddress(), additionalTokens);
      });

      it("Should allow withdrawal of task reward token when task is CANCELLED", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Transfer reward to contract and cancel task
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).cancelTask();

        // Send additional task reward tokens to contract
        const additionalTokens = hre.ethers.parseUnits("30", 18);
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), additionalTokens);

        // Should allow withdrawal when status is CANCELLED
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await token.getAddress(), additionalTokens);
      });

      it("Should revert withdrawal of task reward token when task is OPEN", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Send task reward tokens to contract (status is OPEN)
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);

        // Should revert when trying to withdraw task reward token while task is OPEN
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        ).to.be.revertedWithCustomError(
          taskEscrow,
          "CANNOT_WITHDRAW_TASK_REWARD_TOKEN_WHILE_TASK_IS_ACTIVE"
        );
      });

      it("Should revert withdrawal of task reward token when task is ASSIGNED", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Transfer reward and assign task
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        // Should revert when trying to withdraw task reward token while task is ASSIGNED
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        ).to.be.revertedWithCustomError(
          taskEscrow,
          "CANNOT_WITHDRAW_TASK_REWARD_TOKEN_WHILE_TASK_IS_ACTIVE"
        );
      });

      it("Should revert withdrawal of task reward token when task is COMPLETED", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Complete task flow to COMPLETED
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        // Should revert when trying to withdraw task reward token while task is COMPLETED
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        ).to.be.revertedWithCustomError(
          taskEscrow,
          "CANNOT_WITHDRAW_TASK_REWARD_TOKEN_WHILE_TASK_IS_ACTIVE"
        );
      });

      it("Should revert withdrawal of task reward token when task is DISPUTED", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Complete task flow to DISPUTED
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).raiseDispute();

        // Should revert when trying to withdraw task reward token while task is DISPUTED
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        ).to.be.revertedWithCustomError(
          taskEscrow,
          "CANNOT_WITHDRAW_TASK_REWARD_TOKEN_WHILE_TASK_IS_ACTIVE"
        );
      });
    });

    describe("Access control and validation", function () {
      it("Should revert if called by non-factory", async function () {
        const {
          token,
          taskEscrow,
          factory,
          taskOwner,
          taskAssignee,
          otherAccount,
        } = await getInitializedContract();

        const secondToken = await deploySecondToken();
        await secondToken.mint(
          await taskEscrow.getAddress(),
          hre.ethers.parseUnits("100", 18)
        );

        // Try to call from taskOwner
        await expect(
          taskEscrow
            .connect(taskOwner)
            .emergencyWithdrawToken(await secondToken.getAddress())
        ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");

        // Try to call from taskAssignee
        await expect(
          taskEscrow
            .connect(taskAssignee)
            .emergencyWithdrawToken(await secondToken.getAddress())
        ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");

        // Try to call from other account
        await expect(
          taskEscrow
            .connect(otherAccount)
            .emergencyWithdrawToken(await secondToken.getAddress())
        ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");
      });

      it("Should revert if token address is zero", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(hre.ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_USE_ADDRESS_ZERO");
      });

      it("Should revert if no tokens to withdraw", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();

        // Verify contract has no tokens
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);

        // Try to withdraw with no balance
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        ).to.be.revertedWithCustomError(taskEscrow, "NO_TOKENS_TO_WITHDRAW");
      });
    });

    describe("Edge cases and scenarios", function () {
      it("Should work with very small token amounts", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const smallAmount = 1n; // 1 wei

        await secondToken.mint(await taskEscrow.getAddress(), smallAmount);

        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), smallAmount);
      });

      it("Should work with very large token amounts", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const largeAmount = hre.ethers.parseUnits("1000000", 18); // 1 million tokens

        await secondToken.mint(await taskEscrow.getAddress(), largeAmount);

        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), largeAmount);
      });

      it("Should work multiple times for the same token", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const amount1 = hre.ethers.parseUnits("100", 18);
        const amount2 = hre.ethers.parseUnits("200", 18);

        // First withdrawal
        await secondToken.mint(await taskEscrow.getAddress(), amount1);
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), amount1);

        // Second withdrawal
        await secondToken.mint(await taskEscrow.getAddress(), amount2);
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), amount2);
      });

      it("Should not affect other token balances", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const thirdToken = await hre.ethers.getContractFactory("ERC20Mock");
        const token3 = await thirdToken.deploy("Third Token", "TTK");
        await token3.waitForDeployment();

        const amount1 = hre.ethers.parseUnits("100", 18);
        const amount2 = hre.ethers.parseUnits("200", 18);

        // Send both tokens to contract
        await secondToken.mint(await taskEscrow.getAddress(), amount1);
        await token3.mint(await taskEscrow.getAddress(), amount2);

        // Withdraw only the second token
        await taskEscrow
          .connect(factory)
          .emergencyWithdrawToken(await secondToken.getAddress());

        // Verify second token balance is 0
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);

        // Verify third token balance is unchanged
        expect(await token3.balanceOf(await taskEscrow.getAddress())).to.equal(
          amount2
        );
      });

      it("Should work with tokens having different decimals", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Deploy token with 6 decimals (like USDC)
        const Token6 = await hre.ethers.getContractFactory("ERC20Mock");
        const token6 = await Token6.deploy("Six Decimal Token", "SIX");
        await token6.waitForDeployment();

        const amount = hre.ethers.parseUnits("1000", 6); // 1000 tokens with 6 decimals

        await token6.mint(await taskEscrow.getAddress(), amount);

        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token6.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await token6.getAddress(), amount);
      });

      it("Should not affect ETH balance", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        const secondToken = await deploySecondToken();
        const tokenAmount = hre.ethers.parseUnits("100", 18);
        const ethAmount = hre.ethers.parseEther("1.0");

        // Send both tokens and ETH to contract
        await secondToken.mint(await taskEscrow.getAddress(), tokenAmount);
        await factory.sendTransaction({
          to: await taskEscrow.getAddress(),
          value: ethAmount,
        });

        // Verify initial balances
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(tokenAmount);
        expect(
          await hre.ethers.provider.getBalance(await taskEscrow.getAddress())
        ).to.equal(ethAmount);

        // Withdraw tokens
        await taskEscrow
          .connect(factory)
          .emergencyWithdrawToken(await secondToken.getAddress());

        // Verify token balance is 0 but ETH balance is unchanged
        expect(
          await secondToken.balanceOf(await taskEscrow.getAddress())
        ).to.equal(0);
        expect(
          await hre.ethers.provider.getBalance(await taskEscrow.getAddress())
        ).to.equal(ethAmount);
      });
    });

    describe("Integration with task lifecycle", function () {
      it("Should allow non-task token withdrawal during dispute", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Complete task flow to DISPUTED
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).raiseDispute();

        // Send non-task tokens to contract
        const secondToken = await deploySecondToken();
        const tokenAmount = hre.ethers.parseUnits("100", 18);
        await secondToken.mint(await taskEscrow.getAddress(), tokenAmount);

        // Should allow withdrawal of non-task tokens even during dispute
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await secondToken.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await secondToken.getAddress(), tokenAmount);
      });

      it("Should allow task token withdrawal after dispute resolution", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } =
          await getInitializedContract();

        // Complete task flow to DISPUTED and resolve
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).raiseDispute();
        await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

        // Send additional task reward tokens to contract
        const additionalTokens = hre.ethers.parseUnits("50", 18);
        await token
          .connect(taskOwner)
          .transfer(await taskEscrow.getAddress(), additionalTokens);

        // Should allow withdrawal when status is PAID_OUT after dispute resolution
        await expect(
          taskEscrow
            .connect(factory)
            .emergencyWithdrawToken(await token.getAddress())
        )
          .to.emit(taskEscrow, "EmergencyTokenWithdrawn")
          .withArgs(await token.getAddress(), additionalTokens);
      });
    });
  });
});
