const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const WalletService = require('../services/wallet');
const BlockchainService = require('../services/blockchain');
const SessionManager = require('../services/sessionManager');
const { getNetworkConfig, validateNetworkConfig } = require('../config/networks');
const logger = require('../utils/logger');

async function savedCommand(argv) {
    try {
        console.log(chalk.cyan('💾 ChainWhisper - Export Chat History\n'));


        const supportedFormats = ['json', 'md', 'txt'];
        if (!supportedFormats.includes(argv.saved)) {
            throw new Error(`Unsupported format: ${argv.saved}. Supported: ${supportedFormats.join(', ')}`);
        }


        const networkConfig = getNetworkConfig(argv.network);
        validateNetworkConfig(networkConfig);

        const walletService = new WalletService(networkConfig);
        const walletInfo = await walletService.connect();

        const blockchainService = new BlockchainService(walletService.getWallet(), networkConfig);
        const sessionManager = new SessionManager(blockchainService, walletService.getWallet());

        console.log(chalk.blue('📥 Gathering all conversation data...'));


        const userMessages = await blockchainService.chatContract.getUserMessages(walletInfo.address);
        console.log(chalk.gray(`   Main contract messages: ${userMessages.length}`));


        const sessions = await sessionManager.getUserSessions();
        console.log(chalk.gray(`   Private sessions: ${sessions.length}`));


        const conversationPartners = new Set();


        const mainConversations = new Map();
        for (const messageId of userMessages) {
            try {
                const messageData = await blockchainService.chatContract.getMessage(messageId);
                const otherParty = messageData.from.toLowerCase() === walletInfo.address.toLowerCase()
                    ? messageData.to
                    : messageData.from;

                conversationPartners.add(otherParty.toLowerCase());

                if (!mainConversations.has(otherParty.toLowerCase())) {
                    mainConversations.set(otherParty.toLowerCase(), []);
                }

                mainConversations.get(otherParty.toLowerCase()).push( {
                    ...messageData,
                    messageId: messageId.toString(),
                    source: 'main'
                });
            } catch (error) {
                logger.warn(`Failed to fetch message ${messageId}: ${error.message}`);
            }
        }


        const sessionConversations = new Map();
        for (const session of sessions) {
            const otherParty = session.participant1.toLowerCase() === walletInfo.address.toLowerCase()
                ? session.participant2
                : session.participant1;

            conversationPartners.add(otherParty.toLowerCase());

            try {
                const sessionMessages = await sessionManager.getMessages(otherParty);
                if (sessionMessages.length > 0) {
                    sessionConversations.set(otherParty.toLowerCase(), sessionMessages.map(msg => ( {
                        ...msg,
                        source: 'session'
                    })));
                }
            } catch (error) {
                logger.warn(`Failed to fetch session messages for ${otherParty}: ${error.message}`);
            }
        }


        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: walletInfo.address,
                network: networkConfig.name,
                format: argv.saved,
                totalConversations: conversationPartners.size,
                totalMainMessages: userMessages.length,
                totalSessions: sessions.length
            },
            conversations: {}
        };


        for (const partner of conversationPartners) {
            const mainMsgs = mainConversations.get(partner) || [];
            const sessionMsgs = sessionConversations.get(partner) || [];
            const allMsgs = [...mainMsgs, ...sessionMsgs];


            allMsgs.sort((a, b) => a.timestamp - b.timestamp);

            exportData.conversations[partner] = {
                participant: partner,
                totalMessages: allMsgs.length,
                mainContractMessages: mainMsgs.length,
                sessionMessages: sessionMsgs.length,
                messages: allMsgs
            };
        }


        const exportDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }


        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `chainwhisper-export-${timestamp}.${argv.saved}`;
        const filepath = path.join(exportDir, filename);


        console.log(chalk.blue(`💾 Exporting to ${argv.saved.toUpperCase()} format...`));

        switch (argv.saved) {
            case 'json':
                await exportJSON(exportData, filepath);
                break;
            case 'md':
                await exportMarkdown(exportData, filepath);
                break;
            case 'txt':
                await exportText(exportData, filepath);
                break;
        }


        console.log(chalk.green.bold('\n🎉 Export completed successfully!\n'));

        console.log(chalk.blue('📊 Export Summary:'));
        console.log(chalk.gray(`   File: ${filename}`));
        console.log(chalk.gray(`   Location: ${filepath}`));
        console.log(chalk.gray(`   Format: ${argv.saved.toUpperCase()}`));
        console.log(chalk.gray(`   Conversations: ${conversationPartners.size}`));
        console.log(chalk.gray(`   Total messages: ${userMessages.length + sessions.reduce((sum, s) => sum + s.messageCount, 0)}`));
        console.log(chalk.gray(`   File size: ${Math.round(fs.statSync(filepath).size / 1024)} KB`));

        console.log(chalk.yellow('\n⚠️  Privacy Notice:'));
        console.log(chalk.gray('   Exported file contains encrypted message CIDs only'));
        console.log(chalk.gray('   Actual message content requires IPFS retrieval + decryption'));
        console.log(chalk.gray('   Store exported file securely'));


        logger.info('Chat history exported', {
            format: argv.saved,
            conversationCount: conversationPartners.size,
            messageCount: userMessages.length,
            filepath
        });

    } catch (error) {
        console.error(chalk.red('\n❌ Export failed:'), error.message);
        logger.error('Saved command failed', error, { argv });
        process.exit(1);
    }
}

