import express from "express";
import db from "../config/database.js";
import getMongoClient from "mongodb";
import { classification } from "../controllers/userController.js";


// Creates an instance of the Express router, used to define our routes
const router = express.Router();


// Add Users
router.post("/add", async (req, res) => {
    try{
        const collection = await db.collection("users");
        const new_user = {
            name: req.body.name,
            email: req.body.email,
            password: req.body.password
        }

        const result = await collection.insertOne(new_user);
        res.status(201).json(result)
    }
    catch(err){
        console.error(err);
        res.status(500).send("Error adding user")
    }
});

// Gets a list of all the users
router.get("/login", async (req, res) => {
    let collection = await db.collection("users");
    const login = {
        email: req.body.email,
        password: req.body.password}
    let results = await collection.findOne(login);
    res.send(results).status(200);
});

router.post("/classification", classification);

export default router;
