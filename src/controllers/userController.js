import db from "../config/database.js";
import sendEmail from "../utils/sendEmail.js";
import { ObjectId } from "mongodb";
import { fineLevel } from "../utils/levelProgress.js";

// Controller for handling user classification.
//
// Mode branching (req.body.mode):
//   "set-actual" (default) — actual-1RM-entry path (onboarding, pickNewProgram).
//     Writes current_one_rep_maxes from the payload AND hard-overrides
//     estimated_one_rep_maxes with identical values (regardless of direction).
//     Actual is authoritative — if the prior estimate was higher (e.g., 260
//     from a workout) and the user enters a lower actual (250), estimated
//     drops to 250. Do NOT add a "only override if higher" guard here.
//   "reclassify-only" — post-workout path. Computes classification using the
//     payload's max values for the math, but does NOT write any maxes (not
//     current, not estimated). Only updates current_classification and
//     classification_history.
//
// Default mode (no field / unknown value) is "set-actual" for backwards compat.
export const classification = async (req, res) => {
  try {
    const { email, gender, benchPress, deadlift, squat, bodyWeight, mode } = req.body;
    const isReclassifyOnly = mode === "reclassify-only";
    const users = db.collection("users");

    // Get existing user from DB
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Source of truth for gender / bodyweight depends on mode:
    //   set-actual — req.body is the form-fresh value the user just entered;
    //     fall back to DB only when frontend omits one (legacy behavior).
    //   reclassify-only — req.body comes from a (potentially stale or null)
    //     React-context snapshot at the post-workout Continue click. Never
    //     trust those for facts the server already persists; read from the
    //     loaded user doc instead. This is the fix for Bugs A and B —
    //     prevents history entries from being pushed with bodyweight: 0 or
    //     gender: null when the client's context lags behind the DB.
    const userGender = isReclassifyOnly
      ? existingUser.gender
      : (gender || existingUser.gender);
    const weight = isReclassifyOnly
      ? Number(existingUser.current_bodyweight ?? 0)
      : Number(bodyWeight);

    // Converts input to numbers and calculates total one rep max
    const totalOneRepMax =
      Number(benchPress) +
      Number(deadlift) +
      Number(squat);

    let classification;

    // Gender is male
    if (userGender === "male" || userGender === "other") {

      // Weight class: under 120 lbs
      if (weight < 120) {
        if (totalOneRepMax < 394) {
          classification = "Beginner";
        } else if (totalOneRepMax < 518) {
          classification = "Novice";
        } else if (totalOneRepMax < 658) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 808) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 120 to 130 lbs
      if (weight >= 120 && weight < 130) {
        if (totalOneRepMax < 443) {
          classification = "Beginner";
        } else if (totalOneRepMax < 573) {
          classification = "Novice";
        } else if (totalOneRepMax < 721) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 877) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 130 to 140 lbs
      if (weight >= 130 && weight < 140) {
        if (totalOneRepMax < 490) {
          classification = "Beginner";
        } else if (totalOneRepMax < 627) {
          classification = "Novice";
        } else if (totalOneRepMax < 781) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 943) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 140 to 150 lbs
      if (weight >= 140 && weight < 150) {
        if (totalOneRepMax < 535) {
          classification = "Beginner";
        } else if (totalOneRepMax < 678) {
          classification = "Novice";
        } else if (totalOneRepMax < 838) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1006) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 150 to 160 lbs
      if (weight >= 150 && weight < 160) {
        if (totalOneRepMax < 580) {
          classification = "Beginner";
        } else if (totalOneRepMax < 728) {
          classification = "Novice";
        } else if (totalOneRepMax < 894) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1067) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 160 to 170 lbs
      if (weight >= 160 && weight < 170) {
        if (totalOneRepMax < 623) {
          classification = "Beginner";
        } else if (totalOneRepMax < 777) {
          classification = "Novice";
        } else if (totalOneRepMax < 947) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1125) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 170 to 180 lbs
      if (weight >= 170 && weight < 180) {
        if (totalOneRepMax < 665) {
          classification = "Beginner";
        } else if (totalOneRepMax < 823) {
          classification = "Novice";
        } else if (totalOneRepMax < 999) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1182) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 180 to 190 lbs
      if (weight >= 180 && weight < 190) {
        if (totalOneRepMax < 706) {
          classification = "Beginner";
        } else if (totalOneRepMax < 869) {
          classification = "Novice";
        } else if (totalOneRepMax < 1049) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1236) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 190 to 200 lbs
      if (weight >= 190 && weight < 200) {
        if (totalOneRepMax < 746) {
          classification = "Beginner";
        } else if (totalOneRepMax < 913) {
          classification = "Novice";
        } else if (totalOneRepMax < 1097) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1288) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 200 to 210 lbs
      if (weight >= 200 && weight < 210) {
        if (totalOneRepMax < 784) {
          classification = "Beginner";
        } else if (totalOneRepMax < 956) {
          classification = "Novice";
        } else if (totalOneRepMax < 1144) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1339) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 210 to 220 lbs
      if (weight >= 210 && weight < 220) {
        if (totalOneRepMax < 822) {
          classification = "Beginner";
        } else if (totalOneRepMax < 997) {
          classification = "Novice";
        } else if (totalOneRepMax < 1189) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1388) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 220 to 230 lbs
      if (weight >= 220 && weight < 230) {
        if (totalOneRepMax < 859) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1038) {
          classification = "Novice";
        } else if (totalOneRepMax < 1233) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1436) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 230 to 240 lbs
      if (weight >= 230 && weight < 240) {
        if (totalOneRepMax < 895) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1077) {
          classification = "Novice";
        } else if (totalOneRepMax < 1276) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1482) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 240 to 250 lbs
      if (weight >= 240 && weight < 250) {
        if (totalOneRepMax < 930) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1116) {
          classification = "Novice";
        } else if (totalOneRepMax < 1318) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1527) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 250 to 260 lbs
      if (weight >= 250 && weight < 260) {
        if (totalOneRepMax < 964) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1153) {
          classification = "Novice";
        } else if (totalOneRepMax < 1359) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1571) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 260 to 270 lbs
      if (weight >= 260 && weight < 270) {
        if (totalOneRepMax < 998) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1190) {
          classification = "Novice";
        } else if (totalOneRepMax < 1399) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1614) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 270 to 280 lbs
      if (weight >= 270 && weight < 280) {
        if (totalOneRepMax < 1031) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1226) {
          classification = "Novice";
        } else if (totalOneRepMax < 1438) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1655) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 280 to 290 lbs
      if (weight >= 280 && weight < 290) {
        if (totalOneRepMax < 1063) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1261) {
          classification = "Novice";
        } else if (totalOneRepMax < 1475) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1696) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 290 to 300 lbs
      if (weight >= 290 && weight < 300) {
        if (totalOneRepMax < 1094) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1295) {
          classification = "Novice";
        } else if (totalOneRepMax < 1512) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1736) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 300 to 310 lbs
      if (weight >= 300 && weight < 310) {
        if (totalOneRepMax < 1125) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1328) {
          classification = "Novice";
        } else if (totalOneRepMax < 1549) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1775) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: Over 310 lbs
      if (weight >= 310) {
        if (totalOneRepMax < 1155) {
          classification = "Beginner";
        } else if (totalOneRepMax < 1361) {
          classification = "Novice";
        } else if (totalOneRepMax < 1584) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 1812) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }
    }

    // Gender is female
    if (userGender === "female") {

      // Weight class: under 100 lbs
      if (weight < 100) {
        if (totalOneRepMax < 265) {
          classification = "Beginner";
        } else if (totalOneRepMax < 361) {
          classification = "Novice";
        } else if (totalOneRepMax < 472) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 591) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 100 to 110 lbs
      if (weight >= 100 && weight < 110) {
        if (totalOneRepMax < 289) {
          classification = "Beginner";
        } else if (totalOneRepMax < 389) {
          classification = "Novice";
        } else if (totalOneRepMax < 503) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 626) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 110 to 120 lbs
      if (weight >= 110 && weight < 120) {
        if (totalOneRepMax < 311) {
          classification = "Beginner";
        } else if (totalOneRepMax < 414) {
          classification = "Novice";
        } else if (totalOneRepMax < 532) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 658) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 120 to 130 lbs
      if (weight >= 120 && weight < 130) {
        if (totalOneRepMax < 332) {
          classification = "Beginner";
        } else if (totalOneRepMax < 438) {
          classification = "Novice";
        } else if (totalOneRepMax < 559) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 688) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 130 to 140 lbs
      if (weight >= 130 && weight < 140) {
        if (totalOneRepMax < 352) {
          classification = "Beginner";
        } else if (totalOneRepMax < 461) {
          classification = "Novice";
        } else if (totalOneRepMax < 585) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 717) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 140 to 150 lbs
      if (weight >= 140 && weight < 150) {
        if (totalOneRepMax < 371) {
          classification = "Beginner";
        } else if (totalOneRepMax < 482) {
          classification = "Novice";
        } else if (totalOneRepMax < 609) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 744) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 150 to 160 lbs
      if (weight >= 150 && weight < 160) {
        if (totalOneRepMax < 389) {
          classification = "Beginner";
        } else if (totalOneRepMax < 503) {
          classification = "Novice";
        } else if (totalOneRepMax < 632) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 769) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 160 to 170 lbs
      if (weight >= 160 && weight < 170) {
        if (totalOneRepMax < 406) {
          classification = "Beginner";
        } else if (totalOneRepMax < 523) {
          classification = "Novice";
        } else if (totalOneRepMax < 654) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 793) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 170 to 180 lbs
      if (weight >= 170 && weight < 180) {
        if (totalOneRepMax < 422) {
          classification = "Beginner";
        } else if (totalOneRepMax < 541) {
          classification = "Novice";
        } else if (totalOneRepMax < 675) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 816) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 180 to 190 lbs
      if (weight >= 180 && weight < 190) {
        if (totalOneRepMax < 438) {
          classification = "Beginner";
        } else if (totalOneRepMax < 559) {
          classification = "Novice";
        } else if (totalOneRepMax < 695) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 838) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 190 to 200 lbs
      if (weight >= 190 && weight < 200) {
        if (totalOneRepMax < 454) {
          classification = "Beginner";
        } else if (totalOneRepMax < 577) {
          classification = "Novice";
        } else if (totalOneRepMax < 714) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 859) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 200 to 210 lbs
      if (weight >= 200 && weight < 210) {
        if (totalOneRepMax < 468) {
          classification = "Beginner";
        } else if (totalOneRepMax < 593) {
          classification = "Novice";
        } else if (totalOneRepMax < 733) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 880) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 210 to 220 lbs
      if (weight >= 210 && weight < 220) {
        if (totalOneRepMax < 483) {
          classification = "Beginner";
        } else if (totalOneRepMax < 609) {
          classification = "Novice";
        } else if (totalOneRepMax < 750) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 899) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 220 to 230 lbs
      if (weight >= 220 && weight < 230) {
        if (totalOneRepMax < 496) {
          classification = "Beginner";
        } else if (totalOneRepMax < 625) {
          classification = "Novice";
        } else if (totalOneRepMax < 768) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 918) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 230 to 240 lbs
      if (weight >= 230 && weight < 240) {
        if (totalOneRepMax < 510) {
          classification = "Beginner";
        } else if (totalOneRepMax < 640) {
          classification = "Novice";
        } else if (totalOneRepMax < 784) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 936) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 240 to 250 lbs
      if (weight >= 240 && weight < 250) {
        if (totalOneRepMax < 523) {
          classification = "Beginner";
        } else if (totalOneRepMax < 654) {
          classification = "Novice";
        } else if (totalOneRepMax < 800) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 953) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: 250 to 260 lbs
      if (weight >= 250 && weight < 260) {
        if (totalOneRepMax < 535) {
          classification = "Beginner";
        } else if (totalOneRepMax < 668) {
          classification = "Novice";
        } else if (totalOneRepMax < 816) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 970) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }

      // Weight class: Over 260 lbs
      if (weight >= 260) {
        if (totalOneRepMax < 547) {
          classification = "Beginner";
        } else if (totalOneRepMax < 682) {
          classification = "Novice";
        } else if (totalOneRepMax < 831) {
          classification = "Intermediate";
        } else if (totalOneRepMax < 987) {
          classification = "Advanced";
        } else {
          classification = "Elite";
        }
      }
    }

    // Save classification data to the database
    // Note: onboarding_complete is NOT set here — it's set after the goals
    // step in userRoutes.js once the workout is fully generated
    //const users = db.collection("users");

    // Build $set object dynamically. The mode flag gates the max-writing
    // half of the update — in reclassify-only mode we touch ONLY the
    // classification fields (and gender, if provided), never the maxes.
    const updateFields = {};

    if (!isReclassifyOnly) {
      updateFields.current_bodyweight = weight;
      const maxes = {
        bench: Number(benchPress),
        squat: Number(squat),
        deadlift: Number(deadlift),
      };
      updateFields.current_one_rep_maxes = maxes;
      // Hard override on estimated — actual is authoritative regardless of
      // direction (if the prior estimate was 260 from a workout and the user
      // enters 250 here, estimated drops to 250). No "only if higher" guard.
      //
      // Full-object write is INTENTIONAL asymmetry with the dotted-path write
      // in services/processBig3Progression.js. The two paths have different
      // contracts: this path receives all three lifts from a single user-entry
      // form and clamps the entire dict atomically (a partial write here would
      // leave stale per-lift values from a prior actual-entry mixed with the
      // new ones). processBig3Progression sees only the big-3 lifts that
      // happened to be performed in this workout and must NOT touch the
      // others, hence dotted-path. Keep both write shapes — do not unify.
      updateFields.estimated_one_rep_maxes = { ...maxes };
    }

    // Gender writes happen ONLY in set-actual mode (onboarding / re-classify
    // form submissions). reclassify-only must never overwrite persisted
    // gender — the post-workout client legitimately sends user.gender from a
    // context snapshot that can be null, and the loose `!== undefined` check
    // would nuke the field. Set-actual mode also tightens to `!== null` (the
    // user-entry forms never legitimately send null; defense-in-depth against
    // any future caller that does).
    if (!isReclassifyOnly && gender !== undefined && gender !== null) {
      updateFields.gender = gender;
    }
    // Only update classification if we actually determined one
    if (classification) updateFields.current_classification = classification;

    // Beginner-1 anchor: sticky one-time write. The first time a user lands
    // at Beginner 1 (fine-level) with a non-zero total, snapshot their total
    // as the anchor. Used client-side as the left-bound for the level bar
    // fill while the user is at Beginner 1 — gives them a visible starting
    // point that the bar fills away from, instead of pinning to the
    // Beginner-1-floor threshold (which can be hundreds of pounds above a
    // sub-threshold total).
    //
    // Use `== null` (not `!`) so a hypothetical anchor === 0 wouldn't be
    // overwritten. Sticky on re-entry: if the user crosses into Beginner 2
    // and later drops back, the existing anchor is preserved (the gate
    // skips the write).
    let newAnchor = null;
    if (
      existingUser.beginner_1_anchor == null &&
      totalOneRepMax > 0 &&
      userGender &&
      weight > 0
    ) {
      const fine = fineLevel({ sex: userGender, bodyweight: weight, total: totalOneRepMax });
      if (fine === "Beginner 1") {
        updateFields.beginner_1_anchor = totalOneRepMax;
        newAnchor = totalOneRepMax;
      }
    }

