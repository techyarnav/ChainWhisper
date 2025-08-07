const chalk = require('chalk');
const WalletService = require('../services/wallet');
const BlockchainService = require('../services/blockchain');
const IPFSService = require('../services/ipfs');
const EncryptionService = require('../services/encryption');
const SessionManager = require('../services/sessionManager');
const PrivacyManager = require('../services/privacyManager');
const { getNetworkConfig, validateNetworkConfig } = require('../config/networks');
const logger = require('../utils/logger');

async function replayCommand(argv, blockchainService) {
    try {
        console.log(chalk.blue('🔄 ChainWhisper - Replay Conversation\n'));


        console.log(chalk.blue('🔐 Connecting wallet...'));
        const walletService = new WalletService(argv.network ? getNetworkConfig(argv.network) : getNetworkConfig('sepolia-scroll'));
        const walletInfo = await walletService.connect();
        displayWalletInfo(walletInfo, argv.network || 'sepolia-scroll');


        const networkConfig = getNetworkConfig(argv.network || 'sepolia-scroll');
        const blockchainServiceInstance = blockchainService || new BlockchainService(walletService.getWallet(), networkConfig);
        const sessionManager = new SessionManager(blockchainServiceInstance, walletService.getWallet());
        const ipfsService = new IPFSService();
        const privacyManager = new PrivacyManager();


        const targetAddress = argv.address || argv.replay;

        console.log(chalk.blue(`📚 Fetching conversation with ${targetAddress.substring(0, 8)}...${targetAddress.substring(targetAddress.length - 4)}...\n`));


        console.log(chalk.blue('📨 Checking main contract messages...'));
        let standardMessages = [];
        try {
            standardMessages = await blockchainServiceInstance.getConversationMessages(targetAddress);
            console.log(chalk.gray(`   Found ${standardMessages.length} messages in main contract`));
        } catch (error) {
            console.log(chalk.yellow(`   ⚠️  Standard messages unavailable: ${error.message}`));
        }


        console.log(chalk.blue('🔒 Checking private session messages...'));
        let sessionMessages = [];
        try {
            sessionMessages = await sessionManager.getMessages(targetAddress);
            console.log(chalk.gray(`   Found ${sessionMessages.length} messages in sessions`));
        } catch (error) {
            console.log(chalk.yellow(`   ⚠️  Session messages unavailable: ${error.message.split('\n')[0]}`));
        }


        const allMessages = [...standardMessages, ...sessionMessages];
        allMessages.sort((a, b) => a.timestamp - b.timestamp);

        if (allMessages.length === 0) {
            console.log(chalk.yellow('\n💬 No messages found in this conversation'));
            console.log(chalk.gray(`   Start a conversation with:`));
            console.log(chalk.white(`   npm run start -- --to ${targetAddress} --message "Hello!"`));
            return;
        }

        console.log(chalk.green(`\n📬 Found ${allMessages.length} messages total\n`));
        console.log(chalk.blue('═'.repeat(80)));
        console.log(chalk.cyan.bold('                CONVERSATION HISTORY'));
        console.log(chalk.blue('═'.repeat(80)));


        let displayedCount = 0;
        let failedCount = 0;
        const currentTime = Math.floor(Date.now() / 1000);

        for (const [index, message] of allMessages.entries()) {
            try {

                const isExpired = message.expiry && message.expiry > 0 &&
                    currentTime > message.expiry;

                if (isExpired) {
                    console.log(chalk.gray(`\n[${index + 1}] ⏰ [EXPIRED] Message from ${new Date(message.timestamp * 1000).toLocaleString()}`));
                    console.log(chalk.red('   [Content hidden - message has expired]'));
                    continue;
                }


                let decryptedContent = null;
                let isMediaMessage = false;

                try {

                    if (message.cid && !message.cid.startsWith('QmChainWhisper')) {

                        const mediaType = message.messageType || 'file';
                        decryptedContent = `[Media: ${mediaType}] ${message.cid}`;
                        isMediaMessage = true;
                        console.log(chalk.blue(`📎 IPFS Gateway: https://ipfs.io/ipfs/${message.cid}`));
                    } else {

                        const encryptedContent = await ipfsService.downloadContent(message.cid);
                        decryptedContent = await EncryptionService.decryptFromSender(
                            encryptedContent,
                            process.env.PRIVATE_KEY,
                            message.from
                        );
                    }
                } catch (decryptError) {
                    console.log(chalk.red(`\n[${index + 1}] ❌ Failed to decrypt message from ${message.from.substring(0, 8)}...`));
                    console.log(chalk.gray(`   CID: ${message.cid.substring(0, 20)}...`));
                    console.log(chalk.gray(`   Error: ${decryptError.message.split('\n')[0]}`));
                    failedCount++;
                    continue;
                }


                const isFromMe = message.from.toLowerCase() === walletInfo.address.toLowerCase();
                const senderLabel = isFromMe ? 'You' : 'Them';
                const senderColor = isFromMe ? chalk.cyan : chalk.green;
                const messageDate = new Date(message.timestamp * 1000).toLocaleString();
                const source = message.source === 'session' ? '🔒' : '📨';

                console.log(`\n[${index + 1}] ${source} ${senderColor(senderLabel)} (${messageDate}):`);


                if (isMediaMessage) {
                    console.log(chalk.white(`   ${decryptedContent}`));
                    console.log(chalk.gray(`   📂 Click link above to view media content`));
                } else {
                    console.log(chalk.white(`   ${decryptedContent}`));
                }


                if (message.expiry > 0) {
                    const expiryDate = new Date(message.expiry * 1000).toLocaleString();
                    const timeLeft = message.expiry - currentTime;
                    if (timeLeft > 0) {
                        const hours = Math.floor(timeLeft / 3600);
                        const minutes = Math.floor((timeLeft % 3600) / 60);
                        console.log(chalk.yellow(`   ⏰ Expires: ${expiryDate} (${hours}h ${minutes}m left)`));
                    }
                }

                displayedCount++;

            } catch (messageError) {
                console.log(chalk.red(`\n[${index + 1}] ❌ Message processing error`));
                console.log(chalk.gray(`   Error: ${messageError.message.split('\n')[0]}`));
                failedCount++;
            }
        }

        console.log(chalk.blue('\n═'.repeat(80)));
        console.log(chalk.green(`📊 Summary:`));
        console.log(chalk.gray(`   Total messages found: ${allMessages.length}`));
        console.log(chalk.gray(`   Successfully displayed: ${displayedCount}`));
        if (failedCount > 0) {
            console.log(chalk.yellow(`   Failed to decrypt: ${failedCount}`));
        }


        logger.info('Conversation replayed successfully', {
            otherParty: targetAddress,
            totalMessages: allMessages.length,
            displayedMessages: displayedCount,
            failedMessages: failedCount
        });

    } catch (error) {
        console.error(chalk.red('\n❌ Replay failed:'), error.message);
        logger.error('Replay command failed', error);
        throw error;
    }
}


function displayWalletInfo(walletInfo, networkName) {
    console.log(chalk.green(`✅ Connected: ${walletInfo.address}`));
    console.log(chalk.gray(`💰 Balance: ${walletInfo.balance} ETH\n`));
}

module.exports = { replayCommand };
