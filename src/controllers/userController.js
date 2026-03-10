import db from "../config/database.js";

// Controller for handling user classification
export const classification = async (req, res) => {
  try {
    const { email, gender, benchPress, deadlift, squat, bodyWeight } = req.body;

    // Converts input to numbers and calculates total one rep max
    const totalOneRepMax =
      Number(benchPress) +
      Number(deadlift) +
      Number(squat);

    // Convert body weight to a number
    const weight = Number(bodyWeight);

    let classification = "Unclassified";

    // Gender is male
    if (gender === "male" || gender === "other") {
      
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
    if (gender === "female") {
      
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

    // Saves the classification data to the database
     const users = db.collection("users")

    await users.updateOne(
      {email: email},
      {
        $set:{
          gender,
          current_bodyweight: weight,
          current_one_rep_maxes: {
            bench: Number(benchPress),
            squat: Number(squat),
            deadlift: Number(deadlift)
          },
          current_classification: classification,
          onboarding_complete: true
        }
      }

    );

    res.status(200).json({
      totalOneRepMax,
      classification
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


// Controller for handling user goals
export const goals = async (req, res) => {
  try {
    const { daysPerWeek, goalSelection, classification } = req.body;

    // Days per week = 3
    if (daysPerWeek === "3" && goalSelection === "loseWeight") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "3" && goalSelection === "buildMuscle") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "3" && goalSelection === "getStronger") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    }

    // Days per week = 4
    if (daysPerWeek === "4" && goalSelection === "loseWeight") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "4" && goalSelection === "buildMuscle") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "4" && goalSelection === "getStronger") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    }

    // Days per week = 5
    if (daysPerWeek === "5" && goalSelection === "loseWeight") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "5" && goalSelection === "buildMuscle") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    } else if (daysPerWeek === "5" && goalSelection === "getStronger") {
      console.log(
        "Classification Level:", classification,
        "Days per Week:", daysPerWeek,
        "Goal Selection:", goalSelection
      );
    }

    // Saves the goals input data to the database
    const collection = await db.collection("goals");

  

    const result = await collection.insertOne({
      classification,
      daysPerWeek,
      goalSelection
    });

    res.status(200).json({
      classification,
      daysPerWeek,
      goalSelection
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};