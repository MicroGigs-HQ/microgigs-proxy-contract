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

  describe("Getter Functions", function () {
    describe("getTaskInfo", function () {
      it("Should return correct task information in OPEN state", async function () {
        const { token, taskEscrow, taskOwner } = await getInitializedContract();

        const info = await taskEscrow.getTaskInfo();

        expect(info.owner).to.equal(taskOwner.address);
        expect(info.assignee).to.equal(hre.ethers.ZeroAddress);
        expect(info.taskTitle).to.equal(title);
        expect(info.taskDescription).to.equal(description);
        expect(info.taskCategory).to.equal(category);
        expect(info.token).to.equal(await token.getAddress());
        expect(info.rewardAmount).to.equal(reward);
        expect(info.taskDeadline).to.be.closeTo(
          (await time.latest()) + Number(deadlineInSeconds),
          5
        );
        expect(info.taskStatus).to.equal(0); // Status.OPEN
        expect(info.completed).to.equal(false);
        expect(info.disputed).to.equal(false);
      });

      it("Should return correct information in ASSIGNED state", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        const info = await taskEscrow.getTaskInfo();

        expect(info.assignee).to.equal(taskAssignee.address);
        expect(info.taskStatus).to.equal(1); // Status.ASSIGNED
      });

      it("Should return correct information in COMPLETED state", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        const info = await taskEscrow.getTaskInfo();

        expect(info.taskStatus).to.equal(2); // Status.COMPLETED
        expect(info.completed).to.equal(true);
      });

      it("Should return correct information in DISPUTED state", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).raiseDispute();
        const info = await taskEscrow.getTaskInfo();

        expect(info.taskStatus).to.equal(3); // Status.DISPUTED
        expect(info.disputed).to.equal(true);
      });

      it("Should return correct information in PAID_OUT state", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();

        await token
          .connect(taskOwner)
          .transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();
        const info = await taskEscrow.getTaskInfo();

        expect(info.taskStatus).to.equal(4); // Status.PAID_OUT
      });

      it("Should return correct information in CANCELLED state", async function () {
        const { token, taskEscrow, taskOwner } = await getInitializedContract();

        await token
          .connect(taskOwner)
          .transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).cancelTask();
        const info = await taskEscrow.getTaskInfo();

        expect(info.taskStatus).to.equal(5); // Status.CANCELLED
      });
    });

    describe("isTaskActive", function () {
      it("Should return true for OPEN state", async function () {
        const { taskEscrow } = await getInitializedContract();
        expect(await taskEscrow.isTaskActive()).to.equal(true);
      });

      it("Should return true for ASSIGNED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        expect(await taskEscrow.isTaskActive()).to.equal(true);
      });

      it("Should return false for COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        expect(await taskEscrow.isTaskActive()).to.equal(false);
      });

      it("Should return false for DISPUTED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskOwner).raiseDispute();
        expect(await taskEscrow.isTaskActive()).to.equal(false);
      });
    });

    describe("canSubmitWork", function () {
      it("Should return true for assignee before deadline", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        expect(await taskEscrow.connect(taskAssignee).canSubmitWork()).to.equal(
          true
        );
      });

      it("Should return false for non-assignee", async function () {
        const { taskEscrow, taskOwner, taskAssignee, otherAccount } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        expect(await taskEscrow.connect(otherAccount).canSubmitWork()).to.equal(
          false
        );
      });

      it("Should return false after deadline", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        // Fast-forward past deadline
        await time.increase(deadlineInSeconds + 1n);

        expect(await taskEscrow.connect(taskAssignee).canSubmitWork()).to.equal(
          false
        );
      });

      it("Should return false in non-ASSIGNED states", async function () {
        const { taskEscrow, taskAssignee } = await getInitializedContract();
        // OPEN state
        expect(await taskEscrow.connect(taskAssignee).canSubmitWork()).to.equal(
          false
        );
      });
    });

    describe("canReleasePayment", function () {
      it("Should return true for task owner in COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        expect(
          await taskEscrow.connect(taskOwner).canReleasePayment()
        ).to.equal(true);
      });

      it("Should return false for non-owner", async function () {
        const { taskEscrow, taskAssignee } = await getInitializedContract();
        expect(
          await taskEscrow.connect(taskAssignee).canReleasePayment()
        ).to.equal(false);
      });

      it("Should return false in non-COMPLETED states", async function () {
        const { taskEscrow, taskOwner } = await getInitializedContract();
        expect(
          await taskEscrow.connect(taskOwner).canReleasePayment()
        ).to.equal(false);
      });

      it("Should return false after payment released", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await token
          .connect(taskOwner)
          .transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();

        expect(
          await taskEscrow.connect(taskOwner).canReleasePayment()
        ).to.equal(false);
      });
    });

    describe("canRaiseDispute", function () {
      it("Should return true for owner in ASSIGNED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        expect(await taskEscrow.connect(taskOwner).canRaiseDispute()).to.equal(
          true
        );
      });

      it("Should return true for assignee in COMPLETED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        expect(
          await taskEscrow.connect(taskAssignee).canRaiseDispute()
        ).to.equal(true);
      });

      it("Should return false for unauthorized users", async function () {
        const { taskEscrow, otherAccount } = await getInitializedContract();
        expect(
          await taskEscrow.connect(otherAccount).canRaiseDispute()
        ).to.equal(false);
      });

      it("Should return false in DISPUTED state", async function () {
        const { taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskOwner).raiseDispute();

        expect(await taskEscrow.connect(taskOwner).canRaiseDispute()).to.equal(
          false
        );
      });

      it("Should return false in PAID_OUT state", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } =
          await getInitializedContract();
        await token
          .connect(taskOwner)
          .transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();

        expect(await taskEscrow.connect(taskOwner).canRaiseDispute()).to.equal(
          false
        );
      });

      it("Should return false in OPEN state", async function () {
        const { taskEscrow, taskOwner } = await getInitializedContract();
        expect(await taskEscrow.connect(taskOwner).canRaiseDispute()).to.equal(
          false
        );
      });
    });

    describe("getTimeLeft", function () {
      it("Should return correct time before deadline", async function () {
        const { taskEscrow } = await getInitializedContract();

        const contractDeadline = await taskEscrow.deadline();
        const currentTime = BigInt(await time.latest());

        const expectedTimeLeft =
          contractDeadline > currentTime ? contractDeadline - currentTime : 0n;

        const timeLeft = await taskEscrow.getTimeLeft();

        expect(timeLeft).to.equal(expectedTimeLeft);
      });

      it("Should return 0 after deadline", async function () {
        const { taskEscrow } = await getInitializedContract();

        // Fast-forward past deadline
        await time.increase(deadlineInSeconds + 1n);

        expect(await taskEscrow.getTimeLeft()).to.equal(0);
      });

      it("Should decrease over time", async function () {
        const { taskEscrow } = await getInitializedContract();

        const initial = await taskEscrow.getTimeLeft();
        await time.increase(10);
        const afterDelay = await taskEscrow.getTimeLeft();

        expect(afterDelay).to.be.lessThan(initial);
        expect(initial - afterDelay).to.be.closeTo(10, 2);
      });
    });
  });
});
