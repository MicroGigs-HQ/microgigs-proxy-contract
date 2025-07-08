import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { token } from "../typechain-types/@openzeppelin/contracts";

describe("TaskEscrow", function () {
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

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { taskEscrow } = await loadFixture(deployTaskEscrow);
      expect(await taskEscrow.getAddress()).to.be.properAddress;
    });

    it("Should have initial state before initialization", async function () {
      const { taskEscrow } = await loadFixture(deployTaskEscrow);
      
      // Check that contract is not initialized yet
      expect(await taskEscrow.factory()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.taskOwner()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.taskAssignee()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.title()).to.equal("");
      expect(await taskEscrow.description()).to.equal("");
      expect(await taskEscrow.category()).to.equal("");
      expect(await taskEscrow.reward()).to.equal(0);
      expect(await taskEscrow.deadline()).to.equal(0);
      expect(await taskEscrow.isCompleted()).to.equal(false);
      expect(await taskEscrow.isDisputed()).to.equal(false);
      expect(await taskEscrow.status()).to.equal(0); // Status.OPEN
    });
  });

  describe("Initialization", function () {
    it("Should initialize correctly with valid parameters", async function () {
      const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
      const tokenAddress = await token.getAddress();

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        tokenAddress,
        reward,
        deadlineInSeconds
      );

      expect(await taskEscrow.factory()).to.equal(factory.address);
      expect(await taskEscrow.taskOwner()).to.equal(taskOwner.address);
      expect(await taskEscrow.title()).to.equal(title);
      expect(await taskEscrow.description()).to.equal(description);
      expect(await taskEscrow.category()).to.equal(category);
      expect(await taskEscrow.reward()).to.equal(reward);
      expect(await taskEscrow.deadline()).to.be.closeTo(expectedDeadline, 5); // Allow 5 seconds
      expect(await taskEscrow.status()).to.equal(0); // Status.OPEN
      expect(await taskEscrow.isCompleted()).to.equal(false);
      expect(await taskEscrow.isDisputed()).to.equal(false);
      expect(await taskEscrow.taskAssignee()).to.equal(hre.ethers.ZeroAddress);
      expect(await taskEscrow.tokenAddress()).to.equal(tokenAddress);
    });

    it("Should set deadline as current timestamp + deadline parameter", async function () {
      const { token, taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
      const tokenAddress = await token.getAddress();
      const beforeInit = await time.latest();

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        tokenAddress,
        reward,
        deadlineInSeconds
      );
      const afterInit = await time.latest();

      const contractDeadline = await taskEscrow.deadline();
      const expectedMinDeadline = beforeInit + Number(deadlineInSeconds);
      const expectedMaxDeadline = afterInit + Number(deadlineInSeconds);

      expect(contractDeadline).to.be.at.least(expectedMinDeadline);
      expect(contractDeadline).to.be.at.most(expectedMaxDeadline);
    });

    it("Should prevent double initialization", async function () {
      const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
      const tokenAddress = await token.getAddress();

      // First initialization should succeed
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        tokenAddress,
        reward,
        deadlineInSeconds
      );

      // Second initialization should fail
      await expect(
        taskEscrow.initialize(
          factory.address,
          taskOwner.address,
          title,
          description,
          category,
          tokenAddress,
          reward,
          deadlineInSeconds
        )
      ).to.be.reverted;
    });

    it("Should handle large reward values", async function () {
      const { token, taskEscrow, factory, taskOwner, expectedDeadline } = await loadFixture(deployTaskEscrow);
      const tokenAddress = await token.getAddress();
      const largeReward = hre.ethers.parseEther("1000000"); // 1 million tokens

      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        tokenAddress,
        largeReward,
        deadlineInSeconds
      );

      expect(await taskEscrow.reward()).to.equal(largeReward);
    });

    it("Should handle large deadline values", async function () {
      const { token, taskEscrow, factory, taskOwner } = await loadFixture(deployTaskEscrow);
      const tokenAddress = await token.getAddress();
      const largeDeadline = 31536000n; // 1 year in seconds

      const beforeInit = await time.latest();
      await taskEscrow.initialize(
        factory.address,
        taskOwner.address,
        title,
        description,
        category,
        tokenAddress,
        reward,
        largeDeadline
      );

      const contractDeadline = await taskEscrow.deadline();
      const expectedDeadline = beforeInit + Number(largeDeadline);
      expect(contractDeadline).to.be.closeTo(expectedDeadline, 5);
    });
  });

  describe("assignTask", function () {
    it("Should assign task successfully by task owner", async function () {
        const {  taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

        const tx = taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        
        await expect(tx)
            .to.emit(taskEscrow, "TaskAssigned")
            .withArgs(taskAssignee.address);
            
        await expect(tx)
            .to.emit(taskEscrow, "TaskStatusChanged")
            .withArgs(0, 1);  // OPEN -> ASSIGNED

        expect(await taskEscrow.taskAssignee()).to.equal(taskAssignee.address);
        expect(await taskEscrow.status()).to.equal(1); // Status.ASSIGNED
    });

    it("Should revert if called by non-task owner", async function () {
        const { taskEscrow, taskAssignee, otherAccount } = await getInitializedContract();

        await expect(
            taskEscrow.connect(otherAccount).assignTask(taskAssignee.address)
        ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert if task is already assigned", async function () {
        const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        await expect(
            taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should not allow assignment to zero address", async function () {
        const { taskEscrow, taskOwner } = await getInitializedContract();

        await expect(taskEscrow.connect(taskOwner).assignTask(hre.ethers.ZeroAddress))
            .to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_ASSIGN_TO_ADDRESS_ZERO");
    });

    it("Should prevent task owner from assigning to themselves", async function () {
        const { taskEscrow, taskOwner } = await getInitializedContract();

        await expect(taskEscrow.connect(taskOwner).assignTask(taskOwner.address))
            .to.be.revertedWithCustomError(taskEscrow, "CANNOT_ASSIGN_TO_SELF");
    });

    it("Should revert if task is completed", async function () {
        const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        await expect(
            taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should revert if task is disputed", async function () {
        const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskOwner).raiseDispute();

        await expect(
            taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should revert if task is cancelled", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
        await token.mint(await taskEscrow.getAddress(), reward * 10n);

        await taskEscrow.connect(taskOwner).cancelTask();

        await expect(
            taskEscrow.connect(taskOwner).assignTask(taskAssignee.address)
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should revert if task is paid out", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
        await token.mint(await taskEscrow.getAddress(), reward * 10n);

        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).releasePayment();

        await expect(
            taskEscrow.connect(taskOwner).assignTask(otherAccount.address)
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_ASSIGNED_OR_COMPLETED");
    });

    it("Should revert if deadline has passed", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        // Fast-forward past deadline
        await time.increase(deadlineInSeconds + 1n);
        
        await expect(
            taskEscrow.connect(taskOwner).assignTask(taskAssignee.address)
        ).to.be.revertedWithCustomError(taskEscrow, "DEADLINE_HAS_PASSED");
    });
});

  describe("submitWork", function () {
    it("Should submit work successfully by task assignee", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(taskEscrow.connect(taskAssignee).submitWork())
        .to.emit(taskEscrow, "TaskCompleted");

      expect(await taskEscrow.isCompleted()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(2); // Status.COMPLETED
    });

    it("Should revert if called by non-task assignee", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

      await expect(
        taskEscrow.connect(otherAccount).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow,"ONLY_TASK_ASSIGNEE_CAN_CALL");
    });

    it("Should revert if task is not assigned", async function () {
      const { taskEscrow, taskAssignee } = await getInitializedContract();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_ASSIGNEE_CAN_CALL");
    });

    it("Should revert if work already submitted", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_ASSIGNED");
    });

    it("Should revert if task is disputed", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
        taskEscrow.connect(taskAssignee).submitWork()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_ASSIGNED");
    });
  });

  describe("releasePayment", function () {
    it("Should release ERC20 payment to assignee", async function () {
        const { token, taskEscrow, factory, taskOwner, taskAssignee } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward * 10n);
        
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        const initialBalance = await token.balanceOf(taskAssignee.address);
        
        const tx = taskEscrow.connect(taskOwner).releasePayment();
        
        await expect(tx)
            .to.emit(taskEscrow, "FundsReleased")
            .withArgs(taskAssignee.address, reward);
            
        await expect(tx)
            .to.emit(taskEscrow, "TaskStatusChanged")
            .withArgs(2, 4);  // COMPLETED -> PAID_OUT
            
        expect(await token.balanceOf(taskAssignee.address)).to.equal(initialBalance + reward);
        expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
    });

    it("Should revert if called by non-task owner", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        await expect(
            taskEscrow.connect(otherAccount).releasePayment()
        ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
    });

    it("Should revert if task is not completed", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);

        await expect(
            taskEscrow.connect(taskOwner).releasePayment()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should revert if task is already paid out", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        
        // First release should succeed
        await taskEscrow.connect(taskOwner).releasePayment();
        
        // Second release should fail
        await expect(
            taskEscrow.connect(taskOwner).releasePayment()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_PAID_OUT");
    });

    it("Should revert if contract has insufficient funds", async function () {
        const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        // Don't fund the escrow contract
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();

        await expect(
            taskEscrow.connect(taskOwner).releasePayment()
        ).to.be.reverted;
    });

    it("Should revert if task is disputed", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
        await taskEscrow.connect(taskAssignee).submitWork();
        await taskEscrow.connect(taskOwner).raiseDispute();

        await expect(
            taskEscrow.connect(taskOwner).releasePayment()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });

    it("Should revert if task is cancelled", async function () {
        const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
        
        await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
        await taskEscrow.connect(taskOwner).cancelTask();

        await expect(
            taskEscrow.connect(taskOwner).releasePayment()
        ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
    });
});

describe("raiseDispute", function () {
  it("Should raise dispute successfully by task owner in ASSIGNED state", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(taskEscrow.connect(taskOwner).raiseDispute())
          .to.emit(taskEscrow, "DisputeRaised");
          
      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
  });

  it("Should raise dispute successfully by task assignee in ASSIGNED state", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(taskEscrow.connect(taskAssignee).raiseDispute())
          .to.emit(taskEscrow, "DisputeRaised");
          
      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
  });

  it("Should raise dispute successfully by task owner in COMPLETED state", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      await expect(taskEscrow.connect(taskOwner).raiseDispute())
          .to.emit(taskEscrow, "DisputeRaised");
          
      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
  });

  it("Should raise dispute successfully by task assignee in COMPLETED state", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      await expect(taskEscrow.connect(taskAssignee).raiseDispute())
          .to.emit(taskEscrow, "DisputeRaised");
          
      expect(await taskEscrow.isDisputed()).to.equal(true);
      expect(await taskEscrow.status()).to.equal(3); // Status.DISPUTED
  });

  it("Should revert if called by unauthorized user", async function () {
      const { taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(
          taskEscrow.connect(otherAccount).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "UNAUTHORIZED");
  });

  it("Should revert if dispute already raised", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();
      
      await expect(
          taskEscrow.connect(taskAssignee).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "DISPUTE_ALREADY_RAISED");
  });

  it("Should revert if task is already paid out", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).releasePayment();
      
      await expect(
          taskEscrow.connect(taskOwner).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_PAID_OUT");
  });

  it("Should revert if task is OPEN", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();
      
      await expect(
          taskEscrow.connect(taskOwner).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_DISPUTE");
  });

  it("Should revert if task is CANCELLED", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();
      await token.mint(await taskEscrow.getAddress(), reward * 10n);

      await taskEscrow.connect(taskOwner).cancelTask();
      
      await expect(
          taskEscrow.connect(taskOwner).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_DISPUTE");
  });

  it("Should revert if task is DISPUTED", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();
      
      await expect(
          taskEscrow.connect(taskOwner).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "DISPUTE_ALREADY_RAISED");
  });

  it("Should revert if task is PAID_OUT", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).releasePayment();
      
      await expect(
          taskEscrow.connect(taskOwner).raiseDispute()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_PAID_OUT");
  });

  it("Should emit TaskStatusChanged event", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(taskEscrow.connect(taskOwner).raiseDispute())
          .to.emit(taskEscrow, "TaskStatusChanged")
          .withArgs(1, 3);  // ASSIGNED -> DISPUTED
  });

  it("Should allow dispute after deadline in COMPLETED state", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(taskEscrow.connect(taskOwner).raiseDispute())
          .to.emit(taskEscrow, "DisputeRaised");
  });
});

