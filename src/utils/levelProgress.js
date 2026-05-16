// 13-level fine classification — server-side twin of the client's
// classification.js. Bucket-stepped so the rollup of fine → coarse always
// equals the server's existing 5-level coarse classification (positions
// [3, 6, 9, 12] of every row equal the server's 4 coarse boundaries).
//
// MIRROR: keep in sync with
// client/max-method/src/utils/classification.js. Threshold tables and helper
// signatures must match byte-for-byte. The unit test at
// tests/unit/levelProgress.test.js asserts deepEqual on both tables against
// a copied fixture — table drift between server and client will fail that
// test immediately on next run.
//
// Used by the classification handler to detect when a user has just landed
// at Beginner 1 (anchor write). Other consumers may use fineLevel directly.

export const MALE_THRESHOLDS = {
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

export const FEMALE_THRESHOLDS = {
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

export const FINE_LABELS = [
  'Beginner 1', 'Beginner 2', 'Beginner 3',
  'Novice 1', 'Novice 2', 'Novice 3',
  'Intermediate 1', 'Intermediate 2', 'Intermediate 3',
  'Advanced 1', 'Advanced 2', 'Advanced 3',
  'Elite',
];

// "other" rolls to male table, matching the coarse-classification handler
// at userController.js (`if (userGender === "male" || userGender === "other")`).
function tableFor(sex) {
  return sex === 'female' ? FEMALE_THRESHOLDS : MALE_THRESHOLDS;
}

export function bucketBodyweight(sex, bodyweight) {
  const bw = Number(bodyweight);
  const isFemale = sex === 'female';
  const min = isFemale ? 90 : 110;
  const max = isFemale ? 260 : 310;
  const stepped = Math.floor(bw / 10) * 10;
  return Math.max(min, Math.min(max, stepped));
}

function getThresholds(sex, bodyweight) {
  const row = bucketBodyweight(sex, bodyweight);
  return tableFor(sex)[row];
}

function findFineIndex(thresholds, total) {
  const t = Number(total);
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (t >= thresholds[i]) idx = i;
    else break;
  }
  return idx;
}

export function fineLevel({ sex, bodyweight, total }) {
  const thresholds = getThresholds(sex, bodyweight);
  if (!thresholds) return null;
  const idx = findFineIndex(thresholds, total);
  return FINE_LABELS[idx];
}
