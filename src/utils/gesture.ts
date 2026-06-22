export type Point = { x: number; y: number; z?: number };
export type Keypoint = { x: number; y: number; z?: number; name?: string };

const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const guessGesture = (keypoints: Keypoint[]): string | null => {
  if (!keypoints || keypoints.length < 21) return null;

  const wrist = keypoints[0];
  const thumb = { mcp: keypoints[2], ip: keypoints[3], tip: keypoints[4] };
  const index = { mcp: keypoints[5], pip: keypoints[6], tip: keypoints[8] };
  const middle = { mcp: keypoints[9], pip: keypoints[10], tip: keypoints[12] };
  const ring = { mcp: keypoints[13], pip: keypoints[14], tip: keypoints[16] };
  const pinky = { mcp: keypoints[17], pip: keypoints[18], tip: keypoints[20] };

  // Calculate finger extensions mapping.
  // Extended means tip is further from wrist than pip
  const isThumbExtended = distance(thumb.tip, pinky.mcp) > distance(thumb.ip, pinky.mcp) * 1.2;
  const isIndexExtended = distance(index.tip, wrist) > distance(index.pip, wrist);
  const isMiddleExtended = distance(middle.tip, wrist) > distance(middle.pip, wrist);
  const isRingExtended = distance(ring.tip, wrist) > distance(ring.pip, wrist);
  const isPinkyExtended = distance(pinky.tip, wrist) > distance(pinky.pip, wrist);

  // Are they pointing down? (tip is lower than mcp, visually y is greater)
  const isIndexDown = index.tip.y > index.mcp.y;
  const isMiddleDown = middle.tip.y > middle.mcp.y;
  const isRingDown = ring.tip.y > ring.mcp.y;
  const isPinkyDown = pinky.tip.y > pinky.mcp.y;

  // Distances between fingers
  const indexMiddleDist = distance(index.tip, middle.tip);
  const indexMiddleBaseDist = distance(index.mcp, middle.mcp);
  const thumbIndexDist = distance(thumb.tip, index.tip);

  // Helper flags for "extended AND pointing UP"
  const indexUp = isIndexExtended && !isIndexDown;
  const middleUp = isMiddleExtended && !isMiddleDown;
  const ringUp = isRingExtended && !isRingDown;
  const pinkyUp = isPinkyExtended && !isPinkyDown;

  // Let's go priority by priority (most unique first)

  // 5 (Open Palm): All 5 extended
  if (isThumbExtended && indexUp && middleUp && ringUp && pinkyUp) return "5";

  // B: 4 fingers straight up, thumb tucked
  if (!isThumbExtended && indexUp && middleUp && ringUp && pinkyUp) return "B";

  // W: Index, middle, ring extended and up
  if (!isThumbExtended && indexUp && middleUp && ringUp && !isPinkyExtended) return "W";

  // F: Index tip to Thumb tip touching, others extended up
  // In Libras, F is index down touching thumb, others up
  if (thumbIndexDist < indexMiddleBaseDist * 1.5 && middleUp && ringUp && pinkyUp) return "F";

  // Y: Thumb extended, pinky extended
  if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) return "Y";
  
  // L: Thumb extended, index extended vertically
  if (isThumbExtended && indexUp && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return "L";

  // V & U & R: Index and middle extended and up
  if (!isThumbExtended && indexUp && middleUp && !isRingExtended && !isPinkyExtended) {
    if (indexMiddleDist > indexMiddleBaseDist * 1.2) return "V";
    
    // Simplistic cross check for R: tip positions inverted relative to base positions
    const crossedX = (index.tip.x > middle.tip.x && index.mcp.x < middle.mcp.x) || 
                     (index.tip.x < middle.tip.x && index.mcp.x > middle.mcp.x);
    if (crossedX) return "R";
    
    return "U";
  }

  // I: Only pinky extended
  if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) return "I";

  // D: Index extended up, others closed
  if (!isThumbExtended && indexUp && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return "D";

  // M and N are characterized by fingers explicitly pointing down over the thumb.
  // Because they are pointing down, they might register as "not extended" with the wrist heuristic, 
  // or they might be somewhat extended but pointing down.
  // We check if they are explicitly down.
  if (isIndexDown && isMiddleDown && isRingDown && !isPinkyExtended && !isThumbExtended) return "M";
  if (isIndexDown && isMiddleDown && !isRingDown && !isPinkyExtended && !isThumbExtended) return "N";

  // A vs S: Both closed fists.
  // A: Thumb is extended alongside closed fingers.
  // S: Thumb is wrapped over fingers.
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    if (isThumbExtended) return "A";
    return "S";
  }

  // O: Tips touching thumb
  if (thumbIndexDist < indexMiddleBaseDist && distance(thumb.tip, middle.tip) < indexMiddleBaseDist && distance(thumb.tip, ring.tip) < indexMiddleBaseDist) {
     return "O";
  }

  return null;
};
