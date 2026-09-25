/// <reference types="nativewind/types" />

declare module '*.css' {
  const styles: Readonly<Record<string, string>>;
  export default styles;
}

declare module 'react-native-vector-icons/Ionicons' {
  import type { ComponentType } from 'react';
  import type { ColorValue } from 'react-native';

  type IoniconsProps = {
    color?: ColorValue;
    name: string;
    size?: number;
  };

  const Ionicons: ComponentType<IoniconsProps>;
  export default Ionicons;
}