describe("resolveDispute", function () {
  it("Should resolve dispute with task owner as winner", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      // Fund escrow and setup dispute
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      const initialBalance = await token.balanceOf(taskOwner.address);
      
      await expect(taskEscrow.connect(factory).resolveDispute(taskOwner.address))
          .to.emit(taskEscrow, "DisputeResolved")
          .withArgs(taskOwner.address, reward);
          
      expect(await token.balanceOf(taskOwner.address)).to.equal(initialBalance + reward);
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
  });

  it("Should resolve dispute with task assignee as winner", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).raiseDispute();

      const initialBalance = await token.balanceOf(taskAssignee.address);
      
      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);
      
      expect(await token.balanceOf(taskAssignee.address)).to.equal(initialBalance + reward);
      expect(await taskEscrow.status()).to.equal(4);
  });

  it("Should revert if called by non-factory", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
      
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
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).releasePayment();
      
      await expect(
          taskEscrow.connect(factory).resolveDispute(taskOwner.address)
      ).to.be.revertedWithCustomError(taskEscrow, "NO_ACTIVE_DISPUTE");
  });

  it("Should revert if winner is zero address", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
          taskEscrow.connect(factory).resolveDispute(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(taskEscrow, "CAN_NOT_USE_ADDRESS_ZERO");
  });

  it("Should revert if winner is not task party", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
          taskEscrow.connect(factory).resolveDispute(otherAccount.address)
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_DISPUTE_WINNER");
  });

  it("Should handle insufficient contract balance", async function () {
      const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      // Create dispute without funding contract
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(
          taskEscrow.connect(factory).resolveDispute(taskAssignee.address)
      ).to.be.reverted;
  });

  it("Should emit TaskStatusChanged event", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(taskEscrow.connect(factory).resolveDispute(taskAssignee.address))
          .to.emit(taskEscrow, "TaskStatusChanged")
          .withArgs(3, 4);  // DISPUTED -> PAID_OUT
  });

  it("Should prevent resolution after deadline", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).raiseDispute();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      // Should still be able to resolve after deadline
      await expect(taskEscrow.connect(factory).resolveDispute(taskAssignee.address))
          .to.emit(taskEscrow, "DisputeResolved");
  });

  it("Should update status to PAID_OUT", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();

      await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);
      
      expect(await taskEscrow.status()).to.equal(4);
      expect(await taskEscrow.isDisputed()).to.equal(true);
  });

  it("Should revert if dispute resolved twice", async function () {
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
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
      const { token, factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      await taskEscrow.connect(taskOwner).raiseDispute();

      await expect(taskEscrow.connect(factory).resolveDispute(taskAssignee.address))
          .to.emit(taskEscrow, "DisputeResolved");
  });
});

