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
        await token.mint(user1.address, reward * 50n);

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
            const { taskFactory, taskEscrowImpl } = await loadFixture(deployTaskFactory);
            expect(await taskFactory.taskEscrowImplementation()).to.equal(await taskEscrowImpl.getAddress());
        });

        it("Should prevent double initialization", async function () {
            const { taskFactory, taskEscrowImpl } = await loadFixture(deployTaskFactory);
            await expect(
                taskFactory.initialize(await taskEscrowImpl.getAddress())
            ).to.be.reverted;
        });
    });

    describe("getUncompletedTask", function () {
        
        it("Should return empty array for no tasks", async function () {
            const { taskFactory } = await loadFixture(deployTaskFactory);
            const tasks = await taskFactory.getUncompletedTasks();
            expect(tasks).to.be.an("array").that.is.empty;
        });

        it("Should return uncompleted tasks", async function () {
            const { taskFactory, token, user1 } = await loadFixture(deployTaskFactory);
            
            await token.connect(user1).approve(taskFactory.getAddress(), reward * 3n);
            
            // Create 3 tasks
            for (let i = 0; i < 3; i++) {
                await taskFactory.connect(user1).createTask(
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
            const { taskFactory, token, user1, user2 } = await loadFixture(deployTaskFactory);
            
            await token.connect(user1).approve(taskFactory.getAddress(), reward * 3n);
            
            // Create 3 tasks
            for (let i = 0; i < 3; i++) {
                await taskFactory.connect(user1).createTask(
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
            const firstTaskContract = await hre.ethers.getContractAt("TaskEscrow", firstTaskAddress);
            
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