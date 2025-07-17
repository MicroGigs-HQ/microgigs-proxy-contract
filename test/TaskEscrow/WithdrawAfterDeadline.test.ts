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

  describe("withdrawAfterDeadline", function () {
    it("Should allow assignee to withdraw after deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      const initialBalance = await token.balanceOf(taskAssignee.address);

      await expect(taskEscrow.connect(taskAssignee).withdrawAfterDeadline())
        .to.emit(taskEscrow, "FundsReleased")
        .withArgs(taskAssignee.address, reward);

      expect(await token.balanceOf(taskAssignee.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
    });

    it("Should revert if called before deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(taskAssignee).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "DEADLINE_NOT_REACHED");
    });

    it("Should revert if called by non-assignee", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      await expect(
        taskEscrow.connect(otherAccount).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(
        taskEscrow,
        "ONLY_TASK_ASSIGNEE_CAN_CALL"
      );
    });

    it("Should revert if task not completed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      await expect(
        taskEscrow.connect(taskAssignee).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should revert if task disputed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).raiseDispute();

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      await expect(
        taskEscrow.connect(taskAssignee).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should emit TaskStatusChanged event", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      await expect(taskEscrow.connect(taskAssignee).withdrawAfterDeadline())
        .to.emit(taskEscrow, "TaskStatusChanged")
        .withArgs(2, 4); // COMPLETED -> PAID_OUT
    });
  });
});
