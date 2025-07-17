import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("TaskFactory:", function () {
  const title = "Create App Logo";
  const description = "Create an intuitive modern day logo for xyz app";
  const category = "Design";
  const reward = 100n;
  const deadlineInSeconds = 86400n;
  const anyValue = "0x01";

  async function deployTaskFactory() {
    const [owner, user1, user2] = await hre.ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await hre.ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Test Token", "TST");
    await token.waitForDeployment();
    await token.mint(user1.address, reward * 10n);

    // Deploy TaskEscrow implementation
    const TaskEscrow = await hre.ethers.getContractFactory("TaskEscrow");
    const taskEscrowImpl = await TaskEscrow.deploy();
    await taskEscrowImpl.waitForDeployment();

    // Deploy TaskFactory
    const TaskFactory = await hre.ethers.getContractFactory("TaskFactory");
    const taskFactory = await TaskFactory.deploy();
    await taskFactory.waitForDeployment();

    // Initialize factory
    await taskFactory.initialize(await taskEscrowImpl.getAddress());

    return { taskFactory, taskEscrowImpl, token, owner, user1, user2 };
  }

  describe("Initialization", function () {
    it("Should set implementation address correctly", async function () {
      const { taskFactory, taskEscrowImpl } = await loadFixture(
        deployTaskFactory
      );
      expect(await taskFactory.taskEscrowImplementation()).to.equal(
        await taskEscrowImpl.getAddress()
      );
    });

    it("Should prevent double initialization", async function () {
      const { taskFactory, taskEscrowImpl } = await loadFixture(
        deployTaskFactory
      );
      await expect(taskFactory.initialize(await taskEscrowImpl.getAddress())).to
        .be.reverted;
    });
  });

  describe("createTask", function () {
    it("Should create task successfully", async function () {
      const { taskEscrowImpl, taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      await token.connect(user1).approve(taskFactory.getAddress(), reward);

      const tx = taskFactory
        .connect(user1)
        .createTask(
          title,
          description,
          category,
          await token.getAddress(),
          deadlineInSeconds,
          reward
        );

      // todo: update in future
      await expect(tx).to.emit(taskFactory, "TaskCreated");
      // .withArgs(token, user1.address, await token.getAddress(), reward);

      // Verify state updates
      const tasks = await taskFactory.tasks(0);
      expect(tasks).to.be.properAddress;
      expect(await taskFactory.userTaskCounts(user1.address)).to.equal(1);
      expect(await taskFactory.taskStatusCounts(0)).to.equal(1); // OPEN status

      // Verify token transfer
      const taskContract = await hre.ethers.getContractAt("TaskEscrow", tasks);
      expect(await token.balanceOf(tasks)).to.equal(reward);

      // Verify task initialization
      expect(await taskContract.taskOwner()).to.equal(user1.address);
      expect(await taskContract.title()).to.equal(title);
      expect(await taskContract.reward()).to.equal(reward);
    });

    it("Should revert with zero reward", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      await token.connect(user1).approve(taskFactory.getAddress(), reward);

      await expect(
        taskFactory
          .connect(user1)
          .createTask(
            title,
            description,
            category,
            await token.getAddress(),
            deadlineInSeconds,
            0
          )
      ).to.be.revertedWithCustomError(taskFactory, "REWARD_CANNOT_BE_EMPTY");
    });

    it("Should revert with zero token address", async function () {
      const { taskFactory, user1 } = await loadFixture(deployTaskFactory);

      await expect(
        taskFactory
          .connect(user1)
          .createTask(
            title,
            description,
            category,
            hre.ethers.ZeroAddress,
            deadlineInSeconds,
            reward
          )
      ).to.be.revertedWithCustomError(taskFactory, "CAN_NOT_USE_ADDRESS_ZERO");
    });

    it("Should revert with insufficient balance", async function () {
      const { taskFactory, token, user1, user2 } = await loadFixture(
        deployTaskFactory
      );

      // User2 has no tokens
      await token.connect(user1).approve(taskFactory.getAddress(), reward);

      await expect(
        taskFactory
          .connect(user2)
          .createTask(
            title,
            description,
            category,
            await token.getAddress(),
            deadlineInSeconds,
            reward
          )
      ).to.be.revertedWithCustomError(taskFactory, "INSUFFICIENT_BALANCE");
    });

    it("Should revert without token approval", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      // Don't approve tokens
      await expect(
        taskFactory
          .connect(user1)
          .createTask(
            title,
            description,
            category,
            await token.getAddress(),
            deadlineInSeconds,
            reward
          )
      ).to.be.reverted;
    });

    it("Should create multiple tasks", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      await token.connect(user1).approve(taskFactory.getAddress(), reward * 3n);

      // Create 3 tasks
      for (let i = 0; i < 3; i++) {
        await taskFactory
          .connect(user1)
          .createTask(
            `${title} ${i}`,
            description,
            category,
            await token.getAddress(),
            deadlineInSeconds,
            reward
          );
      }

      expect(await taskFactory.userTaskCounts(user1.address)).to.equal(3);
      expect(await taskFactory.taskStatusCounts(0)).to.equal(3); // All OPEN
    });

    it("Should track tasks correctly", async function () {
      const { taskFactory, token, user1 } = await loadFixture(
        deployTaskFactory
      );

      await token.connect(user1).approve(taskFactory.getAddress(), reward);

      await taskFactory
        .connect(user1)
        .createTask(
          title,
          description,
          category,
          await token.getAddress(),
          deadlineInSeconds,
          reward
        );

      const tasks = await taskFactory.tasks(0);
      expect(await taskFactory.tasks(0)).to.be.properAddress;
      await expect(taskFactory.tasks(1)).to.be.reverted;
    });
  });

  // describe("Task Lifecycle Integration", function () {
  //     it("Should track full task lifecycle", async function () {
  //         const { taskFactory, token, user1, user2 } = await loadFixture(deployTaskFactory);

  //         // Create task
  //         await token.connect(user1).approve(taskFactory.getAddress(), reward);
  //         await taskFactory.connect(user1).createTask(
  //             title,
  //             description,
  //             category,
  //             await token.getAddress(),
  //             deadlineInSeconds,
  //             reward
  //         );

  //         const tasks = await taskFactory.tasks(0);
  //         const taskContract = await hre.ethers.getContractAt("TaskEscrow", tasks);

  //         // Verify initial status
  //         expect(await taskContract.status()).to.equal(0); // OPEN
  //         expect(await taskFactory.taskStatusCounts(0)).to.equal(1);

  //         // Assign task
  //         await taskContract.connect(user1).assignTask(user2.address);
  //         expect(await taskContract.status()).to.equal(1); // ASSIGNED
  //         expect(await taskFactory.taskStatusCounts(1)).to.equal(1);
  //         expect(await taskFactory.taskStatusCounts(0)).to.equal(0);

  //         // Submit work
  //         await taskContract.connect(user2).submitWork();
  //         expect(await taskContract.status()).to.equal(2); // COMPLETED
  //         expect(await taskFactory.taskStatusCounts(2)).to.equal(1);
  //         expect(await taskFactory.taskStatusCounts(1)).to.equal(0);

  //         // Release payment
  //         await taskContract.connect(user1).releasePayment();
  //         expect(await taskContract.status()).to.equal(4); // PAID_OUT
  //         expect(await taskFactory.taskStatusCounts(4)).to.equal(1);
  //         expect(await taskFactory.taskStatusCounts(2)).to.equal(0);
  //     });

  //     it("Should handle dispute resolution", async function () {
  //         const { taskFactory, token, user1, user2 } = await loadFixture(deployTaskFactory);

  //         // Create task
  //         await token.connect(user1).approve(taskFactory.getAddress(), reward);
  //         await taskFactory.connect(user1).createTask(
  //             title,
  //             description,
  //             category,
  //             await token.getAddress(),
  //             deadlineInSeconds,
  //             reward
  //         );

  //         const tasks = await taskFactory.tasks(0);
  //         const taskContract = await hre.ethers.getContractAt("TaskEscrow", tasks);

  //         // Assign and dispute
  //         await taskContract.connect(user1).assignTask(user2.address);
  //         await taskContract.connect(user1).raiseDispute();
  //         expect(await taskContract.status()).to.equal(3); // DISPUTED
  //         expect(await taskFactory.taskStatusCounts(3)).to.equal(1);

  //         // Resolve dispute
  //         await taskContract.connect(taskFactory).resolveDispute(user1.address);
  //         expect(await taskContract.status()).to.equal(4); // PAID_OUT
  //         expect(await taskFactory.taskStatusCounts(4)).to.equal(1);
  //         expect(await taskFactory.taskStatusCounts(3)).to.equal(0);
  //     });
  // });
});
