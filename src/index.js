#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const figlet = require('figlet');


const WalletService = require('./services/wallet');
const BlockchainService = require('./services/blockchain');
const EncryptionService = require('./services/encryption');
const SessionManager = require('./services/sessionManager');
const PrivacyManager = require('./services/privacyManager');
const { getNetworkConfig, validateNetworkConfig } = require('./config/networks');
const logger = require('./utils/logger');


require('dotenv').config();


function displayHeader() {
    console.log(chalk.cyan(figlet.textSync('ChainWhisper', {
        font: 'Small',
        horizontalLayout: 'fitted'
    })));

    console.log(chalk.gray('Privacy-focused Web3 Chat CLI v1.0.0'));
    console.log(chalk.gray('Built on Sepolia Scroll Testnet\n'));
}


const argv = yargs(hideBin(process.argv))
    .scriptName('chain-whisper')
    .usage(chalk.cyan('Usage: $0 [options]'))
    .version('1.0.0')


    .option('to', {
        describe: 'Recipient wallet address',
        type: 'string',
        alias: 't'
    })
    .option('message', {
        describe: 'Message text content',
        type: 'string',
        alias: 'm'
    })


    .option('session', {
        describe: 'Use private session contract (higher privacy, higher gas)',
        type: 'boolean',
        alias: 's'
    })
    .option('expiry', {
        describe: 'Message expiry time in seconds (0 = permanent)',
        type: 'number',
        alias: 'e',
        default: 0
    })


    .option('replay', {
        describe: 'Replay conversation history with specified address',
        type: 'string',
        alias: 'r'
    })


    .option('list-wallets', {
        describe: 'List all saved wallets',
        type: 'boolean',
        alias: 'lw'
    })
    .option('delete-wallet', {
        describe: 'Delete a saved wallet by alias',
        type: 'string',
        alias: 'dw'
    })


    .option('network', {
        describe: 'Blockchain network to use',
        type: 'string',
        default: 'sepolia-scroll',
        choices: ['sepolia-scroll']
    })


    .example([
        ['$0 --to 0x742d35... --message "Hello!"', 'Send text message'],
        ['$0 --to 0x742d35... --message "Secret" --session', 'Send private session message'],
        ['$0 --to 0x742d35... --message "Expires soon" --expiry 3600', 'Send expiring message'],
        ['$0 --replay 0x742d35...', 'View conversation history'],
        ['$0 --list-wallets', 'Show all saved wallets'],
        ['$0 --delete-wallet myWallet', 'Delete saved wallet']
    ])

    .group(['to', 'message'], 'Message Options:')
    .group(['session', 'expiry'], 'Privacy & Security Options:')
    .group(['replay'], 'History Options:')
    .group(['list-wallets', 'delete-wallet'], 'Wallet Management:')
    .group(['network'], 'Network Options:')

    .help('help', 'Show help information')
    .alias('help', 'h')


    .epilogue(chalk.blue(`
🔐 Privacy Features:
  Standard Mode:    Main contract + XChaCha20 encryption (cost-effective)
  Session Mode:     Private contracts + XChaCha20 encryption (maximum privacy)

⏰ Self-Destructing Messages:
  Use --expiry <seconds> to set message expiration

💼 Wallet Management:
  Supports .env files, interactive entry, or saved wallet aliases
  Wallets saved in .wallets/ directory (keep secure!)
  `))

    .check((argv) => {

        const hasMessageCommand = argv.to && argv.message;
        const hasReplayCommand = argv.replay;
        const hasWalletCommand = argv['list-wallets'] || argv['delete-wallet'];

        const commandCount = [hasMessageCommand, hasReplayCommand, hasWalletCommand].filter(Boolean).length;

        if (commandCount === 0) {
            throw new Error(chalk.red('Please specify a command. Use --help for available options.'));
        }

        if (commandCount > 1) {
            throw new Error(chalk.red('Please specify only one command at a time.'));
        }


        if (hasMessageCommand) {
            if (!argv.message) {
                throw new Error(chalk.red('--message is required when using --to'));
            }

            if (argv.expiry < 0) {
                throw new Error(chalk.red('Expiry time must be 0 or greater (seconds)'));
            }


            if (argv.expiry > 0 && argv.expiry < 60) {
                console.log(chalk.yellow('⚠️  Warning: Expiry less than 1 minute'));
            }
        }

        return true;
    })

    .fail((msg, err, yargs) => {
        if (err) {
            console.error(chalk.red('\n❌ Error:'), err.message);
        } else {
            console.error(chalk.red('\n❌ Error:'), msg);
        }
        console.log(chalk.yellow('\nUse --help for usage information\n'));
        process.exit(1);
    })

    .argv;


