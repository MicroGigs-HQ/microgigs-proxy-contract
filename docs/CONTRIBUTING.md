# Contributing

Thank you for your interest in contributing to this project! We welcome contributions from the community and appreciate your help in making this project better.

## Getting Started

1. **Fork and Clone**
   - Fork the repository on GitHub
   - Clone your fork locally:
     ```bash
     git clone https://github.com/MicroGigs-HQ/microgigs-proxy-contract.git
     cd microgigs-proxy-contract
     ```

2. **Install Dependencies**
   - Install project dependencies (e.g., for Hardhat projects):
     ```bash
     npm install
     ```

3. **Environment Setup**
   - Create a `.env` file with required environment variables
   - Include RPC URLs, private keys, and other configuration as needed

4. **Verify Setup**
   - Compile contracts:
     ```bash
     npx hardhat compile
     ```
   - Run tests:
     ```bash
     npx hardhat test
     ```
   - Run security analysis tools:
     ```bash
     # Install Slither (static analysis)
     pip install slither-analyzer
     slither .
     
     # Install Mythril (symbolic execution)
     pip install mythril
     myth analyze contracts/YourContract.sol
     
     # Run prettier (if configured)
     npx prettier --check .
     ```

## Security Analysis Tools

We use static analysis and symbolic execution tools to identify security vulnerabilities:

### Slither
Slither is a static analysis framework that identifies common vulnerabilities:
```bash
# Install Slither
pip install slither-analyzer

# Run analysis on the entire project
slither .

# Run analysis on specific contracts
slither contracts/YourContract.sol
```

### Mythril
Mythril performs symbolic execution to find deeper security issues:
```bash
# Install Mythril
pip install mythril

# Analyze a specific contract
myth analyze contracts/YourContract.sol

# Run with increased depth for thorough analysis
myth analyze contracts/YourContract.sol --max-depth 10
```

**Important:** Always address security issues found by these tools before submitting your pull request. If you believe a finding is a false positive, document your reasoning in the PR description.

## Making Changes

1. **Create a Branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Development Guidelines**
   - Keep pull requests small and focused on one improvement or bug fix
   - Write or update tests for your changes
   - Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
   - Ensure your code passes all existing tests
   - Run security analysis tools to identify potential vulnerabilities

3. **Code Style and Security**
   - Run security analysis tools before committing
   - Follow project conventions and style guidelines
   - Write clear, self-documenting code with appropriate comments
   - Address any security vulnerabilities identified by Slither or Mythril

## Submitting Changes

1. **Commit Your Changes**
   ```bash
   git commit -m "feat: add new staking mechanism"
   ```
   Use clear, descriptive commit messages following conventional commit format when possible.

2. **Push Your Branch**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Open a Pull Request**
   - Create a pull request against the `main` branch
   - Provide a clear description of:
     - What the change is
     - Why it's needed
     - How it was implemented
   - Reference related issues (e.g., "Closes #12")
   - Ensure all tests pass

## Reporting Issues

If you encounter any problems or have suggestions for improvements:

1. **Check Existing Issues**
   - Search existing issues to avoid duplicates

2. **Create a New Issue**
   - Provide a clear description of the problem
   - Include steps to reproduce the issue
   - Add relevant labels and context

3. **Feature Requests**
   - Suggestions for improvements are welcome
   - Describe the feature and its potential benefits
   - Discuss implementation approaches if applicable

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to maintain a welcoming environment for all contributors.

## Questions?

If you have questions about contributing, feel free to open an issue or reach out to the maintainers.

Thanks for contributing to this project!