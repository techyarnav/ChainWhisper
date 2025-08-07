const { ethers } = require('hardhat');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function main() {
    console.log(chalk.cyan.bold('\n🚀 ChainWhisper Production Deployment to Sepolia Scroll\n'));

    try {

        const [deployer] = await ethers.getSigners();
        const network = await ethers.provider.getNetwork();

        console.log(chalk.blue('📋 Deployment Information:'));
        console.log(chalk.gray(`   Deployer: ${deployer.address}`));
        console.log(chalk.gray(`   Network: ${network.name} (Chain ID: ${network.chainId})`));

        const balance = await ethers.provider.getBalance(deployer.address);
        console.log(chalk.gray(`   Balance: ${ethers.formatEther(balance)} ETH\n`));


        if (network.chainId !== 534351n) {
            throw new Error(`Wrong network! Expected Sepolia Scroll (534351), got ${network.chainId}`);
        }


        const estimatedCost = ethers.parseUnits('0.002', 'ether');
        if (balance < estimatedCost) {
            console.log(chalk.red('❌ Insufficient balance for deployment'));
            console.log(chalk.yellow(`   Required: ~${ethers.formatEther(estimatedCost)} ETH`));
            console.log(chalk.yellow(`   Available: ${ethers.formatEther(balance)} ETH`));
            console.log(chalk.blue('\n💡 Get more testnet ETH from:'));
            console.log(chalk.white('   • https://scroll.io/portal'));
            console.log(chalk.white('   • https://faucet.quicknode.com/scroll/sepolia'));
            process.exit(1);
        }

        const deploymentResults = {};
        const deploymentTimestamp = new Date().toISOString();


        // const gasPrice = await ethers.provider.getGasPrice();
        const feeData = await ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        const adjustedGasPrice = gasPrice * 110n / 100n;

        console.log(chalk.blue('⛽ Gas Configuration:'));
        console.log(chalk.gray(`   Network gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`));
        console.log(chalk.gray(`   Adjusted gas price: ${ethers.formatUnits(adjustedGasPrice, 'gwei')} Gwei\n`));


        console.log(chalk.blue('📨 Deploying Main ChatContract...'));

        const ChatContract = await ethers.getContractFactory('ChatContract');

        const chatDeploymentOptions = {
            gasLimit: 1440000,
            gasPrice: adjustedGasPrice
        };

        console.log(chalk.gray(`   Gas limit: ${chatDeploymentOptions.gasLimit}`));
        console.log(chalk.gray(`   Estimated cost: ${ethers.formatEther(BigInt(chatDeploymentOptions.gasLimit) * chatDeploymentOptions.gasPrice)} ETH`));

        const chatContract = await ChatContract.deploy(chatDeploymentOptions);

        console.log(chalk.yellow(`   Transaction hash: ${chatContract.deploymentTransaction().hash}`));
        console.log(chalk.yellow('   Waiting for confirmation...'));

        await chatContract.waitForDeployment();
        const chatAddress = await chatContract.getAddress();

        const chatReceipt = await chatContract.deploymentTransaction().wait();
        console.log(chalk.green(`✅ ChatContract deployed successfully!`));
        console.log(chalk.gray(`   Address: ${chatAddress}`));
        console.log(chalk.gray(`   Gas used: ${chatReceipt.gasUsed}`));
        console.log(chalk.gray(`   Cost: ${ethers.formatEther(chatReceipt.gasUsed * chatReceipt.gasPrice)} ETH\n`));

        deploymentResults.chatContract = {
            address: chatAddress,
            transactionHash: chatContract.deploymentTransaction().hash,
            gasUsed: chatReceipt.gasUsed.toString(),
            gasPrice: chatReceipt.gasPrice.toString(),
            cost: ethers.formatEther(chatReceipt.gasUsed * chatReceipt.gasPrice)
        };


        console.log(chalk.blue('🏭 Deploying ChatFactory (includes ChatSession)...'));

        const FactoryContract = await ethers.getContractFactory('ChatFactory');

        const factoryDeploymentOptions = {
            gasLimit: 2160000,
            gasPrice: adjustedGasPrice
        };

        console.log(chalk.gray(`   Gas limit: ${factoryDeploymentOptions.gasLimit}`));
        console.log(chalk.gray(`   Estimated cost: ${ethers.formatEther(BigInt(factoryDeploymentOptions.gasLimit) * factoryDeploymentOptions.gasPrice)} ETH`));

        const factoryContract = await FactoryContract.deploy(factoryDeploymentOptions);

        console.log(chalk.yellow(`   Transaction hash: ${factoryContract.deploymentTransaction().hash}`));
        console.log(chalk.yellow('   Waiting for confirmation...'));

        await factoryContract.waitForDeployment();
        const factoryAddress = await factoryContract.getAddress();

        const factoryReceipt = await factoryContract.deploymentTransaction().wait();
        console.log(chalk.green(`✅ ChatFactory deployed successfully!`));
        console.log(chalk.gray(`   Address: ${factoryAddress}`));
        console.log(chalk.gray(`   Gas used: ${factoryReceipt.gasUsed}`));
        console.log(chalk.gray(`   Cost: ${ethers.formatEther(factoryReceipt.gasUsed * factoryReceipt.gasPrice)} ETH\n`));

        deploymentResults.chatFactory = {
            address: factoryAddress,
            transactionHash: factoryContract.deploymentTransaction().hash,
            gasUsed: factoryReceipt.gasUsed.toString(),
            gasPrice: factoryReceipt.gasPrice.toString(),
            cost: ethers.formatEther(factoryReceipt.gasUsed * factoryReceipt.gasPrice)
        };


        console.log(chalk.blue('🔍 Verifying contract functionality...'));


        const stats = await chatContract.getStats();
        console.log(chalk.green(`✅ ChatContract functional - total messages: ${stats.totalMessages}`));


        const factoryStats = await factoryContract.getFactoryStats();
        console.log(chalk.green(`✅ ChatFactory functional - sessions: ${factoryStats.total}/${factoryStats.active}`));


        const totalGasUsed = BigInt(deploymentResults.chatContract.gasUsed) +
                            BigInt(deploymentResults.chatFactory.gasUsed);
        const avgGasPrice = (BigInt(deploymentResults.chatContract.gasPrice) +
                           BigInt(deploymentResults.chatFactory.gasPrice)) / 2n;
        const totalCost = totalGasUsed * avgGasPrice;


        const deploymentArtifact = {
            timestamp: deploymentTimestamp,
            network: {
                name: network.name,
                chainId: network.chainId.toString(),
                rpcUrl: process.env.SCROLL_SEPOLIA_RPC
            },
            deployer: {
                address: deployer.address,
                balanceBefore: ethers.formatEther(balance),
                balanceAfter: ethers.formatEther(await ethers.provider.getBalance(deployer.address))
            },
            contracts: deploymentResults,
            costs: {
                totalGasUsed: totalGasUsed.toString(),
                averageGasPrice: avgGasPrice.toString(),
                totalCost: totalCost.toString(),
                totalCostETH: ethers.formatEther(totalCost),
                chatContractCost: deploymentResults.chatContract.cost,
                factoryCost: deploymentResults.chatFactory.cost
            },
            explorer: {
                chatContract: `https://sepolia.scrollscan.dev/address/${chatAddress}`,
                chatFactory: `https://sepolia.scrollscan.dev/address/${factoryAddress}`,
                chatContractTx: `https://sepolia.scrollscan.dev/tx/${deploymentResults.chatContract.transactionHash}`,
                factoryTx: `https://sepolia.scrollscan.dev/tx/${deploymentResults.chatFactory.transactionHash}`
            },
            configuration: {
                gasLimits: {
                    chatContract: chatDeploymentOptions.gasLimit,
                    chatFactory: factoryDeploymentOptions.gasLimit
                },
                gasPrice: ethers.formatUnits(adjustedGasPrice, 'gwei') + ' Gwei'
            }
        };


        const deploymentDir = path.join(process.cwd(), 'deployments');
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }

        const artifactPath = path.join(deploymentDir, `sepolia-scroll-${Date.now()}.json`);
        fs.writeFileSync(artifactPath, JSON.stringify(deploymentArtifact, null, 2));


        console.log(chalk.blue('📝 Updating configuration files...'));
        await updateConfigFiles(chatAddress, factoryAddress);
        console.log(chalk.green(`✅ Configuration files updated`));


        console.log(chalk.green.bold('\n🎉 Deployment Complete!\n'));

        console.log(chalk.blue('📊 Deployment Summary:'));
        console.log(chalk.white(`   ChatContract: ${chatAddress}`));
        console.log(chalk.white(`   ChatFactory: ${factoryAddress}`));
        console.log(chalk.gray(`   Total Gas Used: ${deploymentArtifact.costs.totalGasUsed}`));
        console.log(chalk.gray(`   Total Cost: ${deploymentArtifact.costs.totalCostETH} ETH`));
        console.log(chalk.gray(`   Average Gas Price: ${deploymentArtifact.configuration.gasPrice}`));

        console.log(chalk.blue('\n🔗 Block Explorer Links:'));
        console.log(chalk.white(`   ChatContract: ${deploymentArtifact.explorer.chatContract}`));
        console.log(chalk.white(`   ChatFactory: ${deploymentArtifact.explorer.chatFactory}`));
        console.log(chalk.white(`   Chat Tx: ${deploymentArtifact.explorer.chatContractTx}`));
        console.log(chalk.white(`   Factory Tx: ${deploymentArtifact.explorer.factoryTx}`));


        console.log(chalk.gray(`\n💾 Deployment artifact saved to: ${artifactPath}`));

    } catch (error) {
        console.error(chalk.red('\n❌ Deployment failed:'), error.message);

        if (error.message.includes('insufficient funds')) {
            console.log(chalk.yellow('\n💡 Solutions:'));
            console.log(chalk.gray('   • Get more testnet ETH from Scroll Sepolia faucet'));
            console.log(chalk.gray('   • Reduce gas limits in deployment script'));
        }

        if (error.message.includes('gas')) {
            console.log(chalk.yellow('\n💡 Gas Issues:'));
            console.log(chalk.gray('   • Try increasing gas limit'));
            console.log(chalk.gray('   • Check network congestion'));
        }

        process.exit(1);
    }
}