function displayWalletInfo(walletInfo, networkName) {
    console.log(chalk.green(`✅ Connected: ${walletInfo.address}`));
    console.log(chalk.gray(`💰 Balance: ${walletInfo.balance} ETH\n`));
}


async function main() {
    try {

        const networkConfig = getNetworkConfig(argv.network);
        validateNetworkConfig(networkConfig);


        if (argv.to && argv.message) {
            await handleSendCommand(argv, networkConfig);
        } else if (argv.replay) {
            await handleReplayCommand(argv, networkConfig);
        } else if (argv['list-wallets']) {
            await handleListWalletsCommand(networkConfig);
        } else if (argv['delete-wallet']) {
            await handleDeleteWalletCommand(argv['delete-wallet'], networkConfig);
        }

    } catch (error) {
        console.error(chalk.red('❌ ERROR:'), error.message);
        logger.error('CLI execution failed', error);

        if (process.env.LOG_LEVEL === 'debug') {
            console.error(chalk.gray('\nDebug information:'));
            console.error(error);
        }

        process.exit(1);
    }
}


async function handleListWalletsCommand(networkConfig) {
    try {
        displayHeader();
        console.log(chalk.blue('💼 ChainWhisper - Wallet Management\n'));

        const walletService = new WalletService(networkConfig);
        walletService.listSavedWallets();

    } catch (error) {
        console.error(chalk.red('❌ List wallets failed:'), error.message);
        throw error;
    }
}


async function handleDeleteWalletCommand(walletAlias, networkConfig) {
    try {
        displayHeader();
        console.log(chalk.blue('🗑️  ChainWhisper - Delete Wallet\n'));

        const walletService = new WalletService(networkConfig);
        walletService.deleteSavedWallet(walletAlias);

    } catch (error) {
        console.error(chalk.red('❌ Delete wallet failed:'), error.message);
        throw error;
    }
}


async function handleSendCommand(argv, networkConfig) {
    try {
        displayHeader();
        console.log(chalk.blue('🚀 ChainWhisper - Send Message\n'));


        const walletService = new WalletService(networkConfig);
        const walletInfo = await walletService.connect();


        if (walletInfo.address.toLowerCase() === argv.to.toLowerCase()) {
            throw new Error('Cannot send message to yourself');
        }


        const blockchainService = new BlockchainService(walletService.getWallet(), networkConfig);
        const sessionManager = new SessionManager(blockchainService, walletService.getWallet());

        let result;


        console.log(chalk.blue('🔐 Encrypting message...'));

        const encryptedMessage = await EncryptionService.encryptForRecipient(
            argv.message,
            walletService.getWallet().privateKey,
            argv.to
        );

        console.log(chalk.green('✅ Content processed'));


        const currentTime = Math.floor(Date.now() / 1000);
        const absoluteExpiry = argv.expiry > 0 ? currentTime + argv.expiry : 0;


        if (argv.session) {
            console.log(chalk.blue('🔒 Using private session...'));
            const session = await sessionManager.getOrCreateSession(argv.to);

            result = await blockchainService.sendSessionMessage(
                session.contractAddress,
                encryptedMessage,
                absoluteExpiry,
                false,
                'text'
            );

            result.sessionInfo = session;
        } else {
            console.log(chalk.blue('📨 Sending message...'));
            result = await blockchainService.sendMessageWithMedia(
                argv.to,
                encryptedMessage,
                absoluteExpiry,
                'text'
            );
        }


        console.log(chalk.green('✅ Message sent successfully!'));
        console.log(chalk.gray(`📋 Transaction: ${result.transactionHash}`));
        console.log(chalk.gray(`⛽ Gas used: ${result.gasUsed}`));

        if (result.sessionInfo && !result.sessionInfo.existed) {
            console.log(chalk.blue('🔒 New private session created'));
        }


        logger.info('Message sent successfully', {
            recipient: argv.to,
            mode: argv.session ? 'session' : 'standard',
            transactionHash: result.transactionHash,
            gasUsed: result.gasUsed
        });

        console.log(chalk.green('\n🎉 Success!'));

    } catch (error) {
        console.error(chalk.red('❌ Send failed:'), error.message);
        logger.error('Send command failed', error);
        throw error;
    }
}


