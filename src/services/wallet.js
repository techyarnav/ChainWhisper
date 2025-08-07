const { ethers } = require('ethers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class WalletService {
    constructor(networkConfig) {
        this.networkConfig = networkConfig;
        this.provider = null;
        this.wallet = null;
        this.walletsDir = path.join(process.cwd(), '.wallets');
    }


    ensureWalletsDirectory() {
        if (!fs.existsSync(this.walletsDir)) {
            fs.mkdirSync(this.walletsDir, { recursive: true });
            console.log(chalk.gray(`📁 Created wallets directory: ${this.walletsDir}`));
        }
    }


    getSavedWallets() {
        this.ensureWalletsDirectory();
        try {
            const walletFiles = fs.readdirSync(this.walletsDir)
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
            return walletFiles;
        } catch (error) {
            return [];
        }
    }


    saveWallet(alias, privateKey, address) {
        this.ensureWalletsDirectory();
        const walletPath = path.join(this.walletsDir, `${alias}.json`);

        const walletData = {
            alias,
            address,
            privateKey,
            createdAt: new Date().toISOString()
        };

        fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2));
        console.log(chalk.green(`💾 Wallet saved as "${alias}"`));
        console.log(chalk.gray(`📍 Address: ${address}`));
    }


    loadWallet(alias) {
        const walletPath = path.join(this.walletsDir, `${alias}.json`);

        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet "${alias}" not found`);
        }

        const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
        return walletData;
    }


    async getPrivateKeyInteractively() {
        const rl = readline.createInterface( {
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            console.log(chalk.yellow('🔑 Enter your private key (input will be hidden):'));


            rl.stdoutMuted = true;
            rl._writeToOutput = function _writeToOutput(stringToWrite) {
                if (rl.stdoutMuted) rl.output.write("*");
                else rl.output.write(stringToWrite);
            };

            rl.question('Private Key: ', (privateKey) => {
                rl.close();
                console.log(chalk.gray('\n🔒 Private key entered'));
                resolve(privateKey.trim());
            });
        });
    }


    async selectWallet() {
        console.log(chalk.blue('\n🔐 ChainWhisper Wallet Selection\n'));


        if (process.env.PRIVATE_KEY) {
            console.log(chalk.green('📝 Found private key in .env file'));
            return {
                source: 'env',
                privateKey: process.env.PRIVATE_KEY
            };
        }

        const rl = readline.createInterface( {
            input: process.stdin,
            output: process.stdout
        });


        const savedWallets = this.getSavedWallets();

        if (savedWallets.length > 0) {
            console.log(chalk.cyan('💼 Saved Wallets:'));
            savedWallets.forEach((wallet, index) => {
                console.log(chalk.white(`  ${index + 1}. ${wallet}`));
            });
            console.log(chalk.white(`  ${savedWallets.length + 1}. Enter new private key`));
            console.log(chalk.white(`  ${savedWallets.length + 2}. Generate new wallet`));
        } else {
            console.log(chalk.yellow('💼 No saved wallets found'));
            console.log(chalk.white('  1. Enter private key'));
            console.log(chalk.white('  2. Generate new wallet'));
        }

        return new Promise(async (resolve, reject) => {
            rl.question(chalk.cyan('\nSelect option: '), async (choice) => {
                const choiceNum = parseInt(choice);

                try {
                    if (savedWallets.length > 0 && choiceNum >= 1 && choiceNum <= savedWallets.length) {

                        const walletAlias = savedWallets[choiceNum - 1];
                        try {
                            const walletData = this.loadWallet(walletAlias);
                            console.log(chalk.green(`✅ Loaded wallet: ${walletAlias}`));
                            rl.close();
                            resolve( {
                                source: 'saved',
                                privateKey: walletData.privateKey,
                                alias: walletAlias,
                                address: walletData.address
                            });
                        } catch (error) {
                            console.log(chalk.red(`❌ Failed to load wallet: ${error.message}`));
                            rl.close();
                            const retry = await this.selectWallet();
                            resolve(retry);
                        }
                    } else if ((savedWallets.length > 0 && choiceNum === savedWallets.length + 1) ||
                              (savedWallets.length === 0 && choiceNum === 1)) {

                        rl.close();
                        const privateKey = await this.getPrivateKeyInteractively();


                        const rl2 = readline.createInterface( {
                            input: process.stdin,
                            output: process.stdout
                        });

                        rl2.question(chalk.cyan('💾 Save this wallet? (y/N): '), (saveChoice) => {
                            if (saveChoice.toLowerCase() === 'y' || saveChoice.toLowerCase() === 'yes') {
                                rl2.question(chalk.cyan('📝 Enter wallet alias: '), (alias) => {
                                    rl2.close();
                                    try {
                                        const wallet = new ethers.Wallet(privateKey);
                                        this.saveWallet(alias, privateKey, wallet.address);
                                        resolve( {
                                            source: 'new',
                                            privateKey,
                                            alias,
                                            address: wallet.address,
                                            saved: true
                                        });
                                    } catch (error) {
                                        console.log(chalk.red(`❌ Invalid private key: ${error.message}`));
                                        this.selectWallet().then(resolve).catch(reject);
                                    }
                                });
                            } else {
                                rl2.close();
                                resolve( {
                                    source: 'new',
                                    privateKey
                                });
                            }
                        });
                    } else if ((savedWallets.length > 0 && choiceNum === savedWallets.length + 2) ||
                              (savedWallets.length === 0 && choiceNum === 2)) {

                        const newWallet = ethers.Wallet.createRandom();
                        console.log(chalk.green('🆕 Generated new wallet'));
                        console.log(chalk.yellow('⚠️  SAVE THIS PRIVATE KEY SECURELY:'));
                        console.log(chalk.white(`🔑 Private Key: ${newWallet.privateKey}`));
                        console.log(chalk.gray(`📍 Address: ${newWallet.address}`));

                        rl.question(chalk.cyan('💾 Save this wallet? (Y/n): '), (saveChoice) => {
                            if (saveChoice.toLowerCase() !== 'n' && saveChoice.toLowerCase() !== 'no') {
                                rl.question(chalk.cyan('📝 Enter wallet alias: '), (alias) => {
                                    rl.close();
                                    this.saveWallet(alias, newWallet.privateKey, newWallet.address);
                                    resolve( {
                                        source: 'generated',
                                        privateKey: newWallet.privateKey,
                                        alias,
                                        address: newWallet.address,
                                        saved: true
                                    });
                                });
                            } else {
                                rl.close();
                                resolve( {
                                    source: 'generated',
                                    privateKey: newWallet.privateKey,
                                    address: newWallet.address
                                });
                            }
                        });
                    } else {
                        console.log(chalk.red('❌ Invalid choice'));
                        rl.close();
                        const retry = await this.selectWallet();
                        resolve(retry);
                    }
                } catch (error) {
                    rl.close();
                    reject(error);
                }
            });
        });
    }


    async connect() {
        try {
            console.log(chalk.blue('🔐 Connecting wallet...'));


            const walletChoice = await this.selectWallet();


            const privateKey = walletChoice.privateKey.startsWith('0x') ?
                walletChoice.privateKey : '0x' + walletChoice.privateKey;


            this.provider = new ethers.JsonRpcProvider(this.networkConfig.rpcUrl);
            this.wallet = new ethers.Wallet(privateKey, this.provider);


            const balance = await this.provider.getBalance(this.wallet.address);
            const balanceEth = ethers.formatEther(balance);

            console.log(chalk.green(`✅ Wallet connected: ${this.wallet.address}`));
            console.log(chalk.gray(`💰 Balance: ${balanceEth} ETH`));
            console.log(chalk.gray(`🌐 Network: ${this.networkConfig.name}`));

            return {
                address: this.wallet.address,
                balance: balanceEth,
                source: walletChoice.source
            };

        } catch (error) {
            console.error(chalk.red('❌ Wallet connection failed:'), error.message);
            throw error;
        }
    }


    getWallet() {
        if (!this.wallet) {
            throw new Error('Wallet not connected. Call connect() first.');
        }
        return this.wallet;
    }


    getProvider() {
        if (!this.provider) {
            throw new Error('Provider not available. Call connect() first.');
        }
        return this.provider;
    }


    listSavedWallets() {
        const savedWallets = this.getSavedWallets();

        if (savedWallets.length === 0) {
            console.log(chalk.yellow('💼 No saved wallets found'));
            return;
        }

        console.log(chalk.blue('💼 Saved Wallets:\n'));

        savedWallets.forEach((alias) => {
            try {
                const walletData = this.loadWallet(alias);
                console.log(chalk.white(`📝 ${alias}`));
                console.log(chalk.gray(`   Address: ${walletData.address}`));
                console.log(chalk.gray(`   Created: ${new Date(walletData.createdAt).toLocaleString()}\n`));
            } catch (error) {
                console.log(chalk.red(`❌ Error loading ${alias}: ${error.message}\n`));
            }
        });
    }


    deleteSavedWallet(alias) {
        const walletPath = path.join(this.walletsDir, `${alias}.json`);

        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet "${alias}" not found`);
        }

        fs.unlinkSync(walletPath);
        console.log(chalk.green(`🗑️  Wallet "${alias}" deleted`));
    }
}

module.exports = WalletService;
