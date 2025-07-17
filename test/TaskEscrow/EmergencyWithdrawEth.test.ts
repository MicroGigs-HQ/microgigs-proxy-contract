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

    describe("emergencyWithdrawETH", function () {
        it("Should allow factory to withdraw ETH when balance exists", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Send ETH to the contract
            const ethAmount = hre.ethers.parseEther("1.0");
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            // Verify ETH was sent
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(ethAmount);

            // Get factory's initial balance
            const initialFactoryBalance = await hre.ethers.provider.getBalance(factory.address);

            // Call emergencyWithdrawETH
            const tx = await taskEscrow.connect(factory).emergencyWithdrawETH();
            const receipt = await tx.wait();

            // Calculate gas used
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // Verify ETH was transferred to factory
            const finalFactoryBalance = await hre.ethers.provider.getBalance(factory.address);
            expect(finalFactoryBalance).to.equal(initialFactoryBalance - gasUsed + ethAmount);

            // Verify contract balance is now 0
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);
        });

        it("Should emit EmergencyETHWithdrawn event", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Send ETH to the contract
            const ethAmount = hre.ethers.parseEther("0.5");
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            // Call emergencyWithdrawETH and check event
            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount);
        });

        it("Should revert if called by non-factory", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

            // Send ETH to the contract
            const ethAmount = hre.ethers.parseEther("0.1");
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            // Try to call from taskOwner
            await expect(
                taskEscrow.connect(taskOwner).emergencyWithdrawETH()
            ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");

            // Try to call from taskAssignee
            await expect(
                taskEscrow.connect(taskAssignee).emergencyWithdrawETH()
            ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");

            // Try to call from other account
            await expect(
                taskEscrow.connect(otherAccount).emergencyWithdrawETH()
            ).to.be.revertedWithCustomError(taskEscrow, "CALLER_IS_NOT_FACTORY");
        });

        it("Should revert if no ETH balance to withdraw", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Verify contract has no ETH
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);

            // Try to withdraw with no balance
            await expect(
                taskEscrow.connect(factory).emergencyWithdrawETH()
            ).to.be.revertedWithCustomError(taskEscrow, "NO_ETH_TO_WITHDRAW");
        });

        it("Should work with small ETH amounts", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Send very small amount of ETH
            const ethAmount = 1n; // 1 wei
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            const initialFactoryBalance = await hre.ethers.provider.getBalance(factory.address);

            const tx = await taskEscrow.connect(factory).emergencyWithdrawETH();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const finalFactoryBalance = await hre.ethers.provider.getBalance(factory.address);
            expect(finalFactoryBalance).to.equal(initialFactoryBalance - gasUsed + ethAmount);

            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);
        });

        it("Should work with large ETH amounts", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Send large amount of ETH
            const ethAmount = hre.ethers.parseEther("10.0");
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            const initialFactoryBalance = await hre.ethers.provider.getBalance(factory.address);

            const tx = await taskEscrow.connect(factory).emergencyWithdrawETH();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const finalFactoryBalance = await hre.ethers.provider.getBalance(factory.address);
            expect(finalFactoryBalance).to.equal(initialFactoryBalance - gasUsed + ethAmount);

            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);
        });

        it("Should work regardless of task status", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            const ethAmount = hre.ethers.parseEther("0.1");

            // Test with OPEN status
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount);

            // Test with ASSIGNED status
            await token.connect(taskOwner).transfer(await taskEscrow.getAddress(), reward);
            await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount);

            // Test with COMPLETED status
            await taskEscrow.connect(taskAssignee).submitWork();

            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount);
        });

        it("Should work multiple times if ETH is sent again", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            const ethAmount1 = hre.ethers.parseEther("0.5");
            const ethAmount2 = hre.ethers.parseEther("0.3");

            // First withdrawal
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount1
            });

            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount1);

            // Second withdrawal
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount2
            });

            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount2);

            // Verify final balance is 0
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);
        });

        it("Should handle ETH sent via receive() function", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Send ETH via receive() function (empty transaction)
            const ethAmount = hre.ethers.parseEther("0.2");
            await taskOwner.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            // Verify ETH was received
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(ethAmount);

            // Factory should be able to withdraw it
            await expect(taskEscrow.connect(factory).emergencyWithdrawETH())
                .to.emit(taskEscrow, "EmergencyETHWithdrawn")
                .withArgs(ethAmount);
        });

        it("Should not affect ERC20 token balances", async function () {
            const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();

            // Transfer reward tokens to contract
            await token.connect(taskOwner).transfer(await taskEscrow.getAddress(), reward);
            const initialTokenBalance = await token.balanceOf(await taskEscrow.getAddress());

            // Send ETH to contract
            const ethAmount = hre.ethers.parseEther("0.1");
            await factory.sendTransaction({
                to: await taskEscrow.getAddress(),
                value: ethAmount
            });

            // Withdraw ETH
            await taskEscrow.connect(factory).emergencyWithdrawETH();

            // Verify token balance unchanged
            expect(await token.balanceOf(await taskEscrow.getAddress())).to.equal(initialTokenBalance);

            // Verify ETH balance is 0
            expect(await hre.ethers.provider.getBalance(await taskEscrow.getAddress())).to.equal(0);
        });
    });
});