describe("cancelTask", function () {
  it("Should cancel task successfully by task owner", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();
      
      // Fund escrow contract
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      
      const initialBalance = await token.balanceOf(taskOwner.address);
      
      await expect(taskEscrow.connect(taskOwner).cancelTask())
          .to.emit(taskEscrow, "TaskCancelled");
          
      expect(await token.balanceOf(taskOwner.address)).to.equal(initialBalance + reward);
      expect(await taskEscrow.status()).to.equal(5); // Status.CANCELLED
  });

  it("Should revert if called by non-task owner", async function () {
      const { taskEscrow, taskAssignee } = await getInitializedContract();
      
      await expect(
          taskEscrow.connect(taskAssignee).cancelTask()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
  });

  it("Should revert if task is not OPEN", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(
          taskEscrow.connect(taskOwner).cancelTask()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_CANNOT_BE_CANCELLED");
  });

  it("Should handle insufficient contract balance", async function () {
      const { taskEscrow, taskOwner } = await getInitializedContract();
      
      // Don't fund the contract
      await expect(
          taskEscrow.connect(taskOwner).cancelTask()
      ).to.be.reverted;
  });

  it("Should emit TaskStatusChanged event", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      
      await expect(taskEscrow.connect(taskOwner).cancelTask())
          .to.emit(taskEscrow, "TaskStatusChanged")
          .withArgs(0, 5);  // OPEN -> CANCELLED
  });

  it("Should prevent cancellation after deadline", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(taskEscrow.connect(taskOwner).cancelTask())
          .to.emit(taskEscrow, "TaskCancelled");
  });
});

