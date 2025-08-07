const chalk = require('chalk');

class PrivacyManager {
    constructor() {
        this.privacyModes = {
            STANDARD: 'standard',
            SESSION: 'session'
        };
    }


    determinePrivacyMode(isSession) {
        return isSession ? this.privacyModes.SESSION : this.privacyModes.STANDARD;
    }


    getPrivacyModeInfo(mode) {
        const modeData = {
            [this.privacyModes.STANDARD]: {
                name: 'Standard Mode',
                icon: '📨',
                description: 'Main contract + ECDH encryption (cost-effective)',
                gasCost: 'Low (~50k gas)',
                privacyLevel: 'High encryption, public contract'
            },
            [this.privacyModes.SESSION]: {
                name: 'Private Session Mode',
                icon: '🔒',
                description: 'Disposable contracts + ECDH encryption (maximum privacy)',
                gasCost: 'High (~285k + 50k gas)',
                privacyLevel: 'Maximum privacy, isolated contracts'
            }
        };

        return modeData[mode] || modeData[this.privacyModes.STANDARD];
    }


    isMessageExpired(timestamp, expiry) {
        if (expiry === 0) return false;
        return Math.floor(Date.now() / 1000) > expiry;
    }


    formatExpiryInfo(currentTime, secondsRemaining) {
        if (secondsRemaining <= 0) {
            return { display: chalk.red('⏰ Expired'), remaining: 0 };
        }

        const expiredDate = new Date((currentTime + secondsRemaining) * 1000);
        const hours = Math.floor(secondsRemaining / 3600);

        if (hours > 0) {
            return {
                display: chalk.yellow(`Expires: ${expiredDate.toLocaleString()} (${hours} hour${hours > 1 ? 's' : ''} left)`),
                remaining: secondsRemaining
            };
        } else {
            const minutes = Math.floor(secondsRemaining / 60);
            return {
                display: chalk.yellow(`Expires: ${expiredDate.toLocaleString()} (${minutes} minutes left)`),
                remaining: secondsRemaining
            };
        }
    }


    validateExpiry(expiry) {
        if (expiry === undefined || expiry === null) {
            return 0;
        }

        const expiryNum = parseInt(expiry);
        if (isNaN(expiryNum) || expiryNum < 0) {
            throw new Error('Expiry must be a non-negative number (seconds)');
        }

        return expiryNum;
    }
}

module.exports = PrivacyManager;
