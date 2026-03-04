import express from "express";
import bcrypt from "bcrypt";
import db from "../config/database.js";
import getMongoClient from "mongodb";
import { classification } from "../controllers/userController.js";


// Creates an instance of the Express router, used to define our routes
const router = express.Router();

// Hash password
const saltRounds = 10;

// Add Users
router.post("/add", async (req, res) => {
    try{
        const collection = await db.collection("users");
        const { name, email, password } = req.body;
        
        //Check if user already exist
        const existingUser = await collection.findOne({email});
        if (existingUser){
            return res.status(400).json({message: "Email already registered"});
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const new_user = {
            name,
            email,
            password: hashedPassword
        };

        const result = await collection.insertOne(new_user);
        res.status(201).json(result)
    }
    catch(err){
        console.error(err);
        res.status(500).send("Error adding user")
    }
});

// Login user
router.post("/login", async (req, res) => {
    try{
        let collection = await db.collection("users");
        const {email, password} = req.body;

        // find user email
        let user = await collection.findOne({email});

        if (!user){
            return res.status(400).send("User not found")
        }
        // Compare plain password with stored hashed password
        const isMatch = await bcrypt.compare(password, user.password)

        if (!isMatch){
            return res.status(400).send("Invalid credentials");
        }
    
        res.json({message: "Login succesful"});
    } catch (err){
        console.error(err);
        res.status(500).send("Login error")
    }
});

router.post("/classification", classification);

export default router;