describe("withdrawAfterDeadline", function () {
  it("Should allow assignee to withdraw after deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      const initialBalance = await token.balanceOf(taskAssignee.address);
      
      await expect(taskEscrow.connect(taskAssignee).withdrawAfterDeadline())
          .to.emit(taskEscrow, "FundsReleased")
          .withArgs(taskAssignee.address, reward);
          
      expect(await token.balanceOf(taskAssignee.address)).to.equal(initialBalance + reward);
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
  });

  it("Should revert if called before deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      await expect(
          taskEscrow.connect(taskAssignee).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "DEADLINE_NOT_REACHED");
  });

  it("Should revert if called by non-assignee", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(otherAccount).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_ASSIGNEE_CAN_CALL");
  });

  it("Should revert if task not completed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(taskAssignee).withdrawAfterDeadline()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_NOT_COMPLETED");
  });

  it("Should revert if task disputed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
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
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(taskEscrow.connect(taskAssignee).withdrawAfterDeadline())
          .to.emit(taskEscrow, "TaskStatusChanged")
          .withArgs(2, 4);  // COMPLETED -> PAID_OUT
  });
});

describe("reclaimFunds", function () {
  it("Should allow owner to reclaim funds after deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      const initialBalance = await token.balanceOf(taskOwner.address);
      
      await expect(taskEscrow.connect(taskOwner).reclaimFunds())
          .to.emit(taskEscrow, "FundsReclaimed")
          .withArgs(taskOwner.address, reward);
          
      expect(await token.balanceOf(taskOwner.address)).to.equal(initialBalance + reward);
      expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
  });

  it("Should revert if called before deadline", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      await expect(
          taskEscrow.connect(taskOwner).reclaimFunds()
      ).to.be.revertedWithCustomError(taskEscrow, "DEADLINE_NOT_REACHED");
  });

  it("Should revert if called by non-owner", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee, otherAccount } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(otherAccount).reclaimFunds()
      ).to.be.revertedWithCustomError(taskEscrow, "ONLY_TASK_OWNER_CAN_CALL");
  });

  it("Should revert if task completed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskAssignee).submitWork();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(taskOwner).reclaimFunds()
      ).to.be.revertedWithCustomError(taskEscrow, "TASK_HAS_ALREADY_BEEN_COMPLETED");
  });

  it("Should revert if task not assigned", async function () {
      const { token, taskEscrow, taskOwner } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(taskOwner).reclaimFunds()
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_RECLAIM");
  });

  it("Should revert if task disputed", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      await taskEscrow.connect(taskOwner).raiseDispute();
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(taskOwner).reclaimFunds()
      ).to.be.revertedWithCustomError(taskEscrow, "INVALID_STATUS_FOR_RECLAIM");
  });

  it("Should emit TaskStatusChanged event", async function () {
      const { token, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      await token.connect(taskOwner).transfer(taskEscrow.getAddress(), reward);
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(taskEscrow.connect(taskOwner).reclaimFunds())
          .to.emit(taskEscrow, "TaskStatusChanged")
          .withArgs(1, 4);  // ASSIGNED -> PAID_OUT
  });

  it("Should handle insufficient contract balance", async function () {
      const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();
      
      // Create assignment without funding
      await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
      
      // Fast-forward past deadline
      await time.increase(deadlineInSeconds + 1n);
      
      await expect(
          taskEscrow.connect(taskOwner).reclaimFunds()
      ).to.be.reverted;
  });
});

  // describe("Integration Tests", function () {
  //   it("Should handle complete workflow: assign -> submit -> release", async function () {
  //     const { taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

  //     await taskOwner.sendTransaction({
  //       to: await taskEscrow.getAddress(),
  //       value: reward
  //     });

  //     await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
  //     await taskEscrow.connect(taskAssignee).submitWork();
  //     await taskEscrow.connect(taskOwner).releasePayment();

  //     expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
  //     expect(await taskEscrow.isCompleted()).to.equal(true);
  //   });

  //   it("Should handle workflow with dispute: assign -> dispute -> resolve", async function () {
  //     const { factory, taskEscrow, taskOwner, taskAssignee } = await getInitializedContract();

  //     await taskOwner.sendTransaction({
  //       to: await taskEscrow.getAddress(),
  //       value: reward
  //     });

  //     await taskEscrow.connect(taskOwner).assignTask(taskAssignee.address);
  //     await taskEscrow.connect(taskOwner).raiseDispute();
  //     await taskEscrow.connect(factory).resolveDispute(taskAssignee.address);

  //     expect(await taskEscrow.status()).to.equal(4); // Status.PAID_OUT
  //     expect(await taskEscrow.isDisputed()).to.equal(true);
  //   });
  // });
});
