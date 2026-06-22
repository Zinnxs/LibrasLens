export type Point = { x: number; y: number; z?: number };
export type Keypoint = { x: number; y: number; z?: number; name?: string };

// Helper to calculate distance between two points
const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const guessGesture = (keypoints: Keypoint[]): string | null => {
  if (!keypoints || keypoints.length < 21) return null;

  // Keypoints mapping according to TFJS HandPose Detection:
  // 0: wrist
  // Thumb: 1(cmc), 2(mcp), 3(ip), 4(tip)
  // Index: 5(mcp), 6(pip), 7(dip), 8(tip)
  // Middle: 9(mcp), 10(pip), 11(dip), 12(tip)
  // Ring: 13(mcp), 14(pip), 15(dip), 16(tip)
  // Pinky: 17(mcp), 18(pip), 19(dip), 20(tip)

  const wrist = keypoints[0];

  // Simple heuristic for finger extension:
  // Is the distance from finger tip to wrist greater than finger pip to wrist?
  // Also tip should be higher (y is smaller) than the mcp if standing upright,
  // but let's just use purely distance for rotation invariance, combined with some relative checks.

  const isThumbOpen = distance(keypoints[4], keypoints[17]) > distance(keypoints[3], keypoints[17]) * 1.2;
  const isIndexOpen = distance(keypoints[8], wrist) > distance(keypoints[6], wrist) * 1.2;
  const isMiddleOpen = distance(keypoints[12], wrist) > distance(keypoints[10], wrist) * 1.2;
  const isRingOpen = distance(keypoints[16], wrist) > distance(keypoints[14], wrist) * 1.2;
  const isPinkyOpen = distance(keypoints[20], wrist) > distance(keypoints[18], wrist) * 1.2;

  // Let's create an array of booleans for [Thumb, Index, Middle, Ring, Pinky]
  const fingers = [isThumbOpen, isIndexOpen, isMiddleOpen, isRingOpen, isPinkyOpen];

  // O: All fingers slightly open but forming a circle. Let's just use a loose check.
  // We'll rely on our basic checks.

  // A: All fingers closed, thumb might be slightly open to the side
  if (!fingers[1] && !fingers[2] && !fingers[3] && !fingers[4] && fingers[0]) return "A";
  // B: All fingers open except thumb (thumb folded inwards)
  if (fingers[1] && fingers[2] && fingers[3] && fingers[4] && !fingers[0]) return "B";
  // F: Index and thumb touching (closed together), Middle, Ring, Pinky open
  if (!fingers[0] && !fingers[1] && fingers[2] && fingers[3] && fingers[4]) return "F";
  // L: Thumb and index open, rest closed
  if (fingers[0] && fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) return "L";
  // V: Index and middle open, rest closed
  if (!fingers[0] && fingers[1] && fingers[2] && !fingers[3] && !fingers[4]) return "V";
  // U: Index and middle open (but normally they are together). We'll treat V and U as V for this heuristic
  // W: Index, middle, ring open
  if (!fingers[0] && fingers[1] && fingers[2] && fingers[3] && !fingers[4]) return "W";
  // Y: Thumb and pinky open
  if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) return "Y";
  // I: Only pinky open
  if (!fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) return "I";
  // 5 (Open Palm): All fingers open
  if (fingers[0] && fingers[1] && fingers[2] && fingers[3] && fingers[4]) return "5";

  return null;
};
