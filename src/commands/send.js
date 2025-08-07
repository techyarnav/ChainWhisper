
const chalk = require('chalk');
const EncryptionService = require('../services/encryption');
const IPFSService = require('../services/ipfs');

async function sendCommand(options, blockchainService) {
    try {
        const { to, message, expiry = 0, media, session } = options;

        console.log(chalk.blue('\n🚀 ChainWhisper - Send Message\n'));


        if (!to || !message) {
            throw new Error('Recipient address and message are required');
        }


        console.log(chalk.blue('🔐 Connecting wallet...'));
        await blockchainService.connect();


        console.log(chalk.blue('\n🔐 Encrypting message...'));
        const encryptedMessage = await EncryptionService.encryptForRecipient(
            message,
            blockchainService.privateKey,
            to
        );


        console.log(chalk.blue('📤 Uploading to IPFS...'));
        const ipfsService = new IPFSService();
        const cid = await ipfsService.uploadEncryptedContent(encryptedMessage);


        let result;
        if (session) {
            console.log(chalk.blue('📨 Sending via private session...'));
            result = await blockchainService.sendSessionMessage(to, cid, expiry);
        } else {
            console.log(chalk.blue('📨 Sending message...'));
            result = await blockchainService.sendMessage(to, cid, false, expiry);
        }


        if (!cid.startsWith('QmChainWhisper')) {
            console.log(chalk.gray(`📎 IPFS: ${cid}`));
        }

        return {
            success: true,
            transactionHash: result.transactionHash,
            messageId: result.messageId,
            recipient: to,
            mode: session ? 'session' : 'standard'
        };

    } catch (error) {
        console.error(chalk.red('❌ Send failed:'), error.message);
        throw error;
    }
}

module.exports = { sendCommand };
