const crypto = require('crypto');
const { ethers } = require('ethers');
const chalk = require('chalk');


const _sodium = require('libsodium-wrappers');

class EncryptionService {
    static sodium = null;


    static async initialize() {
        if (!this.sodium) {
            await _sodium.ready;
            this.sodium = _sodium;
        }
        return this.sodium;
    }


    static getPublicKeyFromPrivate(privateKeyHex) {
        try {
            const cleanPrivateKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
            const wallet = new ethers.Wallet('0x' + cleanPrivateKey);
            const publicKey = wallet.signingKey.publicKey;
            return publicKey.slice(4);
        } catch (error) {
            console.error(chalk.red('❌ Public key derivation failed:'), error.message);
            throw error;
        }
    }


    static generateSharedSecret(privateKeyHex, publicKeyHex) {
        try {
            const cleanPrivateKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
            const cleanPublicKey = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;

            const ecdh = crypto.createECDH('secp256k1');
            ecdh.setPrivateKey(Buffer.from(cleanPrivateKey, 'hex'));

            let publicKeyBuffer;
            if (cleanPublicKey.length === 128) {
                publicKeyBuffer = Buffer.from('04' + cleanPublicKey, 'hex');
            } else if (cleanPublicKey.length === 130 && cleanPublicKey.startsWith('04')) {
                publicKeyBuffer = Buffer.from(cleanPublicKey, 'hex');
            } else {
                throw new Error(`Invalid public key format. Length: ${cleanPublicKey.length}`);
            }

            const sharedSecret = ecdh.computeSecret(publicKeyBuffer);
            const derivedKey = crypto.createHash('sha256').update(sharedSecret).digest();

            return derivedKey;
        } catch (error) {
            console.error(chalk.red('❌ ECDH shared secret generation failed:'), error.message);
            throw error;
        }
    }


    static getRecipientPrivateKeyForTesting(recipientAddress) {
        const testingKeys = {
            '0x4B3462da947df564eA5d7bd23f5515fbEB093d55': 'd02a0bf9cf918bf11ded83e126a3dcb143c85fce4f9d5bf607a90b56633c8aac',
            '0xd6ED9d6A26636df02D6A2a51A448cAC55795e016': 'e536d3033baab4a34254cc29c5a7a09c78161f54b21fe673cc15cec91a9496f0'
        };

        const normalizedAddress = recipientAddress.toLowerCase();
        const key = Object.entries(testingKeys).find(([addr]) =>
            addr.toLowerCase() === normalizedAddress
        )?.[1];

        if (!key) {
            throw new Error(`Testing private key not found for address: ${recipientAddress}`);
        }
        return key;
    }


    static async encryptForRecipient(message, senderPrivateKey, recipientAddress) {
        try {
            await this.initialize();
            console.log(chalk.blue(`🔐 Encrypting message with XChaCha20-Poly1305...`));


            const recipientPrivateKey = this.getRecipientPrivateKeyForTesting(recipientAddress);
            const recipientPublicKey = this.getPublicKeyFromPrivate(recipientPrivateKey);


            const sharedSecret = this.generateSharedSecret(senderPrivateKey, recipientPublicKey);


            const key = sharedSecret;


            const nonce = this.sodium.randombytes_buf(this.sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);


            const messageBytes = this.sodium.from_string(message);


            const ciphertext = this.sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
                messageBytes,
                null,
                null,
                nonce,
                key
            );


            const encryptionResult = JSON.stringify( {
                ciphertext: this.sodium.to_base64(ciphertext, this.sodium.base64_variants.ORIGINAL),
                nonce: this.sodium.to_base64(nonce, this.sodium.base64_variants.ORIGINAL),
                algorithm: 'XChaCha20-Poly1305',
                keyDerivation: 'ECDH-secp256k1',
                version: '3.0'
            });

            console.log(chalk.green('✅ Message encrypted successfully'));

            return encryptionResult;

        } catch (error) {
            console.error(chalk.red('❌ XChaCha20 encryption failed:'), error.message);
            throw error;
        }
    }


    static async decryptFromSender(encryptedData, recipientPrivateKey, senderAddress) {
        try {
            await this.initialize();


            let encryptionPayload;

            try {
                encryptionPayload = JSON.parse(encryptedData);

                if (!encryptionPayload.ciphertext || !encryptionPayload.nonce) {
                    throw new Error('Invalid encryption payload');
                }

            } catch (jsonError) {

                if (encryptedData.length < 100) {
                    return `[Corrupted message - ${encryptedData.length} chars]`;
                }
                return '[Legacy message format - please resend with current version]';
            }


            if (encryptionPayload.algorithm !== 'XChaCha20-Poly1305') {
                return '[Legacy message format - please resend with current version]';
            }


            const senderPrivateKey = this.getRecipientPrivateKeyForTesting(senderAddress);
            const senderPublicKey = this.getPublicKeyFromPrivate(senderPrivateKey);


            const sharedSecret = this.generateSharedSecret(recipientPrivateKey, senderPublicKey);


            const key = sharedSecret;


            const nonce = this.sodium.from_base64(encryptionPayload.nonce, this.sodium.base64_variants.ORIGINAL);
            const ciphertext = this.sodium.from_base64(encryptionPayload.ciphertext, this.sodium.base64_variants.ORIGINAL);


            const decryptedBytes = this.sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
                null,
                ciphertext,
                null,
                nonce,
                key
            );

            const decryptedMessage = this.sodium.to_string(decryptedBytes);

            if (!decryptedMessage || decryptedMessage.length === 0) {
                throw new Error('Decryption resulted in empty message');
            }

            return decryptedMessage;

        } catch (error) {
            console.error(chalk.red('❌ Decryption failed:'), error.message);
            return '[Message could not be decrypted]';
        }
    }
}

module.exports = EncryptionService;
