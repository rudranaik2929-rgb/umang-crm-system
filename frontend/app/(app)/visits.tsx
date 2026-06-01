import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../../src/theme/ThemeContext';

/** Site visits removed — redirect to Follow Ups. */
export default function VisitsRedirect() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    router.replace('/(app)/follow-ups' as any);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
