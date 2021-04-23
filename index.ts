
import jwt = require('jsonwebtoken');
import jwksClient = require('jwks-rsa');

import {
    AzureCliCredential,
    ChainedTokenCredential,
    ManagedIdentityCredential,
    VisualStudioCodeCredential
} from "@azure/identity";
import express = require('express');
import { CosmosClient, Container, Item } from "@azure/cosmos";

const SERVER_PORT = process.env.PORT || 8000;
const jwtKeyDiscoveryEndpoint = "https://login.microsoftonline.com/common/discovery/keys";
const cosmosEndpoint = "https://az-fun-demo-cm.documents.azure.com";
const excpectedScopes: string[] = ["access_as_reader"];

const credential = new ChainedTokenCredential(
    new AzureCliCredential(),
    new VisualStudioCodeCredential(),
    new ManagedIdentityCredential()
);
let accessToken;

const cosmosClient = new CosmosClient({ 
    endpoint: cosmosEndpoint, 
    aadCredentials: credential 
});

const validateJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];

        const validationOptions = {
            audience: config.auth.clientId,
            issuer: `${config.auth.authority}/v2.0`
        }

        jwt.verify(token, getSigningKeys, validationOptions, (err, payload) => {
            accessToken = payload;
            if (err) {
                console.log(err);
                return res.sendStatus(403);
            }
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

const getSigningKeys = (header, callback) => {
    var client = jwksClient({
        jwksUri: jwtKeyDiscoveryEndpoint
    });

    client.getSigningKey(header.kid, function (err, key) {
        var signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
};

function confirmRequestHasTheRightScope(scopes:Array<string>): boolean{
    const tokenScopes:Array<string> = accessToken.scp.split(" ");
    scopes.forEach(scope => {
        if(!tokenScopes.includes(scope)){
            return false;
        }
    });
    return true;
}

const config = {
    auth: {
        clientId: "c7639087-cb59-4011-88ed-5d535bafc525",
        tenantId: "e801a3ad-3690-4aa0-a142-1d77cb360b07",
        authority: "https://login.microsoftonline.com/e801a3ad-3690-4aa0-a142-1d77cb360b07",
    }
};

// Create Express App and Routes
const app = express();

app.get('/', (req, res)=>{
    var data = {
        "endpoint1": "/getvolcanodata?volcanoname=<name>",
        "endpoint2": "/getCosmosData"
    };
    res.status(200).send(data); 
})

app.get('/getCosmosData', validateJwt, async (req, res) => {
    if(confirmRequestHasTheRightScope(excpectedScopes)){
        const data = await getCosmosData();
        res.status(200).send(data);
    }
    res.status(403).send("Unauthorized. The token doesn't has a valid scopes");
});

app.get('/getVolcanoData', validateJwt, async(req, res)=> {
    if(confirmRequestHasTheRightScope(excpectedScopes)){
        const data = await getVolcanoDataByName(req.query.volcanoname.toString());
        res.status(200).send(data);
    }
    res.status(403).send("Unauthorized. The token doesn't has a valid scopes");
});

app.listen(SERVER_PORT, () => console.log(`Secure Node Web API listening on port ${SERVER_PORT}!`))

async function getVolcanoDataByName(volcanoName: string): Promise<Array<string>> {
    const container = cosmosClient.database('VolcanoList').container('Volcanos');
    const results = await container.items
        .query({
            query: "SELECT * FROM Volcano f WHERE  f.VolcanoName = @volcanoName",
            parameters: [{ name: "@volcanoName", value: volcanoName }]
        })
        .fetchAll();
    return results.resources;
}

async function getCosmosData(): Promise<Array<any>> {
    try {
        let data: any[] = [];
        const container = cosmosClient.database('VolcanoList').container('Volcanos');
        const results = await container.items.readAll().fetchAll();
        //get the first 10 items
        let index = 0;
        while (index < 10) {
            data.push(results.resources[index]);
            index++;
        };
        return data;
    }
    catch (error) {
        console.error(error);
    }
    return [];
};