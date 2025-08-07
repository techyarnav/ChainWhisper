const chalk = require('chalk');
const { ethers } = require('ethers');

class SessionManager {
    constructor(blockchainService, wallet) {
        this.blockchain = blockchainService;
        this.wallet = wallet;
        this.activeSessions = new Map();
    }


    async getOrCreateSession(participant) {
        try {
            const normalizedParticipant = participant.toLowerCase();

            console.log(chalk.blue(`🔍 Checking for existing session with ${participant}...`));


            const existingSession = await this.blockchain.factoryContract.getSessionBetween(
                this.wallet.address,
                normalizedParticipant
            );

            if (existingSession.contractAddr !== ethers.ZeroAddress) {

                try {
                    const sessionABI = [
                        "function createdAt() external view returns (uint256)"
                    ];

                    const sessionContract = new ethers.Contract(
                        existingSession.contractAddr,
                        sessionABI,
                        this.blockchain.provider
                    );

                    const sessionCreatedAt = await sessionContract.createdAt();
                    const now = Math.floor(Date.now() / 1000);
                    const sessionAge = now - Number(sessionCreatedAt);
                    const ONE_HOUR = 60 * 60;

                    if (sessionAge > ONE_HOUR) {
                        const ageMinutes = Math.floor(sessionAge / 60);
                        console.log(chalk.yellow(`⏰ Existing session is ${ageMinutes} minutes old (expired > 1 hour)`));
                        console.log(chalk.blue('🆕 Creating new private session (old session expired)...'));


                        return await this.createSession(normalizedParticipant);
                    } else {
                        const remainingMinutes = Math.floor((ONE_HOUR - sessionAge) / 60);
                        console.log(chalk.green(`✅ Found existing active session (${remainingMinutes} min remaining)`));
                    }

                } catch (sessionCheckError) {
                    console.log(chalk.yellow(`⚠️  Could not check session age, using existing session`));
                    console.log(chalk.green('✅ Found existing active session'));
                }


                this.activeSessions.set(normalizedParticipant, {
                    contractAddress: existingSession.contractAddr,
                    participant1: this.wallet.address,
                    participant2: normalizedParticipant,
                    created: false
                });

                return {
                    contractAddress: existingSession.contractAddr,
                    existed: true
                };
            }


            console.log(chalk.blue('🆕 Creating new private session...'));

            return await this.createSession(normalizedParticipant);

        } catch (error) {
            console.error(chalk.red('❌ Session management failed:'), error.message);
            throw error;
        }
    }


    async createSession(participant) {
        try {
            console.log(chalk.blue(`🔧 Creating private session with ${participant}...`));

            const gasEstimate = await this.blockchain.factoryContract.createChatSession.estimateGas(participant);
            const gasLimit = gasEstimate * 120n / 100n;

            console.log(chalk.gray(`⛽ Estimated gas: ${gasEstimate}`));
            console.log(chalk.gray(`💰 Estimated cost: ~${ethers.formatEther(gasEstimate * 20000000000n)} ETH`));


            const tx = await this.blockchain.factoryContract.createChatSession(participant, {
                gasLimit
            });

            console.log(chalk.yellow(`📡 Transaction sent: ${tx.hash}`));
            console.log(chalk.yellow('⏳ Waiting for confirmation...'));

            const receipt = await tx.wait();

            if (receipt.status === 0) {
                throw new Error('Session creation transaction failed');
            }


            const sessionInfo = await this.blockchain.factoryContract.getSessionBetween(
                this.wallet.address,
                participant
            );

            if (sessionInfo.contractAddr === ethers.ZeroAddress) {
                throw new Error('Session contract not found after creation');
            }


            this.activeSessions.set(participant.toLowerCase(), {
                contractAddress: sessionInfo.contractAddr,
                participant1: this.wallet.address,
                participant2: participant,
                created: true,
                transactionHash: tx.hash,
                gasUsed: receipt.gasUsed
            });

            console.log(chalk.green('✅ Private session created successfully'));
            console.log(chalk.gray(`   Contract: ${sessionInfo.contractAddr}`));
            console.log(chalk.gray(`   Gas used: ${receipt.gasUsed}`));

            return {
                contractAddress: sessionInfo.contractAddr,
                existed: false,
                sessionId: sessionInfo.contractAddr,
                transactionHash: tx.hash,
                gasUsed: receipt.gasUsed.toString()
            };

        } catch (error) {
            console.error(chalk.red('❌ Session creation failed:'), error.message);
            throw error;
        }
    }