async function updateConfigFiles(chatAddress, factoryAddress) {

    const networkConfigPath = path.join(process.cwd(), 'src/config/networks.js');

    if (fs.existsSync(networkConfigPath)) {
        let configContent = fs.readFileSync(networkConfigPath, 'utf8');

        configContent = configContent.replace(
            /chatContract:\s*['"`]0x[a-fA-F0-9]{40}['"`]/,
            `chatContract: '${chatAddress}'`
        );
        configContent = configContent.replace(
            /factoryContract:\s*['"`]0x[a-fA-F0-9]{40}['"`]/,
            `factoryContract: '${factoryAddress}'`
        );

        fs.writeFileSync(networkConfigPath, configContent);
        console.log(chalk.green(`✅ Updated: ${networkConfigPath}`));
    }


    const envFiles = ['.env', '.env.example'];

    envFiles.forEach(envFile => {
        const envPath = path.join(process.cwd(), envFile);
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('MAIN_CONTRACT_ADDRESS=')) {
                envContent = envContent.replace(
                    /MAIN_CONTRACT_ADDRESS=.*/,
                    `MAIN_CONTRACT_ADDRESS=${chatAddress}`
                );
            } else {
                envContent += `\nMAIN_CONTRACT_ADDRESS=${chatAddress}`;
            }

            if (envContent.includes('FACTORY_CONTRACT_ADDRESS=')) {
                envContent = envContent.replace(
                    /FACTORY_CONTRACT_ADDRESS=.*/,
                    `FACTORY_CONTRACT_ADDRESS=${factoryAddress}`
                );
            } else {
                envContent += `\nFACTORY_CONTRACT_ADDRESS=${factoryAddress}`;
            }

            fs.writeFileSync(envPath, envContent);
            console.log(chalk.green(`✅ Updated: ${envPath}`));
        }
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
