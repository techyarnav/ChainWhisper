const chalk = require('chalk');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

class BlockchainService {
    constructor(wallet, networkConfig) {
        this.wallet = wallet;
        this.provider = wallet.provider;
        this.networkConfig = networkConfig;


        this.chatContractAddress = networkConfig.contracts.chatContract;
        this.factoryContractAddress = networkConfig.contracts.factoryContract;


        this.chatContract = this.initializeChatContract();
        this.factoryContract = this.initializeFactoryContract();
    }

    initializeChatContract() {
        const chatABI = [
            "function sendMessage(address to, string calldata cid, uint256 expiry, bool isMedia, string calldata messageType) external returns (uint256 messageId)",
            "function getUserMessages(address user) external view returns (uint256[] memory)",
            "function getMessage(uint256 messageId) external view returns (tuple(address from, address to, string cid, uint256 timestamp, uint256 expiry, bool isMedia, string messageType, bytes32 conversationHash))",
            "function getConversationMessages(bytes32 conversationHash) external view returns (uint256[] memory)",
            "function generateConversationHash(address user1, address user2) public pure returns (bytes32)",
            "function isExpired(uint256 messageId) external view returns (bool)",
            "event MessageSent(address indexed from, address indexed to, string cid, uint256 timestamp, uint256 expiry, uint256 messageId, bytes32 indexed conversationHash)"
        ];

        return new ethers.Contract(this.chatContractAddress, chatABI, this.wallet);
    }

    initializeFactoryContract() {
        const factoryABI = [
            "function createChatSession(address participant) external returns (address sessionContract, bytes32 sessionId)",
            "function getSessionBetween(address user1, address user2) external view returns (bytes32 sessionId, address contractAddr, bool isActive)",
            "function getUserSessions(address user) external view returns (bytes32[] memory)",
            "event ChatSessionCreated(address indexed sessionContract, address indexed initiator, address indexed participant, bytes32 sessionId, uint256 timestamp)"
        ];

        return new ethers.Contract(this.factoryContractAddress, factoryABI, this.wallet);
    }


    displayFundingInstructions(walletAddress, requiredGas, currentBalance) {
        console.log(chalk.red('\n💸 Insufficient Funds!'));
        console.log(chalk.gray('═'.repeat(60)));
        console.log(chalk.yellow(`📍 Wallet Address: ${walletAddress}`));
        console.log(chalk.red(`💰 Current Balance: ${currentBalance} ETH`));
        console.log(chalk.yellow(`⛽ Required Gas Cost: ~${ethers.formatEther(requiredGas * 20000000000n)} ETH`));

        console.log(chalk.blue('\n🚰 Get Free Sepolia Scroll Testnet ETH from these faucets:'));
        console.log(chalk.white('1. 🔗 Sepolia Scroll Official Faucet:'));
        console.log(chalk.cyan('   https://sepolia.scroll.io/'));

        console.log(chalk.white('\n2. 🔗 Alchemy Sepolia Faucet (requires account):'));
        console.log(chalk.cyan('   https://sepoliafaucet.com/'));

        console.log(chalk.white('\n3. 🔗 Chainlink Sepolia Faucet:'));
        console.log(chalk.cyan('   https://faucets.chain.link/sepolia'));

        console.log(chalk.white('\n4. 🔗 QuickNode Sepolia Faucet:'));
        console.log(chalk.cyan('   https://faucet.quicknode.com/ethereum/sepolia'));

        console.log(chalk.blue('\n📋 Instructions:'));
        console.log(chalk.gray('1. Copy your wallet address above'));
        console.log(chalk.gray('2. Visit any faucet link'));
        console.log(chalk.gray('3. Paste your address and request testnet ETH'));
        console.log(chalk.gray('4. Wait 1-2 minutes for funds to arrive'));
        console.log(chalk.gray('5. Retry your ChainWhisper command'));

        console.log(chalk.yellow('\n⏳ Pro tip: You only need ~0.01 ETH for several messages!'));
        console.log(chalk.gray('═'.repeat(60)));
    }


    async checkSufficientBalance(estimatedGas) {
        try {
            const balance = await this.provider.getBalance(this.wallet.address);
            const balanceEth = ethers.formatEther(balance);
            const requiredGas = estimatedGas * 120n / 100n;
            const gasPrice = await this.provider.getFeeData();
            const totalCost = requiredGas * gasPrice.gasPrice;

            if (balance < totalCost) {
                this.displayFundingInstructions(this.wallet.address, requiredGas, balanceEth);
                throw new Error(`Insufficient funds. Need ${ethers.formatEther(totalCost)} ETH, have ${balanceEth} ETH`);
            }

            return true;
        } catch (error) {
            if (error.message.includes('Insufficient funds')) {
                throw error;
            }
            console.error(chalk.red('❌ Balance check failed:'), error.message);
            throw error;
        }
    }


