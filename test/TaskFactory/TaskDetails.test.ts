import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("TaskFactory:", function () {
  const title = "Create App Logo";
  const description = "Create an intuitive modern day logo for xyz app";
  const category = "Design";
  const reward = 100n;
  const deadlineInSeconds = 86400n;
  const anyValue = "0x01";

  async function deployTaskFactory() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Test Token", "TST");
    await token.waitForDeployment();
    await token.mint(user1.address, reward * 10n);

    // Deploy TaskEscrow implementation
    const TaskEscrow = await ethers.getContractFactory("TaskEscrow");
    const taskEscrowImpl = await TaskEscrow.deploy();
    await taskEscrowImpl.waitForDeployment();

    // Deploy TaskFactory
    const TaskFactory = await ethers.getContractFactory("TaskFactory");
    const taskFactory = await TaskFactory.deploy();
    await taskFactory.waitForDeployment();

    // Initialize factory
    await taskFactory.initialize(await taskEscrowImpl.getAddress());

    return { taskFactory, taskEscrowImpl, token, owner, user1, user2 };
  }

  describe("Initialization", function () {
    it("Should set implementation address correctly", async function () {
      const { taskFactory, taskEscrowImpl } = await loadFixture(deployTaskFactory);
      expect(await taskFactory.taskEscrowImplementation()).to.equal(
        await taskEscrowImpl.getAddress()
      );
    });

    it("Should prevent double initialization", async function () {
      const { taskFactory, taskEscrowImpl } = await loadFixture(deployTaskFactory);
      await expect(
        taskFactory.initialize(await taskEscrowImpl.getAddress())
      ).to.be.reverted;
    });
  });

  describe("createTask and check Details", function () {
    it("Should create task successfully and also check task details", async function () {
      const { taskEscrowImpl, taskFactory, token, user1 } = await loadFixture(deployTaskFactory);

      await token.connect(user1).approve(taskFactory.getAddress(), reward);

      const tx = await taskFactory.connect(user1).createTask(
        title,
        description,
        category,
        await token.getAddress(),
        deadlineInSeconds,
        reward
      );

      await tx.wait();

      // Verify state updates
      const tasks = await taskFactory.tasks(0);
      expect(tasks).to.be.properAddress;
      expect(await taskFactory.userTaskCounts(user1.address)).to.equal(1);
      expect(await taskFactory.taskStatusCounts(0)).to.equal(1); // OPEN status

      // Verify token transfer
      const taskContract = await ethers.getContractAt("TaskEscrow", tasks);
      expect(await token.balanceOf(tasks)).to.equal(reward);

      // Verify task initialization
      expect(await taskContract.taskOwner()).to.equal(user1.address);
      expect(await taskContract.title()).to.equal(title);
      expect(await taskContract.reward()).to.equal(reward);

      // Verifying task details
      const taskDetails = await taskFactory.getDetailsForATask(tasks);
      expect(await taskContract.taskOwner()).to.equal(taskDetails[1]);
      expect(await taskContract.title()).to.equal(taskDetails[2]);
      expect(await taskContract.reward()).to.equal(taskDetails[7]);
    });
  });
});
