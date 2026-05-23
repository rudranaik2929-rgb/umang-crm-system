import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type CardActionMenuProps = {
  colors: any;
  isStarred?: boolean;
  onEdit: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
  testIDPrefix: string;
};

export function CardActionMenu({
  colors,
  isStarred,
  onEdit,
  onToggleStar,
  onDelete,
  testIDPrefix,
}: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<any>(null);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const node = rootRef.current;
      if (node && typeof node.contains === 'function' && node.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const run = (event: any, action: () => void) => {
    event?.stopPropagation?.();
    setOpen(false);
    action();
  };

  return (
    <View ref={rootRef} style={styles.wrap}>
      <Pressable
        testID={`${testIDPrefix}-menu`}
        onPress={(event: any) => {
          event?.stopPropagation?.();
          setOpen((value) => !value);
        }}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
      </Pressable>

      {open ? (
        <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            testID={`${testIDPrefix}-edit`}
            onPress={(event: any) => run(event, onEdit)}
            style={({ hovered }: any) => [styles.item, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
          >
            <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.itemText, { color: colors.text }]}>Edit</Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-star`}
            onPress={(event: any) => run(event, onToggleStar)}
            style={({ hovered }: any) => [styles.item, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
          >
            <Ionicons name={isStarred ? 'star' : 'star-outline'} size={15} color={colors.warning} />
            <Text style={[styles.itemText, { color: colors.text }]}>{isStarred ? 'Unstar' : 'Star'}</Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
          <Pressable
            testID={`${testIDPrefix}-delete`}
            onPress={(event: any) => run(event, onDelete)}
            style={({ hovered }: any) => [styles.item, { backgroundColor: hovered ? colors.negative + '10' : 'transparent' }]}
          >
            <Ionicons name="trash-outline" size={15} color={colors.negative} />
            <Text style={[styles.itemText, { color: colors.negative }]}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    flexShrink: 0,
    zIndex: 20,
  },
  trigger: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    width: 132,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    padding: 5,
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.10)',
  } as any,
  item: {
    height: 34,
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
});
