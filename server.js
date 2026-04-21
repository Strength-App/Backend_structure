import express from "express";
import cors from "cors";
import db from "./src/config/database.js";
import users from "./src/routes/userRoutes.js"
import * as path from "path";
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(".env") });

const PORT = process.env.PORT || 5050;

const app = express();
const mongoURI = process.env.MONGODB_URI;
const corsOptions = {
    origin: [
        'https://maxmethod-fitness.com',
        'https://www.maxmethod-fitness.com',
        'http://localhost:3000'
    ]
};

const __dirname = path.resolve();

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/users", users)

app.set("view-engine","react-html-parser")

// Home, Classification, Goals pages, History, Settings
app.get("/health",  (req, res, next) => {
    res.json({status: "ok"});
});
//
// app.get("/classification", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/goals", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/history", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/settings", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });

// start the Express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