const classificationEntry = {
      squat: Number(squat),
      bench: Number(benchPress),
      deadlift: Number(deadlift),
      total: totalOneRepMax,
      bodyweight: weight,
      classification: classification || null,
      gender: userGender,
      date: new Date(),
    };

    // In reclassify-only mode, do not push a bodyweight_history entry — the
    // bodyweight in the payload is the client's stored value, not a fresh
    // entry, and duplicating it on every post-workout call would clutter
    // the history. classification_history always pushes; that's the
    // purpose of the call.
    const pushFields = { classification_history: classificationEntry };
    if (!isReclassifyOnly) {
      pushFields.bodyweight_history = { value: weight, date: new Date() };
    }
    await users.updateOne(
      { email },
      {
        $set: updateFields,
        $push: pushFields,
      }
    );
    // Send email if classification exists — fire-and-forget so SMTP latency
    // doesn't block the HTTP response (Gmail handshakes from Railway can stall
    // up to nodemailer's 2-min timeout, leaving the user stuck on the form).
    if (classification) {
      sendEmail({
        to: existingUser.email,
        subject: "Your Strength Classification Results 💪",
        text: `Classification: ${classification}`,
      }).catch(err => console.error("Email failed:", err.message));
    }

    // beginner1Anchor in the response so the client mirror can pick it up
    // immediately (without waiting for the next app-boot bootstrap fetch to
    // refresh user state). Reports the just-written value when this call
    // performed the first write, OR the pre-existing value otherwise. Null
    // for users still above Beginner 1 with no anchor yet.
    res.status(200).json({
      totalOneRepMax,
      classification,
      gender: userGender,
      beginner1Anchor: newAnchor ?? existingUser.beginner_1_anchor ?? null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const users = db.collection("users");

    const existingUser = await users.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    await users.insertOne({
      name,
      email,
      password,
    });

    // send email when user is created
    try {
      await sendEmail({
        to: email,
        subject: "Welcome to MaxMethod 💪",
        text: `Hey ${name},

Your account has been successfully created!

- MaxMethod`,
      });
    } catch (err) {
      console.error("Email failed:", err);
    }

    res.status(201).json({ message: "User created" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating user" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, gender } = req.body;

    const users = db.collection("users");

    const existingUser = await users.findOne({ _id: new ObjectId(id) });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (gender) updateFields.gender = gender;

    await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    // send email when user profile is updated
    try {
      await sendEmail({
        to: email || existingUser.email,
        subject: "Profile Updated",
        text: `Hi ${name || existingUser.name},

Your profile was updated successfully.`,
      });
    } catch (err) {
      console.error("Email failed:", err);
    }

    return res.status(200).json({ message: "Profile updated" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating user" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const users = db.collection("users");

    const user = await users.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.password !== currentPassword) {
      return res.status(400).json({ message: "Current password incorrect" });
    }

    await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { password: newPassword } }
    );

    // send email when user password is changed
    try {
      await sendEmail({
        to: user.email,
        subject: "Password Changed 🔐",
        text: `Hi ${user.name},

Your password was successfully updated.`,
      });
    } catch (err) {
      console.error("Email failed:", err);
    }

    return res.status(200).json({ message: "Password updated" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error changing password" });
  }
};