import {useRef} from 'react';

// Loading state renders feedback; a synchronous lock also covers two events
// delivered before React renders that state. One lock covers related actions.
export default function useSubmissionLock() {
  const pending = useRef(false);
  return {
    acquire() {
      if (pending.current) return false;
      pending.current = true;
      return true;
    },
    release() {pending.current = false;}
  };
}