async function handleReplayCommand(argv, networkConfig) {
    try {
        displayHeader();
        console.log(chalk.blue('🔄 ChainWhisper - Replay Conversation\n'));


        const walletService = new WalletService(networkConfig);
        const walletInfo = await walletService.connect();
        displayWalletInfo(walletInfo, networkConfig.name);


        const blockchainService = new BlockchainService(walletService.getWallet(), networkConfig);
        const sessionManager = new SessionManager(blockchainService, walletService.getWallet());

        console.log(chalk.blue(`📚 Fetching conversation with ${argv.replay.substring(0, 8)}...${argv.replay.substring(argv.replay.length - 4)}...\n`));


        console.log(chalk.blue('📨 Checking main contract messages...'));
        let standardMessages = [];
        try {
            standardMessages = await blockchainService.getConversationMessages(argv.replay);
            console.log(chalk.gray(`   Found ${standardMessages.length} messages in main contract`));
        } catch (error) {
            console.log(chalk.yellow(`   ⚠️  Standard messages unavailable: ${error.message}`));
        }


        console.log(chalk.blue('🔒 Checking private session messages...'));
        let sessionMessages = [];
        try {
            sessionMessages = await sessionManager.getMessages(argv.replay);
            console.log(chalk.gray(`   Found ${sessionMessages.length} messages in sessions`));
        } catch (error) {
            console.log(chalk.yellow(`   ⚠️  Session messages unavailable: ${error.message.split('\n')[0]}`));
        }


        const allMessages = [...standardMessages, ...sessionMessages];
        allMessages.sort((a, b) => a.timestamp - b.timestamp);

        if (allMessages.length === 0) {
            console.log(chalk.yellow('\n💬 No messages found in this conversation'));
            console.log(chalk.gray(`   Start a conversation with:`));
            console.log(chalk.white(`   npm run start -- --to ${argv.replay} --message "Hello!"`));
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
                try {
                    decryptedContent = await EncryptionService.decryptFromSender(
                        message.cid,
                        walletService.getWallet().privateKey,
                        message.from
                    );
                } catch (decryptError) {
                    console.log(chalk.red(`\n[${index + 1}] ❌ Failed to decrypt message from ${message.from.substring(0, 8)}...`));
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
                console.log(chalk.white(`   ${decryptedContent}`));

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

        console.log(chalk.blue('\n' + '═'.repeat(80)));
        console.log(chalk.green(`📊 Summary:`));
        console.log(chalk.gray(`   Total messages found: ${allMessages.length}`));
        console.log(chalk.gray(`   Successfully displayed: ${displayedCount}`));
        if (failedCount > 0) {
            console.log(chalk.yellow(`   Failed to decrypt: ${failedCount}`));
        }


        logger.info('Conversation replayed successfully', {
            otherParty: argv.replay,
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


process.on('unhandledRejection', (error) => {
    console.error(chalk.red('\n💥 Unhandled promise rejection:'), error.message);
    logger.error('Unhandled promise rejection', error);
    process.exit(1);
});


process.on('uncaughtException', (error) => {
    console.error(chalk.red('\n💥 Uncaught exception:'), error.message);
    logger.error('Uncaught exception', error);
    process.exit(1);
});


if (require.main === module) {
    main();
}

module.exports = { main };
