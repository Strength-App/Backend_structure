import express from "express";
import cors from "cors";
// node --env-file=config.env server
import db from "./src/config/database.js";
import userRoutes from "./src/routes/userRoutes.js";
import * as path from "path";
import dotenv from "dotenv"

dotenv.config()

const PORT = process.env.PORT || 5050;
const app = express();
const mongoURI = process.env.MONGODB_URI;
const corsOptions = {
    origin: ["http://localhost:5173"],
    optionsSuccessStatus: 200

};

const __dirname = path.resolve();


app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/users", userRoutes);

app.post("/logintest", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await db.collection("users").findOne({ email: email });
    console.log(user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (password !== user.password) {
      return res.status(401).json({ message: "Wrong password" });
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

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// start the Express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
