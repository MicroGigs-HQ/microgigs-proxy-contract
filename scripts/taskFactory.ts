const { ethers, upgrades } = require("hardhat");

async function main() {
  // Deploy the TaskEscrow logic contract (used for cloning)
  const TaskEscrow = await ethers.getContractFactory("TaskEscrow");
  const taskEscrowImpl = await TaskEscrow.deploy();
  await taskEscrowImpl.waitForDeployment();
  console.log("TaskEscrow Implementation deployed at:", await taskEscrowImpl.getAddress());

  // Deploy the TaskFactory as an upgradeable proxy
  const TaskFactory = await ethers.getContractFactory("TaskFactory");
  const factoryProxy = await upgrades.deployProxy(TaskFactory, [await taskEscrowImpl.getAddress()], {
    initializer: "initialize",
  });
  await factoryProxy.waitForDeployment();
  console.log("TaskFactory proxy deployed at:", await factoryProxy.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});