    async sendMessageWithMedia(to, encryptedContent, expiry = 0, messageType = 'text') {
        try {
            console.log(chalk.blue('📤 Sending message to main contract...'));


            const gasEstimate = await this.chatContract.sendMessage.estimateGas(
                to,
                encryptedContent,
                expiry,
                false,
                messageType
            );

            console.log(chalk.gray(`⛽ Estimated gas: ${gasEstimate}`));


            await this.checkSufficientBalance(gasEstimate);


            const tx = await this.chatContract.sendMessage(
                to,
                encryptedContent,
                expiry,
                false,
                messageType,
                { gasLimit: gasEstimate * 120n / 100n }
            );

            console.log(chalk.yellow(`📡 Transaction sent: ${tx.hash}`));
            console.log(chalk.yellow('⏳ Waiting for confirmation...'));

            const receipt = await tx.wait();

            if (receipt.status === 0) {
                throw new Error('Transaction failed');
            }

            console.log(chalk.green('✅ Message sent to blockchain successfully!'));


            const messageEvent = receipt.logs.find(log => {
                try {
                    const parsed = this.chatContract.interface.parseLog(log);
                    return parsed.name === 'MessageSent';
                } catch (e) {
                    return false;
                }
            });

            let messageId = null;
            if (messageEvent) {
                const parsed = this.chatContract.interface.parseLog(messageEvent);
                messageId = parsed.args.messageId.toString();
            }

            return {
                transactionHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                messageId,
                blockNumber: receipt.blockNumber
            };

        } catch (error) {
            if (error.code === 'INSUFFICIENT_FUNDS' || error.message.includes('insufficient funds')) {

                const balance = await this.provider.getBalance(this.wallet.address);
                const balanceEth = ethers.formatEther(balance);
                this.displayFundingInstructions(this.wallet.address, 400000n, balanceEth);
            }

            console.error(chalk.red('❌ Blockchain send failed:'), error.message);
            logger.error('Blockchain send failed', error);
            throw error;
        }
    }


    async sendSessionMessage(sessionAddress, encryptedContent, expiry = 0, isMedia = false, messageType = 'text') {
        try {
            console.log(chalk.blue('📤 Sending message to private session...'));

            const sessionABI = [
                "function sendMessage(string calldata cid, uint256 expiry, bool isMedia, string calldata messageType) external",
                "event MessageSent(address indexed from, string cid, uint256 timestamp, uint256 expiry, uint256 messageIndex, bool isMedia, string messageType)"
            ];

            const sessionContract = new ethers.Contract(sessionAddress, sessionABI, this.wallet);


            const gasEstimate = await sessionContract.sendMessage.estimateGas(
                encryptedContent,
                expiry,
                isMedia,
                messageType
            );

            console.log(chalk.gray(`⛽ Estimated gas: ${gasEstimate}`));


            await this.checkSufficientBalance(gasEstimate);


            const tx = await sessionContract.sendMessage(
                encryptedContent,
                expiry,
                isMedia,
                messageType,
                { gasLimit: gasEstimate * 120n / 100n }
            );

            console.log(chalk.yellow(`📡 Transaction sent: ${tx.hash}`));
            console.log(chalk.yellow('⏳ Waiting for confirmation...'));

            const receipt = await tx.wait();

            if (receipt.status === 0) {
                throw new Error('Session transaction failed');
            }

            console.log(chalk.green('✅ Session message sent successfully!'));

            return {
                transactionHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                sessionAddress,
                blockNumber: receipt.blockNumber
            };

        } catch (error) {
            if (error.code === 'INSUFFICIENT_FUNDS' || error.message.includes('insufficient funds')) {

                const balance = await this.provider.getBalance(this.wallet.address);
                const balanceEth = ethers.formatEther(balance);
                this.displayFundingInstructions(this.wallet.address, 50000n, balanceEth);
            }

            console.error(chalk.red('❌ Session send failed:'), error.message);
            logger.error('Session send failed', error);
            throw error;
        }
    }


    async getConversationMessages(otherAddress) {
        try {
            const conversationHash = await this.chatContract.generateConversationHash(
                this.wallet.address,
                otherAddress
            );

            const messageIds = await this.chatContract.getConversationMessages(conversationHash);

            const messages = [];
            for (const messageId of messageIds) {
                try {
                    const messageData = await this.chatContract.getMessage(messageId);
                    messages.push( {
                        messageId: messageId.toString(),
                        from: messageData.from,
                        to: messageData.to,
                        cid: messageData.cid,
                        timestamp: Number(messageData.timestamp),
                        expiry: Number(messageData.expiry),
                        isMedia: messageData.isMedia,
                        messageType: messageData.messageType,
                        conversationHash: messageData.conversationHash,
                        source: 'main'
                    });
                } catch (msgError) {
                    logger.warn(`Failed to fetch message ${messageId}: ${msgError.message}`);
                }
            }

            return messages;

        } catch (error) {
            console.error(chalk.red('❌ Failed to get conversation messages:'), error.message);
            throw error;
        }
    }


    async getSessionMessages(sessionAddress, fromBlock = 0) {
        try {
            const sessionABI = [
                "event MessageSent(address indexed from, string cid, uint256 timestamp, uint256 expiry, uint256 messageIndex, bool isMedia, string messageType)"
            ];

            const sessionContract = new ethers.Contract(sessionAddress, sessionABI, this.provider);

            const filter = sessionContract.filters.MessageSent();
            const events = await sessionContract.queryFilter(filter, fromBlock);

            const messages = events.map((event, index) => ( {
                messageId: event.args.messageIndex.toString(),
                from: event.args.from,
                to: null,
                cid: event.args.cid,
                timestamp: Number(event.args.timestamp),
                expiry: Number(event.args.expiry),
                isMedia: event.args.isMedia,
                messageType: event.args.messageType,
                source: 'session',
                sessionAddress,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash
            }));

            return messages;

        } catch (error) {
            console.error(chalk.red('❌ Failed to get session messages:'), error.message);
            throw error;
        }
    }


    async getBalance() {
        try {
            const balance = await this.provider.getBalance(this.wallet.address);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error(chalk.red('❌ Failed to get balance:'), error.message);
            throw error;
        }
    }


    async getNetworkInfo() {
        try {
            const network = await this.provider.getNetwork();
            const blockNumber = await this.provider.getBlockNumber();

            return {
                name: this.networkConfig.name,
                chainId: Number(network.chainId),
                blockNumber,
                rpcUrl: this.networkConfig.rpcUrl
            };
        } catch (error) {
            console.error(chalk.red('❌ Failed to get network info:'), error.message);
            throw error;
        }
    }
}

module.exports = BlockchainService;
