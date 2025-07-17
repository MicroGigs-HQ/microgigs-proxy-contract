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

  describe("cancelTask", function () {
    it("Should cancel task successfully by task owner", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();

      // Fund escrow contract
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);

      const initialBalance = await token.balanceOf(taskOwner.address);

      await expect(taskEscrow.connect(taskOwner).cancelTask()).to.emit(
        taskEscrow,
        "TaskCancelled"
      );

      expect(await token.balanceOf(taskOwner.address)).to.equal(
        initialBalance + reward
      );
      expect(await taskEscrow.status()).to.equal(5); // Status.CANCELLED
    });

    it("Should revert if called by non-task owner", async function () {
      const { taskEscrow, taskAssignee } = await getInitializedContract();

      await expect(
        taskEscrow.connect(taskAssignee).cancelTask()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert if task is not OPEN", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } =
        await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(taskOwner).cancelTask()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_CANNOT_BE_CANCELLED");
    });

    it("Should handle insufficient contract balance", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();

      // Don't fund the contract
      await expect(taskEscrow.connect(taskOwner).cancelTask()).to.be.reverted;
    });

    it("Should emit TaskStatusChanged event", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);

      await expect(taskEscrow.connect(taskOwner).cancelTask())
        .to.emit(taskEscrow, "TaskStatusChanged")
        .withArgs(0, 5); // OPEN -> CANCELLED
    });

    it("Should prevent cancellation after deadline", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);

      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);

      await expect(taskEscrow.connect(taskOwner).cancelTask()).to.emit(
        taskEscrow,
        "TaskCancelled"
      );
    });
  });
});
