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
    await token.mint(taskOwner.address, reward * 10n);

    // approve taskEscrow to spend
    await token
      .connect(taskOwner)
      .approve(await taskEscrow.getAddress(), reward * 10n);

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

  describe("resolveDispute", function () {
    it("Should resolve dispute with task owner as winner", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      // Fund escrow and setup dispute
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      const initialBalance = await token.balanceOf(taskOwner.address);

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskOwner.address)
      )
        .to.emit(taskEscrow, "DisputeResolved")
        .withArgs(taskOwner.address, reward);

      expect(await token.balanceOf(taskOwner.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
    });

    it("Should resolve dispute with task assignee as winner", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).raiseDispute();

      const initialBalance = await token.balanceOf(taskAssignee.address);

      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

      expect(await token.balanceOf(taskAssignee.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskEscrow.status()).to.equal(4);
    });

    it("Should revert if called by non-factory", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(otherAccount).resolveDispute(taskOwner.address)
      ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");
    });

    it("Should revert if no active dispute", async function () {
      const { factory, taskEscrow, taskOwner } = await getInitializedContract();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskOwner.address)
      ).to.be.revertedWithCustomError(taskEscrow, "NO_ACTIVE_DISPUTE");
    });

    it("Should revert if task already paid out", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).releasePayment();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskOwner.address)
      ).to.be.revertedWithCustomError(taskEscrow, "NO_ACTIVE_DISPUTE");
    });

    it("Should revert if winner is zero address", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_USE_ADDRESS_ZERO");
    });

    it("Should revert if winner is not task party", async function () {
      const {
        token,
        factory,
        taskEscrow,
        taskOwner,
        taskAssignee,
        otherAccount,
      } = await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(otherAccount.address)
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_DISPUTE_WINNER");
    });

    it("Should handle insufficient contract balance", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      // Create dispute without funding contract
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.be.reverted;
    });

    it("Should emit TaskStatusChanged event", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      )
        .to.emit(taskEscrow, "TaskStatusChanged")
        .withArgs(3, 4); // DISPUTED -> PAID_OUT
    });

    it("Should prevent resolution after deadline", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).raiseDispute();

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      // Should still be able to resolve after deadline
      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.emit(taskEscrow, "DisputeResolved");
    });

    it("Should update status to PAID_OUT", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

      expect(await taskEscrow.status()).to.equal(4);
      expect(await taskEscrow.isDisputed()).to.equal(true);
    });

    it("Should revert if dispute resolved twice", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      // First resolution should succeed
      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

      // Second attempt should fail
      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.be.revertedWithCustomError(taskEscrow, "NO_ACTIVE_DISPUTE");
    });

    it("Should allow resolution after task completion", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.emit(taskEscrow, "DisputeResolved");
    });
  });
});
