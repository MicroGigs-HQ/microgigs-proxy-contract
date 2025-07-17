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

  describe("Getter Functions", function () {
    describe("getTotalTasks", function () {
      it("Should return 0 for empty tasks", async function () {
        const { taskFactory } = await loadFixture(deployTaskFactory);
        expect(await taskFactory.getTotalTasks()).to.equal(0);
      });

      it("Should return correct count after task creation", async function () {
        const { taskFactory, token, user1, user2 } = await loadFixture(
          deployTaskFactory
        );

        // Approve enough for 3 tasks
        await token
          .connect(user1)
          .approve(taskFactory.getAddress(), reward * 3n);

        // Create 3 tasks
        const taskAddresses = [];
        for (let i = 0; i < 3; i++) {
          const tx = await taskFactory
            .connect(user1)
            .createTask(
              `${title} ${i}`,
              description,
              category,
              await token.getAddress(),
              deadlineInSeconds,
              reward
            );
          const receipt = await tx.wait();
          const event = receipt?.logs?.find(
            (log: any) => log.fragment?.name === "TaskCreated"
          );
          taskAddresses.push(event?.args?.task);
        }

        expect(await taskFactory.getTotalTasks()).to.equal(3);
      });

      it("Should not count cancelled tasks", async function () {
        const { taskFactory, token, user1 } = await loadFixture(
          deployTaskFactory
        );

        await token.connect(user1).approve(taskFactory.getAddress(), reward);

        // Create task
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

        const taskAddress = await taskFactory.tasks(0);
        const taskContract = await hre.ethers.getContractAt(
          "TaskEscrow",
          taskAddress
        );

        // Cancel task
        await taskContract.connect(user1).cancelTask();

        // Should still count as 1 task
        expect(await taskFactory.getTotalTasks()).to.equal(1);
      });
    });

    describe("getTaskStatusCounts", function () {
      it("Should return all zeros initially", async function () {
        const { taskFactory } = await loadFixture(deployTaskFactory);

        const counts = await taskFactory.getTaskStatusCounts();
        expect(counts.open).to.equal(0);
        expect(counts.assigned).to.equal(0);
        expect(counts.completed).to.equal(0);
        expect(counts.disputed).to.equal(0);
        expect(counts.paidOut).to.equal(0);
      });

      //todo: fix test
      // it("Should track multiple status types", async function () {
      //     const { taskFactory, token, user1, user2 } = await loadFixture(deployTaskFactory);

      //     await token.connect(user1).approve(taskFactory.getAddress(), reward * 3n);

      //     // Create 3 tasks
      //     const taskAddresses = [];
      //     for (let i = 0; i < 3; i++) {
      //         const tx = await taskFactory.connect(user1).createTask(
      //             `${title} ${i}`,
      //             description,
      //             category,
      //             await token.getAddress(),
      //             deadlineInSeconds,
      //             reward
      //         );

      //         // Wait for transaction and get receipt
      //         const receipt = await tx.wait();

      //         // Find TaskCreated event
      //         const event = receipt?.logs?.find(
      //             log => log.fragment && log.fragment.name === "TaskCreated"
      //         );

      //         // Extract task address from event
      //         if (event) {
      //             const [taskAddress] = event.args;
      //             taskAddresses.push(taskAddress);
      //         } else {
      //             throw new Error("TaskCreated event not found");
      //         }
      //     }

      //     // Get task contracts
      //     const taskContracts = await Promise.all(
      //         taskAddresses.map((addr) =>
      //             hre.ethers.getContractAt("TaskEscrow", addr)
      //         )
      //     );

      //     // Update statuses:
      //     // Task 0: Assign
      //     await taskContracts[0].connect(user1).assignTask(user2.address);

      //     // Task 1: Complete
      //     await taskContracts[1].connect(user1).assignTask(user2.address);
      //     await taskContracts[1].connect(user2).submitWork();

      //     // Task 2: Dispute
      //     await taskContracts[2].connect(user1).assignTask(user2.address);
      //     await taskContracts[2].connect(user1).raiseDispute();

      //     // Check counts
      //     const counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.open).to.equal(0); // All tasks moved from open
      //     expect(counts.assigned).to.equal(1); // Task 0
      //     expect(counts.completed).to.equal(1); // Task 1
      //     expect(counts.disputed).to.equal(1); // Task 2
      //     expect(counts.paidOut).to.equal(0);
      // });

      // todo: fix test
      // it("Should update counts through lifecycle", async function () {
      //     const { taskFactory, token, user1, user2 } = await loadFixture(deployTaskFactory);

      //     await token.connect(user1).approve(taskFactory.getAddress(), reward);

      //     // Create task
      //     await taskFactory.connect(user1).createTask(
      //         title,
      //         description,
      //         category,
      //         await token.getAddress(),
      //         deadlineInSeconds,
      //         reward
      //     );

      //     const taskAddress = await taskFactory.tasks(0);
      //     const taskContract = await hre.ethers.getContractAt("TaskEscrow", taskAddress);

      //     // Verify initial counts
      //     let counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.open).to.equal(1);

      //     // Assign task
      //     await taskContract.connect(user1).assignTask(user2.address);
      //     counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.assigned).to.equal(1);
      //     expect(counts.open).to.equal(0);

      //     // Complete task
      //     await taskContract.connect(user2).submitWork();
      //     counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.completed).to.equal(1);
      //     expect(counts.assigned).to.equal(0);

      //     // Pay out
      //     await taskContract.connect(user1).releasePayment();
      //     counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.paidOut).to.equal(1);
      //     expect(counts.completed).to.equal(0);
      // });

      // todo: fix test
      // it("Should handle cancelled tasks", async function () {
      //     const { taskFactory, token, user1 } = await loadFixture(deployTaskFactory);

      //     await token.connect(user1).approve(taskFactory.getAddress(), reward);

      //     // Create task
      //     await taskFactory.connect(user1).createTask(
      //         title,
      //         description,
      //         category,
      //         await token.getAddress(),
      //         deadlineInSeconds,
      //         reward
      //     );

      //     const taskAddress = await taskFactory.tasks(0);
      //     const taskContract = await hre.ethers.getContractAt("TaskEscrow", taskAddress);

      //     // Cancel task
      //     await taskContract.connect(user1).cancelTask();

      //     // Cancelled tasks are not tracked in status counts
      //     const counts = await taskFactory.getTaskStatusCounts();
      //     expect(counts.open).to.equal(0);
      //     expect(counts.paidOut).to.equal(0);
      // });
    });

    describe("getTaskDetails", function () {
      it("Should return correct details for new task", async function () {
        const { taskFactory, token, user1 } = await loadFixture(
          deployTaskFactory
        );

        await token.connect(user1).approve(taskFactory.getAddress(), reward);

        // Create task
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

        const taskAddress = await taskFactory.tasks(0);
        const details = await taskFactory.getTaskDetails(taskAddress);

        expect(details.taskOwner).to.equal(user1.address);
        expect(details.taskAssignee).to.equal(hre.ethers.ZeroAddress);
        expect(details.title).to.equal(title);
        expect(details.description).to.equal(description);
        expect(details.category).to.equal(category);
        expect(details.tokenAddress).to.equal(await token.getAddress());
        expect(details.reward).to.equal(reward);
        expect(details.status).to.equal(0); // OPEN
        expect(details.isCompleted).to.equal(false);
        expect(details.isDisputed).to.equal(false);
      });

      it("Should return updated details after state changes", async function () {
        const { taskFactory, token, user1, user2 } = await loadFixture(
          deployTaskFactory
        );

        await token.connect(user1).approve(taskFactory.getAddress(), reward);

        // Create task
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

        const taskAddress = await taskFactory.tasks(0);
        const taskContract = await hre.ethers.getContractAt(
          "TaskEscrow",
          taskAddress
        );

        // Update state
        await taskContract.connect(user1).assignTask(user2.address);
        await taskContract.connect(user2).submitWork();
        await taskContract.connect(user1).raiseDispute();

        // Get details
        const details = await taskFactory.getTaskDetails(taskAddress);

        expect(details.taskAssignee).to.equal(user2.address);
        expect(details.status).to.equal(3); // DISPUTED
        expect(details.isCompleted).to.equal(true);
        expect(details.isDisputed).to.equal(true);
      });

      it("Should handle paid out tasks", async function () {
        const { taskFactory, token, user1, user2 } = await loadFixture(
          deployTaskFactory
        );

        await token.connect(user1).approve(taskFactory.getAddress(), reward);

        // Create task
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

        const taskAddress = await taskFactory.tasks(0);
        const taskContract = await hre.ethers.getContractAt(
          "TaskEscrow",
          taskAddress
        );

        // Complete and pay out
        await taskContract.connect(user1).assignTask(user2.address);
        await taskContract.connect(user2).submitWork();
        await taskContract.connect(user1).releasePayment();

        // Get details
        const details = await taskFactory.getTaskDetails(taskAddress);

        expect(details.status).to.equal(4); // PAID_OUT
        expect(details.isCompleted).to.equal(true);
      });

      it("Should revert for invalid task address", async function () {
        const { taskFactory, user1 } = await loadFixture(deployTaskFactory);

        await expect(taskFactory.getTaskDetails(user1.address)).to.be.reverted;
      });

      it("Should match TaskEscrow's getTaskInfo", async function () {
        const { taskFactory, token, user1 } = await loadFixture(
          deployTaskFactory
        );

        await token.connect(user1).approve(taskFactory.getAddress(), reward);

        // Create task
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

        const taskAddress = await taskFactory.tasks(0);
        const taskContract = await hre.ethers.getContractAt(
          "TaskEscrow",
          taskAddress
        );

        // Get details from both sources
        const factoryDetails = await taskFactory.getTaskDetails(taskAddress);
        const escrowDetails = await taskContract.getTaskInfo();

        // Compare all fields
        expect(factoryDetails.taskOwner).to.equal(escrowDetails.owner);
        expect(factoryDetails.taskAssignee).to.equal(escrowDetails.assignee);
        expect(factoryDetails.title).to.equal(escrowDetails.taskTitle);
        expect(factoryDetails.description).to.equal(
          escrowDetails.taskDescription
        );
        expect(factoryDetails.category).to.equal(escrowDetails.taskCategory);
        expect(factoryDetails.tokenAddress).to.equal(escrowDetails.token);
        expect(factoryDetails.reward).to.equal(escrowDetails.rewardAmount);
        expect(factoryDetails.deadline).to.equal(escrowDetails.taskDeadline);
        expect(factoryDetails.status).to.equal(escrowDetails.taskStatus);
        expect(factoryDetails.isCompleted).to.equal(escrowDetails.completed);
        expect(factoryDetails.isDisputed).to.equal(escrowDetails.disputed);
      });
    });

    describe("getUncompletedTasks", function () {
      it("Should return empty array for no tasks", async function () {
        const { taskFactory } = await loadFixture(deployTaskFactory);
        const tasks = await taskFactory.getUncompletedTasks();
        expect(tasks).to.be.an("array").that.is.empty;
      });

      it("Should return uncompleted tasks", async function () {
        const { taskFactory, token, user1 } = await loadFixture(
          deployTaskFactory
        );

        await token
          .connect(user1)
          .approve(taskFactory.getAddress(), reward * 3n);

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

        // Get uncompleted tasks
        const tasks = await taskFactory.getUncompletedTasks();

        expect(tasks).to.have.lengthOf(3);
      });

      it("Should not include completed tasks", async function () {
        const { taskFactory, token, user1, user2 } = await loadFixture(
          deployTaskFactory
        );

        await token
          .connect(user1)
          .approve(taskFactory.getAddress(), reward * 3n);

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

        // Complete the first task
        const firstTaskAddress = await taskFactory.tasks(0);
        const firstTaskContract = await hre.ethers.getContractAt(
          "TaskEscrow",
          firstTaskAddress
        );

        await firstTaskContract.connect(user1).assignTask(user2.address);
        await firstTaskContract.connect(user2).submitWork();
        await firstTaskContract.connect(user1).releasePayment();

        // Get uncompleted tasks
        const tasks = await taskFactory.getUncompletedTasks();

        // Should only have 2 uncompleted tasks
        expect(tasks).to.have.lengthOf(2);
      });
    });
  });
});
