import {setServers} from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);

import dotenv from "dotenv";
dotenv.config();

import { MongoClient, ServerApiVersion } from "mongodb";

const URI = process.env.MONGODB_URI;

const client = new MongoClient(URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    appName: "max-method",
});

let db;

try {
    // Connect the client to the server
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("Maxmethod_db").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    db = client.db("Maxmethod_db")
} catch (err) {
    console.error(err);
}
export default db;