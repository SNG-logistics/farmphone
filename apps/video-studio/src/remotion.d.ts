declare module 'remotion' {
  import React from 'react';

  export function useCurrentFrame(): number;

  export interface CompositionProps<T = any> {
    id: string;
    component: React.ComponentType<T>;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    defaultProps?: T;
  }

  export const Composition: React.FC<CompositionProps>;
}
