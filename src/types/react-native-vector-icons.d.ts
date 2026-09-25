declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';

  export type MaterialCommunityIconName = 'cow' | 'minus' | 'plus';

  export type MaterialCommunityIconProps = TextProps & {
    name: MaterialCommunityIconName;
    size?: number;
    color?: string;
  };

  const MaterialCommunityIcons: ComponentType<MaterialCommunityIconProps>;

  export default MaterialCommunityIcons;
}
