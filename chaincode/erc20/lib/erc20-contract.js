'use strict';

const { Contract } = require('fabric-contract-api');

class AutoCoinContract extends Contract {

    // Get caller's organization
    _getMSP(ctx) {
        return ctx.clientIdentity.getMSPID();
    }

    // Only Org1 can perform admin operations
    _onlyAdmin(ctx) {
        if (this._getMSP(ctx) !== 'Org1MSP') {
            throw new Error('Access denied: Only Org1MSP is the admin');
        }
    }

    // Validate token amount
    _validateAmount(amount) {
        if (!/^[0-9]+$/.test(String(amount)) || BigInt(amount) <= 0n) {
            throw new Error('Invalid token amount');
        }
        return BigInt(amount);
    }

    // Get balance
    async _getBalance(ctx, account) {
        const data = await ctx.stub.getState(`balance:${account}`);
        return data.length ? BigInt(data.toString()) : 0n;
    }

    // Save balance
    async _setBalance(ctx, account, amount) {
        await ctx.stub.putState(
            `balance:${account}`,
            Buffer.from(amount.toString())
        );
    }

    // Initialize AutoCoin
    async Initialize(ctx) {
        this._onlyAdmin(ctx);

        const existing = await ctx.stub.getState('tokenInfo');

        if (existing.length > 0) {
            throw new Error('AutoCoin is already initialized');
        }

        const tokenInfo = {
            name: 'AutoCoin',
            symbol: 'AUTO',
            totalSupply: '0'
        };

        await ctx.stub.putState(
            'tokenInfo',
            Buffer.from(JSON.stringify(tokenInfo))
        );

        return JSON.stringify(tokenInfo);
    }

    // Mint tokens (Admin only)
    async Mint(ctx, toMSP, amount) {
        this._onlyAdmin(ctx);

        const value = this._validateAmount(amount);

        const infoData = await ctx.stub.getState('tokenInfo');
        if (!infoData.length) {
            throw new Error('Initialize AutoCoin first');
        }

        const balance = await this._getBalance(ctx, toMSP);
        const newBalance = balance + value;

        const info = JSON.parse(infoData.toString());
        info.totalSupply = (
            BigInt(info.totalSupply) + value
        ).toString();

        await this._setBalance(ctx, toMSP, newBalance);

        await ctx.stub.putState(
            'tokenInfo',
            Buffer.from(JSON.stringify(info))
        );

        return `Minted ${amount} AUTO to ${toMSP}`;
    }

    // Check balance
    async BalanceOf(ctx, accountMSP) {
        const balance = await this._getBalance(ctx, accountMSP);
        return balance.toString();
    }

    // Transfer tokens from caller to another organization
    async Transfer(ctx, fromMSP, toMSP, amount) {
        const caller = this._getMSP(ctx);

        if (caller !== fromMSP) {
            throw new Error('Access denied: Sender must be caller organization');
        }

        if (fromMSP === toMSP) {
            throw new Error('Cannot transfer to the same account');
        }

        const value = this._validateAmount(amount);

        const senderBalance = await this._getBalance(ctx, fromMSP);

        if (senderBalance < value) {
            throw new Error('Insufficient balance');
        }

        const receiverBalance = await this._getBalance(ctx, toMSP);

        await this._setBalance(ctx, fromMSP, senderBalance - value);
        await this._setBalance(ctx, toMSP, receiverBalance + value);

        return `Transferred ${amount} AUTO from ${fromMSP} to ${toMSP}`;
    }

    // Approve spending allowance
    async Approve(ctx, ownerMSP, spenderMSP, amount) {
        if (this._getMSP(ctx) !== ownerMSP) {
            throw new Error('Access denied: Only owner can approve');
        }

        const value = this._validateAmount(amount);

        await ctx.stub.putState(
            `allowance:${ownerMSP}:${spenderMSP}`,
            Buffer.from(value.toString())
        );

        return `Approved ${amount} AUTO for ${spenderMSP}`;
    }

    // Check allowance
    async Allowance(ctx, ownerMSP, spenderMSP) {
        const data = await ctx.stub.getState(
            `allowance:${ownerMSP}:${spenderMSP}`
        );

        return data.length ? data.toString() : '0';
    }

    // Transfer using approved allowance
    async TransferFrom(ctx, spenderMSP, ownerMSP, toMSP, amount) {
        if (this._getMSP(ctx) !== spenderMSP) {
            throw new Error('Access denied: Caller is not the approved spender');
        }

        const value = this._validateAmount(amount);

        const allowanceData = await ctx.stub.getState(
            `allowance:${ownerMSP}:${spenderMSP}`
        );

        const allowance = allowanceData.length
            ? BigInt(allowanceData.toString())
            : 0n;

        if (allowance < value) {
            throw new Error('Insufficient allowance');
        }

        const ownerBalance = await this._getBalance(ctx, ownerMSP);

        if (ownerBalance < value) {
            throw new Error('Insufficient balance');
        }

        const receiverBalance = await this._getBalance(ctx, toMSP);

        await this._setBalance(ctx, ownerMSP, ownerBalance - value);
        await this._setBalance(ctx, toMSP, receiverBalance + value);

        await ctx.stub.putState(
            `allowance:${ownerMSP}:${spenderMSP}`,
            Buffer.from((allowance - value).toString())
        );

        return `Transferred ${amount} AUTO using allowance`;
    }

    // Burn tokens from caller's own account
    async Burn(ctx, accountMSP, amount) {
        if (this._getMSP(ctx) !== accountMSP) {
            throw new Error('Access denied: Can only burn own tokens');
        }

        const value = this._validateAmount(amount);
        const balance = await this._getBalance(ctx, accountMSP);

        if (balance < value) {
            throw new Error('Insufficient balance to burn');
        }

        const infoData = await ctx.stub.getState('tokenInfo');

        if (!infoData.length) {
            throw new Error('AutoCoin is not initialized');
        }

        const info = JSON.parse(infoData.toString());

        await this._setBalance(ctx, accountMSP, balance - value);

        info.totalSupply = (
            BigInt(info.totalSupply) - value
        ).toString();

        await ctx.stub.putState(
            'tokenInfo',
            Buffer.from(JSON.stringify(info))
        );

        return `Burned ${amount} AUTO`;
    }

    // Get total supply
    async TotalSupply(ctx) {
        const data = await ctx.stub.getState('tokenInfo');

        if (!data.length) {
            throw new Error('AutoCoin is not initialized');
        }

        const info = JSON.parse(data.toString());
        return info.totalSupply;
    }
}

module.exports = AutoCoinContract;
