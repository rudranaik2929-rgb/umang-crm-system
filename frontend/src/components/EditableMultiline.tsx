import React from 'react';
import { Platform, TextInput, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  editable?: boolean;
  testID?: string;
  style?: StyleProp<TextStyle>;
  minHeight?: number;
};

/**
 * Multiline text field that always accepts typing on web.
 * RN TextInput nested under overlays/modals often fails to focus; native textarea does not.
 */
export function EditableMultiline({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  editable = true,
  testID,
  style,
  minHeight = 88,
}: Props) {
  const flat = StyleSheet.flatten(style) || {};
  const {
    color = '#0f172a',
    backgroundColor = '#f8fafc',
    borderColor = '#e2e8f0',
    borderWidth = 1,
    borderRadius = 8,
    padding = 12,
    fontSize = 14,
    marginTop,
    ...rest
  } = flat as Record<string, any>;

  if (Platform.OS === 'web') {
    return (
      <textarea
        data-testid={testID}
        data-editable="true"
        className="crm-text-input"
        value={value}
        disabled={editable === false}
        placeholder={placeholder}
        onChange={(e) => onChangeText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          minHeight,
          marginTop: marginTop ?? 10,
          padding,
          borderWidth,
          borderStyle: 'solid',
          borderColor,
          borderRadius,
          color,
          backgroundColor,
          fontSize,
          fontFamily: 'inherit',
          lineHeight: 1.4,
          resize: 'vertical',
          outline: 'none',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          pointerEvents: 'auto',
          opacity: editable === false ? 0.6 : 1,
          ...rest,
        }}
      />
    );
  }

  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      textAlignVertical="top"
      style={[{ minHeight, marginTop: 10, padding: 12, borderWidth: 1, borderRadius: 8, fontSize: 14 }, style]}
    />
  );
}