    async getMessages(participant, fromBlock = 0) {
        try {
            const normalizedParticipant = participant.toLowerCase();

            const session = this.activeSessions.get(normalizedParticipant);

            if (!session) {

                const existing = await this.blockchain.factoryContract.getSessionBetween(
                    this.wallet.address,
                    normalizedParticipant
                );

                if (existing.contractAddr === ethers.ZeroAddress) {
                    return [];
                }

                return await this.getSessionMessagesWithLimit(existing.contractAddr, fromBlock);
            }

            return await this.getSessionMessagesWithLimit(session.contractAddress, fromBlock);

        } catch (error) {
            console.error(chalk.red('❌ Failed to get session messages:'), error.message);
            throw error;
        }
    }


    async getSessionMessagesWithLimit(sessionAddress, fromBlock = 0) {
        try {
            const sessionABI = [
                "event MessageSent(address indexed from, string cid, uint256 timestamp, uint256 expiry, uint256 messageIndex, bool isMedia, string messageType)"
            ];

            const sessionContract = new ethers.Contract(sessionAddress, sessionABI, this.blockchain.provider);

            const currentBlock = await this.blockchain.provider.getBlockNumber();
            const messages = [];

            const maxBlocksToScan = 10000;
            const chunkSize = 500;


            const safeStartBlock = Math.max(currentBlock - maxBlocksToScan, fromBlock);

            console.log(chalk.gray(`   📊 Scanning recent blocks: ${safeStartBlock} to ${currentBlock} (${currentBlock - safeStartBlock} blocks)`));

            if (currentBlock - safeStartBlock > maxBlocksToScan) {
                console.log(chalk.yellow(`   ⚠️  Limiting scan to last ${maxBlocksToScan} blocks for performance`));
            }

            for (let block = safeStartBlock; block <= currentBlock; block += chunkSize) {
                const toBlock = Math.min(block + chunkSize - 1, currentBlock);

                try {
                    const filter = sessionContract.filters.MessageSent();
                    const events = await sessionContract.queryFilter(filter, block, toBlock);

                    events.forEach((event) => {
                        messages.push( {
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
                        });
                    });

                } catch (rangeError) {
                    console.log(chalk.yellow(`   ⚠️  Skipping blocks ${block}-${toBlock}: RPC limit reached`));

                    if (rangeError.message.includes('too large') || rangeError.message.includes('range')) {
                        console.log(chalk.yellow(`   🔄 Trying smaller chunk (100 blocks)...`));

                        for (let smallBlock = block; smallBlock <= toBlock; smallBlock += 100) {
                            const smallToBlock = Math.min(smallBlock + 99, toBlock);
                            try {
                                const smallEvents = await sessionContract.queryFilter(filter, smallBlock, smallToBlock);
                                smallEvents.forEach((event) => {
                                    messages.push( {
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
                                    });
                                });
                            } catch (smallError) {
                                console.log(chalk.yellow(`   ⚠️  Skipping blocks ${smallBlock}-${smallToBlock}`));
                                continue;
                            }
                        }
                    }
                    continue;
                }

                if ((block - safeStartBlock) % 2000 === 0 && block > safeStartBlock) {
                    const progress = Math.round(((block - safeStartBlock) / (currentBlock - safeStartBlock)) * 100);
                    console.log(chalk.gray(`   📈 Progress: ${progress}% (Block ${block})`));
                }
            }
            messages.sort((a, b) => a.timestamp - b.timestamp);

            console.log(chalk.gray(`   📥 Retrieved ${messages.length} session messages from recent blocks`));

            if (messages.length === 0 && currentBlock - safeStartBlock < maxBlocksToScan) {
                console.log(chalk.yellow(`   💡 No session messages found in scanned range. Session may be older than ${maxBlocksToScan} blocks.`));
            }

            return messages;

        } catch (error) {
            console.error(chalk.red('❌ Failed to get session messages:'), error.message);
            return [];
        }
    }


    async getUserSessions() {
        try {
            if (typeof this.blockchain.factoryContract.getUserSessions === 'function') {
                return await this.blockchain.factoryContract.getUserSessions(this.wallet.address);
            }

            return Array.from(this.activeSessions.values());

        } catch (error) {
            console.error(chalk.red('❌ Failed to get user sessions:'), error.message);
            return Array.from(this.activeSessions.values());
        }
    }


    displaySessions() {
        console.log(chalk.blue('\n📋 Your Chat Sessions:'));
        console.log(chalk.blue('─'.repeat(80)));

        if (this.activeSessions.size === 0) {
            console.log('No sessions found');
            return;
        }

        for (const [participant, session] of this.activeSessions.entries()) {
            const status = session.created ? 'Created' : 'Existing';
            console.log(`${status}: ${participant} -> ${session.contractAddress}`);
        }
    }
}

module.exports = SessionManager;
