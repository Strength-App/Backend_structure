import express from "express";
import bcrypt from "bcrypt";
import db from "../config/database.js";
import { classification } from "../controllers/userController.js";
import { goals } from "../controllers/userController.js";

const router = express.Router();

const saltRounds = 10;

// Add Users
router.post("/create-account", async (req, res) => {
    try{
        const collection = db.collection("users");
        const { firstName, lastName, email, password } = req.body;
        
        const existingUser = await collection.findOne({email});
        if (existingUser){
            return res.status(400).json({message: "Email already registered"});
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const new_user = {
            firstName,
            lastName,
            email,
            password: hashedPassword,
            onboarding_complete: false,
            gender: null,
            current_bodyweight: null,
            current_one_rep_maxes: {
                squat: null,
                bench: null,
                deadlift: null
            },
            current_classification: null,
            current_workout_id: null
        };

        const result = await collection.insertOne(new_user);
        res.status(201).json({
            _id: result.insertedId,
            firstName,
            lastName,
            email
        })
    }
    catch(err){
        console.error(err);
        res.status(500).send("Error adding user")
    }
});

// Login user
router.post("/login", async (req, res) => {
    try{
        let collection = db.collection("users");
        const {email, password} = req.body;

        let user = await collection.findOne({email});

        if (!user){
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch){
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const { name_first, name_last, bday, gender, current_bodyweight, current_one_rep_maxes, current_classification} = user;

        res.status(200).json({ 
            success: true,
            user: {
                email, 
                name_first, 
                name_last, 
                bday, 
                gender, 
                current_bodyweight, 
                current_one_rep_maxes, 
                current_classification 
            }
        });

    } catch (err){
        console.error(err);
        res.status(500).json({ success: false, message: "Login error" });
    }
});

// Classification
router.post("/classification", classification);

// Goals
router.post("/goals", goals);

export default router;