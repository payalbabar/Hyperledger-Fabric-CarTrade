'use strict';

const { Contract } = require('fabric-contract-api');

class VehicleContract extends Contract {

    async CreateVehicle(ctx, vehicleId, make, model, owner) {
        const existing = await ctx.stub.getState(vehicleId);

        if (existing && existing.length > 0) {
            throw new Error(`Vehicle ${vehicleId} already exists`);
        }

        const vehicle = {
            vehicleId,
            make,
            model,
            owner
        };

        await ctx.stub.putState(
            vehicleId,
            Buffer.from(JSON.stringify(vehicle))
        );

        return JSON.stringify(vehicle);
    }

    async ReadVehicle(ctx, vehicleId) {
        const data = await ctx.stub.getState(vehicleId);

        if (!data || data.length === 0) {
            throw new Error(`Vehicle ${vehicleId} does not exist`);
        }

        return data.toString();
    }

    async CreatePrivateDeal(ctx, vehicleId) {
        const mspId = ctx.clientIdentity.getMSPID();

        if (!['Org1MSP', 'Org2MSP'].includes(mspId)) {
            throw new Error('Access denied: Only Dealer and Buyer can create private deals');
        }

        const vehicle = await ctx.stub.getState(vehicleId);

        if (!vehicle || vehicle.length === 0) {
            throw new Error(`Vehicle ${vehicleId} does not exist`);
        }

        const transientData = ctx.stub.getTransient();
        const dealBytes = transientData.get('deal');

        if (!dealBytes) {
            throw new Error('Private deal data missing from transient data');
        }

        const deal = JSON.parse(dealBytes.toString());

        const { originalPrice, discount, finalPrice } = deal;

        if (
            !Number.isSafeInteger(originalPrice) ||
            !Number.isSafeInteger(discount) ||
            !Number.isSafeInteger(finalPrice) ||
            originalPrice <= 0 ||
            discount < 0 ||
            discount > originalPrice ||
            finalPrice !== originalPrice - discount
        ) {
            throw new Error('Invalid deal prices');
        }

        const privateDeal = {
            vehicleId,
            originalPrice,
            discount,
            finalPrice
        };

        await ctx.stub.putPrivateData(
            'DealerBuyerPrivateCollection',
            vehicleId,
            Buffer.from(JSON.stringify(privateDeal))
        );

        return 'Private deal saved successfully';
    }

    async ReadPrivateDeal(ctx, vehicleId) {
        const mspId = ctx.clientIdentity.getMSPID();

        if (!['Org1MSP', 'Org2MSP'].includes(mspId)) {
            throw new Error('Access denied: You are not a collection member');
        }

        const data = await ctx.stub.getPrivateData(
            'DealerBuyerPrivateCollection',
            vehicleId
        );

        if (!data || data.length === 0) {
            throw new Error('Private deal not found');
        }

        return data.toString();
    }
}

module.exports = VehicleContract;
