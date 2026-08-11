export const DROPDOWN_TAP_MOVE_THRESHOLD = 8;

export type DropdownGestureState = {
  startX: number;
  startY: number;
  lastY: number;
  moved: boolean;
};

export function startDropdownGesture(clientX: number, clientY: number): DropdownGestureState {
  return { startX: clientX, startY: clientY, lastY: clientY, moved: false };
}

export function moveDropdownGesture(
  state: DropdownGestureState,
  clientX: number,
  clientY: number,
  threshold = DROPDOWN_TAP_MOVE_THRESHOLD
) {
  const deltaY = clientY - state.lastY;
  const distance = Math.hypot(clientX - state.startX, clientY - state.startY);
  return {
    state: {
      ...state,
      lastY: clientY,
      moved: state.moved || distance >= threshold
    },
    deltaY
  };
}

export function shouldContainDropdownOverscroll(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  fingerDeltaY: number
) {
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  return (atTop && fingerDeltaY > 0) || (atBottom && fingerDeltaY < 0);
}

export function isDropdownTap(state: DropdownGestureState | null) {
  return !state?.moved;
}