async function exportJSON(data, filepath) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

async function exportMarkdown(data, filepath) {
    let markdown = `# ChainWhisper Chat Export\n\n`;

    markdown += `**Exported:** ${data.metadata.exportedAt}\n`;
    markdown += `**Account:** ${data.metadata.exportedBy}\n`;
    markdown += `**Network:** ${data.metadata.network}\n`;
    markdown += `**Conversations:** ${data.metadata.totalConversations}\n`;
    markdown += `**Total Messages:** ${data.metadata.totalMainMessages}\n\n`;

    markdown += `---\n\n`;

    for (const [partner, conversation] of Object.entries(data.conversations)) {
        markdown += `## Conversation with ${partner}\n\n`;
        markdown += `- **Total Messages:** ${conversation.totalMessages}\n`;
        markdown += `- **Main Contract:** ${conversation.mainContractMessages}\n`;
        markdown += `- **Private Sessions:** ${conversation.sessionMessages}\n\n`;

        for (const [index, message] of conversation.messages.entries()) {
            const date = new Date(message.timestamp * 1000);
            const source = message.source === 'session' ? '🔒 Private' : '📨 Standard';

            markdown += `### Message ${index + 1} - ${source}\n\n`;
            markdown += `**Date:** ${date.toLocaleString()}\n`;
            markdown += `**From:** ${message.from}\n`;
            markdown += `**To:** ${message.to || 'Session participant'}\n`;
            markdown += `**IPFS CID:** \`${message.cid}\`\n`;

            if (message.expiry && message.expiry > 0) {
                const expiryDate = new Date((message.timestamp + message.expiry) * 1000);
                markdown += `**Expires:** ${expiryDate.toLocaleString()}\n`;
            }

            if (message.isMedia) {
                markdown += `**Media Type:** ${message.messageType}\n`;
            }

            markdown += `\n`;
        }

        markdown += `---\n\n`;
    }

    fs.writeFileSync(filepath, markdown);
}

async function exportText(data, filepath) {
    let text = `CHAINWHISPER CHAT EXPORT\n`;
    text += `${'='.repeat(50)}\n\n`;

    text += `Exported: ${data.metadata.exportedAt}\n`;
    text += `Account: ${data.metadata.exportedBy}\n`;
    text += `Network: ${data.metadata.network}\n`;
    text += `Conversations: ${data.metadata.totalConversations}\n`;
    text += `Total Messages: ${data.metadata.totalMainMessages}\n\n`;

    text += `${'='.repeat(50)}\n\n`;

    for (const [partner, conversation] of Object.entries(data.conversations)) {
        text += `CONVERSATION WITH: ${partner}\n`;
        text += `${'-'.repeat(30)}\n`;
        text += `Total Messages: ${conversation.totalMessages}\n`;
        text += `Main Contract: ${conversation.mainContractMessages}\n`;
        text += `Private Sessions: ${conversation.sessionMessages}\n\n`;

        for (const [index, message] of conversation.messages.entries()) {
            const date = new Date(message.timestamp * 1000);
            const source = message.source === 'session' ? '[PRIVATE]' : '[STANDARD]';

            text += `[${index + 1}] ${source} ${date.toLocaleString()}\n`;
            text += `From: ${message.from}\n`;
            text += `To: ${message.to || 'Session participant'}\n`;
            text += `IPFS CID: ${message.cid}\n`;

            if (message.expiry && message.expiry > 0) {
                const expiryDate = new Date((message.timestamp + message.expiry) * 1000);
                text += `Expires: ${expiryDate.toLocaleString()}\n`;
            }

            if (message.isMedia) {
                text += `Media Type: ${message.messageType}\n`;
            }

            text += `\n`;
        }

        text += `${'='.repeat(50)}\n\n`;
    }

    fs.writeFileSync(filepath, text);
}

module.exports = savedCommand;
