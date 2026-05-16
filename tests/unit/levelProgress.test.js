/**
 * levelProgress.test.js
 *
 * Unit tests for the server-side level helper. The most important test in
 * this file is the THRESHOLD-TABLE PARITY check: a verbatim copy of the
 * client's MALE_THRESHOLDS / FEMALE_THRESHOLDS objects lives below as a
 * fixture, and the test asserts deepEqual against the server's exports.
 * If either side ever drifts (server twin diverges from client source-of-
 * truth, or vice versa), this test fails immediately. The MIRROR comments
 * at the top of each file are documentation; this test is enforcement.
 *
 * Run with:  node --test tests/unit/levelProgress.test.js
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MALE_THRESHOLDS,
  FEMALE_THRESHOLDS,
  FINE_LABELS,
  bucketBodyweight,
  fineLevel,
} from "../../src/utils/levelProgress.js";

// ─── Threshold-table parity fixtures ──────────────────────────────────────
// VERBATIM copy of client/max-method/src/utils/classification.js's
// MALE_THRESHOLDS and FEMALE_THRESHOLDS. Do not edit these directly. If a
// table needs to change, update the client source first, then mirror the
// change to the server's levelProgress.js, then paste the new client
// fixture HERE. The parity test below will fail until all three locations
// agree byte-for-byte.

const EXPECTED_MALE_THRESHOLDS = {
  110: [292, 326, 360, 394, 435, 477, 518, 565, 611, 658, 708, 758, 808],
  120: [334, 370, 407, 443, 486, 530, 573, 622, 672, 721, 773, 825, 877],
  130: [375, 413, 452, 490, 536, 581, 627, 678, 730, 781, 835, 889, 943],
  140: [415, 455, 495, 535, 583, 630, 678, 731, 785, 838, 894, 950, 1006],
  150: [454, 496, 538, 580, 629, 679, 728, 783, 839, 894, 952, 1009, 1067],
  160: [492, 536, 579, 623, 674, 726, 777, 834, 890, 947, 1006, 1066, 1125],
  170: [530, 575, 620, 665, 718, 770, 823, 882, 940, 999, 1060, 1121, 1182],
  180: [566, 613, 659, 706, 760, 815, 869, 929, 989, 1049, 1111, 1174, 1236],
  190: [602, 650, 698, 746, 802, 857, 913, 974, 1036, 1097, 1161, 1224, 1288],
  200: [637, 686, 735, 784, 841, 899, 956, 1019, 1081, 1144, 1209, 1274, 1339],
  210: [671, 721, 772, 822, 880, 939, 997, 1061, 1125, 1189, 1255, 1322, 1388],
  220: [704, 756, 807, 859, 919, 978, 1038, 1103, 1168, 1233, 1301, 1368, 1436],
  230: [737, 790, 842, 895, 956, 1016, 1077, 1143, 1210, 1276, 1345, 1413, 1482],
  240: [769, 823, 876, 930, 992, 1054, 1116, 1183, 1251, 1318, 1388, 1457, 1527],
  250: [800, 855, 909, 964, 1027, 1090, 1153, 1222, 1290, 1359, 1430, 1500, 1571],
  260: [830, 886, 942, 998, 1062, 1126, 1190, 1260, 1329, 1399, 1471, 1542, 1614],
  270: [860, 917, 974, 1031, 1096, 1161, 1226, 1297, 1367, 1438, 1510, 1583, 1655],
  280: [890, 948, 1005, 1063, 1129, 1195, 1261, 1332, 1404, 1475, 1549, 1622, 1696],
  290: [918, 977, 1035, 1094, 1161, 1228, 1295, 1367, 1440, 1512, 1587, 1661, 1736],
  300: [947, 1006, 1066, 1125, 1193, 1260, 1328, 1402, 1475, 1549, 1624, 1700, 1775],
  310: [974, 1034, 1095, 1155, 1224, 1292, 1361, 1435, 1510, 1584, 1660, 1736, 1812],
};

const EXPECTED_FEMALE_THRESHOLDS = {
   90: [188, 214, 239, 265, 297, 329, 361, 398, 435, 472, 512, 551, 591],
  100: [208, 235, 262, 289, 322, 356, 389, 427, 465, 503, 544, 585, 626],
  110: [226, 254, 283, 311, 345, 380, 414, 453, 493, 532, 574, 616, 658],
  120: [244, 273, 303, 332, 367, 403, 438, 478, 519, 559, 602, 645, 688],
  130: [261, 291, 322, 352, 388, 425, 461, 502, 544, 585, 629, 673, 717],
  140: [278, 309, 340, 371, 408, 445, 482, 524, 567, 609, 654, 699, 744],
  150: [293, 325, 357, 389, 427, 465, 503, 546, 589, 632, 678, 723, 769],
  160: [308, 341, 373, 406, 445, 484, 523, 567, 610, 654, 700, 747, 793],
  170: [323, 356, 389, 422, 462, 501, 541, 586, 630, 675, 722, 769, 816],
  180: [337, 371, 404, 438, 478, 519, 559, 604, 650, 695, 743, 790, 838],
  190: [350, 385, 419, 454, 495, 536, 577, 623, 668, 714, 762, 811, 859],
  200: [363, 398, 433, 468, 510, 551, 593, 640, 686, 733, 782, 831, 880],
  210: [375, 411, 447, 483, 525, 567, 609, 656, 703, 750, 800, 849, 899],
  220: [388, 424, 460, 496, 539, 582, 625, 673, 720, 768, 818, 868, 918],
  230: [399, 436, 473, 510, 553, 597, 640, 688, 736, 784, 835, 885, 936],
  240: [411, 448, 486, 523, 567, 610, 654, 703, 751, 800, 851, 902, 953],
  250: [422, 460, 497, 535, 579, 624, 668, 717, 767, 816, 867, 919, 970],
  260: [433, 471, 509, 547, 592, 637, 682, 732, 781, 831, 883, 935, 987],
};

const EXPECTED_FINE_LABELS = [
  'Beginner 1', 'Beginner 2', 'Beginner 3',
  'Novice 1', 'Novice 2', 'Novice 3',
  'Intermediate 1', 'Intermediate 2', 'Intermediate 3',
  'Advanced 1', 'Advanced 2', 'Advanced 3',
  'Elite',
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe("threshold-table parity (client ↔ server)", () => {
  test("MALE_THRESHOLDS matches client fixture verbatim", () => {
    assert.deepStrictEqual(MALE_THRESHOLDS, EXPECTED_MALE_THRESHOLDS);
  });

  test("FEMALE_THRESHOLDS matches client fixture verbatim", () => {
    assert.deepStrictEqual(FEMALE_THRESHOLDS, EXPECTED_FEMALE_THRESHOLDS);
  });

  test("FINE_LABELS matches client fixture verbatim", () => {
    assert.deepStrictEqual(FINE_LABELS, EXPECTED_FINE_LABELS);
  });
});

describe("bucketBodyweight", () => {
  test("male clamps to [110, 310] in steps of 10", () => {
    assert.strictEqual(bucketBodyweight("male", 100), 110);
    assert.strictEqual(bucketBodyweight("male", 110), 110);
    assert.strictEqual(bucketBodyweight("male", 115), 110);
    assert.strictEqual(bucketBodyweight("male", 199), 190);
    assert.strictEqual(bucketBodyweight("male", 200), 200);
    assert.strictEqual(bucketBodyweight("male", 350), 310);
  });

  test("female clamps to [90, 260] in steps of 10", () => {
    assert.strictEqual(bucketBodyweight("female", 80), 90);
    assert.strictEqual(bucketBodyweight("female", 90), 90);
    assert.strictEqual(bucketBodyweight("female", 145), 140);
    assert.strictEqual(bucketBodyweight("female", 300), 260);
  });

  test("'other' uses male bucket range (matches handler's male||other branch)", () => {
    assert.strictEqual(bucketBodyweight("other", 100), 110);
    assert.strictEqual(bucketBodyweight("other", 200), 200);
  });
});

describe("fineLevel", () => {
  // Sample row: MALE_THRESHOLDS[180] = [566, 613, 659, 706, 760, 815, 869, 929, 989, 1049, 1111, 1174, 1236]
  // → index 0 = Beginner 1, index 3 = Novice 1, index 12 = Elite

  test("below the floor returns Beginner 1 (sub-threshold case)", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 100 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 0 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 565 }), "Beginner 1");
  });

  test("at the Beginner 1 floor returns Beginner 1", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 566 }), "Beginner 1");
  });

  test("just below Beginner 2 boundary still returns Beginner 1", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 612 }), "Beginner 1");
  });

  test("at Beginner 2 boundary returns Beginner 2", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 613 }), "Beginner 2");
  });

  test("at Novice 1 boundary returns Novice 1 (coarse boundary too)", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 706 }), "Novice 1");
  });

  test("at Elite floor returns Elite", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 1236 }), "Elite");
  });

  test("above Elite floor still returns Elite", () => {
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 180, total: 9999 }), "Elite");
  });

  test("female table is consulted for sex='female'", () => {
    // FEMALE_THRESHOLDS[140][1] = 309 (Beginner 2 boundary)
    assert.strictEqual(fineLevel({ sex: "female", bodyweight: 140, total: 308 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "female", bodyweight: 140, total: 309 }), "Beginner 2");
  });

  test("'other' uses male table", () => {
    // MALE_THRESHOLDS[180][1] = 613
    assert.strictEqual(fineLevel({ sex: "other", bodyweight: 180, total: 612 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "other", bodyweight: 180, total: 613 }), "Beginner 2");
  });

  test("bodyweight outside table range clamps to nearest bucket", () => {
    // bw=50 (sub-floor) for male clamps to 110 → MALE_THRESHOLDS[110][0]=292
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 50, total: 291 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 50, total: 292 }), "Beginner 1");
    assert.strictEqual(fineLevel({ sex: "male", bodyweight: 50, total: 326 }), "Beginner 2");
  });
});
