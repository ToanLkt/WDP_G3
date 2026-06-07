import { Platform } from 'react-native';

/** Chiều cao tab bar (khớp AppNavigator tabBarStyle). */
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 72;

/** Padding thêm phía dưới nội dung scroll để không bị tab bar che. */
const TAB_BAR_EXTRA_PADDING = 24;

export const TAB_BAR_CONTENT_INSET = TAB_BAR_HEIGHT + TAB_BAR_EXTRA_PADDING;

/** Padding bottom cho ScrollView / FlatList. */
export const useTabBarAwareScroll = () => ({
  tabBarPaddingBottom: TAB_BAR_CONTENT_INSET,
  /** Khoảng cách composer/input nằm phía trên tab bar. */
  tabBarInset: TAB_BAR_HEIGHT,
});
